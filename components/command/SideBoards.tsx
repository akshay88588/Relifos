"use client";
import type { Assignment, Responder, Shelter } from "@/lib/clientTypes";
import { ACTIVE_ASSIGNMENT, isResponderFree, byAvailabilityThenName } from "@/lib/clientTypes";
import { Bar, EmptyState, StatusDot } from "@/components/ui/bits";

export function ResponderBoard({ responders, assignments }: { responders: Responder[]; assignments: Assignment[] }) {
  const free = responders.filter(isResponderFree).length;
  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-head">
        <span>Responders</span>
        <span className="text-ink-faint font-normal normal-case tracking-normal tabular-nums">{free} free</span>
      </div>
      <div className="scroll-y max-h-[240px]">
        {[...responders].sort(byAvailabilityThenName).map((r) => {
          const active = assignments.find((a) => a.responder_id === r.id && ACTIVE_ASSIGNMENT.includes(a.status));
          return (
            <div key={r.id} className="px-3 py-1.5 border-b flex items-center justify-between gap-2"
                 style={{ borderColor: "var(--border-subtle)" }}>
              <div className="min-w-0">
                <div className="text-[12.5px] text-ink-primary flex items-center gap-1.5 truncate">
                  <StatusDot status={r.status} />{r.name}
                </div>
                <div className="text-[10.5px] text-ink-faint truncate">{r.capabilities.slice(0, 3).join(" · ")}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-ink-secondary">{r.status.replace(/_/g, " ")}</div>
                {active && <div className="text-[10px]" style={{ color: "var(--st-enroute)" }}>assigned</div>}
              </div>
            </div>
          );
        })}
        {!responders.length && (
          <EmptyState title="No responders" hint="Seed the demo world to create the responder pool." />
        )}
      </div>
    </div>
  );
}

export function ShelterBoard({ shelters }: { shelters: Shelter[] }) {
  return (
    <div className="panel flex flex-col min-h-0">
      <div className="panel-head"><span>Shelter capacity</span></div>
      <div className="scroll-y max-h-[170px]">
        {shelters.map((s) => (
          <div key={s.id} className="px-3 py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between text-[12px] gap-2">
              <span className="text-ink-secondary truncate">{s.name}</span>
              <span className="text-ink-tertiary mono text-[11px] shrink-0 tabular-nums">
                {s.capacity_used}/{s.capacity_total}
              </span>
            </div>
            <div className="mt-1.5">
              <Bar value={s.capacity_used} max={s.capacity_total} label={`${s.name} occupancy`} />
            </div>
          </div>
        ))}
        {!shelters.length && <EmptyState title="No shelters" hint="Seed the demo world to create shelters." />}
      </div>
    </div>
  );
}
