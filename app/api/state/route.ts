import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { listIncidents } from "@/lib/repositories/incidents";
import { listResponders } from "@/lib/repositories/responders";
import { listAssignments } from "@/lib/repositories/assignments";
import { admin } from "@/lib/supabase/admin";

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

  return ok({
    incidents, responders, assignments,
    shelters: shelters.data ?? [],
    events: (events.data ?? []).reverse(),
    notifications: notifications.data ?? [],
    simulation: run.data ?? null,
  });
}
