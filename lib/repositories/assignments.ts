import { admin } from "@/lib/supabase/admin";

export const ACTIVE_ASSIGNMENT_STATUSES = ["dispatched", "accepted", "en_route", "on_scene"];
export const OPEN_RECOMMENDATION_STATUSES = ["recommended", "awaiting_approval"];

export const ASSIGNMENT_COLUMNS =
  "id, incident_id, responder_id, status, match_score, match_factors, eta_minutes," +
  " ai_decision_id, ai_rationale, requires_approval, approved_by, approved_at," +
  " declined_reason, invalidation_reason, created_at, updated_at";

export interface AssignmentRow {
  id: string; incident_id: string; responder_id: string; status: string;
  match_score: number; match_factors: any; eta_minutes: number | null;
  ai_decision_id: string | null; ai_rationale: string[] | null;
  requires_approval: boolean; approved_by: string | null; approved_at: string | null;
  declined_reason: string | null; invalidation_reason: string | null;
  created_at: string; updated_at: string;
}

/** Postgres error code for a unique-index violation - our conflict guard firing. */
export const UNIQUE_VIOLATION = "23505";

export async function createAssignment(row: Record<string, any>) {
  const { data, error } = await admin().from("assignments").insert(row).select(ASSIGNMENT_COLUMNS).single();
  if (error) return { data: null, error };
  return { data: data as unknown as AssignmentRow, error: null };
}

export async function updateAssignment(id: string, patch: Record<string, any>) {
  const { data, error } = await admin().from("assignments").update(patch).eq("id", id).select(ASSIGNMENT_COLUMNS).single();
  if (error) return { data: null, error };
  return { data: data as unknown as AssignmentRow, error: null };
}

export async function getAssignment(id: string) {
  const { data, error } = await admin().from("assignments").select(ASSIGNMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getAssignment: ${error.message}`);
  return (data as unknown as AssignmentRow) ?? null;
}

export async function openRecommendationFor(incidentId: string) {
  const { data } = await admin().from("assignments").select(ASSIGNMENT_COLUMNS)
    .eq("incident_id", incidentId).in("status", OPEN_RECOMMENDATION_STATUSES).maybeSingle();
  return (data as unknown as AssignmentRow) ?? null;
}

export async function activeAssignmentFor(incidentId: string) {
  const { data } = await admin().from("assignments").select(ASSIGNMENT_COLUMNS)
    .eq("incident_id", incidentId).in("status", ACTIVE_ASSIGNMENT_STATUSES).maybeSingle();
  return (data as unknown as AssignmentRow) ?? null;
}

export async function activeAssignmentForResponder(responderId: string) {
  const { data } = await admin().from("assignments").select(ASSIGNMENT_COLUMNS)
    .eq("responder_id", responderId).in("status", ACTIVE_ASSIGNMENT_STATUSES).maybeSingle();
  return (data as unknown as AssignmentRow) ?? null;
}

export async function listAssignments(incidentIds?: string[]) {
  let q = admin().from("assignments").select(ASSIGNMENT_COLUMNS);
  if (incidentIds?.length) q = q.in("incident_id", incidentIds);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(`listAssignments: ${error.message}`);
  return (data ?? []) as unknown as AssignmentRow[];
}
