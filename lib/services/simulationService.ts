import { publish } from "@/lib/events/publish";
import { admin } from "@/lib/supabase/admin";
import * as I from "@/lib/repositories/incidents";
import * as R from "@/lib/repositories/responders";
import { intakeIncident } from "./incidentService";
import { setResponderStatus } from "./responderService";
import { adjustShelterCapacity } from "./resourceService";
import { ageOpenIncidents } from "./reconciler";
import { setConfig } from "./config";

/**
 * SIMULATION AND CHAOS MODE.
 *
 * Neither of these is a special code path. Both call exactly the same services
 * a real citizen or coordinator would, so every row they create is a real row
 * and every event they emit is a real event. The only difference is the
 * is_simulated flag and the banner it drives in the UI.
 */

const CENTRE = { lat: 17.4718, lng: 78.6660 }; // Ghatkesar / SNIST area, Hyderabad

export const DEMO_RESPONDERS = [
  { name: "Alpha Rescue", type: "rescue", caps: ["flood_rescue", "boat", "swift_water", "structural_rescue"], lat: 17.4780, lng: 78.6520, speed: 30, max: 1 },
  { name: "Bravo Rescue", type: "rescue", caps: ["flood_rescue", "boat", "evacuation"], lat: 17.4550, lng: 78.6900, speed: 28, max: 1 },
  { name: "Medic One", type: "medical", caps: ["medical_first_aid", "advanced_medical", "transport"], lat: 17.4700, lng: 78.6710, speed: 35, max: 1 },
  { name: "Medic Two", type: "medical", caps: ["medical_first_aid", "transport"], lat: 17.4920, lng: 78.6400, speed: 35, max: 1 },
  { name: "Fire Unit 7", type: "fire", caps: ["fire_suppression", "gas_safety", "evacuation", "structural_rescue"], lat: 17.4620, lng: 78.6450, speed: 30, max: 1 },
  { name: "Volunteer Team Sindhu", type: "volunteer", caps: ["evacuation", "supplies", "shelter_support"], lat: 17.4740, lng: 78.6630, speed: 20, max: 2 },
  { name: "Volunteer Team Kranti", type: "volunteer", caps: ["evacuation", "supplies", "debris_clearance"], lat: 17.4490, lng: 78.6580, speed: 20, max: 2 },
  { name: "Logistics Unit 3", type: "logistics", caps: ["transport", "supplies", "debris_clearance"], lat: 17.4850, lng: 78.6800, speed: 25, max: 2 },
];

const DEMO_SHELTERS = [
  { name: "Sunrise Community Hall", lat: 17.4695, lng: 78.6640, total: 200, used: 60 },
  { name: "Ghatkesar Government School", lat: 17.4560, lng: 78.6820, total: 150, used: 40 },
  { name: "Yamnampet Sports Complex", lat: 17.4830, lng: 78.6710, total: 300, used: 120 },
];

const DEMO_RESOURCES = [
  { kind: "boat", label: "Inflatable rescue boats", total: 4, available: 4, lat: 17.4780, lng: 78.6520 },
  { kind: "ambulance", label: "Ambulances", total: 3, available: 3, lat: 17.4700, lng: 78.6710 },
  { kind: "supplies", label: "Water and ration packs", total: 500, available: 500, lat: 17.4850, lng: 78.6800 },
];

/** Background incidents, written as a citizen would actually phrase them. */
export const DEMO_INCIDENTS = [
  { text: "Water has come into the lane near our shop and two shops are flooded. No one is hurt but we cannot move our things out.", lat: 17.4665, lng: 78.6590 },
  { text: "A tree has fallen across the road near the bus stop and vehicles cannot pass. Nobody is injured.", lat: 17.4805, lng: 78.6745 },
  { text: "My neighbour is an old man living alone and the water is rising in his street. He cannot walk properly and needs help getting out.", lat: 17.4600, lng: 78.6680 },
  { text: "There is a smell of gas near the apartment kitchen block and people are worried. Around fifteen families live here.", lat: 17.4750, lng: 78.6555 },
];

