import { randomUUID } from "node:crypto";
import { publish } from "@/lib/events/publish";
import * as R from "@/lib/repositories/responders";
import { afterResponderStatusChange } from "./reconciler";

/**
 * A responder changing availability is the single most disruptive event in the
 * system: it can strand an incident that was already promised help. Every
 * status change therefore runs the full reconciliation cascade.
 */
export async function setResponderStatus(
  responderId: string,
  status: string,
  actor?: { id: string; label: string },
) {
  const correlationId = randomUUID();
  const before = await R.getResponder(responderId);
  if (!before) throw new Error("Responder not found");
  if (before.status === status) return { responder: before, changed: false };

  const updated = await R.updateResponder(responderId, { status });
  await publish({
    type: "responder.status_changed", entity_type: "responder", entity_id: responderId,
    actor_type: actor ? "user" : "system", actor_id: actor?.id ?? null,
    actor_label: actor?.label ?? null, correlation_id: correlationId,
    payload: { from: before.status, to: status, name: updated.name },
  });

  await afterResponderStatusChange(responderId, status, correlationId);
  return { responder: (await R.getResponder(responderId))!, changed: true };
}

export async function moveResponder(responderId: string, lat: number, lng: number) {
  await R.setResponderLocation(responderId, lat, lng);
  const updated = await R.getResponder(responderId);
  await publish({
    type: "responder.location_changed", entity_type: "responder", entity_id: responderId,
    payload: { lat, lng, name: updated?.name },
  });
  return updated;
}
