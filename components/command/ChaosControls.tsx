"use client";
import { useEffect, useRef, useState } from "react";
import type { ReliefState } from "@/lib/clientTypes";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Simulation and Chaos Mode controls.
 *
 * Chaos Mode's script lives on the server. This component only pokes
 * /api/simulation/chaos/tick on an interval; the server decides which steps are
 * due and executes them through the same services a real user would hit.
 */
export function ChaosControls({ state, onRefetch }: { state: ReliefState | null; onRefetch: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const running = state?.simulation?.status === "running";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(async () => {
      const r = await post("/api/simulation/chaos/tick");
      if (r.data?.executed?.length) { setMsg(r.data.executed[0]); onRefetch(); }
      if (r.data?.running === false) onRefetch();
    }, 2500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, onRefetch]);

  async function seed() {
    setBusy("seed"); setMsg("Seeding responders and shelters…");
    const world = await post("/api/simulation/seed", { phase: "world" });
    if (!world.ok) { setMsg(world.data?.error?.message ?? "Seed failed"); setBusy(null); return; }
    onRefetch();
    const total = world.data?.incidents_to_seed ?? 0;
    for (let i = 0; i < total; i++) {
      setMsg(`Assessing demo incident ${i + 1} of ${total} through the live AI pipeline…`);
      await post("/api/simulation/seed", { phase: "incident", index: i });
      onRefetch();
    }
    setMsg("Demo world ready.");
    setBusy(null);
  }

  async function act(kind: "start" | "stop" | "reset") {
    setBusy(kind);
    const url = kind === "reset" ? "/api/simulation/reset" : `/api/simulation/chaos/${kind}`;
    const r = await post(url);
    setMsg(r.ok ? (kind === "start" ? "Chaos Mode running" : kind === "stop" ? "Chaos Mode stopped" : "Simulation reset")
                : r.data?.error?.message ?? "Action failed");
    setBusy(null); onRefetch();
  }

  const step = state?.simulation?.current_step ?? 0;
  const total = state?.simulation?.steps?.length ?? 0;

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11px] text-zinc-500 max-w-[280px] truncate">{msg}</span>}
      {!running ? (
        <>
          <button className="btn-ghost" disabled={!!busy} onClick={seed}>
            {busy === "seed" ? "Seeding…" : "Seed demo world"}
          </button>
          <button className="btn-danger" disabled={!!busy} onClick={() => act("start")}>
            ▶ Start Chaos Mode
          </button>
        </>
      ) : (
        <>
          <span className="chip bg-red-500/20 text-red-300">chaos {step}/{total}</span>
          <button className="btn-ghost" disabled={!!busy} onClick={() => act("stop")}>Stop</button>
        </>
      )}
      <button className="btn-ghost" disabled={!!busy} onClick={() => act("reset")}>Reset</button>
    </div>
  );
}
