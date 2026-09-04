import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { resetSimulation } from "@/lib/services/simulationService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Kill switch: removes every simulated row and resets tuning to defaults. */
export async function POST() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  return ok(await resetSimulation());
}
