import { admin } from "@/lib/supabase/admin";

export const RESPONDER_COLUMNS =
  "id, name, org, type, status, capabilities, current_load, max_concurrent, speed_kmh, lat, lng, is_simulated, updated_at";

export interface ResponderRow {
  id: string; name: string; org: string | null; type: string; status: string;
  capabilities: string[]; current_load: number; max_concurrent: number;
  speed_kmh: number; lat: number | null; lng: number | null;
  is_simulated: boolean; updated_at: string;
}

export async function listResponders() {
  const { data, error } = await admin().from("responders").select(RESPONDER_COLUMNS).order("name");
  if (error) throw new Error(`listResponders: ${error.message}`);
  return (data ?? []) as unknown as ResponderRow[];
}

export async function getResponder(id: string) {
  const { data, error } = await admin().from("responders").select(RESPONDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getResponder: ${error.message}`);
  return (data as unknown as ResponderRow) ?? null;
}

export async function updateResponder(id: string, patch: Record<string, any>) {
  const { data, error } = await admin().from("responders").update(patch).eq("id", id).select(RESPONDER_COLUMNS).single();
  if (error) throw new Error(`updateResponder: ${error.message}`);
  return data as unknown as ResponderRow;
}

export async function setResponderLocation(id: string, lat: number, lng: number) {
  const { error } = await admin().from("responders")
    .update({ current_location: `SRID=4326;POINT(${lng} ${lat})` }).eq("id", id);
  if (error) throw new Error(`setResponderLocation: ${error.message}`);
  await admin().from("responder_locations").insert({
    responder_id: id, location: `SRID=4326;POINT(${lng} ${lat})`,
  });
}

/**
 * Atomic load adjustment.
 *
 * This used to read the row, add the delta in JavaScript and write it back,
 * which loses an update when two dispatches commit at the same time. Because
 * current_load gates candidate eligibility in the matching engine, drift here
 * silently changes who gets dispatched. The arithmetic now happens inside
 * Postgres in a single statement.
 */
export async function adjustLoad(id: string, delta: number) {
  const { data, error } = await admin().rpc("adjust_responder_load", { p_id: id, p_delta: delta });
  if (error) {
    console.error("[responders] adjustLoad failed", error.message);
    return null;
  }
  return { id, current_load: data as number };
}
