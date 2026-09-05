"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useReliefStream } from "@/lib/realtime/useReliefStream";
import { LiveMap } from "@/components/map/LiveMap";
import { MetricStrip } from "@/components/command/MetricStrip";
import { PriorityQueue } from "@/components/command/PriorityQueue";
import { EventTimeline } from "@/components/command/EventTimeline";
import { ResponderBoard, ShelterBoard } from "@/components/command/SideBoards";
import { ChaosControls } from "@/components/command/ChaosControls";
import { ConnectionPill, SystemChip } from "@/components/command/StatusBar";
import { UserChip } from "@/components/command/UserChip";
import { AppNav } from "@/components/ui/AppNav";
import { IncidentDetail } from "@/components/incidents/IncidentDetail";
import { ActivityIcon, ListIcon, MapIcon, WarnIcon } from "@/components/ui/bits";

type MobilePane = "queue" | "map" | "activity";

/**
 * THE COMMAND CENTRE.
 *
 * Desktop is a three-column operations console: map, queue, detail, with the
 * event log across the bottom. Mobile is NOT that layout shrunk - it is a
 * single pane with a bottom tab bar, because a coordinator on a phone needs one
 * complete thing at a time, not five compressed ones.
 */
export default function CommandCenter() {
  const { state, events, connection, lastEvent, error, refetch } = useReliefStream();
  const [selected, setSelected] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [pane, setPane] = useState<MobilePane>("queue");
  const refreshKey = useMemo(() => events.length, [events.length]);

  const incidents = state?.incidents ?? [];
  const responders = state?.responders ?? [];
  const shelters = state?.shelters ?? [];
  const assignments = state?.assignments ?? [];

  const simulated = incidents.some((i) => i.is_simulated) || responders.some((r) => r.is_simulated);

  /** Selecting on mobile should reveal the detail, not leave it on another tab. */
  useEffect(() => { if (selected) setPane("queue"); }, [selected]);

  const TABS: { id: MobilePane; label: string; icon: React.ReactNode }[] = [
    { id: "queue", label: "Queue", icon: <ListIcon size={16} /> },
    { id: "map", label: "Map", icon: <MapIcon size={16} /> },
    { id: "activity", label: "Activity", icon: <ActivityIcon size={16} /> },
  ];

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <a href="#main" className="skip-link">Skip to main content</a>

      <header className="px-3 sm:px-4 py-2 flex items-center justify-between gap-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-[15px] font-semibold tracking-tight shrink-0">
            RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
          </Link>
          <span className="label hidden xl:inline whitespace-nowrap">Emergency command centre</span>
          <AppNav />
          {simulated && (
            <span className="chip shrink-0" style={{ background: "var(--p-medium-bg)", color: "var(--p-medium)" }}
                  title="Some records on this screen were created by Simulation or Chaos Mode">
              simulation
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <SystemChip />
          <ConnectionPill connection={connection} />
          <div className="hidden md:block"><ChaosControls state={state} onRefetch={refetch} /></div>
          <UserChip />
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-[12px] flex items-center gap-2 shrink-0" role="alert"
             style={{ background: "var(--p-critical-bg)", borderBottom: "1px solid var(--p-critical-bd)", color: "var(--p-critical)" }}>
          <WarnIcon /> {error}
          <Link href="/login" className="underline ml-1">Sign in</Link>
        </div>
      )}

      <MetricStrip incidents={incidents} responders={responders} shelters={shelters} assignments={assignments} />

      {/* Chaos controls move below the metrics on small screens rather than
          being cut off the header. */}
      <div className="md:hidden px-2 py-1.5 shrink-0 overflow-x-auto"
           style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <ChaosControls state={state} onRefetch={refetch} />
      </div>

      <main id="main" className="flex-1 min-h-0 p-2">
        <h1 className="sr-only">ReliefOS emergency command centre</h1>
        {/* ---------------- desktop / tablet ---------------- */}
        <div className="hidden md:grid h-full min-h-0 grid-cols-12 grid-rows-[1fr_auto] gap-2">
          <section
            aria-label="Operational map"
            className={`min-h-0 panel overflow-hidden transition-all duration-200 ease-ops ${
              mapExpanded ? "col-span-12" : "col-span-12 lg:col-span-6"
            }`}
          >
            <LiveMap
              incidents={incidents} responders={responders} shelters={shelters}
              assignments={assignments} lastEvent={lastEvent}
              onSelect={setSelected} selectedId={selected}
              isExpanded={mapExpanded} onToggleExpand={() => setMapExpanded((p) => !p)}
            />
          </section>

          {!mapExpanded && (
            <>
              <section aria-label="Priority queue" className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
                <PriorityQueue
                  incidents={incidents} assignments={assignments} responders={responders}
                  exclusions={state?.exclusions} factors={state?.factors}
                  selectedId={selected} onSelect={setSelected}
                />
              </section>

              <section aria-label="Incident detail" className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0 flex flex-col gap-2">
                {selected ? (
                  <IncidentDetail
                    incidentId={selected} refreshKey={refreshKey}
                    onClose={() => setSelected(null)} onAction={refetch}
                  />
                ) : (
                  <div className="flex flex-col gap-2 min-h-0 h-full">
                    <ResponderBoard responders={responders} assignments={assignments} />
                    <ShelterBoard shelters={shelters} />
                    <div className="panel p-3 text-[12px] text-ink-tertiary leading-relaxed">
                      Select an incident to see the priority factors, the candidate scoreboard and the
                      dispatch controls.
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          <section aria-label="Event timeline" className="col-span-12 h-[186px]">
            <EventTimeline events={events} />
          </section>
        </div>

        {/* ---------------- mobile: one pane at a time ---------------- */}
        <div className="md:hidden h-full min-h-0">
          {pane === "queue" && (
            <div className="h-full min-h-0">
              {selected ? (
                <div className="h-full min-h-0 sheet-up">
                  <IncidentDetail
                    incidentId={selected} refreshKey={refreshKey}
                    onClose={() => setSelected(null)} onAction={refetch}
                  />
                </div>
              ) : (
                <PriorityQueue
                  incidents={incidents} assignments={assignments} responders={responders}
                  exclusions={state?.exclusions} factors={state?.factors}
                  selectedId={selected} onSelect={setSelected}
                />
              )}
            </div>
          )}
          {pane === "map" && (
            <div className="h-full min-h-0 panel overflow-hidden">
              <LiveMap
                incidents={incidents} responders={responders} shelters={shelters}
                assignments={assignments} lastEvent={lastEvent}
                onSelect={(id) => { setSelected(id); setPane("queue"); }}
                selectedId={selected}
              />
            </div>
          )}
          {pane === "activity" && (
            <div className="h-full min-h-0 flex flex-col gap-2">
              <div className="flex-1 min-h-0"><EventTimeline events={events} /></div>
              <ResponderBoard responders={responders} assignments={assignments} />
              <ShelterBoard shelters={shelters} />
            </div>
          )}
        </div>
      </main>

      {/* Bottom tab bar: thumb-reachable, 44px targets, safe-area aware. */}
      <nav className="md:hidden shrink-0 grid grid-cols-3 safe-b"
           style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-raised)" }}
           aria-label="Command centre sections">
        {TABS.map((t) => {
          const activeTab = pane === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setPane(t.id); if (t.id !== "queue") setSelected(null); }}
              aria-current={activeTab ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors"
              style={{ color: activeTab ? "var(--accent-hover)" : "var(--text-tertiary)" }}
            >
              {t.icon}
              <span className="text-[10.5px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
