import { z } from "zod";
import { fail, guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { setResponderStatus } from "@/lib/services/responderService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["available", "en_route", "on_scene", "busy", "offline"]) });

/**
 * The most disruptive endpoint in the system: taking a responder out of service
 * can strand an incident that was already promised help, so this triggers the
 * full reconciliation cascade.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["responder", "coordinator"]);
  if (deny) return deny;
  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    const result = await setResponderStatus(id, data!.status, { id: user!.id, label: user!.display_name });
    return ok(result);
  } catch (err: any) {
    return fail("status_failed", err?.message ?? "Could not change status", 500);
  }
}
