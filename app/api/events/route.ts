import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * REST catch-up for the realtime stream. The client calls this when it detects a
 * gap in the seq sequence or after a reconnect, so a dropped packet can never
 * leave the command centre silently stale.
 */
export async function GET(req: Request) {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after_seq") ?? 0);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));

  let q = admin().from("system_events")
    .select("id, seq, type, entity_type, entity_id, incident_id, actor_type, actor_label, payload, created_at");
  q = after > 0 ? q.gt("seq", after).order("seq", { ascending: true })
                : q.order("seq", { ascending: false });

  const { data, error } = await q.limit(limit);
  if (error) return ok({ events: [], error: error.message });
  const events = after > 0 ? data ?? [] : (data ?? []).reverse();
  return ok({ events });
}
