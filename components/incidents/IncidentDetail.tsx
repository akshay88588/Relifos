"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Factor } from "@/lib/clientTypes";
import {
  CheckIcon, CloseIcon, ErrorState, FactorRow, LoadingState,
  PriorityBadge, Spinner, StatusPill, clock,
} from "@/components/ui/bits";

interface Candidate {
  id: string; responder_id: string; rank: number | null; score: number;
  factors: { factors?: Factor[] } | null; distance_km: number | null; eta_minutes: number | null;
  eligible: boolean; exclusion_reason: string | null;
  invalidated_at: string | null; invalidation_reason: string | null;
}
interface AssignmentRow {
  id: string; responder_id: string; status: string; match_score: number;
  eta_minutes: number | null; ai_rationale: string[] | null; requires_approval: boolean;
  match_factors: { factors?: Factor[] } | null;
}
interface Detail {
  incident: Record<string, any>;
  candidates: Candidate[];
  assignments: AssignmentRow[];
  priorityFactors: Factor[];
  aiDecisions: { agent: string; model: string; provider: string; validation_status: string; latency_ms: number | null; fallback_used: boolean }[];
  assessments: unknown[];
  events: { id: string; type: string; created_at: string }[];
  responders: { id: string; name: string; type: string; status: string }[];
}

/**
 * THE DECISION PANEL.
 *
 * Everything here is read back from the database: the priority factors the
 * engine wrote, the candidate scoreboard including who was excluded and why,
 * and the AI decision record behind the recommendation. No chain-of-thought is
 * ever stored or shown.
 */
