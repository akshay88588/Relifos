"use client";
import type { Assignment, Incident, Responder, Shelter } from "@/lib/clientTypes";
import { OPEN_RECOMMENDATION } from "@/lib/clientTypes";

/**
 * The five numbers an operator must be able to read in one glance. Anything
 * that is zero stays quiet; anything that demands attention is coloured AND
 * carries a word, so urgency never depends on colour alone.
 */
export function MetricStrip({ incidents, responders, shelters, assignments }: {
  incidents: Incident[]; responders: Responder[]; shelters: Shelter[]; assignments: Assignment[];
}) {
  const open = incidents.filter((i) => !["resolved", "cancelled"].includes(i.status));
  const critical = open.filter((i) => i.priority_band === "CRITICAL").length;
  // Counted the same way the queue's "Awaiting" filter counts it: an incident
  // is only awaiting a human if a recommendation is actually live for it.
  const awaiting = open.filter((i) =>
    assignments.some((a) => a.incident_id === i.id && OPEN_RECOMMENDATION.includes(a.status))).length;
  const free = responders.filter((r) => r.status === "available" && r.current_load < r.max_concurrent).length;
  const capTotal = shelters.reduce((s, x) => s + x.capacity_total, 0);
  const capUsed = shelters.reduce((s, x) => s + x.capacity_used, 0);
  const shelterPct = capTotal ? Math.round((capUsed / capTotal) * 100) : null;

  const items = [
    { k: "Active incidents", v: open.length, note: null, tone: "text-ink-primary" },
    {
      k: "Critical", v: critical,
      note: critical ? "needs attention" : "none",
      tone: critical ? "pri-CRITICAL" : "text-ink-primary",
    },
    {
      k: "Awaiting approval", v: awaiting,
      note: awaiting ? "action required" : "clear",
      tone: awaiting ? "pri-HIGH" : "text-ink-primary",
    },
    {
      k: "Responders free", v: `${free}/${responders.length}`,
      note: responders.length === 0 ? "not seeded" : free === 0 ? "none available" : null,
      tone: responders.length && free === 0 ? "pri-CRITICAL" : "text-ink-primary",
    },
    {
      k: "Shelter load", v: shelterPct == null ? "—" : `${shelterPct}%`,
      note: shelterPct != null && shelterPct >= 85 ? "near capacity" : null,
      tone: shelterPct != null && shelterPct >= 85 ? "pri-HIGH" : "text-ink-primary",
    },
  ];

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px shrink-0"
      style={{ background: "var(--border-subtle)", borderBlock: "1px solid var(--border-subtle)" }}
      role="group"
      aria-label="Operational summary"
    >
      {items.map((i) => (
        <div key={i.k} className="px-3 py-2" style={{ background: "var(--surface-base)" }}>
          <div className="label truncate">{i.k}</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={`metric ${i.tone}`}>{i.v}</span>
            {i.note && <span className={`text-[10px] ${i.tone} opacity-80 truncate`}>{i.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
