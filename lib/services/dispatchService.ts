import { randomUUID } from "node:crypto";
import { publish, notify } from "@/lib/events/publish";
import * as A from "@/lib/repositories/assignments";
import * as I from "@/lib/repositories/incidents";
import * as M from "@/lib/repositories/matches";
import * as R from "@/lib/repositories/responders";
import { runMatching } from "./matching";
import { recomputePriority, rescoreWaitingFor } from "./reconciler";

export interface DispatchResult {
  ok: boolean;
  conflict?: boolean;
  message: string;
  assignment?: A.AssignmentRow | null;
  newRecommendation?: A.AssignmentRow | null;
}

/**
 * HUMAN-IN-THE-LOOP DISPATCH.
 *
 * Nothing is committed until a coordinator presses approve. The commitment
 * itself is guarded by a unique partial index in Postgres, so two coordinators
 * racing for the same responder cannot both win - the loser gets a conflict
 * resolution flow instead of a corrupt database.
 */
export async function approveDispatch(assignmentId: string, actor: { id: string; label: string }): Promise<DispatchResult> {
  const correlationId = randomUUID();
  const assignment = await A.getAssignment(assignmentId);
  if (!assignment) return { ok: false, message: "Assignment not found" };
  if (!A.OPEN_RECOMMENDATION_STATUSES.includes(assignment.status)) {
    return { ok: false, message: `Assignment is already ${assignment.status}` };
  }

  const incident = await I.getIncident(assignment.incident_id);
  const responder = await R.getResponder(assignment.responder_id);
  if (!incident || !responder) return { ok: false, message: "Incident or responder missing" };

  // Two guards fire here.
  //
  // 1. The status precondition is part of the UPDATE, not a separate read. A
  //    double-clicked Approve sends two requests that both pass the check
  //    above; the second one matches zero rows and is refused, so the load
  //    counter and the event log are only ever moved once per dispatch.
  // 2. If the responder was already committed elsewhere, this UPDATE trips the
  //    unique partial index. That is the conflict guard doing its job.
  const { data: dispatched, error } = await A.commitApproval(assignmentId, {
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
  });

  if (error) {
    if ((error as any).code === A.UNIQUE_VIOLATION) {
      return resolveConflict(assignment, incident, responder, correlationId);
    }
    if ((error as any).code === A.NO_ROWS_RETURNED) {
      return { ok: false, message: "This recommendation was already actioned." };
    }
    return { ok: false, message: `Dispatch failed: ${error.message}` };
  }
  if (!dispatched) {
    return { ok: false, message: "This recommendation was already actioned." };
  }

  await R.adjustLoad(responder.id, +1);
  await I.updateIncident(incident.id, { status: "dispatched", dispatched_at: new Date().toISOString() });

  await publish({
    type: "assignment.created", entity_type: "assignment", entity_id: assignmentId,
    incident_id: incident.id, actor_type: "user", actor_id: actor.id, actor_label: actor.label,
    correlation_id: correlationId,
    payload: {
      responder_id: responder.id, responder_name: responder.name,
      incident_code: incident.code, match_score: assignment.match_score,
      eta_minutes: assignment.eta_minutes, approved_by: actor.label,
    },
  });
  await publish({
    type: "responder.status_changed", entity_type: "responder", entity_id: responder.id,
    incident_id: incident.id, correlation_id: correlationId,
    payload: { status: responder.status, load: responder.current_load + 1, reason: "dispatched" },
  });
  await notify({
    title: `${responder.name} dispatched to ${incident.code}`,
    body: `Approved by ${actor.label}. ETA ~${Math.round(assignment.eta_minutes ?? 0)} min (est.)`,
    severity: "info", incident_id: incident.id,
  });

  // Committing a responder shrinks the capable pool: everyone still waiting on
  // that capability just became relatively more urgent.
  await rescoreWaitingFor(responder.capabilities ?? [], "responder_committed", correlationId);

  return { ok: true, message: `Dispatched ${responder.name}`, assignment: dispatched };
}

