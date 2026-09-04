import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { stopChaos } from "@/lib/services/simulationService";

export const dynamic = "force-dynamic";

export async function POST() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  return ok(await stopChaos());
}