export async function seedWorld() {
  const existing = await R.listResponders();
  if (existing.length > 0) {
    // The world is already seeded, but a Chaos run may have left units offline
    // and carrying stale load. Re-seeding used to no-op, so the demo could only
    // ever be restored with a full reset. Put every simulated unit back in
    // service instead: the starting state must never be all-offline, or a
    // CRITICAL incident has no candidate to match against.
    const { error } = await admin()
      .from("responders")
      .update({ status: "available", current_load: 0 })
      .eq("is_simulated", true);
    if (error) console.error("[simulation] could not restore responders", error.message);

    await publish({
      type: "simulation.step_executed", entity_type: "system",
      payload: { step: "restore_responders", restored: existing.length,
                 note: "Simulated units returned to available" },
    });
    return { responders: existing.length, seeded: false, restored: true };
  }

  await admin().from("responders").insert(
    DEMO_RESPONDERS.map((r) => ({
      name: r.name, org: "ReliefOS Demo Agency", type: r.type, status: "available",
      capabilities: r.caps, current_load: 0, max_concurrent: r.max, speed_kmh: r.speed,
      base_location: `SRID=4326;POINT(${r.lng} ${r.lat})`,
      current_location: `SRID=4326;POINT(${r.lng} ${r.lat})`,
      is_simulated: true,
    })),
  );
  await admin().from("shelters").insert(
    DEMO_SHELTERS.map((s) => ({
      name: s.name, location: `SRID=4326;POINT(${s.lng} ${s.lat})`,
      capacity_total: s.total, capacity_used: s.used, status: "open", is_simulated: true,
    })),
  );
  await admin().from("resources").insert(
    DEMO_RESOURCES.map((r) => ({
      kind: r.kind, label: r.label, quantity_total: r.total, quantity_available: r.available,
      location: `SRID=4326;POINT(${r.lng} ${r.lat})`, is_simulated: true,
    })),
  );

  await publish({
    type: "simulation.step_executed", entity_type: "system",
    payload: { step: "seed_world", responders: DEMO_RESPONDERS.length,
               shelters: DEMO_SHELTERS.length, note: "Demo responders and shelters created" },
  });
  return { responders: DEMO_RESPONDERS.length, seeded: true };
}

/** One background incident per call, so no single request has to wait on many model calls. */
export async function seedIncident(index: number) {
  const spec = DEMO_INCIDENTS[index];
  if (!spec) return null;
  return intakeIncident({
    description: spec.text, lat: spec.lat, lng: spec.lng,
    source: "simulation", address_text: "Ghatkesar area (demo)", is_simulated: true,
  });
}

// ---------------------------------------------------------------- CHAOS MODE

export interface ChaosStep {
  offset_s: number;
  kind: "incident" | "responder_offline" | "shelter" | "reporter_update" | "congestion" | "age";
  label: string;
  params: Record<string, any>;
}

export const CHAOS_SCRIPT: ChaosStep[] = [
  { offset_s: 0, kind: "incident", label: "Flood report: family trapped on ground floor",
    params: { text: "Water has entered our house and my parents are on the ground floor. My father cannot walk and we cannot get them out. Please send help fast.", lat: 17.4735, lng: 78.6605 } },
  { offset_s: 8, kind: "incident", label: "Second report: stranded on a rooftop",
    params: { text: "Four of us are stuck on the terrace, the water below is rising and the stairs are flooded. One person is a small child.", lat: 17.4665, lng: 78.6720 } },
  { offset_s: 18, kind: "responder_offline", label: "Alpha Rescue goes offline (vehicle stuck)",
    params: { name: "Alpha Rescue" } },
  { offset_s: 28, kind: "incident", label: "Critical report: unconscious person",
    params: { text: "An elderly woman has collapsed and is not responding. Water is inside the house and we cannot carry her out alone. Urgent.", lat: 17.4790, lng: 78.6690 } },
  { offset_s: 38, kind: "shelter", label: "Sunrise Community Hall capacity drops",
    params: { name: "Sunrise Community Hall", delta: 130, reason: "Sudden intake of evacuated families" } },
  { offset_s: 48, kind: "reporter_update", label: "Reporter adds detail to an open incident",
    params: { text: "Two more neighbours have joined us and one of them is injured and bleeding." } },
  { offset_s: 58, kind: "congestion", label: "Road conditions deteriorate", params: { factor: 1.6 } },
  { offset_s: 68, kind: "age", label: "Time pressure recalculation across the open queue", params: {} },
];

export async function startChaos() {
  await admin().from("simulation_runs").update({ status: "stopped", ended_at: new Date().toISOString() }).eq("status", "running");
  const { data, error } = await admin().from("simulation_runs")
    .insert({ scenario: "flood_surge", status: "running", steps: CHAOS_SCRIPT as any, current_step: 0 })
    .select("id, started_at, steps, current_step, status").single();
  if (error) throw new Error(`startChaos: ${error.message}`);
  await setConfig("simulation_active", true);
  await publish({
    type: "simulation.step_executed", entity_type: "system", simulation_run_id: data.id,
    payload: { step: "chaos_started", scenario: "flood_surge", total_steps: CHAOS_SCRIPT.length },
  });
  return data;
}

export async function stopChaos() {
  await admin().from("simulation_runs")
    .update({ status: "stopped", ended_at: new Date().toISOString() }).eq("status", "running");
  await setConfig("simulation_active", false);
  await setConfig("congestion_factor", 1.0);
  await publish({ type: "simulation.step_executed", entity_type: "system",
    payload: { step: "chaos_stopped" } });
  return { stopped: true };
}

/**
 * The browser calls this on a short interval, but the SERVER decides which
 * steps are due from started_at and current_step, and executes them through the
 * ordinary services. The client is a metronome; it cannot cause a state change
 * the server did not perform. (Vercel's serverless runtime has no durable
 * background timer - this is documented in the README under Limitations.)
 */
