"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReliefState } from "@/lib/clientTypes";
import { Spinner } from "@/components/ui/bits";

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
 * The Chaos script lives on the SERVER. This component only pokes
 * /api/simulation/chaos/tick on an interval; the server decides which steps are
 * due and executes them through the same services a real user would hit. The
 * client is a metronome and cannot cause a state change the server did not make.
 */
export function ChaosControls({ state, onRefetch }: { state: ReliefState | null; onRefetch: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seedProgress, setSeedProgress] = useState<{ done: number; total: number } | null>(null);
  const running = state?.simulation?.status === "running";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ticking = useRef(false);

  useEffect(() => {
    if (!running) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(async () => {
      // A slow tick must not stack: one request in flight at a time.
      if (ticking.current) return;
      ticking.current = true;
      try {
        const r = await post("/api/simulation/chaos/tick");
        if (r.data?.executed?.length) { setMsg(r.data.executed[0]); onRefetch(); }
        if (r.data?.running === false) onRefetch();
      } catch { /* the next tick retries; the server owns the schedule */ }
      finally { ticking.current = false; }
    }, 2500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, onRefetch]);

  const seed = useCallback(async () => {
    setBusy("seed"); setMsg("Seeding responders and shelters…");
    const world = await post("/api/simulation/seed", { phase: "world" });
    if (!world.ok) {
      setMsg(world.data?.error?.message ?? "Seed failed");
      setBusy(null); return;
    }
    onRefetch();
    const total = world.data?.incidents_to_seed ?? 0;
    for (let i = 0; i < total; i++) {
      setSeedProgress({ done: i, total });
      setMsg(`Assessing demo incident ${i + 1} of ${total} through the live AI pipeline…`);
      await post("/api/simulation/seed", { phase: "incident", index: i });
      onRefetch();
    }
    setSeedProgress(null);
    setMsg("Demo world ready.");
    setBusy(null);
  }, [onRefetch]);

  async function act(kind: "start" | "stop" | "reset") {
    if (kind === "reset" && !window.confirm(
      "Reset removes every simulated incident, responder and shelter. Events belonging to real reports are kept. Continue?"
    )) return;
    setBusy(kind);
    const url = kind === "reset" ? "/api/simulation/reset" : `/api/simulation/chaos/${kind}`;
    const r = await post(url);
    setMsg(r.ok
      ? kind === "start" ? "Chaos Mode running" : kind === "stop" ? "Chaos Mode stopped" : "Simulation reset"
      : r.data?.error?.message ?? "Action failed");
    setBusy(null); onRefetch();
  }

  const step = state?.simulation?.current_step ?? 0;
  const total = state?.simulation?.steps?.length ?? 0;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {msg && (
        <span className="hidden lg:inline text-[11px] text-ink-tertiary max-w-[260px] truncate" role="status" aria-live="polite">
          {seedProgress && <span className="mono mr-1">{seedProgress.done}/{seedProgress.total}</span>}
          {msg}
        </span>
      )}

      {!running ? (
        <>
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={seed}>
            {busy === "seed" ? <><Spinner /> Seeding…</> : "Seed demo world"}
          </button>
          <button className="btn-danger btn-sm" disabled={!!busy} onClick={() => act("start")}
                  title="Run the 8-step flood-surge scenario through the real services">
            {busy === "start" ? <Spinner /> : "▶"} Chaos Mode
          </button>
        </>
      ) : (
        <>
          <span className="chip" style={{ background: "var(--p-critical-bg)", color: "var(--p-critical)" }}
                role="status" aria-live="polite">
            chaos {step}/{total}
          </span>
          <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => act("stop")}>Stop</button>
        </>
      )}
      <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => act("reset")}>
        {busy === "reset" ? <Spinner /> : "Reset"}
      </button>
    </div>
  );
}
