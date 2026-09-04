"use client";
import Link from "next/link";
import { useState } from "react";
import { useReliefStream } from "@/lib/realtime/useReliefStream";
import { ConnectionPill } from "@/components/command/StatusBar";
import { UserChip } from "@/components/command/UserChip";
import {
  EmptyState, LoadingState, PriorityBadge, Spinner, StatusDot, StatusPill, WarnIcon,
} from "@/components/ui/bits";
import { ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";

const STATUSES = ["available", "busy", "offline"] as const;

/**
 * RESPONDER CONSOLE.
 *
 * Every control here writes to the database through a route handler, and the
 * consequences ripple back through the reconciler: going offline while holding
 * an assignment invalidates it and triggers a search for an alternative, which
 * the command centre sees within a second.
 *
 * Built for a phone in the field: single column, large targets, the current
 * assignment always the largest thing on screen.
 */
export default function ResponderConsole() {
  const { state, connection, error, refetch } = useReliefStream();
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  const responders = state?.responders ?? [];
  const unit = responders.find((r) => r.id === me) ?? null;
  const assignment = (state?.assignments ?? []).find(
    (a) => a.responder_id === me && ACTIVE_ASSIGNMENT.includes(a.status),
  );
  const incident = (state?.incidents ?? []).find((i) => i.id === assignment?.incident_id);

  async function call(url: string, body?: unknown) {
    setBusy(true); setFlash(null);
    try {
      const res = await fetch(url, {
        method: url.includes("/status") ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.ok !== false;
      setFlash({ text: data?.message ?? data?.error?.message ?? (ok ? "Updated" : "Action failed"), ok });
      refetch();
    } catch {
      setFlash({ text: "Network problem — the change was not saved.", ok: false });
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="px-4 py-2.5 flex items-center justify-between gap-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-semibold tracking-tight shrink-0">
            RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
          </Link>
          <span className="label hidden sm:inline">Responder console</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ConnectionPill connection={connection} />
          <UserChip />
        </div>
      </header>

      <main id="main" className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <h1 className="sr-only">Responder console</h1>
        {error && (
          <p className="mb-4 text-[12.5px] panel p-3 flex items-start gap-2" role="alert"
             style={{ color: "var(--danger)", borderColor: "var(--p-critical-bd)" }}>
            <span className="mt-0.5 shrink-0"><WarnIcon /></span>
            <span>{error} <Link href="/login" className="underline">Sign in</Link></span>
          </p>
        )}

        <div className="panel p-4">
          <label htmlFor="unit-select" className="label block mb-2">Operating as</label>
          {!state ? (
            <LoadingState label="Loading units" rows={1} />
          ) : responders.length === 0 ? (
            <EmptyState title="No units available" hint="A coordinator needs to seed the demo world first." />
          ) : (
            <select
              id="unit-select"
              value={me ?? ""}
              onChange={(e) => setMe(e.target.value || null)}
              className="field"
            >
              <option value="">Select your unit…</option>
              {responders.map((r) => (
                <option key={r.id} value={r.id}>{r.name} — {r.type}</option>
              ))}
            </select>
          )}
        </div>

        {unit && (
          <>
            <section aria-label="Your unit" className="mt-3 panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] text-ink-primary flex items-center gap-2">
                    <StatusDot status={unit.status} />{unit.name}
                  </h2>
                  <p className="text-[11.5px] text-ink-tertiary mt-1 leading-snug">
                    {unit.capabilities.join(" · ")}
                  </p>
                  <p className="text-[11.5px] text-ink-faint mt-0.5">
                    load {unit.current_load}/{unit.max_concurrent}
                  </p>
                </div>
                <StatusPill status={unit.status} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Change your availability">
                {STATUSES.map((s) => (
                  <button key={s} className="btn-ghost flex-1 sm:flex-none" disabled={busy || unit.status === s}
                    aria-pressed={unit.status === s}
                    onClick={() => call(`/api/responders/${unit.id}/status`, { status: s })}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-faint leading-relaxed">
                Going offline while holding an assignment invalidates it and triggers an automatic search
                for an alternative responder.
              </p>
            </section>

            {assignment && incident ? (
              <section aria-label="Current assignment" className="mt-3 panel p-4 sheet-up"
                       style={{ borderColor: "var(--p-low-bd)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="label">Current assignment</h2>
                  <PriorityBadge band={incident.priority_band} score={incident.priority_score} />
                </div>
                <p className="mt-2 mono text-[13px] text-ink-secondary">{incident.code}</p>
                <p className="mt-1.5 text-[14px] text-ink-primary leading-relaxed">{incident.short_summary}</p>
                <p className="mt-2 text-[12px] text-ink-tertiary leading-relaxed">
                  {incident.people_affected} affected · needs {incident.required_capabilities.join(", ")} ·
                  ETA ~{Math.round(assignment.eta_minutes ?? 0)} min (est., straight-line)
                </p>

                {incident.vulnerability_flags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {incident.vulnerability_flags.map((f) => (
                      <span key={f} className="chip" style={{ background: "var(--p-high-bg)", color: "var(--p-high)" }}>
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {assignment.status === "dispatched" && (
                    <>
                      <button className="btn-primary flex-1 sm:flex-none" disabled={busy}
                        onClick={() => call(`/api/assignments/${assignment.id}/accept`)}>
                        {busy ? <Spinner /> : "Accept"}
                      </button>
                      <button className="btn-ghost flex-1 sm:flex-none" disabled={busy}
                        onClick={() => call(`/api/assignments/${assignment.id}/decline`, { reason: "Unable to respond" })}>
                        Decline
                      </button>
                    </>
                  )}
                  {assignment.status === "accepted" && (
                    <button className="btn-primary flex-1 sm:flex-none" disabled={busy}
                      onClick={() => call(`/api/assignments/${assignment.id}/arrive`)}>
                      {busy ? <Spinner /> : "Arrived on scene"}
                    </button>
                  )}
                  {assignment.status === "on_scene" && (
                    <button className="btn-primary flex-1 sm:flex-none" disabled={busy}
                      onClick={() => call(`/api/assignments/${assignment.id}/complete`)}>
                      {busy ? <Spinner /> : "Mark complete"}
                    </button>
                  )}
                  <StatusPill status={assignment.status} />
                </div>
              </section>
            ) : (
              <div className="mt-3 panel">
                <EmptyState
                  title="No active assignment"
                  hint="New dispatches appear here the moment a coordinator approves them."
                />
              </div>
            )}
          </>
        )}

        {flash && (
          <p className="mt-3 text-[12.5px]" role="status" aria-live="polite"
             style={{ color: flash.ok ? "var(--accent-hover)" : "var(--danger)" }}>
            {flash.text}
          </p>
        )}
      </main>
    </div>
  );
}
