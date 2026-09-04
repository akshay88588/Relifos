import { randomUUID } from "node:crypto";
import { publish, notify } from "@/lib/events/publish";
import { admin } from "@/lib/supabase/admin";
import { rescoreWaitingFor } from "./reconciler";

/** Shelter capacity is a real constraint: when it moves, dependent incidents re-price. */
export async function adjustShelterCapacity(shelterId: string, delta: number, reason: string) {
  const correlationId = randomUUID();
  const { data: shelter } = await admin()
    .from("shelters").select("id, name, capacity_total, capacity_used, lat, lng").eq("id", shelterId).maybeSingle();
  if (!shelter) throw new Error("Shelter not found");

  const used = Math.max(0, Math.min(shelter.capacity_total, shelter.capacity_used + delta));
  const ratio = shelter.capacity_total ? used / shelter.capacity_total : 1;
  const status = ratio >= 1 ? "full" : ratio >= 0.85 ? "near_full" : "open";

  await admin().from("shelters").update({ capacity_used: used, status, updated_at: new Date().toISOString() }).eq("id", shelterId);
  await admin().from("shelter_capacity_events").insert({ shelter_id: shelterId, delta, reason });

  await publish({
    type: "shelter.capacity_changed", entity_type: "shelter", entity_id: shelterId,
    correlation_id: correlationId,
    payload: { name: shelter.name, capacity_used: used, capacity_total: shelter.capacity_total,
               status, delta, reason },
  });

  if (status !== "open") {
    await notify({
      title: `${shelter.name} is ${status.replace("_", " ")}`,
      body: `${used}/${shelter.capacity_total} occupied after: ${reason}`,
      severity: status === "full" ? "critical" : "warning",
    });
    // Evacuation-dependent incidents now have fewer safe destinations.
    await rescoreWaitingFor(["evacuation", "shelter_support", "transport"], "shelter_capacity", correlationId);
  }
  return { id: shelterId, capacity_used: used, status };
}

export async function adjustResourceInventory(resourceId: string, delta: number) {
  const { data: res } = await admin()
    .from("resources").select("id, label, kind, quantity_total, quantity_available").eq("id", resourceId).maybeSingle();
  if (!res) throw new Error("Resource not found");
  const available = Math.max(0, Math.min(res.quantity_total, res.quantity_available + delta));
  await admin().from("resources").update({ quantity_available: available, updated_at: new Date().toISOString() }).eq("id", resourceId);
  await publish({
    type: "resource.updated", entity_type: "resource", entity_id: resourceId,
    payload: { label: res.label, kind: res.kind, quantity_available: available, quantity_total: res.quantity_total, delta },
  });
  return { id: resourceId, quantity_available: available };
}
