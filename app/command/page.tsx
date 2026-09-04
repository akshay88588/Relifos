"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useReliefStream } from "@/lib/realtime/useReliefStream";
import { LiveMap } from "@/components/map/LiveMap";
import { MetricStrip } from "@/components/command/MetricStrip";
import { PriorityQueue } from "@/components/command/PriorityQueue";
import { EventTimeline } from "@/components/command/EventTimeline";
import { ResponderBoard, ShelterBoard } from "@/components/command/SideBoards";
import { ChaosControls } from "@/components/command/ChaosControls";
import { ConnectionPill, SystemChip } from "@/components/command/StatusBar";
import { UserChip } from "@/components/command/UserChip";
import { IncidentDetail } from "@/components/incidents/IncidentDetail";

export default function CommandCenter() {
  const { state, events, connection, lastEvent, error, refetch } = useReliefStream();
  const [selected, setSelected] = useState<string | null>(null);
  const refreshKey = useMemo(() => events.length, [events.length]);

  const simulated = (state?.incidents ?? []).some((i) => i.is_simulated)
    || (state?.responders ?? []).some((r) => r.is_simulated);

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="px-4 py-2.5 flex items-center justify-between gap-4 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            RELIEF<span className="text-emerald-400">OS</span>
          </Link>
          <span className="label hidden md:inline">Live emergency command center</span>
          {simulated && <span className="chip bg-amber-500/20 text-amber-300">simulation mode</span>}
        </div>
        <div className="flex items-center gap-4">
          <SystemChip />
          <ConnectionPill connection={connection} />
          <ChaosControls state={state} onRefetch={refetch} />
          <UserChip />
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-[12px] text-red-300 flex items-center gap-3">
          {error}
          <Link href="/login" className="underline">Sign in</Link>
        </div>
      )}

      <MetricStrip
        incidents={state?.incidents ?? []}
        responders={state?.responders ?? []}
        shelters={state?.shelters ?? []}
      />

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-2 p-2">
        <section className="col-span-12 lg:col-span-5 xl:col-span-6 min-h-0 panel overflow-hidden">
          <LiveMap
            incidents={state?.incidents ?? []}
            responders={state?.responders ?? []}
            shelters={state?.shelters ?? []}
            assignments={state?.assignments ?? []}
            lastEvent={lastEvent}
            onSelect={setSelected}
            selectedId={selected}
          />
        </section>

        <section className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
          <PriorityQueue
            incidents={state?.incidents ?? []}
            assignments={state?.assignments ?? []}
            responders={state?.responders ?? []}
            selectedId={selected}
            onSelect={setSelected}
          />
        </section>

        <section className="col-span-12 md:col-span-6 lg:col-span-4 xl:col-span-3 min-h-0 flex flex-col gap-2">
          {selected ? (
            <IncidentDetail
              incidentId={selected}
              refreshKey={refreshKey}
              onClose={() => setSelected(null)}
              onAction={refetch}
            />
          ) : (
            <>
              <ResponderBoard responders={state?.responders ?? []} assignments={state?.assignments ?? []} />
              <ShelterBoard shelters={state?.shelters ?? []} />
              <div className="panel p-3 text-[12px] text-zinc-500 leading-relaxed">
                Select an incident to see the priority factors, the candidate scoreboard and the
                dispatch controls.
              </div>
            </>
          )}
        </section>
      </div>

      <section className="h-[190px] shrink-0 px-2 pb-2">
        <EventTimeline events={events} />
      </section>
    </main>
  );
}
