"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AUTH_REQUIRED, useReliefStream } from "@/lib/realtime/useReliefStream";
import { ConnectionPill } from "@/components/command/StatusBar";
import { UserChip } from "@/components/command/UserChip";
import { AppNav } from "@/components/ui/AppNav";
import { SignInGate } from "@/components/ui/SignInGate";
import {
  EmptyState, LoadingState, PriorityBadge, Spinner, StatusDot, StatusPill, WarnIcon, timeAgo,
} from "@/components/ui/bits";
import { ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";
import type { Assignment, Incident, Responder } from "@/lib/clientTypes";
import { haversineKm } from "@/lib/domain/geo";

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
  /** The unit this signed-in account is provisioned to operate, if any. */
  const [boundUnit, setBoundUnit] = useState<string | null>(null);
  const [boundLoaded, setBoundLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  // A provisioned responder account may only operate its own unit - the server
  // enforces this, so the picker must not offer choices that will be refused.
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.user?.role === "responder" && d.user.responder_id) {
          setBoundUnit(d.user.responder_id);
          setMe(d.user.responder_id);
        }
        setBoundLoaded(true);
      })
      .catch(() => { if (alive) setBoundLoaded(true); });
    return () => { alive = false; };
  }, []);

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
          <span className="label hidden lg:inline">Responder console</span>
          <AppNav />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ConnectionPill connection={connection} />
          <UserChip />
        </div>
      </header>

      {error === AUTH_REQUIRED && (
        <SignInGate
          next="/responder"
          blurb="The responder console is your unit: its status, its current dispatch, and what it is eligible for. Sign in as a responder to change status and accept assignments."
        />
      )}

      <main id="main" className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <h1 className="sr-only">Responder console</h1>
        {error && error !== AUTH_REQUIRED && (
          <p className="mb-4 text-[12.5px] panel p-3 flex items-start gap-2" role="alert"
             style={{ color: "var(--danger)", borderColor: "var(--p-critical-bd)" }}>
            <span className="mt-0.5 shrink-0"><WarnIcon /></span>
            <span>{error} <Link href="/login" className="underline">Sign in</Link></span>
          </p>
        )}

        {/* A provisioned responder has exactly one unit and no choice to make, so
            the picker collapses to a line of text and the unit card - the thing
            they actually came for - starts at the top of the screen. Only a
            coordinator operating someone else's unit gets the full control. */}
        {!state ? (
          <div className="panel p-4"><LoadingState label="Loading units" rows={1} /></div>
        ) : responders.length === 0 ? (
          <div className="panel p-4">
            <EmptyState title="No units available" hint="A coordinator needs to seed the demo world first." />
          </div>
        ) : boundLoaded && boundUnit ? (
          <p className="text-[11px] text-ink-faint mb-2">
            Signed in as this unit. Coordinators can operate any unit.
          </p>
        ) : (
          <div className="panel p-3 flex items-center gap-3">
            <label htmlFor="unit-select" className="label shrink-0">Operating as</label>
            <select
              id="unit-select"
              value={me ?? ""}
              onChange={(e) => setMe(e.target.value || null)}
              className="field !py-1.5"
            >
              <option value="">Select your unit…</option>
              {responders.map((r) => (
                <option key={r.id} value={r.id}>{r.name} — {r.type}</option>
              ))}
            </select>
          </div>
        )}

        {state && responders.length > 0 && !unit && (
          <div className="mt-3 panel">
            <EmptyState
              title="Pick your unit to begin"
              hint="Choose the unit you are operating. Its status, current dispatch and shift history appear here."
            />
          </div>
        )}

        {unit && (
          <>
            <section aria-label="Your unit" className="panel p-4">
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

            <ShiftHistory unit={unit} assignments={state?.assignments ?? []}
                          incidents={state?.incidents ?? []} />
            <EligibleNearby unit={unit} incidents={state?.incidents ?? []}
                            assignments={state?.assignments ?? []} />
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

/**
 * What this unit has already handled this session. Read straight off the same
 * shared state the command centre uses, so the two can never disagree.
 */
function ShiftHistory({ unit, assignments, incidents }: {
  unit: Responder; assignments: Assignment[]; incidents: Incident[];
}) {
  const mine = assignments
    .filter((a) => a.responder_id === unit.id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 8);
  const incidentOf = (id: string) => incidents.find((i) => i.id === id);

  return (
    <section aria-label="Your assignments this session" className="mt-3 panel">
      <header className="panel-head"><span>This shift</span>
        <span className="text-ink-faint font-normal normal-case tracking-normal tabular-nums">
          {mine.length}
        </span>
      </header>
      {mine.length === 0 ? (
        <p className="p-3 text-[12px] text-ink-faint">
          Nothing assigned to this unit yet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {mine.map((a) => {
            const i = incidentOf(a.incident_id);
            return (
              <li key={a.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {i && <PriorityBadge band={i.priority_band} score={i.priority_score} size="sm" />}
                    <span className="font-mono text-[12px] text-ink-secondary shrink-0">
                      {i?.code ?? "incident"}
                    </span>
                  </span>
                  <StatusPill status={a.status} />
                </div>
                {/* A row that is only a code and a number says nothing about what
                    the shift actually was. The summary is the point of the log. */}
                {i?.short_summary && (
                  <p className="mt-1 text-[12px] text-ink-tertiary leading-snug line-clamp-2">
                    {i.short_summary}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint tabular-nums">
                  <span>{timeAgo(a.created_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>match {Math.round(a.match_score)}</span>
                  {a.eta_minutes != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>ETA ~{Math.round(a.eta_minutes)} min</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Open incidents this unit could serve, nearest first.
 *
 * READ-ONLY BY DESIGN. There is no accept or claim control here: a dispatch
 * still has to be recommended by the matching engine and approved by a
 * coordinator. This exists so a responder can see what is happening around
 * them, not so they can pick their own job.
 */
function EligibleNearby({ unit, incidents, assignments }: {
  unit: Responder; incidents: Incident[]; assignments: Assignment[];
}) {
  const taken = new Set(
    assignments
      .filter((a) => ACTIVE_ASSIGNMENT.includes(a.status))
      .map((a) => a.incident_id),
  );

  const nearby = incidents
    .filter((i) =>
      !["resolved", "cancelled"].includes(i.status) &&
      !taken.has(i.id) &&
      (i.required_capabilities ?? []).some((c) => unit.capabilities.includes(c)))
    .map((i) => ({
      incident: i,
      km: unit.lat != null && unit.lng != null && i.lat != null && i.lng != null
        ? haversineKm({ lat: unit.lat, lng: unit.lng }, { lat: i.lat, lng: i.lng })
        : null,
    }))
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
    .slice(0, 5);

  return (
    <section aria-label="Open incidents you are eligible for" className="mt-3 panel">
      <header className="panel-head"><span>Eligible nearby</span>
        <span className="text-ink-faint font-normal normal-case tracking-normal">read-only</span>
      </header>
      {nearby.length === 0 ? (
        <p className="p-3 text-[12px] text-ink-faint">
          No open incidents match this unit&apos;s capabilities right now.
        </p>
      ) : (
        <>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {nearby.map(({ incident: i, km }) => (
              <li key={i.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <PriorityBadge band={i.priority_band} score={i.priority_score} size="sm" />
                    <span className="font-mono text-[12px] text-ink-secondary">{i.code}</span>
                  </span>
                  {km != null && (
                    <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                      {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-tertiary line-clamp-1">
                  {i.address_text ?? i.short_summary ?? ""}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 text-[10.5px] text-ink-faint border-t" style={{ borderColor: "var(--border)" }}>
            Shown for awareness. Dispatch is assigned by a coordinator.
          </p>
        </>
      )}
    </section>
  );
}
