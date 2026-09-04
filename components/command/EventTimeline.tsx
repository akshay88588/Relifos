"use client";
import clsx from "clsx";
import type { Ev } from "@/lib/clientTypes";
import { EVENT_LABEL } from "@/lib/events/types";
import { clock } from "@/components/ui/bits";

const TONE: Record<string, string> = {
  "incident.created": "text-red-300",
  "incident.priority_changed": "text-amber-300",
  "ai.assessment_created": "text-violet-300",
  "ai.assessment_rejected": "text-amber-400",
  "match.created": "text-emerald-300",
  "match.invalidated": "text-orange-300",
  "assignment.created": "text-blue-300",
  "assignment.accepted": "text-blue-200",
  "responder.status_changed": "text-zinc-300",
  "shelter.capacity_changed": "text-teal-300",
  "simulation.step_executed": "text-fuchsia-300",
  "system.degraded": "text-amber-400",
  "incident.resolved": "text-green-300",
};

/** The persistent event log. These are database rows, not UI effects. */
export function EventTimeline({ events }: { events: Ev[] }) {
  const ordered = [...events].sort((a, b) => b.seq - a.seq).slice(0, 120);
  return (
    <div className="panel h-full flex flex-col min-h-0">
      <div className="panel-head">
        <span>Event timeline</span>
        <span className="text-zinc-600">{events.length} events</span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin font-mono text-[11.5px]">
        {ordered.map((e) => (
          <div key={e.id} className="row-in px-3 py-1 flex gap-3 border-b border-white/[0.03] hover:bg-white/[0.03]">
            <span className="text-zinc-600 shrink-0">{clock(e.created_at)}</span>
            <span className={clsx("shrink-0 w-[150px]", TONE[e.type] ?? "text-zinc-400")}>
              {EVENT_LABEL[e.type] ?? e.type}
            </span>
            <span className="text-zinc-500 truncate">{describe(e)}</span>
          </div>
        ))}
        {!ordered.length && <div className="p-4 text-zinc-600">No events yet.</div>}
      </div>
    </div>
  );
}

function describe(e: Ev): string {
  const p = e.payload ?? {};
  switch (e.type) {
    case "incident.created": return `${p.code ?? ""} ${p.source ? `via ${p.source}` : ""} ${p.description ? `- ${String(p.description).slice(0, 60)}` : ""}`;
    case "ai.assessment_created": return `${p.structured?.severity ?? ""} ${p.structured?.hazard_type ?? ""} · ${p.model ?? ""} · ${p.validation_status ?? ""}${p.latency_ms ? ` · ${p.latency_ms}ms` : ""}`;
    case "ai.assessment_rejected": return `fallback used - ${String(p.error ?? "model output rejected").slice(0, 70)}`;
    case "incident.priority_changed": return `${p.from_band} ${Math.round(p.from_score ?? 0)} → ${p.to_band} ${Math.round(p.to_score ?? 0)} (${p.trigger})`;
    case "match.created": return p.outcome === "no_strong_match"
      ? `no strong match - ${p.considered} considered, best ${p.best_score ?? "n/a"}`
      : `${p.responder_name} · match ${Math.round(p.score ?? 0)} · ${p.eligible}/${p.considered} eligible`;
    case "match.invalidated": return `${p.responder_name ?? ""} - ${p.reason ?? ""}`;
    case "assignment.created": return `${p.responder_name} → ${p.incident_code}${p.approved_by ? ` (approved by ${p.approved_by})` : ""}`;
    case "assignment.accepted": return `${p.responder_name} accepted ${p.incident_code}`;
    case "assignment.updated": return `${p.responder_name} ${p.action} ${p.incident_code}`;
    case "responder.status_changed": return `${p.name ?? ""} ${p.from ? `${p.from} → ` : ""}${p.to ?? p.status}${p.reason ? ` (${p.reason})` : ""}`;
    case "shelter.capacity_changed": return `${p.name} ${p.capacity_used}/${p.capacity_total} · ${p.status}`;
    case "simulation.step_executed": return `${p.step ?? ""}${p.ok === false ? " (failed)" : ""}`;
    case "system.degraded": return `${p.component}: ${p.effect}`;
    case "notification.created": return String(p.title ?? "");
    case "incident.resolved": return p.by ? `by ${p.by}` : String(p.note ?? "");
    default: return JSON.stringify(p).slice(0, 90);
  }
}