/** CONFLICT RESOLUTION: the responder was taken. Find the next best option. */
async function resolveConflict(
  assignment: A.AssignmentRow,
  incident: I.IncidentRow,
  responder: R.ResponderRow,
  correlationId: string,
): Promise<DispatchResult> {
  const reason = `${responder.name} was committed to another incident first`;

  await A.updateAssignment(assignment.id, { status: "invalidated", invalidation_reason: reason });
  await M.invalidateCandidate(incident.id, responder.id, reason);
  await publish({
    type: "match.invalidated", entity_type: "assignment", entity_id: assignment.id,
    incident_id: incident.id, correlation_id: correlationId,
    payload: { reason, responder_id: responder.id, responder_name: responder.name, cause: "resource_conflict" },
  });

  const repriced = await recomputePriority(incident, "resource_conflict", correlationId);
  const rematch = await runMatching(repriced, {
    trigger: "resource_conflict", correlationId, excludeResponderIds: [responder.id],
  });

  await notify({
    title: `Conflict on ${incident.code}`,
    body: rematch.recommendation
      ? `${reason}. New recommendation prepared.`
      : `${reason}. No alternative found - manual assignment required.`,
    severity: "warning", incident_id: incident.id,
  });

  return {
    ok: false,
    conflict: true,
    message: rematch.recommendation
      ? `${reason}. A new recommendation is ready.`
      : `${reason}. No alternative responder is available.`,
    newRecommendation: rematch.recommendation,
  };
}

export async function rejectRecommendation(
  assignmentId: string, reason: string, actor: { id: string; label: string },
): Promise<DispatchResult> {
  const correlationId = randomUUID();
  const assignment = await A.getAssignment(assignmentId);
  if (!assignment) return { ok: false, message: "Assignment not found" };
  if (!A.OPEN_RECOMMENDATION_STATUSES.includes(assignment.status)) {
    // Rejecting an already-dispatched assignment would orphan the responder:
    // their load and status would never be released. Cancel it properly instead.
    return { ok: false, message: `Assignment is already ${assignment.status} and cannot be rejected` };
  }

  const { data: rejected } = await A.updateAssignmentIfStatus(
    assignmentId, A.OPEN_RECOMMENDATION_STATUSES,
    { status: "invalidated", invalidation_reason: `Rejected by coordinator: ${reason}` },
  );
  if (!rejected) return { ok: false, message: "This recommendation was already actioned." };
  await M.invalidateCandidate(assignment.incident_id, assignment.responder_id, `Rejected: ${reason}`);
  await publish({
    type: "match.invalidated", entity_type: "assignment", entity_id: assignmentId,
    incident_id: assignment.incident_id, actor_type: "user", actor_id: actor.id,
    actor_label: actor.label, correlation_id: correlationId,
    payload: { reason, cause: "coordinator_rejected", responder_id: assignment.responder_id },
  });

  const incident = await I.getIncident(assignment.incident_id);
  if (!incident) return { ok: false, message: "Incident not found" };

  const rematch = await runMatching(incident, {
    trigger: "coordinator_rejected", correlationId, excludeResponderIds: [assignment.responder_id],
  });
  return {
    ok: true,
    message: rematch.recommendation ? "Alternative responder recommended" : "No alternative available",
    newRecommendation: rematch.recommendation,
  };
}

/** Coordinator override: assign a specific responder by hand. */
export async function manualAssign(
  incidentId: string, responderId: string, actor: { id: string; label: string },
): Promise<DispatchResult> {
  const correlationId = randomUUID();
  const incident = await I.getIncident(incidentId);
  const responder = await R.getResponder(responderId);
  if (!incident || !responder) return { ok: false, message: "Incident or responder not found" };

  const previousActive = await A.activeAssignmentFor(incidentId);
  if (previousActive) {
    await A.updateAssignment(previousActive.id, {
      status: "cancelled", invalidation_reason: `Reassigned by ${actor.label}`,
    });
    await R.adjustLoad(previousActive.responder_id, -1);
    await R.updateResponder(previousActive.responder_id, { status: "available" });
    await publish({
      type: "assignment.cancelled", entity_type: "assignment", entity_id: previousActive.id,
      incident_id: incidentId, actor_type: "user", actor_id: actor.id, correlation_id: correlationId,
      payload: { reason: "reassigned", previous_responder_id: previousActive.responder_id },
    });
  }

  const open = await A.openRecommendationFor(incidentId);
  if (open) await A.updateAssignment(open.id, { status: "invalidated", invalidation_reason: "Manual reassignment" });

  const candidates = await M.listCandidates(incidentId);
  const scored = candidates.find((c: any) => c.responder_id === responderId);

  const { data: created, error } = await A.createAssignment({
    incident_id: incidentId, responder_id: responderId, status: "dispatched",
    match_score: scored?.score ?? 0, match_factors: scored?.factors ?? {},
    eta_minutes: scored?.eta_minutes ?? null, requires_approval: false,
    approved_by: actor.id, approved_at: new Date().toISOString(),
    ai_rationale: [`Manually assigned by ${actor.label}`],
  });

  if (error) {
    if ((error as any).code === A.UNIQUE_VIOLATION) {
      return { ok: false, conflict: true, message: `${responder.name} is already committed to another incident` };
    }
    return { ok: false, message: `Assignment failed: ${error.message}` };
  }

  await R.adjustLoad(responderId, +1);
  await I.updateIncident(incidentId, { status: "dispatched", dispatched_at: new Date().toISOString() });
  await publish({
    type: "assignment.created", entity_type: "assignment", entity_id: created!.id,
    incident_id: incidentId, actor_type: "user", actor_id: actor.id, actor_label: actor.label,
    correlation_id: correlationId,
    payload: { responder_id: responderId, responder_name: responder.name,
               incident_code: incident.code, manual: true },
  });
  await rescoreWaitingFor(responder.capabilities ?? [], "manual_assignment", correlationId);
  return { ok: true, message: `${responder.name} assigned`, assignment: created };
}

