import { z } from "zod";
import { fail, guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { advanceAssignment } from "@/lib/services/dispatchService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ACTIONS = ["accept", "decline", "arrive", "complete"] as const;
const schema = z.object({ reason: z.string().max(300).optional() });

/** Responder-side state machine: accept -> en route -> on scene -> completed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["responder", "coordinator"]);
  if (deny) return deny;

  const { id, action } = await ctx.params;
  if (!ACTIONS.includes(action as any)) {
    return fail("bad_action", `Action must be one of: ${ACTIONS.join(", ")}`, 404);
  }

  let reason: string | undefined;
  try { reason = schema.parse(await req.json()).reason; } catch { /* body optional */ }

  const result = await advanceAssignment(
    id, action as (typeof ACTIONS)[number], { id: user!.id, label: user!.display_name }, reason,
  );
  return ok(result, result.ok ? 200 : 400);
}
