"use client";
import type { Incident, Responder, Shelter } from "@/lib/clientTypes";

export function MetricStrip({ incidents, responders, shelters }: {
  incidents: Incident[]; responders: Responder[]; shelters: Shelter[];
}) {
  const open = incidents.filter((i) => !["resolved", "cancelled"].includes(i.status));
  const critical = open.filter((i) => i.priority_band === "CRITICAL").length;
  const awaiting = open.filter((i) => i.status === "awaiting_approval").length;
  const available = responders.filter((r) => r.status === "available" && r.current_load < r.max_concurrent).length;
  const capTotal = shelters.reduce((s, x) => s + x.capacity_total, 0);
  const capUsed = shelters.reduce((s, x) => s + x.capacity_used, 0);

  const items = [
    { k: "Active incidents", v: open.length, tone: "text-zinc-100" },
    { k: "Critical", v: critical, tone: critical ? "text-red-400" : "text-zinc-100" },
    { k: "Awaiting approval", v: awaiting, tone: awaiting ? "text-amber-400" : "text-zinc-100" },
    { k: "Responders free", v: `${available}/${responders.length}`, tone: available ? "text-emerald-400" : "text-red-400" },
    { k: "Shelter load", v: capTotal ? `${Math.round((capUsed / capTotal) * 100)}%` : "-", tone: "text-zinc-100" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.07] border-y border-white/[0.07]">
      {items.map((i) => (
        <div key={i.k} className="bg-base-950 px-3 py-2">
          <div className="label">{i.k}</div>
          <div className={`text-xl font-semibold leading-tight ${i.tone}`}>{i.v}</div>
        </div>
      ))}
    </div>
  );
}
