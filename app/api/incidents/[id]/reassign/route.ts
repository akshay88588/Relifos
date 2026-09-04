import { z } from "zod";
import { guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { manualAssign } from "@/lib/services/dispatchService";

export const dynamic = "force-dynamic";
const schema = z.object({ responder_id: z.string().uuid(), reason: z.string().max(300).default("Coordinator override") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  const result = await manualAssign(id, data!.responder_id, { id: user!.id, label: user!.display_name });
  return ok(result, result.ok ? 200 : 409);
}