export async function tickChaos() {
  const { data: run } = await admin().from("simulation_runs")
    .select("id, started_at, steps, current_step, status").eq("status", "running").maybeSingle();
  if (!run) return { running: false, executed: [] as string[] };

  const elapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  const steps = (run.steps ?? []) as ChaosStep[];
  const executed: string[] = [];
  let cursor = run.current_step;

  // Catch up on every step that is now due, not just the next one, so a tab that
  // was closed or throttled does not strand the scenario. Bounded by a wall-clock
  // budget and a step cap so no single request nears the serverless timeout.
  const budgetMs = 25_000;
  const startedAt = Date.now();
  let ranThisTick = 0;

  while (
    cursor < steps.length &&
    steps[cursor].offset_s <= elapsed &&
    ranThisTick < 3 &&
    Date.now() - startedAt < budgetMs
  ) {
    const step = steps[cursor];

    // CLAIM THE STEP BEFORE RUNNING IT.
    //
    // The browser polls this endpoint every 2.5s. Two overlapping ticks used to
    // both read current_step = N, both judge step N due, and both execute it -
    // duplicating an incident or a match in the audit trail. The claim is a
    // conditional UPDATE: only the tick whose `current_step` still equals the
    // value it read wins the row, and only the winner executes. The loser sees
    // no row and moves on. Exactly-once, enforced by Postgres rather than by
    // hoping the polls never overlap.
    const { data: claimed } = await admin()
      .from("simulation_runs")
      .update({ current_step: cursor + 1 })
      .eq("id", run.id)
      .eq("current_step", cursor)
      .select("id")
      .maybeSingle();

    if (!claimed) break; // another tick claimed this step; it owns the execution

    try {
      await executeStep(step, run.id);
      executed.push(step.label);
    } catch (err: any) {
      await publish({
        type: "simulation.step_executed", entity_type: "system", simulation_run_id: run.id,
        payload: { step: step.label, error: err?.message ?? String(err), ok: false },
      });
    }
    cursor++;
    ranThisTick++;
  }

  const done = cursor >= steps.length;
  if (done) {
    await admin().from("simulation_runs")
      .update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", run.id);
    await setConfig("simulation_active", false);
  }

  return { running: !done, executed, step: cursor, total: steps.length, elapsed: Math.round(elapsed) };
}

async function executeStep(step: ChaosStep, runId: string) {
  switch (step.kind) {
    case "incident": {
      await intakeIncident({
        description: step.params.text, lat: step.params.lat, lng: step.params.lng,
        source: "simulation", address_text: "Ghatkesar area (demo)", is_simulated: true,
      });
      break;
    }
    case "responder_offline": {
      const all = await R.listResponders();
      const target = all.find((r) => r.name === step.params.name && r.status !== "offline")
        ?? all.find((r) => r.status === "available");
      if (target) await setResponderStatus(target.id, "offline");
      break;
    }
    case "shelter": {
      const { data } = await admin().from("shelters").select("id").eq("name", step.params.name).maybeSingle();
      if (data) await adjustShelterCapacity(data.id, step.params.delta, step.params.reason);
      break;
    }
    case "reporter_update": {
      const open = await I.listUndispatched();
      const target = open.find((i) => i.is_simulated) ?? open[0];
      if (target) {
        const { addIncidentUpdate } = await import("./incidentService");
        await addIncidentUpdate(target.id, step.params.text);
      }
      break;
    }
    case "congestion": {
      await setConfig("congestion_factor", step.params.factor);
      break;
    }
    case "age": {
      await ageOpenIncidents();
      break;
    }
  }

  await publish({
    type: "simulation.step_executed", entity_type: "system", simulation_run_id: runId,
    payload: { step: step.label, kind: step.kind, ok: true },
  });
}

/**
 * Removes every SIMULATED row and resets tuning.
 *
 * Deliberately scoped. Deleting the simulated incidents cascades to their
 * events, assessments, candidates, assignments, AI decisions, factors and
 * notifications (every one of those tables declares
 * `incident_id ... on delete cascade`), so the demo world disappears without
 * this function ever issuing an unscoped delete. Events and notifications
 * belonging to REAL reports are left alone: an audit log that a UI button can
 * silently truncate is not an audit log.
 */
export async function resetSimulation() {
  const db = admin();

  // Chaos-run bookkeeping: events tagged with a run, then the runs themselves.
  await db.from("system_events").delete().not("simulation_run_id", "is", null);
  await db.from("simulation_runs").delete().not("id", "is", null);

  // Cascades clear the dependent rows for each simulated incident.
  const { data: removed } = await db.from("incidents").delete().eq("is_simulated", true).select("id");
  await db.from("responders").delete().eq("is_simulated", true);
  await db.from("shelters").delete().eq("is_simulated", true);
  await db.from("resources").delete().eq("is_simulated", true);

  await setConfig("congestion_factor", 1.0);
  await setConfig("simulation_active", false);
  return { reset: true, incidents_removed: removed?.length ?? 0 };
}

export { CENTRE };
