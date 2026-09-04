"use client";
import type { Assignment, Responder, Shelter } from "@/lib/clientTypes";
import { Bar, StatusDot } from "@/components/ui/bits";

export function ResponderBoard({ responders, assignments }: { responders: Responder[]; assignments: Assignment[] }) {
  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-head"><span>Responders</span>
        <span className="text-zinc-600">{responders.filter((r) => r.status === "available").length} free</span>
      </div>
      <div className="overflow-y-auto scrollbar-thin max-h-[240px]">
        {responders.map((r) => {
          const active = assignments.find((a) =>
            a.responder_id === r.id && ["dispatched", "accepted", "en_route", "on_scene"].includes(a.status));
          return (
            <div key={r.id} className="px-3 py-1.5 border-b border-white/[0.04] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] text-zinc-200 flex items-center gap-1.5">
                  <StatusDot status={r.status} />{r.name}
                </div>
                <div className="text-[10.5px] text-zinc-600 truncate">
                  {r.capabilities.slice(0, 3).join(" · ")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-zinc-400">{r.status.replace("_", " ")}</div>
                {active && <div className="text-[10px] text-blue-300">assigned</div>}
              </div>
            </div>
          );
        })}
        {!responders.length && <div className="p-3 text-[12px] text-zinc-600">No responders seeded.</div>}
      </div>
    </div>
  );
}

export function ShelterBoard({ shelters }: { shelters: Shelter[] }) {
  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-head"><span>Shelter capacity</span></div>
      <div className="overflow-y-auto scrollbar-thin max-h-[160px]">
        {shelters.map((s) => (
          <div key={s.id} className="px-3 py-2 border-b border-white/[0.04]">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-zinc-300 truncate">{s.name}</span>
              <span className="text-zinc-500 font-mono text-[11px]">{s.capacity_used}/{s.capacity_total}</span>
            </div>
            <div className="mt-1"><Bar value={s.capacity_used} max={s.capacity_total} /></div>
          </div>
        ))}
        {!shelters.length && <div className="p-3 text-[12px] text-zinc-600">No shelters seeded.</div>}
      </div>
    </div>
  );
}
