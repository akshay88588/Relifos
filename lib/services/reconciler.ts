import { randomUUID } from "node:crypto";
import { computePriority, isMaterialPriorityChange } from "@/lib/domain/priority";
import type { PriorityInput, Severity, VulnerabilityFlag } from "@/lib/domain/types";
import { publish, notify } from "@/lib/events/publish";
import * as A from "@/lib/repositories/assignments";
import * as D from "@/lib/repositories/decisions";
import * as I from "@/lib/repositories/incidents";
import * as M from "@/lib/repositories/matches";
import * as R from "@/lib/repositories/responders";
import { runMatching } from "./matching";

/**
 * THE RECONCILER.
 *
 * Every service call that mutates state ends here. It works out the blast
 * radius of the change, recomputes priorities, invalidates matches whose
 * assumptions no longer hold, re-runs matching where a recommendation died, and
 * publishes everything that resulted.
 *
 * It runs synchronously inside the originating request. Vercel's serverless
 * model has no durable background worker, and a synchronous cascade is fully
 * traceable through one correlation_id in system_events. Documented as a
 * limitation in the README rather than hidden.
 */

export async function recomputePriority(
  incident: I.IncidentRow,
  trigger: string,
  correlationId: string = randomUUID(),
): Promise<I.IncidentRow> {
  const minutesWaiting = ["dispatched", "en_route", "on_scene", "resolved", "cancelled"].includes(incident.status)
    ? 0
    : (Date.now() - new Date(incident.created_at).getTime()) / 60000;

  const supply = await I.capabilitySupplyRatio(incident.required_capabilities ?? []);

  const input: PriorityInput = {
    severity: (incident.severity as Severity) ?? "medium",
    people_affected: incident.people_affected,
    vulnerability_flags: (incident.vulnerability_flags ?? []) as VulnerabilityFlag[],
    life_risk: incident.life_risk,
    urgency: incident.urgency,
    confidence: incident.ai_confidence,
    minutes_awaiting_dispatch: minutesWaiting,
    capability_supply_ratio: supply,
  };

  const result = computePriority(input);
  const changed = isMaterialPriorityChange(
    { score: incident.priority_score, band: incident.priority_band },
    { score: result.score, band: result.band },
  );

  const computedAt = new Date().toISOString();

  // A material change is CLAIMED, not merely written: only the caller whose
  // read still matches the stored row wins it, and only the winner publishes.
  // Without this, two overlapping recomputes of the same incident both saw the
  // same "before" values and both wrote incident.priority_changed - two
  // identical rows at the same microsecond in the audit trail.
  const claimed = changed
    ? await I.claimPriorityChange(
        incident.id,
        incident.priority_computed_at,
        { score: result.score, band: result.band, computed_at: computedAt },
      )
    : await I.updateIncident(incident.id, {
        priority_score: result.score,
        priority_band: result.band,
        priority_computed_at: computedAt,
      });

  // Lost the race: the other caller already wrote this exact transition and
  // published for it. Return its row and stay quiet.
  if (!claimed) return (await I.getIncident(incident.id)) ?? incident;
  const updated = claimed;

  await D.replaceFactors({
    subject_type: "priority", subject_id: incident.id,
    incident_id: incident.id, factors: result.factors,
  });

  if (changed) {
    await publish({
      type: "incident.priority_changed", entity_type: "incident", entity_id: incident.id,
      incident_id: incident.id, correlation_id: correlationId,
      payload: {
        from_score: incident.priority_score, to_score: result.score,
        from_band: incident.priority_band, to_band: result.band,
        trigger, factors: result.factors,
      },
    });

    if (result.band === "CRITICAL" && incident.priority_band !== "CRITICAL") {
      await notify({
        title: `${incident.code} escalated to CRITICAL`,
        body: `${incident.priority_band} -> CRITICAL (${result.score}) after ${trigger}`,
        severity: "critical", incident_id: incident.id,
      });
    }
  }

  return updated;
}

