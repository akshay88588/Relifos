"use client";
import clsx from "clsx";
import type { Assignment, Incident, Responder } from "@/lib/clientTypes";
import { OPEN_RECOMMENDATION } from "@/lib/clientTypes";
import { BandChip, timeAgo } from "@/components/ui/bits";

/** The AI priority queue: ordered by the deterministic priority score. */
export function PriorityQueue({ incidents, assignments, responders, selectedId, onSelect }: {
  incidents: Incident[]; assignments: Assignment[]; responders: Responder[];
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const open = incidents
    .filter((i) => !["resolved", "cancelled"].includes(i.status))
    .sort((a, b) => b.priority_score - a.priority_score);

  const nameOf = (id: string) => responders.find((r) => r.id === id)?.name ?? "unknown unit";

  return (
    <div className="panel h-full flex flex-col min-h-0">
      <div className="panel-head">
        <span>AI priority queue</span>
        <span className="text-zinc-600">{open.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {open.length === 0 && (
          <div className="p-4 text-[12px] text-zinc-500">
            No active incidents. Seed the demo world or report an emergency to begin.
          </div>
        )}
        {open.map((i) => {
          const rec = assignments.find((a) => a.incident_id === i.id && OPEN_RECOMMENDATION.includes(a.status));
          const active = assignments.find((a) =>
            a.incident_id === i.id && ["dispatched", "accepted", "en_route", "on_scene"].includes(a.status));
          return (
            <button key={i.id} onClick={() => onSelect(i.id)}
              className={clsx(
                "row-in w-full text-left px-3 py-2.5 border-b border-white/[0.05] hover:bg-white/[0.04] transition-colors",
                selectedId === i.id && "bg-white/[0.06]",
              )}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BandChip band={i.priority_band} score={i.priority_score} />
                  <span className="font-mono text-[12px] text-zinc-300">{i.code}</span>
                </div>
                <span className="text-[11px] text-zinc-600 shrink-0">{timeAgo(i.created_at)}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-zinc-300 line-clamp-2 leading-snug">
                {i.short_summary ?? i.description_raw.slice(0, 110)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                <span>{i.people_affected} {i.people_affected === 1 ? "person" : "people"}</span>
                {i.vulnerability_flags?.slice(0, 2).map((f) => (
                  <span key={f} className="text-amber-400/80">{f.replace("_", " ")}</span>
                ))}
                {i.degraded && <span className="text-amber-500">rule-based</span>}
                <span className="text-zinc-600">conf {Math.round(i.ai_confidence * 100)}%</span>
              </div>
              {active ? (
                <div className="mt-1.5 text-[11px] text-blue-300">
                  → {nameOf(active.responder_id)} · {active.status.replace("_", " ")}
                </div>
              ) : rec ? (
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-emerald-300">
                    AI: {nameOf(rec.responder_id)} · match {Math.round(rec.match_score)}
                  </span>
                  <span className="chip bg-amber-500/20 text-amber-300">review</span>
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-zinc-600">no recommendation</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
