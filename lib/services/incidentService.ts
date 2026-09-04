import { randomUUID } from "node:crypto";
import { assessIncident } from "@/lib/agents/incidentIntelligence";
import { publish } from "@/lib/events/publish";
import * as D from "@/lib/repositories/decisions";
import * as I from "@/lib/repositories/incidents";
import * as A from "@/lib/repositories/assignments";
import { runMatching } from "./matching";
import { recomputePriority } from "./reconciler";

const CODE_PREFIX: Record<string, string> = {
  flood: "FLD", fire: "FIRE", building_collapse: "COL", medical: "MED",
  trapped: "TRP", gas_leak: "GAS", road_block: "RDB", other: "INC",
};

/**
 * REPORT -> UNDERSTAND -> VALIDATE -> CLASSIFY -> ASSESS -> PRIORITIZE ->
 * FIND RESOURCES -> MATCH -> PLAN -> (await human approval)
 *
 * One HTTP request, one correlation id, and roughly fifteen real database
 * operations. Every step below is inspectable afterwards in system_events.
 */
export async function intakeIncident(args: {
  description: string;
  lat: number | null;
  lng: number | null;
  source: "text" | "voice" | "simulation";
  address_text?: string | null;
  reported_by?: string | null;
  is_simulated?: boolean;
}) {
  const correlationId = randomUUID();

  // 1-2. Persist the raw report before anything else can fail.
  const created = await I.createIncident(args);
  await publish({
    type: "incident.created", entity_type: "incident", entity_id: created.id,
    incident_id: created.id, correlation_id: correlationId,
    actor_type: args.is_simulated ? "system" : "user",
    payload: {
      code: created.code, source: args.source,
      description: args.description.slice(0, 240),
      has_location: created.lat != null, is_simulated: created.is_simulated,
    },
  });

  // 3-4. Featherless assessment, through the full validation ladder.
  await I.updateIncident(created.id, { status: "assessing" });
  const assessment = await assessIncident(args.description, args.address_text ?? null);
  const aiDecisionId = await D.recordAiDecision(created.id, assessment.decision);

  // 5. Version the assessment so reprioritisation history is provable.
  await I.recordAssessment({
    incident_id: created.id, version: 1, ai_decision_id: aiDecisionId,
    structured: assessment.data, trigger: "initial_report",
  });

  const d = assessment.data;
  const prefix = CODE_PREFIX[d.hazard_type] ?? "INC";
  const withHazardCode = `${prefix}-${created.code.split("-")[1]}`;

  const assessed = await I.updateIncident(created.id, {
    code: withHazardCode,
    hazard_type: d.hazard_type,
    severity: d.severity,
    people_affected: d.people_affected,
    vulnerability_flags: d.vulnerability_flags,
    required_capabilities: d.required_capabilities,
    urgency: d.urgency,
    life_risk: d.life_risk,
    ai_confidence: d.confidence,
    missing_information: d.missing_information,
    short_summary: d.short_summary,
    assessment_version: 1,
    degraded: assessment.degraded,
    status: "assessing",
  });

  await publish({
    type: assessment.degraded ? "ai.assessment_rejected" : "ai.assessment_created",
    entity_type: "incident", entity_id: created.id, incident_id: created.id,
    actor_type: "ai", correlation_id: correlationId,
    payload: {
      model: assessment.decision.model,
      validation_status: assessment.decision.validation_status,
      fallback_used: assessment.decision.fallback_used,
      latency_ms: assessment.decision.latency_ms,
      error: assessment.decision.error_text,
      structured: d,
    },
  });

  if (assessment.degraded) {
    await publish({
      type: "system.degraded", entity_type: "system", incident_id: created.id,
      correlation_id: correlationId,
      payload: { component: "featherless", detail: assessment.decision.error_text,
                 effect: "rule-based fallback assessment used" },
    });
  }

  // 6. Deterministic priority + the WHY factors.
  const prioritised = await recomputePriority(assessed, "initial_assessment", correlationId);

  // 7. Candidate search, scoring, planner, recommendation.
  const match = await runMatching(prioritised, { trigger: "initial", correlationId });

  const final = (await I.getIncident(created.id))!;
  return {
    incident: final,
    // Returned to the reporter once, at creation. Required to add detail later.
    reporter_token: (created as { reporter_token?: string }).reporter_token ?? null,
    assessment: d,
    degraded: assessment.degraded,
    candidates: match.candidates,
    recommendation: match.recommendation,
    reason: match.reason,
    correlation_id: correlationId,
  };
}

