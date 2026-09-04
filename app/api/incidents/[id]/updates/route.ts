import { z } from "zod";
import { clientIp, fail, guardConfigured, ok, parseBody, rateLimit } from "@/lib/api/http";
import { currentUser } from "@/lib/auth/rbac";
import { getIncident, canAmendIncident } from "@/lib/repositories/incidents";
import { addIncidentUpdate } from "@/lib/services/incidentService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({ description: z.string().min(4).max(1000) });

/**
 * A reporter adds information to THEIR OWN report. A new assessment version is
 * produced, which can move the priority band and invalidate a recommendation.
 *
 * This endpoint is reachable without a session, so it must prove ownership
 * itself. Previously it did not: anyone who knew an incident UUID could append
 * arbitrary text, forcing a fresh model call and a priority recalculation —
 * enough to push a fabricated emergency to the top of the queue, or to burn the
 * AI budget. Callers must now present one of:
 *
 *   - the reporter token issued once when the incident was created, or
 *   - a signed-in session that owns the incident, or
 *   - a coordinator/responder session.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  if (!(await rateLimit(clientIp(req), 15))) return fail("rate_limited", "Please wait a moment", 429);

  const { data, error } = await parseBody(req, schema);
  if (error) return error;
  const { id } = await ctx.params;

  const incident = await getIncident(id);
  if (!incident) return fail("not_found", "Incident not found", 404);

  const user = await currentUser();
  const isStaff = user?.role === "coordinator" || user?.role === "responder" || user?.role === "admin";
  const owns = isStaff
    ? true
    : await canAmendIncident(id, req.headers.get("x-reporter-token"), user?.id ?? null);

  if (!owns) {
    return fail("forbidden", "You can only add detail to your own report", 403);
  }

  try {
    return ok(await addIncidentUpdate(id, data!.description));
  } catch (err: any) {
    return fail("update_failed", err?.message ?? "Could not apply the update", 500);
  }
}
