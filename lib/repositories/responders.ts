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

export async function adjustLoad(id: string, delta: number) {
  const r = await getResponder(id);
  if (!r) return null;
  const next = Math.max(0, r.current_load + delta);
  return updateResponder(id, { current_load: next });
}
