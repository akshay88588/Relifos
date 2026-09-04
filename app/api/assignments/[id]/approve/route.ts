import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { approveDispatch } from "@/lib/services/dispatchService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** THE HUMAN-IN-THE-LOOP GATE. Nothing is committed until this runs. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["coordinator"]);
  if (deny) return deny;

  const { id } = await ctx.params;
  const result = await approveDispatch(id, { id: user!.id, label: user!.display_name });
  return ok(result, result.ok ? 200 : result.conflict ? 409 : 400);
}
