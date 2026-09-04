import { z } from "zod";
import { clientIp, fail, guardConfigured, ok, parseBody, rateLimit } from "@/lib/api/http";
import { addIncidentUpdate } from "@/lib/services/incidentService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({ description: z.string().min(4).max(1000) });

/** A reporter adds information. New assessment version -> possible reprioritisation. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  if (!rateLimit(clientIp(req), 15)) return fail("rate_limited", "Please wait a moment", 429);

  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    return ok(await addIncidentUpdate(id, data!.description));
  } catch (err: any) {
    return fail("update_failed", err?.message ?? "Could not apply the update", 500);
  }
}
