import { admin } from "@/lib/supabase/admin";
import type { EventType, SystemEvent } from "./types";

export interface PublishArgs {
  type: EventType;
  entity_type: SystemEvent["entity_type"];
  entity_id?: string | null;
  incident_id?: string | null;
  actor_type?: SystemEvent["actor_type"];
  actor_id?: string | null;
  actor_label?: string | null;
  correlation_id?: string | null;
  payload?: Record<string, any>;
  simulation_run_id?: string | null;
}

/**
 * Appending to system_events IS the realtime publish: Supabase Realtime streams
 * inserts on this table to every subscribed client. Timeline, audit trail and
 * live feed are therefore the same rows, and nothing can appear in the UI that
 * did not happen in the database.
 */
export async function publish(args: PublishArgs) {
  const { data, error } = await admin()
    .from("system_events")
    .insert({
      type: args.type,
      entity_type: args.entity_type,
      entity_id: args.entity_id ?? null,
      incident_id: args.incident_id ?? null,
      actor_type: args.actor_type ?? "system",
      actor_id: args.actor_id ?? null,
      actor_label: args.actor_label ?? null,
      correlation_id: args.correlation_id ?? null,
      payload: args.payload ?? {},
      simulation_run_id: args.simulation_run_id ?? null,
    })
    .select("id, seq")
    .single();

  if (error) {
    // An event that cannot be recorded is a real failure, but it must not roll
    // back the state change that already succeeded. Log loudly and continue.
    console.error("[events] failed to publish", args.type, error.message);
    return null;
  }
  return data;
}

export async function publishMany(list: PublishArgs[]) {
  for (const e of list) await publish(e);
}

export async function notify(args: {
  title: string; body?: string; severity?: "info" | "warning" | "critical";
  incident_id?: string | null; target_role?: string | null;
}) {
  const { data } = await admin()
    .from("notifications")
    .insert({
      title: args.title,
      body: args.body ?? null,
      severity: args.severity ?? "info",
      incident_id: args.incident_id ?? null,
      target_role: args.target_role ?? "coordinator",
    })
    .select("id")
    .single();

  await publish({
    type: "notification.created",
    entity_type: "notification",
    entity_id: data?.id ?? null,
    incident_id: args.incident_id ?? null,
    payload: { title: args.title, body: args.body ?? null, severity: args.severity ?? "info" },
  });
  return data?.id ?? null;
}
