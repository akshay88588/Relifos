import { ok } from "@/lib/api/http";
import { getProvider } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/rbac";
import { admin, isConfigured } from "@/lib/supabase/admin";
import { getConfig } from "@/lib/services/config";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Honest system health: what is actually configured and actually working. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // A deep probe spends a real Featherless completion. Anonymous callers must
  // not be able to burn the quota (or measure it) by hitting this in a loop.
  const user = url.searchParams.get("deep") === "1" ? await currentUser() : null;
  const deep = Boolean(user && (user.role === "coordinator" || user.role === "admin"));

  const configured = isConfigured();
  const aiConfigured = Boolean(process.env.FEATHERLESS_API_KEY);

  let db: { ok: boolean; error?: string } = { ok: false };
  let fallbackRate: number | null = null;
  let lastLatency: number | null = null;
  let simulationActive = false;
  let congestion = 1;

  if (configured) {
    try {
      const { error } = await admin().from("incidents").select("id", { count: "exact", head: true });
      db = { ok: !error, error: error?.message };
      const { data: recent } = await admin().from("ai_decisions")
        .select("fallback_used, latency_ms").order("created_at", { ascending: false }).limit(20);
      if (recent?.length) {
        fallbackRate = recent.filter((r) => r.fallback_used).length / recent.length;
        lastLatency = recent.find((r) => r.latency_ms != null)?.latency_ms ?? null;
      }
      simulationActive = Boolean(await getConfig("simulation_active", false));
      congestion = Number(await getConfig("congestion_factor", 1));
    } catch (err: any) {
      db = { ok: false, error: err?.message };
    }
  }

  let ai: Record<string, unknown> = {
    configured: aiConfigured,
    provider: "featherless",
    model: process.env.FEATHERLESS_MODEL ?? null,
  };
  if (deep && aiConfigured) {
    const p = getProvider();
    ai = { ...ai, ...(p ? await p.health() : { ok: false, error: "provider unavailable" }) };
  }

  return ok({
    supabase: { configured, ...db },
    ai: { ...ai, recent_fallback_rate: fallbackRate, last_latency_ms: lastLatency },
    simulation: { active: simulationActive, congestion_factor: congestion },
    auto_dispatch_enabled: process.env.AUTO_DISPATCH_ENABLED === "true",
  });
}
