"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Connection } from "@/lib/realtime/useReliefStream";

export function ConnectionPill({ connection }: { connection: Connection }) {
  const map = {
    live: ["LIVE", "bg-emerald-500", "text-emerald-300"],
    connecting: ["CONNECTING", "bg-amber-500", "text-amber-300"],
    reconnecting: ["RECONNECTING", "bg-amber-500", "text-amber-300"],
    offline: ["OFFLINE - polling", "bg-red-500", "text-red-300"],
  } as const;
  const [label, dot, text] = map[connection];
  return (
    <span className={clsx("flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider", text)}>
      <i className={clsx("w-1.5 h-1.5 rounded-full", dot, connection === "live" && "animate-pulse")} />
      {label}
    </span>
  );
}

/** Honest system health, read from /api/system/status. */
export function SystemChip() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    const load = () => fetch("/api/system/status").then((r) => r.json()).then(setS).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;

  const aiOk = s.ai?.configured;
  const degraded = (s.ai?.recent_fallback_rate ?? 0) > 0;
  return (
    <div className="flex items-center gap-3 text-[10.5px]">
      <span className={aiOk ? (degraded ? "text-amber-400" : "text-zinc-400") : "text-red-400"}>
        AI {aiOk ? (degraded ? `degraded ${Math.round(s.ai.recent_fallback_rate * 100)}% fallback` : "ok") : "not configured"}
        {s.ai?.last_latency_ms ? ` · ${s.ai.last_latency_ms}ms` : ""}
      </span>
      <span className={s.supabase?.ok ? "text-zinc-400" : "text-red-400"}>
        DB {s.supabase?.ok ? "ok" : "error"}
      </span>
      {s.simulation?.congestion_factor > 1 && (
        <span className="text-orange-400">congestion ×{s.simulation.congestion_factor}</span>
      )}
    </div>
  );
}
