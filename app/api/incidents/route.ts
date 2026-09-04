import { z } from "zod";
import { clientIp, fail, guardConfigured, ok, parseBody, rateLimit } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { currentUser } from "@/lib/auth/rbac";
import { intakeIncident } from "@/lib/services/incidentService";
import { listIncidents } from "@/lib/repositories/incidents";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  description: z.string().min(8, "Describe what is happening").max(2000),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  source: z.enum(["text", "voice"]).default("text"),
  address_hint: z.string().max(200).nullable().optional(),
});

/** PUBLIC: a citizen reports an emergency. Voice and text land here identically. */
export async function POST(req: Request) {
  const notReady = guardConfigured();
  if (notReady) return notReady;

  if (!rateLimit(clientIp(req), 10)) {
    return fail("rate_limited", "Too many reports from this address. Please wait a moment.", 429);
  }

  const { data, error } = await parseBody(req, bodySchema);
  if (error) return error;

  const user = await currentUser();

  try {
    const result = await intakeIncident({
      description: data!.description,
      lat: data!.lat ?? null,
      lng: data!.lng ?? null,
      source: data!.source,
      address_text: data!.address_hint ?? null,
      reported_by: user?.id ?? null,
    });
    return ok(result, 201);
  } catch (err: any) {
    return fail("intake_failed", err?.message ?? "Could not process the report", 500);
  }
}

/** STAFF: the incident list behind the command centre. */
export async function GET() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;
  return ok({ incidents: await listIncidents({ open: true }) });
}
