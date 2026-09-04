import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { tickChaos } from "@/lib/services/simulationService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The browser pokes this every couple of seconds, but the SERVER owns the
 * script: it decides which steps are due from started_at and current_step and
 * executes them through the ordinary services. The client cannot cause a state
 * change the server did not perform.
 */
export async function POST() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  return ok(await tickChaos());
}
