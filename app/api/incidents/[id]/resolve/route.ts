import { z } from "zod";
import { fail, guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { resolveIncident } from "@/lib/services/incidentService";

export const dynamic = "force-dynamic";
const schema = z.object({ note: z.string().max(400).default("Resolved by coordinator") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { user, deny } = await requireRole(["coordinator"]);
  if (deny) return deny;
  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;
  try {
    return ok({ incident: await resolveIncident(id, data!.note, user!.id) });
  } catch (err: any) {
    return fail("resolve_failed", err?.message ?? "Could not resolve", 500);
  }
}
