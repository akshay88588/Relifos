"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Connection } from "@/lib/realtime/useReliefStream";

/**
 * Connection state is stated in words, not just a colour. "OFFLINE — polling"
 * is the honest label: the console keeps refreshing over REST, so the operator
 * knows data is still moving even though the socket is down.
 */
export function ConnectionPill({ connection }: { connection: Connection }) {
  const map = {
    live: { label: "Live", tone: "var(--st-available)", detail: "Realtime connected" },
    connecting: { label: "Connecting", tone: "var(--warn)", detail: "Opening realtime channel" },
    reconnecting: { label: "Reconnecting", tone: "var(--warn)", detail: "Realtime dropped — retrying, polling meanwhile" },
    offline: { label: "Offline — polling", tone: "var(--danger)", detail: "Realtime closed — refreshing every 4 seconds" },
  } as const;
  const s = map[connection];
  return (
    <span
      className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider font-semibold whitespace-nowrap"
      style={{ color: s.tone }}
      title={s.detail}
      role="status"
      aria-live="polite"
    >
      <i
        className={clsx("w-2 h-2 rounded-full shrink-0", connection === "live" && "live-dot")}
        style={{ background: s.tone }}
        aria-hidden="true"
      />
      {s.label}
    </span>
  );
}

interface SystemStatus {
  ai?: { configured?: boolean; recent_fallback_rate?: number | null; last_latency_ms?: number | null };
  supabase?: { ok?: boolean };
  simulation?: { congestion_factor?: number };
}

/** Honest system health, read from /api/system/status. */
export function SystemChip() {
  const [s, setS] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/system/status", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (alive) setS(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!s) return null;

  const aiOk = Boolean(s.ai?.configured);
  const fallbackRate = s.ai?.recent_fallback_rate ?? 0;
  const degraded = fallbackRate > 0;
  const congestion = s.simulation?.congestion_factor ?? 1;

  return (
    <div className="hidden md:flex items-center gap-3 text-[10.5px]" role="status">
      <span
        style={{ color: aiOk ? (degraded ? "var(--warn)" : "var(--text-secondary)") : "var(--danger)" }}
        title={aiOk ? "Featherless configured" : "FEATHERLESS_API_KEY is not set — assessments use the rule-based fallback"}
      >
        AI {aiOk ? (degraded ? `degraded · ${Math.round(fallbackRate * 100)}% fallback` : "ok") : "not configured"}
        {s.ai?.last_latency_ms ? ` · ${s.ai.last_latency_ms}ms` : ""}
      </span>
      <span style={{ color: s.supabase?.ok ? "var(--text-secondary)" : "var(--danger)" }}>
        DB {s.supabase?.ok ? "ok" : "error"}
      </span>
      {congestion > 1 && (
        <span style={{ color: "var(--p-high)" }} title="Chaos Mode has raised the road congestion factor">
          congestion ×{congestion}
        </span>
      )}
    </div>
  );
}
