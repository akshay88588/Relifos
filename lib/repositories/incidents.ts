import { randomUUID } from "node:crypto";
import { admin } from "@/lib/supabase/admin";
import type { CandidateResponder } from "@/lib/domain/types";

export const INCIDENT_COLUMNS =
  "id, code, status, hazard_type, description_raw, source, address_text, location_confidence," +
  " severity, people_affected, vulnerability_flags, required_capabilities, urgency, life_risk," +
  " ai_confidence, missing_information, short_summary, priority_score, priority_band," +
  " priority_computed_at, assessment_version, degraded, is_simulated, lat, lng," +
  " created_at, updated_at, dispatched_at, resolved_at";

export interface IncidentRow {
  id: string; code: string; status: string; hazard_type: string | null;
  description_raw: string; source: string; address_text: string | null;
  location_confidence: string; severity: string | null; people_affected: number;
  vulnerability_flags: string[]; required_capabilities: string[]; urgency: number;
  life_risk: boolean; ai_confidence: number; missing_information: string[];
  short_summary: string | null; priority_score: number; priority_band: string;
  priority_computed_at: string | null; assessment_version: number; degraded: boolean;
  is_simulated: boolean; lat: number | null; lng: number | null;
  created_at: string; updated_at: string; dispatched_at: string | null; resolved_at: string | null;
}

export const OPEN_STATUSES = ["new", "assessing", "matched", "awaiting_approval", "dispatched", "en_route", "on_scene"];
export const UNDISPATCHED_STATUSES = ["new", "assessing", "matched", "awaiting_approval"];

export async function createIncident(args: {
  description: string; lat: number | null; lng: number | null;
  source: string; address_text?: string | null; reported_by?: string | null;
  is_simulated?: boolean;
}) {
  const location = args.lat != null && args.lng != null ? `SRID=4326;POINT(${args.lng} ${args.lat})` : null;
  const { data, error } = await admin()
    .from("incidents")
    .insert({
      description_raw: args.description,
      source: args.source,
      location,
      address_text: args.address_text ?? null,
      location_confidence: location ? "reported" : "unknown",
      reported_by: args.reported_by ?? null,
      is_simulated: args.is_simulated ?? false,
      status: "new",
      // Capability token handed back to the reporter exactly once, so they can
      // add detail to their OWN report later without being signed in. It is
      // never included in any list or detail read (see INCIDENT_COLUMNS).
      reporter_token: randomUUID(),
    })
    .select(`${INCIDENT_COLUMNS}, reporter_token`)
    .single();
  if (error) throw new Error(`createIncident: ${error.message}`);
  return data as unknown as IncidentRow & { reporter_token: string };
}

export async function getIncident(id: string) {
  const { data, error } = await admin().from("incidents").select(INCIDENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getIncident: ${error.message}`);
  return (data as unknown as IncidentRow) ?? null;
}

export async function updateIncident(id: string, patch: Record<string, any>) {
  const { data, error } = await admin().from("incidents").update(patch).eq("id", id).select(INCIDENT_COLUMNS).single();
  if (error) throw new Error(`updateIncident: ${error.message}`);
  return data as unknown as IncidentRow;
}

export async function listIncidents(opts: { open?: boolean; limit?: number } = {}) {
  let q = admin().from("incidents").select(INCIDENT_COLUMNS);
  if (opts.open !== false) q = q.in("status", OPEN_STATUSES);
  const { data, error } = await q
    .order("priority_score", { ascending: false })
    .limit(opts.limit ?? 200);
  if (error) throw new Error(`listIncidents: ${error.message}`);
  return (data ?? []) as unknown as IncidentRow[];
}

/** Open incidents that still need a responder - the reconciler's working set. */
export async function listUndispatched() {
  const { data, error } = await admin()
    .from("incidents").select(INCIDENT_COLUMNS)
    .in("status", UNDISPATCHED_STATUSES)
    .order("priority_score", { ascending: false });
  if (error) throw new Error(`listUndispatched: ${error.message}`);
  return (data ?? []) as unknown as IncidentRow[];
}

/** PostGIS candidate search (ST_DWithin + ST_Distance) via a security-definer RPC. */
export async function nearbyCapableResponders(
  lat: number, lng: number, caps: string[], radiusM: number,
): Promise<CandidateResponder[]> {
  const { data, error } = await admin().rpc("nearby_capable_responders", {
    p_lat: lat, p_lng: lng, p_caps: caps, p_radius_m: radiusM,
  });
  if (error) throw new Error(`nearbyCapableResponders: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, org: r.org, type: r.type, status: r.status,
    capabilities: r.capabilities ?? [], current_load: r.current_load,
    max_concurrent: r.max_concurrent, speed_kmh: Number(r.speed_kmh),
    lat: r.lat, lng: r.lng, distance_m: Number(r.distance_m),
    active_assignment_id: r.active_assignment_id ?? null,
    active_incident_priority: r.active_incident_priority != null ? Number(r.active_incident_priority) : null,
  }));
}

export async function capabilitySupplyRatio(caps: string[]) {
  const { data, error } = await admin().rpc("capability_supply_ratio", { p_caps: caps });
  if (error) return 1;
  const n = Number(data);
  return Number.isFinite(n) ? n : 1;
}

export async function recordAssessment(args: {
  incident_id: string; version: number; ai_decision_id: string | null;
  structured: unknown; trigger: string;
}) {
  const { error } = await admin().from("incident_assessments").insert({
    incident_id: args.incident_id, version: args.version,
    ai_decision_id: args.ai_decision_id, structured: args.structured as any, trigger: args.trigger,
  });
  if (error) throw new Error(`recordAssessment: ${error.message}`);
}

/**
 * Ownership check for the public "add detail" endpoint.
 *
 * Both the token and the reporter id live outside INCIDENT_COLUMNS, so they are
 * never returned by any read path; they are only ever compared here, on the
 * server. Returns true when the caller either presents the token issued at
 * creation or is the signed-in user who filed the report.
 */
export async function canAmendIncident(
  incidentId: string,
  token: string | null,
  userId: string | null,
) {
  const { data } = await admin()
    .from("incidents")
    .select("reporter_token, reported_by")
    .eq("id", incidentId)
    .maybeSingle();
  if (!data) return false;
  const row = data as { reporter_token: string | null; reported_by: string | null };
  if (token && row.reporter_token && row.reporter_token === token) return true;
  if (userId && row.reported_by && row.reported_by === userId) return true;
  return false;
}
