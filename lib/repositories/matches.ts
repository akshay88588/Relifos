import { admin } from "@/lib/supabase/admin";
import type { ScoredCandidate } from "@/lib/domain/types";

/**
 * Candidates are rewritten wholesale each time matching runs for an incident.
 * Excluded responders are stored too, with the reason - the command centre
 * shows a coordinator who was NOT chosen and why.
 */
export async function replaceCandidates(incidentId: string, candidates: ScoredCandidate[]) {
  await admin().from("match_candidates").delete().eq("incident_id", incidentId);
  if (!candidates.length) return;
  const { error } = await admin().from("match_candidates").insert(
    candidates.map((c) => ({
      incident_id: incidentId, responder_id: c.responder_id, rank: c.rank,
      score: c.score, factors: { factors: c.factors, preemption_of: c.preemption_of } as any,
      distance_km: c.distance_km, eta_minutes: c.eta_minutes,
      eligible: c.eligible, exclusion_reason: c.exclusion_reason,
    })),
  );
  if (error) console.error("[matches] insert failed", error.message);
}

export async function invalidateCandidate(incidentId: string, responderId: string, reason: string) {
  await admin().from("match_candidates")
    .update({ invalidated_at: new Date().toISOString(), invalidation_reason: reason })
    .eq("incident_id", incidentId).eq("responder_id", responderId);
}

export async function listCandidates(incidentId: string) {
  const { data } = await admin().from("match_candidates")
    .select("id, responder_id, rank, score, factors, distance_km, eta_minutes, eligible, exclusion_reason, invalidated_at, invalidation_reason, computed_at")
    .eq("incident_id", incidentId)
    .order("eligible", { ascending: false })
    .order("score", { ascending: false });
  return data ?? [];
}