/**
 * A citizen adds information ("two more people are here now"). This produces a
 * NEW assessment version, which can move the priority band, which can invalidate
 * the existing recommendation. This is the reprioritisation path.
 */
export async function addIncidentUpdate(incidentId: string, extra: string) {
  const correlationId = randomUUID();
  const incident = await I.getIncident(incidentId);
  if (!incident) throw new Error("Incident not found");

  const combined = `${incident.description_raw}\n\nUPDATE FROM REPORTER: ${extra}`;
  const assessment = await assessIncident(combined, incident.address_text);
  const aiDecisionId = await D.recordAiDecision(incident.id, assessment.decision);
  const version = incident.assessment_version + 1;

  await I.recordAssessment({
    incident_id: incident.id, version, ai_decision_id: aiDecisionId,
    structured: assessment.data, trigger: "reporter_update",
  });

  const d = assessment.data;
  const updated = await I.updateIncident(incident.id, {
    description_raw: combined,
    hazard_type: d.hazard_type, severity: d.severity, people_affected: d.people_affected,
    vulnerability_flags: d.vulnerability_flags, required_capabilities: d.required_capabilities,
    urgency: d.urgency, life_risk: d.life_risk, ai_confidence: d.confidence,
    missing_information: d.missing_information, short_summary: d.short_summary,
    assessment_version: version, degraded: assessment.degraded,
  });

  await publish({
    type: "incident.updated", entity_type: "incident", entity_id: incident.id,
    incident_id: incident.id, actor_type: "user", correlation_id: correlationId,
    payload: { update: extra.slice(0, 240), assessment_version: version },
  });
  await publish({
    type: assessment.degraded ? "ai.assessment_rejected" : "ai.assessment_created",
    entity_type: "incident", entity_id: incident.id, incident_id: incident.id,
    actor_type: "ai", correlation_id: correlationId,
    payload: { version, structured: d, model: assessment.decision.model,
               validation_status: assessment.decision.validation_status },
  });

  const prioritised = await recomputePriority(updated, "reporter_update", correlationId);

  // If nobody is committed yet, the new picture may change who should go.
  const active = await A.activeAssignmentFor(incident.id);
  let match = null;
  if (!active) {
    match = await runMatching(prioritised, { trigger: "reporter_update", correlationId });
  }

  return { incident: (await I.getIncident(incident.id))!, assessment: d, match, correlation_id: correlationId };
}

export async function resolveIncident(incidentId: string, note: string, actorId: string | null) {
  const correlationId = randomUUID();
  const incident = await I.getIncident(incidentId);
  if (!incident) throw new Error("Incident not found");

  const active = await A.activeAssignmentFor(incidentId);
  if (active) {
    await A.updateAssignment(active.id, { status: "completed" });
    const { adjustLoad, updateResponder } = await import("@/lib/repositories/responders");
    await adjustLoad(active.responder_id, -1);
    await updateResponder(active.responder_id, { status: "available" });
    await publish({
      type: "responder.status_changed", entity_type: "responder", entity_id: active.responder_id,
      incident_id: incidentId, correlation_id: correlationId,
      payload: { status: "available", reason: "incident resolved" },
    });
  }

  const updated = await I.updateIncident(incidentId, {
    status: "resolved", resolved_at: new Date().toISOString(),
  });
  await publish({
    type: "incident.resolved", entity_type: "incident", entity_id: incidentId,
    incident_id: incidentId, actor_type: "user", actor_id: actorId,
    correlation_id: correlationId, payload: { note: note.slice(0, 240) },
  });
  return updated;
}
