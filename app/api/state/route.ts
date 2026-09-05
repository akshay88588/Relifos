import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { listIncidents } from "@/lib/repositories/incidents";
import { listResponders } from "@/lib/repositories/responders";
import { listAssignments } from "@/lib/repositories/assignments";
import { admin } from "@/lib/supabase/admin";
import { exclusionSummaryFor } from "@/lib/repositories/matches";
import { priorityFactorsFor } from "@/lib/repositories/decisions";

export const dynamic = "force-dynamic";

/** One bootstrap read for the command centre; realtime keeps it current afterwards. */
export async function GET() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;

  const [incidents, responders, assignments, shelters, events, notifications, run] = await Promise.all([
    listIncidents({ open: true }),
    listResponders(),
    listAssignments(),
    admin().from("shelters").select("id, name, capacity_total, capacity_used, status, lat, lng").order("name"),
    admin().from("system_events")
      .select("id, seq, type, entity_type, entity_id, incident_id, actor_type, actor_label, payload, created_at")
      .order("seq", { ascending: false }).limit(60),
    admin().from("notifications").select("id, title, body, severity, incident_id, created_at")
      .order("created_at", { ascending: false }).limit(20),
    admin().from("simulation_runs").select("id, scenario, status, current_step, steps, started_at")
      .eq("status", "running").maybeSingle(),
  ]);

  // Incidents with nothing recommended: explain WHY, from the reasons the
  // matching engine persisted, rather than showing a bare "no recommendation".
  const liveAssignment = new Set(
    assignments
      .filter((a) => ["recommended", "awaiting_approval", "dispatched", "accepted", "en_route", "on_scene"].includes(a.status))
      .map((a) => a.incident_id),
  );
  const unmatched = incidents.filter((i) => !liveAssignment.has(i.id)).map((i) => i.id);
  const exclusions = await exclusionSummaryFor(unmatched);

  // The priority breakdown the engine persisted, batched for the whole queue so
  // every card can explain its own score without the coordinator clicking first.
  const factors = await priorityFactorsFor(incidents.map((i) => i.id));

  return ok({
    incidents, responders, assignments, exclusions, factors,
    shelters: shelters.data ?? [],
    events: (events.data ?? []).reverse(),
    notifications: notifications.data ?? [],
    simulation: run.data ?? null,
  });
}
