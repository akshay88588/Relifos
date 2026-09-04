"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Assignment, ExclusionSummary, Incident, Responder } from "@/lib/clientTypes";
import { OPEN_RECOMMENDATION, ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";
import { EmptyState, ListIcon, PriorityBadge, timeAgo } from "@/components/ui/bits";

type Filter = "all" | "critical" | "awaiting" | "unassigned";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every open incident" },
  { id: "critical", label: "Critical", hint: "CRITICAL band only" },
  { id: "awaiting", label: "Awaiting", hint: "A recommendation is waiting for your approval" },
  { id: "unassigned", label: "Unassigned", hint: "No responder recommended or committed" },
];

/**
 * THE PRIORITY QUEUE.
 *
 * Ordered by the deterministic priority score - never by arrival time. The
 * filters and the search box operate on the real incident list already in
 * state; nothing here fetches, invents or caches a separate copy.
 */
export function PriorityQueue({ incidents, assignments, responders, exclusions, selectedId, onSelect }: {
  incidents: Incident[]; assignments: Assignment[]; responders: Responder[];
  exclusions?: Record<string, ExclusionSummary>;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const nameOf = (id: string) => responders.find((r) => r.id === id)?.name ?? "unknown unit";

  const open = useMemo(
    () => incidents
      .filter((i) => !["resolved", "cancelled"].includes(i.status))
      .sort((a, b) => b.priority_score - a.priority_score),
    [incidents],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return open.filter((i) => {
      const rec = assignments.find((a) => a.incident_id === i.id && OPEN_RECOMMENDATION.includes(a.status));
      const active = assignments.find((a) => a.incident_id === i.id && ACTIVE_ASSIGNMENT.includes(a.status));
      if (filter === "critical" && i.priority_band !== "CRITICAL") return false;
      if (filter === "awaiting" && !rec) return false;
      if (filter === "unassigned" && (rec || active)) return false;
      if (!q) return true;
      return (
        i.code.toLowerCase().includes(q) ||
        (i.short_summary ?? "").toLowerCase().includes(q) ||
        (i.hazard_type ?? "").toLowerCase().includes(q) ||
        i.description_raw.toLowerCase().includes(q)
      );
    });
  }, [open, assignments, filter, query]);

  const counts = useMemo(() => ({
    all: open.length,
    critical: open.filter((i) => i.priority_band === "CRITICAL").length,
    awaiting: open.filter((i) => assignments.some((a) => a.incident_id === i.id && OPEN_RECOMMENDATION.includes(a.status))).length,
    unassigned: open.filter((i) => !assignments.some((a) =>
      a.incident_id === i.id && [...OPEN_RECOMMENDATION, ...ACTIVE_ASSIGNMENT].includes(a.status))).length,
  }), [open, assignments]);

  return (
    <div className="panel flex flex-col h-full min-h-0">
      <div className="panel-head">
        <span>Priority queue</span>
        <span className="text-ink-faint font-normal normal-case tracking-normal tabular-nums">
          {rows.length === open.length ? open.length : `${rows.length} of ${open.length}`}
        </span>
      </div>

      <div className="px-2 pt-2 pb-1.5 space-y-1.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <label className="sr-only" htmlFor="queue-search">Search incidents</label>
        <input
          id="queue-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, summary, hazard…"
          className="field !py-1.5 !text-[12px]"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter incidents">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              title={f.hint}
              className={clsx(
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                filter === f.id
                  ? "bg-accent text-[#04140d]"
                  : "text-ink-tertiary hover:text-ink-primary",
              )}
              style={filter === f.id ? undefined : { background: "var(--surface-hover)" }}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 scroll-y min-h-0">
        {rows.length === 0 && (
          open.length === 0 ? (
            <EmptyState
              icon={<ListIcon size={22} />}
              title="No active incidents"
              hint="Seed the demo world, or submit a report from the citizen page, to see the queue populate."
            />
          ) : (
            <EmptyState
              title="No incidents match"
              hint="Clear the search box or choose a different filter."
              action={
                <button className="btn-ghost btn-sm mt-1" onClick={() => { setQuery(""); setFilter("all"); }}>
                  Reset filters
                </button>
              }
            />
          )
        )}

        <ul className="list-none m-0 p-0">
          {rows.map((i) => {
            const rec = assignments.find((a) => a.incident_id === i.id && OPEN_RECOMMENDATION.includes(a.status));
            const active = assignments.find((a) => a.incident_id === i.id && ACTIVE_ASSIGNMENT.includes(a.status));
            const selected = selectedId === i.id;
            return (
              <li key={i.id}>
                <button
                  onClick={() => onSelect(i.id)}
                  aria-current={selected ? "true" : undefined}
                  className={clsx(
                    "row-in w-full text-left px-3 py-2.5 transition-colors border-b",
                    `pri-rail-${i.priority_band}`,
                    selected ? "bg-white/[0.06]" : "hover:bg-white/[0.035]",
                  )}
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PriorityBadge band={i.priority_band} score={i.priority_score} />
                      <span className="mono text-[12px] text-ink-secondary truncate">{i.code}</span>
                    </div>
                    <span className="text-[11px] text-ink-faint shrink-0 tabular-nums">{timeAgo(i.created_at)}</span>
                  </div>

                  <p className="mt-1 text-[12.5px] text-ink-primary leading-snug line-clamp-2">
                    {i.short_summary ?? i.description_raw.slice(0, 110)}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-tertiary">
                    <span>{i.people_affected === 0
                      ? "no casualties reported"
                      : `${i.people_affected} ${i.people_affected === 1 ? "person" : "people"}`}</span>
                    {i.vulnerability_flags?.slice(0, 2).map((f) => (
                      <span key={f} style={{ color: "var(--p-high)" }}>{f.replace(/_/g, " ")}</span>
                    ))}
                    {i.degraded && (
                      <span className="chip" style={{ background: "var(--p-medium-bg)", color: "var(--p-medium)" }}>
                        rule-based
                      </span>
                    )}
                    <span className="text-ink-faint">conf {Math.round(i.ai_confidence * 100)}%</span>
                  </div>

                  {active ? (
                    <div className="mt-1.5 text-[11px]" style={{ color: "var(--st-enroute)" }}>
                      → {nameOf(active.responder_id)} · {active.status.replace(/_/g, " ")}
                    </div>
                  ) : rec ? (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] truncate" style={{ color: "var(--accent-hover)" }}>
                        AI: {nameOf(rec.responder_id)} · match {Math.round(rec.match_score)}
                      </span>
                      <span className="chip shrink-0" style={{ background: "var(--p-high-bg)", color: "var(--p-high)" }}>
                        review
                      </span>
                    </div>
                  ) : (
                    <NoCandidate summary={exclusions?.[i.id]} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * "no recommendation" on a CRITICAL incident reads like the system gave up.
 * The matching engine already recorded why every candidate was gated out, so
 * show that instead: which reason dominated and how many units it excluded.
 */
function NoCandidate({ summary }: { summary?: ExclusionSummary }) {
  if (!summary) {
    return (
      <div className="mt-1.5 text-[11px] text-ink-faint">
        No candidate yet — matching has not run for this incident
      </div>
    );
  }
  return (
    <div className="mt-1.5 text-[11px]" style={{ color: "var(--p-high)" }}>
      No candidate — {summary.reason.toLowerCase()}
      <span className="text-ink-faint">
        {" "}({summary.count} of {summary.total} units excluded)
      </span>
    </div>
  );
}
