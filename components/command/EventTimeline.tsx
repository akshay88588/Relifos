"use client";
import { useMemo, useState } from "react";
import type { Ev } from "@/lib/clientTypes";
import { EVENT_LABEL } from "@/lib/events/types";
import { ActivityIcon, EmptyState, clock } from "@/components/ui/bits";

const TONE: Record<string, string> = {
  "incident.created": "var(--p-critical)",
  "incident.priority_changed": "var(--p-high)",
  "ai.assessment_created": "#c084fc",
  "ai.assessment_rejected": "var(--warn)",
  "match.created": "var(--accent-hover)",
  "match.invalidated": "var(--p-high)",
  "assignment.created": "var(--st-enroute)",
  "assignment.accepted": "var(--st-enroute)",
  "assignment.declined": "var(--danger)",
  "responder.status_changed": "var(--text-secondary)",
  "shelter.capacity_changed": "#2dd4bf",
  "simulation.step_executed": "#e879f9",
  "system.degraded": "var(--warn)",
  "incident.resolved": "var(--st-available)",
};

/**
 * The persistent event log. These rows are `system_events` records - the same
 * rows that form the audit trail - so nothing can appear here that did not
 * happen in the database.
 */
export function EventTimeline({ events }: { events: Ev[] }) {
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<Ev[] | null>(null);

  const live = useMemo(() => [...events].sort((a, b) => b.seq - a.seq).slice(0, 150), [events]);
  const shown = paused && frozen ? frozen : live;

  const togglePause = () => {
    if (paused) { setPaused(false); setFrozen(null); }
    else { setFrozen(live); setPaused(true); }
  };

  return (
    <div className="panel h-full flex flex-col min-h-0">
      <div className="panel-head">
        <span className="flex items-center gap-1.5"><ActivityIcon size={12} /> Event timeline</span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          {paused && (
            <span className="chip" style={{ background: "var(--p-medium-bg)", color: "var(--p-medium)" }}>paused</span>
          )}
          <button
            onClick={togglePause}
            className="text-[10.5px] text-ink-tertiary hover:text-ink-primary transition-colors"
            aria-pressed={paused}
            title={paused ? "Resume the live feed" : "Freeze the feed so you can read a row"}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <span className="text-ink-faint font-normal tabular-nums">{events.length}</span>
        </span>
      </div>

      {/* Polite, not assertive: an operator should not have every event
          interrupt whatever their screen reader is already saying. */}
      <div className="flex-1 scroll-y min-h-0 mono text-[11.5px]" role="log" aria-label="Live operational events" aria-live="polite">
        {shown.map((e) => (
          <div
            key={e.id}
            className="row-in px-3 py-1 flex gap-2 sm:gap-3 border-b hover:bg-white/[0.03] transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.03)" }}
          >
            <span className="text-ink-faint shrink-0 tabular-nums">{clock(e.created_at)}</span>
            <span
              className="shrink-0 w-[124px] sm:w-[150px] truncate font-semibold"
              style={{ color: TONE[e.type] ?? "var(--text-secondary)" }}
            >
              {EVENT_LABEL[e.type] ?? e.type}
            </span>
            <span className="text-ink-tertiary truncate">{describe(e)}</span>
          </div>
        ))}
        {!shown.length && (
          <EmptyState
            title="No events yet"
            hint="Every state change in the system appears here the moment it is written to the database."
          />
        )}
      </div>
    </div>
  );
}

function describe(e: Ev): string {
  const p = e.payload ?? {};
  switch (e.type) {
    case "incident.created":
      return `${p.code ?? ""} ${p.source ? `via ${p.source}` : ""} ${p.description ? `— ${String(p.description).slice(0, 60)}` : ""}`;
    case "ai.assessment_created":
      return `${p.structured?.severity ?? ""} ${p.structured?.hazard_type ?? ""} · ${p.model ?? ""} · ${p.validation_status ?? ""}${p.latency_ms ? ` · ${p.latency_ms}ms` : ""}`;
    case "ai.assessment_rejected":
      return `fallback used — ${String(p.error ?? "model output rejected").slice(0, 70)}`;
    case "incident.priority_changed":
      return `${p.from_band} ${Math.round(p.from_score ?? 0)} → ${p.to_band} ${Math.round(p.to_score ?? 0)} (${p.trigger})`;
    case "match.created":
      return p.outcome === "no_strong_match"
        ? `no strong match — ${p.considered} considered, best ${p.best_score ?? "n/a"}`
        : `${p.responder_name} · match ${Math.round(p.score ?? 0)} · ${p.eligible}/${p.considered} eligible`;
    case "match.invalidated": return `${p.responder_name ?? ""} — ${p.reason ?? ""}`;
    case "assignment.created": return `${p.responder_name} → ${p.incident_code}${p.approved_by ? ` (approved by ${p.approved_by})` : ""}`;
    case "assignment.accepted": return `${p.responder_name} accepted ${p.incident_code}`;
    case "assignment.declined": return `${p.responder_name} declined${p.reason ? ` — ${p.reason}` : ""}`;
    case "assignment.updated": return `${p.responder_name} ${p.action} ${p.incident_code}`;
    case "responder.status_changed":
      return `${p.name ?? ""} ${p.from ? `${p.from} → ` : ""}${p.to ?? p.status}${p.reason ? ` (${p.reason})` : ""}`;
    case "shelter.capacity_changed": return `${p.name} ${p.capacity_used}/${p.capacity_total} · ${p.status}`;
    case "simulation.step_executed": return `${p.step ?? ""}${p.ok === false ? " (failed)" : ""}`;
    case "system.degraded": return `${p.component}: ${p.effect}`;
    case "notification.created": return String(p.title ?? "");
    case "incident.resolved": return p.by ? `by ${p.by}` : String(p.note ?? "");
    default: return JSON.stringify(p).slice(0, 90);
  }
}
