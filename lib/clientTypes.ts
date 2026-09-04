export interface Incident {
  id: string; code: string; status: string; hazard_type: string | null;
  description_raw: string; source: string; address_text: string | null;
  location_confidence: string; severity: string | null; people_affected: number;
  vulnerability_flags: string[]; required_capabilities: string[]; urgency: number;
  life_risk: boolean; ai_confidence: number; missing_information: string[];
  short_summary: string | null; priority_score: number; priority_band: string;
  assessment_version: number; degraded: boolean; is_simulated: boolean;
  lat: number | null; lng: number | null;
  created_at: string; updated_at: string; dispatched_at: string | null; resolved_at: string | null;
}

export interface Responder {
  id: string; name: string; org: string | null; type: string; status: string;
  capabilities: string[]; current_load: number; max_concurrent: number;
  speed_kmh: number; lat: number | null; lng: number | null; is_simulated: boolean;
}

export interface Assignment {
  id: string; incident_id: string; responder_id: string; status: string;
  match_score: number; match_factors: any; eta_minutes: number | null;
  ai_rationale: string[] | null; requires_approval: boolean;
  approved_by: string | null; invalidation_reason: string | null; created_at: string;
}

export interface Shelter {
  id: string; name: string; capacity_total: number; capacity_used: number;
  status: string; lat: number | null; lng: number | null;
}

export interface Ev {
  id: string; seq: number; type: string; entity_type: string; entity_id: string | null;
  incident_id: string | null; actor_type: string; actor_label: string | null;
  payload: any; created_at: string;
}

export interface Factor {
  label: string; detail: string | null; contribution: number; direction: string;
}

export interface ExclusionSummary { reason: string; count: number; total: number }

export interface ReliefState {
  incidents: Incident[];
  /** incident id -> why no responder could be recommended */
  exclusions?: Record<string, ExclusionSummary>;
  responders: Responder[];
  assignments: Assignment[];
  shelters: Shelter[];
  events: Ev[];
  notifications: { id: string; title: string; body: string | null; severity: string; created_at: string }[];
  simulation: { id: string; scenario: string; status: string; current_step: number; steps: any[] } | null;
}

export const ACTIVE_ASSIGNMENT = ["dispatched", "accepted", "en_route", "on_scene"];
export const OPEN_RECOMMENDATION = ["recommended", "awaiting_approval"];

/**
 * THE definition of an available responder. The command-centre header and the
 * responder panel each had their own version of this - the header also required
 * spare capacity, the panel did not - so a unit at max load was counted "free"
 * in one place and not the other. That is the 4/8-vs-4-free mismatch.
 */
export function isResponderFree(r: Pick<Responder, "status" | "current_load" | "max_concurrent">) {
  return r.status === "available" && r.current_load < r.max_concurrent;
}

/** Available units first, then by name; offline sinks to the bottom. */
export function byAvailabilityThenName(a: Responder, b: Responder) {
  const rank = (r: Responder) =>
    isResponderFree(r) ? 0 : r.status === "offline" ? 2 : 1;
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}
