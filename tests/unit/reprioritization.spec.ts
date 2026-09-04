import { describe, expect, it } from "vitest";
import { computePriority, isMaterialPriorityChange } from "@/lib/domain/priority";
import { haversineKm, estimateEtaMinutes } from "@/lib/domain/geo";
import { EVENT_TYPES } from "@/lib/events/types";
import { mergeEvents } from "@/lib/realtime/useReliefStream";
import type { PriorityInput } from "@/lib/domain/types";

const base: PriorityInput = {
  severity: "medium", people_affected: 1, vulnerability_flags: [], life_risk: false,
  urgency: 0.5, confidence: 0.9, minutes_awaiting_dispatch: 0, capability_supply_ratio: 1,
};

describe("dynamic reprioritization", () => {
  it("escalates when a reporter adds people and a vulnerability", () => {
    const before = computePriority(base);
    const after = computePriority({
      ...base, people_affected: 4, vulnerability_flags: ["elderly", "injured"],
      severity: "high", urgency: 0.8,
    });
    expect(after.score).toBeGreaterThan(before.score);
    expect(isMaterialPriorityChange(before, after)).toBe(true);
  });

  it("escalates when the responder pool for a capability empties", () => {
    const supplied = computePriority({ ...base, severity: "high", capability_supply_ratio: 1 });
    const stranded = computePriority({ ...base, severity: "high", capability_supply_ratio: 0 });
    expect(stranded.score).toBeGreaterThan(supplied.score);
  });

  it("does not announce a change that is only noise", () => {
    const a = { score: 61.0, band: "HIGH" };
    const b = { score: 62.4, band: "HIGH" };
    expect(isMaterialPriorityChange(a, b)).toBe(false);
  });

  it("always announces a band crossing", () => {
    expect(isMaterialPriorityChange({ score: 54.9, band: "MEDIUM" }, { score: 55.1, band: "HIGH" })).toBe(true);
  });

  it("can carry a MEDIUM incident into HIGH on waiting time alone", () => {
    const fresh = computePriority({ ...base, severity: "high", urgency: 0.75 });
    const waited = computePriority({ ...base, severity: "high", urgency: 0.75, minutes_awaiting_dispatch: 45 });
    expect(waited.score).toBeGreaterThan(fresh.score);
    expect(waited.factors.some((f) => f.label.includes("Waiting"))).toBe(true);
  });
});

describe("geospatial estimates", () => {
  it("measures a known short distance sensibly", () => {
    // roughly 1.1 km apart in the Ghatkesar demo area
    const km = haversineKm({ lat: 17.4718, lng: 78.666 }, { lat: 17.4818, lng: 78.666 });
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.2);
  });

  it("returns zero distance for the same point", () => {
    expect(haversineKm({ lat: 17.47, lng: 78.66 }, { lat: 17.47, lng: 78.66 })).toBeCloseTo(0, 5);
  });

  it("scales ETA with distance and congestion", () => {
    const near = estimateEtaMinutes(2, 30, 1);
    const far = estimateEtaMinutes(10, 30, 1);
    const jammed = estimateEtaMinutes(10, 30, 1.6);
    expect(far).toBeGreaterThan(near);
    expect(jammed).toBeCloseTo(far * 1.6, 5);
  });
});

describe("event catalog", () => {
  it("covers every transition the command centre renders", () => {
    for (const t of [
      "incident.created", "incident.priority_changed", "ai.assessment_created",
      "ai.assessment_rejected", "match.created", "match.invalidated",
      "assignment.created", "assignment.accepted", "responder.status_changed",
      "shelter.capacity_changed", "simulation.step_executed", "system.degraded",
    ]) {
      expect(EVENT_TYPES).toContain(t as any);
    }
  });

  it("has no duplicate event types", () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });
});

describe("realtime event merging", () => {
  const ev = (id: string, seq: number) => ({ id, seq } as any);

  it("de-duplicates an event that arrives over the socket and again in a catch-up", () => {
    const first = mergeEvents([], [ev("a", 1), ev("b", 2)]);
    const merged = mergeEvents(first, [ev("b", 2), ev("c", 3)]);
    expect(merged.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("survives a duplicated subscription delivering everything twice", () => {
    const batch = [ev("a", 1), ev("b", 2), ev("c", 3)];
    const merged = mergeEvents(mergeEvents([], batch), batch);
    expect(merged).toHaveLength(3);
    expect(new Set(merged.map((e) => e.id)).size).toBe(3);
  });

  it("orders by sequence regardless of arrival order", () => {
    const merged = mergeEvents([], [ev("c", 3), ev("a", 1), ev("b", 2)]);
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("keeps only the most recent events once the buffer is full", () => {
    const many = Array.from({ length: 600 }, (_, i) => ev(`e${i}`, i + 1));
    const merged = mergeEvents([], many);
    expect(merged).toHaveLength(500);
    expect(merged[merged.length - 1].seq).toBe(600);
  });
});
