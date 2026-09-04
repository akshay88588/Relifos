import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { ageOpenIncidents } from "@/lib/services/reconciler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Time pressure: undispatched incidents grow more urgent on their own. */
export async function POST() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  return ok(await ageOpenIncidents());
}
