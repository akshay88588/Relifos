"use client";
import Link from "next/link";
import { useState } from "react";
import { useReliefStream } from "@/lib/realtime/useReliefStream";
import { ConnectionPill } from "@/components/command/StatusBar";
import { UserChip } from "@/components/command/UserChip";
import { BandChip, StatusDot } from "@/components/ui/bits";
import { ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";

const STATUSES = ["available", "busy", "offline"] as const;

/**
 * RESPONDER CONSOLE.
 *
 * Every control here writes to the database through a route handler and the
 * consequences ripple back through the reconciler: going offline while holding
 * an assignment invalidates it and triggers a search for an alternative, which
 * the command centre sees within a second.
 */
export default function ResponderConsole() {
  const { state, connection, error, refetch } = useReliefStream();
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const responders = state?.responders ?? [];
  const unit = responders.find((r) => r.id === me) ?? null;
  const assignment = (state?.assignments ?? []).find(
    (a) => a.responder_id === me && ACTIVE_ASSIGNMENT.includes(a.status),
  );
  const incident = (state?.incidents ?? []).find((i) => i.id === assignment?.incident_id);

  async function call(url: string, body?: unknown) {
    setBusy(true); setFlash(null);
    const res = await fetch(url, {
      method: url.includes("/status") ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setFlash(data?.message ?? data?.error?.message ?? (res.ok ? "Updated" : "Failed"));
    refetch();
  }

  return (
    <main className="min-h-screen">
      <header className="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">RELIEF<span className="text-emerald-400">OS</span></Link>
          <span className="label">Responder console</span>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionPill connection={connection} />
          <UserChip />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 text-[12.5px] text-red-300">
            {error} <Link href="/login" className="underline">Sign in</Link>
          </div>
        )}

        <div className="panel p-4">
          <div className="label mb-2">Operating as</div>
          <select value={me ?? ""} onChange={(e) => setMe(e.target.value || null)}
            className="w-full bg-base-950 border border-white/10 rounded px-2.5 py-2 text-[13px]">
            <option value="">Select your unit…</option>
            {responders.map((r) => (
              <option key={r.id} value={r.id}>{r.name} — {r.type}</option>
            ))}
          </select>
        </div>

        {unit && (
          <>
            <div className="mt-3 panel p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[15px] text-zinc-100 flex items-center gap-2">
                    <StatusDot status={unit.status} />{unit.name}
                  </div>
                  <div className="text-[11.5px] text-zinc-500 mt-0.5">
                    {unit.capabilities.join(" · ")} · load {unit.current_load}/{unit.max_concurrent}
                  </div>
                </div>
                <span className="chip bg-white/10 text-zinc-300">{unit.status.replace("_", " ")}</span>
              </div>
              <div className="mt-3 flex gap-2">
                {STATUSES.map((s) => (
                  <button key={s} className="btn-ghost" disabled={busy || unit.status === s}
                    onClick={() => call(`/api/responders/${unit.id}/status`, { status: s })}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Going offline while holding an assignment invalidates it and triggers an automatic
                search for an alternative responder.
              </p>
            </div>

            {assignment && incident ? (
              <div className="mt-3 panel p-4">
                <div className="flex items-center justify-between">
                  <span className="label">Current assignment</span>
                  <BandChip band={incident.priority_band} score={incident.priority_score} />
                </div>
                <div className="mt-2 font-mono text-[13px] text-zinc-300">{incident.code}</div>
                <p className="mt-1.5 text-[13.5px] text-zinc-200">{incident.short_summary}</p>
                <div className="mt-1.5 text-[12px] text-zinc-500">
                  {incident.people_affected} affected · needs {incident.required_capabilities.join(", ")} ·
                  ETA ~{Math.round(assignment.eta_minutes ?? 0)} min (est.)
                </div>
                {incident.vulnerability_flags?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {incident.vulnerability_flags.map((f) => (
                      <span key={f} className="chip bg-amber-500/15 text-amber-300">{f.replace("_", " ")}</span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {assignment.status === "dispatched" && (
                    <>
                      <button className="btn-primary" disabled={busy}
                        onClick={() => call(`/api/assignments/${assignment.id}/accept`)}>Accept</button>
                      <button className="btn-ghost" disabled={busy}
                        onClick={() => call(`/api/assignments/${assignment.id}/decline`, { reason: "Unable to respond" })}>
                        Decline
                      </button>
                    </>
                  )}
                  {assignment.status === "accepted" && (
                    <button className="btn-primary" disabled={busy}
                      onClick={() => call(`/api/assignments/${assignment.id}/arrive`)}>Arrived on scene</button>
                  )}
                  {assignment.status === "on_scene" && (
                    <button className="btn-primary" disabled={busy}
                      onClick={() => call(`/api/assignments/${assignment.id}/complete`)}>Mark complete</button>
                  )}
                  <span className="chip bg-blue-500/20 text-blue-300 self-center">{assignment.status.replace("_", " ")}</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 panel p-4 text-[13px] text-zinc-500">
                No active assignment. New dispatches appear here the moment a coordinator approves them.
              </div>
            )}
          </>
        )}

        {flash && <div className="mt-3 text-[12.5px] text-zinc-400">{flash}</div>}
      </div>
    </main>
  );
}
