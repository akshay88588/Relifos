import { z } from "zod";
import { guardConfigured, ok, parseBody } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { DEMO_INCIDENTS, seedIncident, seedWorld } from "@/lib/services/simulationService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  phase: z.enum(["world", "incident"]).default("world"),
  index: z.number().int().min(0).max(20).default(0),
});

/**
 * Seeding runs through the same services real users hit: responders and
 * shelters are inserted directly (they are static entities), but every seeded
 * incident goes through the full intake pipeline, including real model calls.
 * One incident per request keeps each call inside the serverless time budget.
 */
export async function POST(req: Request) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator"]);
  if (deny) return deny;

  const { data, error } = await parseBody(req, schema);
  if (error) return error;

  if (data!.phase === "world") {
    return ok({ ...(await seedWorld()), incidents_to_seed: DEMO_INCIDENTS.length });
  }
  const index = data!.index;
  const result = await seedIncident(index);
  return ok({
    seeded: Boolean(result),
    index,
    remaining: Math.max(0, DEMO_INCIDENTS.length - index - 1),
    incident: result?.incident ?? null,
  });
}
