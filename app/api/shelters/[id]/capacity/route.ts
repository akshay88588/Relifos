import { z } from "zod";
import { fail, guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { adjustShelterCapacity } from "@/lib/services/resourceService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const schema = z.object({ delta: z.number().int().min(-1000).max(1000), reason: z.string().max(200).default("Manual adjustment") });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    return ok(await adjustShelterCapacity(id, data!.delta, data!.reason));
  } catch (err: any) {
    return fail("capacity_failed", err?.message ?? "Could not adjust capacity", 500);
  }
}
