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

export interface ExclusionSummary {
  /** the most common reason a candidate was gated out */
  reason: string;
  /** how many responders were excluded for that reason */
  count: number;
  /** how many were excluded in total, for any reason */
  total: number;
}

/**
 * Why an incident has no recommendation.
 *
 * The matching engine already writes a reason against every candidate it gates
 * out. A card saying only "no recommendation" throws that away and looks like a
 * bug; the coordinator needs to know it was "all flood_rescue units offline"
 * rather than "the system did not try".
 */
export async function exclusionSummaryFor(
  incidentIds: string[],
): Promise<Record<string, ExclusionSummary>> {
  if (!incidentIds.length) return {};
  const { data, error } = await admin()
    .from("match_candidates")
    .select("incident_id, exclusion_reason")
    .in("incident_id", incidentIds)
    .eq("eligible", false);
  if (error) {
    console.error("[matches] exclusionSummaryFor", error.message);
    return {};
  }

  const byIncident: Record<string, Record<string, number>> = {};
  for (const row of (data ?? []) as { incident_id: string; exclusion_reason: string | null }[]) {
    const reason = row.exclusion_reason?.trim();
    if (!reason) continue;
    (byIncident[row.incident_id] ??= {});
    byIncident[row.incident_id][reason] = (byIncident[row.incident_id][reason] ?? 0) + 1;
  }

  const out: Record<string, ExclusionSummary> = {};
  for (const [incidentId, reasons] of Object.entries(byIncident)) {
    const ranked = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((n, [, c]) => n + c, 0);
    out[incidentId] = { reason: ranked[0][0], count: ranked[0][1], total };
  }
  return out;
}
