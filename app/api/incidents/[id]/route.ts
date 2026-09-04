import { guardConfigured, ok, fail } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { getIncident } from "@/lib/repositories/incidents";
import { listCandidates } from "@/lib/repositories/matches";
import { listAiDecisions, listFactors } from "@/lib/repositories/decisions";
import { listAssignments } from "@/lib/repositories/assignments";
import { admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Everything a coordinator needs to audit one decision, straight from the database. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;

  const { id } = await ctx.params;
  const incident = await getIncident(id);
  if (!incident) return fail("not_found", "Incident not found", 404);

  const [candidates, assignments, priorityFactors, aiDecisions, events, assessments] = await Promise.all([
    listCandidates(id),
    listAssignments([id]),
    listFactors("priority", id),
    listAiDecisions(id),
    admin().from("system_events").select("id, seq, type, actor_type, actor_label, payload, created_at")
      .eq("incident_id", id).order("seq", { ascending: false }).limit(80),
    admin().from("incident_assessments").select("version, structured, trigger, created_at")
      .eq("incident_id", id).order("version", { ascending: false }),
  ]);

  const responderIds = Array.from(new Set([
    ...candidates.map((c: any) => c.responder_id),
    ...assignments.map((a) => a.responder_id),
  ]));
  const { data: responders } = responderIds.length
    ? await admin().from("responders").select("id, name, type, status, org, capabilities, lat, lng").in("id", responderIds)
    : { data: [] as any[] };

  return ok({
    incident, candidates, assignments, priorityFactors, aiDecisions,
    assessments: assessments.data ?? [],
    events: events.data ?? [],
    responders: responders ?? [],
  });
}
