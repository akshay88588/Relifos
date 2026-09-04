import { randomUUID } from "node:crypto";
import { planResponse } from "@/lib/agents/responsePlanner";
import { MATCH_POLICY, requiresHumanApproval, scoreCandidates } from "@/lib/domain/matching";
import type { ScoredCandidate } from "@/lib/domain/types";
import { publish, notify } from "@/lib/events/publish";
import * as A from "@/lib/repositories/assignments";
import * as D from "@/lib/repositories/decisions";
import * as I from "@/lib/repositories/incidents";
import * as M from "@/lib/repositories/matches";
import { autoDispatchEnabled, getConfig } from "./config";

export interface MatchOutcome {
  candidates: ScoredCandidate[];
  recommendation: A.AssignmentRow | null;
  reason: string;
}

/**
 * FIND RESOURCES -> MATCH -> PLAN RESPONSE.
 *
 * Runs the PostGIS candidate search, scores every candidate deterministically,
 * persists the full scoreboard (including exclusions), then asks the planner
 * agent to choose among the top three and justify it. The result is a
 * recommendation awaiting a human, not a dispatch.
 */
export async function runMatching(
  incident: I.IncidentRow,
  opts: { trigger: string; correlationId?: string; excludeResponderIds?: string[] } = { trigger: "initial" },
): Promise<MatchOutcome> {
  const correlationId = opts.correlationId ?? randomUUID();

  if (incident.lat == null || incident.lng == null) {
    return { candidates: [], recommendation: null, reason: "Incident has no usable location" };
  }

  const congestion = Number(await getConfig("congestion_factor", 1));
  const raw = await I.nearbyCapableResponders(
    incident.lat, incident.lng, incident.required_capabilities ?? [], MATCH_POLICY.searchRadiusM,
  );
  const pool = opts.excludeResponderIds?.length
    ? raw.filter((r) => !opts.excludeResponderIds!.includes(r.id))
    : raw;

  const candidates = scoreCandidates(
    {
      incidentId: incident.id,
      incidentPriority: incident.priority_score,
      hazardType: incident.hazard_type ?? "other",
      requiredCapabilities: incident.required_capabilities ?? [],
      location: { lat: incident.lat, lng: incident.lng },
      congestionFactor: congestion,
    },
    pool,
  );

  await M.replaceCandidates(incident.id, candidates);

  const eligible = candidates.filter((c) => c.eligible);
  const top = eligible[0];

  if (!top || top.score < MATCH_POLICY.minRecommendScore) {
    await I.updateIncident(incident.id, { status: "assessing" });
    await notify({
      title: `No strong match for ${incident.code}`,
      body: top
        ? `Best available option scores ${top.score} (threshold ${MATCH_POLICY.minRecommendScore}). Manual assignment required.`
        : `No eligible responder within ${MATCH_POLICY.searchRadiusM / 1000} km. Manual assignment required.`,
      severity: "warning",
      incident_id: incident.id,
    });
    await publish({
      type: "match.created", entity_type: "incident", entity_id: incident.id,
      incident_id: incident.id, correlation_id: correlationId,
      payload: { outcome: "no_strong_match", considered: candidates.length, best_score: top?.score ?? null },
    });
    return {
      candidates,
      recommendation: null,
      reason: top ? "No candidate met the recommendation threshold" : "No eligible responder in range",
    };
  }

  // AGENT 2 picks among the top three the engine already ranked.
  const plan = await planResponse({
    incident: {
      code: incident.code, hazard_type: incident.hazard_type ?? "other",
      severity: incident.severity ?? "medium", priority_score: incident.priority_score,
      priority_band: incident.priority_band, people_affected: incident.people_affected,
      vulnerability_flags: incident.vulnerability_flags ?? [],
      required_capabilities: incident.required_capabilities ?? [],
      short_summary: incident.short_summary ?? incident.description_raw.slice(0, 140),
    },
    candidates,
  });
  const aiDecisionId = await D.recordAiDecision(incident.id, plan.decision);

  const chosen =
    eligible.find((c) => c.responder_id === plan.data.recommended_responder_id) ?? top;

  const approval = requiresHumanApproval({
    band: incident.priority_band,
    matchScore: chosen.score,
    isPreemption: Boolean(chosen.preemption_of),
    responderStatus: "available",
    autoDispatchEnabled: autoDispatchEnabled(),
  });

  // Clear any previous open recommendation before writing the new one.
  const previous = await A.openRecommendationFor(incident.id);
  if (previous) {
    await A.updateAssignment(previous.id, {
      status: "invalidated",
      invalidation_reason: `Superseded by re-match (${opts.trigger})`,
    });
    await M.invalidateCandidate(incident.id, previous.responder_id, `Superseded by re-match (${opts.trigger})`);
    await publish({
      type: "match.invalidated", entity_type: "assignment", entity_id: previous.id,
      incident_id: incident.id, correlation_id: correlationId,
      payload: { reason: `Superseded by re-match (${opts.trigger})`, responder_id: previous.responder_id },
    });
  }

  const { data: recommendation, error } = await A.createAssignment({
    incident_id: incident.id,
    responder_id: chosen.responder_id,
    status: "awaiting_approval",
    match_score: chosen.score,
    match_factors: { factors: chosen.factors, preemption_of: chosen.preemption_of } as any,
    eta_minutes: chosen.eta_minutes,
    ai_decision_id: aiDecisionId,
    ai_rationale: plan.data.rationale_bullets,
    requires_approval: approval.required,
  });

  if (error || !recommendation) {
    return { candidates, recommendation: null, reason: `Could not persist recommendation: ${error?.message}` };
  }

  await D.replaceFactors({
    subject_type: "match", subject_id: recommendation.id,
    incident_id: incident.id, factors: chosen.factors,
  });

  await I.updateIncident(incident.id, { status: "awaiting_approval" });

  await publish({
    type: "match.created", entity_type: "assignment", entity_id: recommendation.id,
    incident_id: incident.id, actor_type: plan.degraded ? "system" : "ai",
    correlation_id: correlationId,
    payload: {
      responder_id: chosen.responder_id, responder_name: chosen.name,
      score: chosen.score, eta_minutes: Math.round(chosen.eta_minutes),
      rationale: plan.data.rationale_bullets, considered: candidates.length,
      eligible: eligible.length, approval_reason: approval.reason,
      planner_degraded: plan.degraded, trigger: opts.trigger,
    },
  });

  await notify({
    title: `${incident.priority_band} ${incident.code}: ${chosen.name} recommended`,
    body: `Match ${chosen.score} - ${approval.required ? "awaiting your approval" : "auto-dispatch eligible"}`,
    severity: incident.priority_band === "CRITICAL" ? "critical" : "info",
    incident_id: incident.id,
  });

  return { candidates, recommendation, reason: approval.reason };
}
