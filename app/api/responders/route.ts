import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { listResponders } from "@/lib/repositories/responders";

export const dynamic = "force-dynamic";

export async function GET() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;
  return ok({ responders: await listResponders() });
}