export function IncidentDetail({ incidentId, onClose, refreshKey, onAction }: {
  incidentId: string; onClose: () => void; refreshKey: number; onAction: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, { cache: "no-store" });
      if (!res.ok) {
        setLoadError(res.status === 403 || res.status === 401
          ? "You do not have permission to view this incident."
          : `Could not load incident (${res.status}).`);
        return;
      }
      setD(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    }
  }, [incidentId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  /** Opening the panel moves focus into it, so keyboard users are not stranded. */
  useEffect(() => { closeRef.current?.focus(); }, [incidentId]);

  /** Escape closes the panel, matching every other dismissible surface. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function call(url: string, body?: unknown, key = "action") {
    setBusy(key); setFlash(null);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.ok !== false;
      setFlash({ text: data?.message ?? data?.error?.message ?? (ok ? "Done" : "Action failed"), ok });
      await load();
      onAction();
    } catch (err) {
      setFlash({ text: err instanceof Error ? err.message : "Network error", ok: false });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="panel h-full min-h-0">
        <div className="panel-head">
          <span>Incident</span>
          <button ref={closeRef} onClick={onClose} className="text-ink-tertiary hover:text-ink-primary" aria-label="Close incident detail">
            <CloseIcon />
          </button>
        </div>
        <ErrorState title="Could not load incident" detail={loadError} onRetry={load} />
      </div>
    );
  }

  if (!d) {
    return (
      <div className="panel h-full min-h-0">
        <div className="panel-head"><span>Incident</span></div>
        <LoadingState label="Loading incident detail" rows={4} />
      </div>
    );
  }

  const i = d.incident;
  const nameOf = (id: string) => d.responders.find((r) => r.id === id)?.name ?? "unit";
  const rec = d.assignments.find((a) => ["recommended", "awaiting_approval"].includes(a.status));
  const active = d.assignments.find((a) => ["dispatched", "accepted", "en_route", "on_scene"].includes(a.status));
  const eligible = d.candidates.filter((c) => c.eligible);
  const excluded = d.candidates.filter((c) => !c.eligible);
  const lastAi = d.aiDecisions.find((a) => a.agent === "incident_intelligence");

  return (
    <section className="panel flex flex-col h-full min-h-0" aria-label={`Incident ${i.code} detail`}>
      <div className="panel-head sticky top-0 z-10" style={{ background: "var(--surface-raised)" }}>
        <span className="flex items-center gap-2 min-w-0">
          <PriorityBadge band={i.priority_band} score={i.priority_score} />
          <span className="mono text-ink-secondary truncate">{i.code}</span>
          <span className="text-ink-faint normal-case tracking-normal">{i.status.replace(/_/g, " ")}</span>
        </span>
        <button ref={closeRef} onClick={onClose} className="text-ink-tertiary hover:text-ink-primary transition-colors p-1"
                aria-label="Close incident detail">
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 scroll-y min-h-0 p-3 space-y-4">
        {i.degraded && (
          <div className="text-[11.5px] px-2.5 py-2 rounded-md leading-relaxed" role="status"
               style={{ background: "var(--p-medium-bg)", border: "1px solid var(--p-medium-bd)", color: "var(--p-medium)" }}>
            <strong className="font-semibold">RULE-BASED ASSESSMENT</strong> — the model was unavailable or
            returned unusable output, so a deterministic keyword fallback was used. Confidence is capped at 35%.
          </div>
        )}

        <section>
          <h3 className="label mb-1">Report</h3>
          <p className="text-[13px] text-ink-secondary leading-relaxed whitespace-pre-wrap break-words">{i.description_raw}</p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-tertiary">
            {[
              ["hazard", i.hazard_type ?? "unclassified"],
              ["affected", `${i.people_affected}`],
              ["severity", i.severity ?? "—"],
              ["urgency", `${Math.round((i.urgency ?? 0) * 100)}%`],
              ["confidence", `${Math.round((i.ai_confidence ?? 0) * 100)}%`],
              ["source", i.source],
              ["assessment", `v${i.assessment_version}`],
            ].map(([k, v]) => (
              <span key={k as string}><dt className="inline text-ink-faint">{k} </dt><dd className="inline">{v as string}</dd></span>
            ))}
          </dl>
          {i.vulnerability_flags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {i.vulnerability_flags.map((f: string) => (
                <span key={f} className="chip" style={{ background: "var(--p-high-bg)", color: "var(--p-high)" }}>
                  {f.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
          {i.missing_information?.length > 0 && (
            <p className="mt-2 text-[11.5px] text-ink-tertiary">
              <span className="text-ink-secondary">Unknown:</span> {i.missing_information.join(" · ")}
            </p>
          )}
        </section>

        <section>
          <h3 className="label mb-1.5">Why this priority</h3>
          <div className="panel p-2.5">
            {d.priorityFactors.length
              ? d.priorityFactors.map((f, n) => <FactorRow key={n} f={f} />)
              : <p className="text-[12px] text-ink-faint">No factors recorded yet.</p>}
            <div className="pt-2 mt-1 flex justify-between text-[12px]" style={{ borderTop: "1px solid var(--border-default)" }}>
              <span className="text-ink-secondary">Priority score</span>
              <span className={`mono pri-${i.priority_band}`}>{Math.round(i.priority_score)} / 100</span>
            </div>
          </div>
          {lastAi && (
            <p className="mt-1.5 text-[10.5px] text-ink-faint">
              Assessed by {lastAi.model} via {lastAi.provider} · validation {lastAi.validation_status}
              {lastAi.latency_ms ? ` · ${lastAi.latency_ms}ms` : ""}{lastAi.fallback_used ? " · fallback" : ""}
            </p>
          )}
        </section>

        {active ? (
          <section>
            <h3 className="label mb-1.5">Assigned</h3>
            <div className="panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-ink-primary truncate">{nameOf(active.responder_id)}</span>
                <StatusPill status={active.status} />
              </div>
              <p className="mt-1 text-[11.5px] text-ink-tertiary">
                match {Math.round(active.match_score)} · ETA ~{Math.round(active.eta_minutes ?? 0)} min (est., straight-line)
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/resolve`, { note: "Resolved from command centre" }, "resolve")}>
                  {busy === "resolve" ? <><Spinner /> Resolving…</> : "Mark resolved"}
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>
                  {busy === "rematch" ? <><Spinner /> Re-evaluating…</> : "Re-evaluate"}
                </button>
              </div>
            </div>
          </section>
        ) : rec ? (
          <section>
            <h3 className="label mb-1.5">AI recommendation</h3>
            <div className="panel p-3" style={{ borderColor: "var(--p-low-bd)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] text-ink-primary truncate">{nameOf(rec.responder_id)}</span>
                <span className="text-[13px] mono shrink-0" style={{ color: "var(--accent-hover)" }}>
                  match {Math.round(rec.match_score)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-tertiary">
                ETA ~{Math.round(rec.eta_minutes ?? 0)} min (est., straight-line)
              </p>
              {rec.ai_rationale && rec.ai_rationale.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {rec.ai_rationale.map((b, n) => (
                    <li key={n} className="text-[12px] text-ink-secondary flex gap-1.5 leading-snug">
                      <span aria-hidden="true" style={{ color: "var(--accent)" }}>·</span>{b}
                    </li>
                  ))}
                </ul>
              )}
              {rec.match_factors?.factors && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {rec.match_factors.factors.map((f, n) => <FactorRow key={n} f={f} />)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!!busy}
                  onClick={() => call(`/api/assignments/${rec.id}/approve`, undefined, "approve")}>
                  {busy === "approve" ? <><Spinner /> Dispatching…</> : <><CheckIcon /> Approve dispatch</>}
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/assignments/${rec.id}/reject`, { reason: "Coordinator judgement" }, "reject")}>
                  {busy === "reject" ? <><Spinner /> Rejecting…</> : "Reject & re-match"}
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>
                  {busy === "rematch" ? <><Spinner /> Working…</> : "Re-evaluate"}
                </button>
              </div>
              {rec.requires_approval && (
                <p className="mt-2 text-[10.5px]" style={{ color: "var(--p-high)" }}>
                  Human approval required before any responder is committed.
                </p>
              )}
            </div>
          </section>
        ) : (
          <section>
            <h3 className="label mb-1.5">No recommendation</h3>
            <div className="panel p-3 text-[12px] text-ink-secondary leading-relaxed">
              No candidate met the recommendation threshold. Assign manually from the scoreboard below, or
              re-evaluate once conditions change.
              <button className="btn-ghost btn-sm mt-2 block" disabled={!!busy}
                onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>
                {busy === "rematch" ? "Re-evaluating…" : "Re-evaluate"}
              </button>
            </div>
          </section>
        )}

        <section>
          <h3 className="label mb-1.5">Candidate scoreboard</h3>
          <div className="panel divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {eligible.map((c) => (
              <div key={c.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink-primary truncate">
                    <span className="text-ink-faint mono mr-1.5">#{c.rank}</span>{nameOf(c.responder_id)}
                  </div>
                  <div className="text-[10.5px] text-ink-tertiary">
                    {c.distance_km} km · ~{Math.round(c.eta_minutes ?? 0)} min
                    {c.invalidated_at ? ` · invalidated: ${c.invalidation_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono text-[12px] text-ink-secondary tabular-nums">{Math.round(c.score)}</span>
                  {!active && (
                    <button className="btn-ghost btn-sm" disabled={!!busy}
                      onClick={() => call(`/api/incidents/${i.id}/reassign`,
                        { responder_id: c.responder_id, reason: "Manual selection" }, `assign:${c.id}`)}>
                      {busy === `assign:${c.id}` ? "…" : "assign"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {excluded.map((c) => (
              <div key={c.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 opacity-55">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-ink-secondary line-through truncate">{nameOf(c.responder_id)}</div>
                  <div className="text-[10.5px] text-ink-tertiary">{c.exclusion_reason}</div>
                </div>
                <span className="mono text-[11px] text-ink-faint shrink-0">excluded</span>
              </div>
            ))}
            {!d.candidates.length && (
              <p className="p-3 text-[12px] text-ink-faint">No candidates computed yet.</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="label mb-1.5">Incident timeline</h3>
          <div className="panel p-2 mono text-[11px] space-y-0.5 max-h-[220px] scroll-y">
            {d.events.map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="text-ink-faint tabular-nums">{clock(e.created_at)}</span>
                <span className="text-ink-tertiary truncate">{e.type}</span>
              </div>
            ))}
            {!d.events.length && <p className="text-ink-faint">No events recorded.</p>}
          </div>
        </section>

        {flash && (
          <p className="text-[12px]" role="status" aria-live="polite"
             style={{ color: flash.ok ? "var(--accent-hover)" : "var(--danger)" }}>
            {flash.text}
          </p>
        )}
      </div>
    </section>
  );
}
