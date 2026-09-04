import { guardConfigured, ok } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/rbac";
import { admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const notReady = guardConfigured();
  if (notReady) return notReady;
  const { deny } = await requireRole(["coordinator", "responder"]);
  if (deny) return deny;
  const { data } = await admin().from("shelters")
    .select("id, name, capacity_total, capacity_used, status, lat, lng, is_simulated").order("name");
  return ok({ shelters: data ?? [] });
}
