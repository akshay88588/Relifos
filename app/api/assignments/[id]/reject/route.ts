import { z } from "zod";
import { guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { rejectRecommendation } from "@/lib/services/dispatchService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const schema = z.object({ reason: z.string().min(2).max(300) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  const result = await rejectRecommendation(id, data!.reason, { id: user!.id, label: user!.display_name });
  return ok(result);
}
