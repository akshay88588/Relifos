"use client";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { Factor } from "@/lib/clientTypes";
import { BandChip, FactorRow, clock } from "@/components/ui/bits";

interface Detail {
  incident: any; candidates: any[]; assignments: any[];
  priorityFactors: Factor[]; aiDecisions: any[]; assessments: any[];
  events: any[]; responders: any[];
}

/**
 * The decision panel. Everything here is read back from the database: the
 * priority factors the engine wrote, the candidate scoreboard including who was
 * excluded and why, and the AI decision record behind the recommendation.
 * No chain-of-thought is ever stored or shown.
 */
export function IncidentDetail({ incidentId, onClose, refreshKey, onAction }: {
  incidentId: string; onClose: () => void; refreshKey: number; onAction: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/incidents/${incidentId}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [incidentId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function call(url: string, body?: unknown, key = "action") {
    setBusy(key); setFlash(null);
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setFlash(data?.message ?? data?.error?.message ?? (res.ok ? "Done" : "Failed"));
    await load(); onAction();
  }

  if (!d) return <div className="panel p-4 text-[12px] text-zinc-500">Loading incident…</div>;

  const i = d.incident;
  const nameOf = (id: string) => d.responders.find((r) => r.id === id)?.name ?? "unit";
  const rec = d.assignments.find((a) => ["recommended", "awaiting_approval"].includes(a.status));
  const active = d.assignments.find((a) => ["dispatched", "accepted", "en_route", "on_scene"].includes(a.status));
  const eligible = d.candidates.filter((c) => c.eligible);
  const excluded = d.candidates.filter((c) => !c.eligible);
  const lastAi = d.aiDecisions.find((a) => a.agent === "incident_intelligence");

  return (
    <div className="panel flex flex-col h-full min-h-0">
      <div className="panel-head sticky top-0 bg-base-900 z-10">
        <span className="flex items-center gap-2">
          <BandChip band={i.priority_band} score={i.priority_score} />
          <span className="font-mono text-zinc-300">{i.code}</span>
          <span className="text-zinc-600">{i.status.replace("_", " ")}</span>
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
        {i.degraded && (
          <div className="text-[11.5px] px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
            RULE-BASED ASSESSMENT — the model was unavailable or returned unusable output, so a
            deterministic keyword fallback was used. Confidence is capped at 35%.
          </div>
        )}

        <section>
          <div className="label mb-1">Report</div>
          <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{i.description_raw}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-zinc-500">
            <span>{i.hazard_type ?? "unclassified"}</span>
            <span>{i.people_affected} affected</span>
            <span>severity {i.severity ?? "-"}</span>
            <span>urgency {Math.round((i.urgency ?? 0) * 100)}%</span>
            <span>confidence {Math.round((i.ai_confidence ?? 0) * 100)}%</span>
            <span>source {i.source}</span>
            <span>assessment v{i.assessment_version}</span>
          </div>
          {i.vulnerability_flags?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {i.vulnerability_flags.map((f: string) => (
                <span key={f} className="chip bg-amber-500/15 text-amber-300">{f.replace("_", " ")}</span>
              ))}
            </div>
          )}
          {i.missing_information?.length > 0 && (
            <div className="mt-2 text-[11.5px] text-zinc-500">
              <span className="text-zinc-400">Unknown:</span> {i.missing_information.join(" · ")}
            </div>
          )}
        </section>

        <section>
          <div className="label mb-1.5">Why this priority</div>
          <div className="panel p-2.5">
            {d.priorityFactors.map((f, n) => <FactorRow key={n} f={f} />)}
            <div className="pt-2 mt-1 border-t border-white/10 flex justify-between text-[12px]">
              <span className="text-zinc-400">Priority score</span>
              <span className={`font-mono band-${i.priority_band}`}>{Math.round(i.priority_score)} / 100</span>
            </div>
          </div>
          {lastAi && (
            <div className="mt-1.5 text-[10.5px] text-zinc-600">
              Assessment by {lastAi.model} via {lastAi.provider} · validation {lastAi.validation_status}
              {lastAi.latency_ms ? ` · ${lastAi.latency_ms}ms` : ""}{lastAi.fallback_used ? " · fallback" : ""}
            </div>
          )}
        </section>

        {active ? (
          <section>
            <div className="label mb-1.5">Assigned</div>
            <div className="panel p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-zinc-200">{nameOf(active.responder_id)}</span>
                <span className="chip bg-blue-500/20 text-blue-300">{active.status.replace("_", " ")}</span>
              </div>
              <div className="mt-1 text-[11.5px] text-zinc-500">
                match {Math.round(active.match_score)} · ETA ~{Math.round(active.eta_minutes ?? 0)} min (est.)
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/resolve`, { note: "Resolved from command centre" }, "resolve")}>
                  Mark resolved
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>
                  Re-evaluate
                </button>
              </div>
            </div>
          </section>
        ) : rec ? (
          <section>
            <div className="label mb-1.5">AI recommendation</div>
            <div className="panel p-3 border-emerald-500/25">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-zinc-100">{nameOf(rec.responder_id)}</span>
                <span className="text-[13px] font-mono text-emerald-400">match {Math.round(rec.match_score)}</span>
              </div>
              <div className="mt-1 text-[11.5px] text-zinc-500">
                ETA ~{Math.round(rec.eta_minutes ?? 0)} min (est., straight-line)
              </div>
              {rec.ai_rationale?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {rec.ai_rationale.map((b: string, n: number) => (
                    <li key={n} className="text-[12px] text-zinc-400 flex gap-1.5">
                      <span className="text-emerald-500">·</span>{b}
                    </li>
                  ))}
                </ul>
              )}
              {rec.match_factors?.factors && (
                <div className="mt-2 pt-2 border-t border-white/[0.07]">
                  {rec.match_factors.factors.map((f: any, n: number) => <FactorRow key={n} f={f} />)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!!busy}
                  onClick={() => call(`/api/assignments/${rec.id}/approve`, undefined, "approve")}>
                  {busy === "approve" ? "Dispatching…" : "Approve dispatch"}
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/assignments/${rec.id}/reject`, { reason: "Coordinator judgement" }, "reject")}>
                  Reject &amp; re-match
                </button>
                <button className="btn-ghost" disabled={!!busy}
                  onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>
                  Re-evaluate
                </button>
              </div>
              {rec.requires_approval && (
                <div className="mt-2 text-[10.5px] text-amber-400/80">
                  Human approval required before any responder is committed.
                </div>
              )}
            </div>
          </section>
        ) : (
          <section>
            <div className="label mb-1.5">No recommendation</div>
            <div className="panel p-3 text-[12px] text-zinc-400">
              No candidate met the recommendation threshold. Assign manually below, or re-evaluate
              once conditions change.
              <button className="btn-ghost mt-2 block" disabled={!!busy}
                onClick={() => call(`/api/incidents/${i.id}/rematch`, undefined, "rematch")}>Re-evaluate</button>
            </div>
          </section>
        )}

        <section>
          <div className="label mb-1.5">Candidate scoreboard</div>
          <div className="panel divide-y divide-white/[0.05]">
            {eligible.map((c) => (
              <div key={c.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-zinc-200">
                    <span className="text-zinc-600 font-mono mr-1.5">#{c.rank}</span>{nameOf(c.responder_id)}
                  </div>
                  <div className="text-[10.5px] text-zinc-500">
                    {c.distance_km} km · ~{Math.round(c.eta_minutes)} min
                    {c.invalidated_at ? ` · invalidated: ${c.invalidation_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[12px] text-zinc-300">{Math.round(c.score)}</span>
                  {!active && (
                    <button className="btn-ghost !px-2 !py-0.5 text-[11px]" disabled={!!busy}
                      onClick={() => call(`/api/incidents/${i.id}/reassign`,
                        { responder_id: c.responder_id, reason: "Manual selection" }, "assign")}>
                      assign
                    </button>
                  )}
                </div>
              </div>
            ))}
            {excluded.map((c) => (
              <div key={c.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 opacity-50">
                <div className="min-w-0">
                  <div className="text-[12.5px] text-zinc-400 line-through">{nameOf(c.responder_id)}</div>
                  <div className="text-[10.5px] text-zinc-500">{c.exclusion_reason}</div>
                </div>
                <span className="font-mono text-[11px] text-zinc-600">excluded</span>
              </div>
            ))}
            {!d.candidates.length && <div className="p-3 text-[12px] text-zinc-600">No candidates computed yet.</div>}
          </div>
        </section>

        <section>
          <div className="label mb-1.5">Incident timeline</div>
          <div className="panel p-2 font-mono text-[11px] space-y-0.5 max-h-[220px] overflow-y-auto scrollbar-thin">
            {d.events.map((e) => (
              <div key={e.id} className="flex gap-2">
                <span className="text-zinc-600">{clock(e.created_at)}</span>
                <span className="text-zinc-400">{e.type}</span>
              </div>
            ))}
          </div>
        </section>

        {flash && <div className={clsx("text-[12px]", flash.includes("fail") ? "text-red-400" : "text-emerald-400")}>{flash}</div>}
      </div>
    </div>
  );
}