/** Responder-side transitions. Each one persists and announces. */
export async function advanceAssignment(
  assignmentId: string,
  action: "accept" | "decline" | "arrive" | "complete",
  actor: { id: string; label: string },
  reason?: string,
): Promise<DispatchResult> {
  const correlationId = randomUUID();
  const assignment = await A.getAssignment(assignmentId);
  if (!assignment) return { ok: false, message: "Assignment not found" };
  const incident = await I.getIncident(assignment.incident_id);
  const responder = await R.getResponder(assignment.responder_id);
  if (!incident || !responder) return { ok: false, message: "Incident or responder missing" };

  if (action === "decline") {
    const { data: declined } = await A.updateAssignmentIfStatus(
      assignmentId, ["dispatched"],
      { status: "declined", declined_reason: reason ?? "No reason given" },
    );
    if (!declined) return { ok: false, message: `Assignment is already ${assignment.status}` };
    await R.adjustLoad(responder.id, -1);
    await M.invalidateCandidate(incident.id, responder.id, `Declined: ${reason ?? "no reason"}`);
    await publish({
      type: "assignment.declined", entity_type: "assignment", entity_id: assignmentId,
      incident_id: incident.id, actor_type: "user", actor_id: actor.id, correlation_id: correlationId,
      payload: { responder_id: responder.id, responder_name: responder.name, reason: reason ?? null },
    });
    const repriced = await recomputePriority(incident, "responder_declined", correlationId);
    const rematch = await runMatching(repriced, {
      trigger: "responder_declined", correlationId, excludeResponderIds: [responder.id],
    });
    return { ok: true, message: "Declined; searching for an alternative", newRecommendation: rematch.recommendation };
  }

  const map = {
    accept: { assignment: "accepted", responder: "en_route", incident: "en_route", event: "assignment.accepted" },
    arrive: { assignment: "on_scene", responder: "on_scene", incident: "on_scene", event: "assignment.updated" },
    complete: { assignment: "completed", responder: "available", incident: "resolved", event: "assignment.updated" },
  } as const;
  const step = map[action];

  // Each transition may only be taken from its own predecessor state, so a
  // double-clicked Accept or Complete cannot fire the cascade (or the load
  // decrement) twice.
  const FROM: Record<typeof action, string[]> = {
    accept: ["dispatched"],
    arrive: ["accepted"],
    complete: ["accepted", "on_scene"],
  };
  const { data: moved } = await A.updateAssignmentIfStatus(
    assignmentId, FROM[action], { status: step.assignment },
  );
  if (!moved) return { ok: false, message: `Assignment is already ${assignment.status}` };
  await R.updateResponder(responder.id, { status: step.responder });
  if (action === "complete") {
    await R.adjustLoad(responder.id, -1);
    await I.updateIncident(incident.id, { status: "resolved", resolved_at: new Date().toISOString() });
  } else {
    await I.updateIncident(incident.id, { status: step.incident });
  }

  await publish({
    type: step.event as any, entity_type: "assignment", entity_id: assignmentId,
    incident_id: incident.id, actor_type: "user", actor_id: actor.id, actor_label: actor.label,
    correlation_id: correlationId,
    payload: { action, responder_id: responder.id, responder_name: responder.name,
               incident_code: incident.code, assignment_status: step.assignment },
  });
  await publish({
    type: "responder.status_changed", entity_type: "responder", entity_id: responder.id,
    incident_id: incident.id, correlation_id: correlationId,
    payload: { status: step.responder, reason: action },
  });

  if (action === "complete") {
    await publish({
      type: "incident.resolved", entity_type: "incident", entity_id: incident.id,
      incident_id: incident.id, correlation_id: correlationId,
      payload: { by: responder.name },
    });
    await rescoreWaitingFor(responder.capabilities ?? [], "responder_freed", correlationId);
  }

  return { ok: true, message: `Assignment ${step.assignment}` };
}