/**
 * A responder changing state can strand an incident. Work out what it broke and
 * fix it: invalidate their commitments, re-match the incidents they abandoned,
 * and re-score everyone waiting on the capability they took with them.
 */
export async function afterResponderStatusChange(
  responderId: string,
  next: string,
  correlationId: string = randomUUID(),
) {
  const responder = await R.getResponder(responderId);
  if (!responder) return;

  const nowUnusable = next === "offline" || next === "busy";

  if (nowUnusable) {
    // 1. Any live commitment is void.
    const active = await A.activeAssignmentForResponder(responderId);
    if (active) {
      await A.updateAssignment(active.id, {
        status: "invalidated",
        invalidation_reason: `Responder became ${next}`,
      });
      await M.invalidateCandidate(active.incident_id, responderId, `Responder became ${next}`);
      await R.adjustLoad(responderId, -1);
      await publish({
        type: "match.invalidated", entity_type: "assignment", entity_id: active.id,
        incident_id: active.incident_id, correlation_id: correlationId,
        payload: { reason: `Responder became ${next}`, responder_id: responderId, responder_name: responder.name },
      });
      await notify({
        title: `Assignment invalidated: ${responder.name} is ${next}`,
        body: "Searching for an alternative responder.",
        severity: "warning", incident_id: active.incident_id,
      });

      const incident = await I.getIncident(active.incident_id);
      if (incident) {
        const repriced = await recomputePriority(incident, `responder_${next}`, correlationId);
        await runMatching(repriced, {
          trigger: `responder_${next}`, correlationId,
          excludeResponderIds: [responderId],
        });
      }
    }

    // 2. Any open recommendation naming them is void.
    const { data: open } = await (await import("@/lib/supabase/admin")).admin()
      .from("assignments").select("id, incident_id")
      .eq("responder_id", responderId).in("status", A.OPEN_RECOMMENDATION_STATUSES);

    for (const row of open ?? []) {
      await A.updateAssignment(row.id, {
        status: "invalidated", invalidation_reason: `Responder became ${next}`,
      });
      await publish({
        type: "match.invalidated", entity_type: "assignment", entity_id: row.id,
        incident_id: row.incident_id, correlation_id: correlationId,
        payload: { reason: `Responder became ${next}`, responder_id: responderId },
      });
      const inc = await I.getIncident(row.incident_id);
      if (inc) {
        const repriced = await recomputePriority(inc, `responder_${next}`, correlationId);
        await runMatching(repriced, {
          trigger: `responder_${next}`, correlationId, excludeResponderIds: [responderId],
        });
      }
    }
  }

  // 3. The capability pool changed, so scarcity changed for everyone waiting on it.
  await rescoreWaitingFor(responder.capabilities ?? [], `responder_${next}`, correlationId);
}

/** Re-price open incidents that depend on a capability whose supply just moved. */
export async function rescoreWaitingFor(
  capabilities: string[],
  trigger: string,
  correlationId: string = randomUUID(),
) {
  if (!capabilities.length) return;
  const open = await I.listUndispatched();
  const affected = open.filter((i) => (i.required_capabilities ?? []).some((c) => capabilities.includes(c)));
  for (const inc of affected.slice(0, 25)) {
    await recomputePriority(inc, trigger, correlationId);
  }
}

/**
 * Time tick: incidents nobody has dispatched to grow more urgent on their own.
 * Called by Chaos Mode and by /api/system/tick.
 */
export async function ageOpenIncidents(correlationId: string = randomUUID()) {
  const open = await I.listUndispatched();
  let changed = 0;
  for (const inc of open.slice(0, 40)) {
    const before = inc.priority_band;
    const after = await recomputePriority(inc, "time_elapsed", correlationId);
    if (after.priority_band !== before) changed++;
  }
  return { examined: open.length, bandChanges: changed };
}
