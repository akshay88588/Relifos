/**
 * THE EVENT CATALOG.
 *
 * One discriminated union shared by the publisher and every client. If a state
 * change is not in this list it cannot be announced, and if it is not announced
 * the UI does not move - which is what makes decorative animation structurally
 * impossible in this codebase.
 */
export const EVENT_TYPES = [
  "incident.created",
  "incident.updated",
  "incident.priority_changed",
  "incident.resolved",
  "ai.assessment_created",
  "ai.assessment_rejected",
  "responder.status_changed",
  "responder.location_changed",
  "match.created",
  "match.invalidated",
  "assignment.created",
  "assignment.accepted",
  "assignment.declined",
  "assignment.updated",
  "assignment.cancelled",
  "resource.updated",
  "shelter.capacity_changed",
  "notification.created",
  "simulation.step_executed",
  "system.degraded",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface SystemEvent {
  id: string;
  seq: number;
  type: EventType;
  entity_type: "incident" | "responder" | "assignment" | "shelter" | "resource" | "system" | "notification";
  entity_id: string | null;
  incident_id: string | null;
  actor_type: "system" | "ai" | "user";
  actor_id: string | null;
  actor_label: string | null;
  correlation_id: string | null;
  payload: Record<string, any>;
  created_at: string;
}

/** Human-readable timeline labels. */
export const EVENT_LABEL: Record<string, string> = {
  "incident.created": "INCIDENT RECEIVED",
  "incident.updated": "INCIDENT UPDATED",
  "incident.priority_changed": "PRIORITY RECALCULATED",
  "incident.resolved": "INCIDENT RESOLVED",
  "ai.assessment_created": "AI CLASSIFIED",
  "ai.assessment_rejected": "AI OUTPUT REJECTED",
  "responder.status_changed": "RESPONDER STATUS",
  "responder.location_changed": "RESPONDER MOVED",
  "match.created": "MATCH FOUND",
  "match.invalidated": "MATCH INVALIDATED",
  "assignment.created": "DISPATCH APPROVED",
  "assignment.accepted": "RESPONDER ACCEPTED",
  "assignment.declined": "RESPONDER DECLINED",
  "assignment.updated": "ASSIGNMENT UPDATED",
  "assignment.cancelled": "ASSIGNMENT CANCELLED",
  "resource.updated": "RESOURCE UPDATED",
  "shelter.capacity_changed": "SHELTER CAPACITY",
  "notification.created": "NOTIFICATION",
  "simulation.step_executed": "SIMULATION STEP",
  "system.degraded": "SYSTEM DEGRADED",
};
