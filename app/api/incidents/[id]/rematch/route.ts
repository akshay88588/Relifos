import { fail, guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { getIncident } from "@/lib/repositories/incidents";
import { runMatching } from "@/lib/services/matching";
import { recomputePriority } from "@/lib/services/reconciler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Force a fresh assessment of who should go, against current conditions. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;

  const { id } = await ctx.params;
  const incident = await getIncident(id);
  if (!incident) return fail("not_found", "Incident not found", 404);
  const repriced = await recomputePriority(incident, "manual_rematch");
  const result = await runMatching(repriced, { trigger: "manual_rematch" });
  return ok({ incident: repriced, ...result });
}
