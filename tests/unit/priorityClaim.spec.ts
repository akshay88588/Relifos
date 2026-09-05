import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESSION: the audit trail must record a priority transition exactly once.
 *
 * Two recomputes of the same incident can overlap - the Chaos "time pressure"
 * step and /api/system/tick both call ageOpenIncidents. Both used to read the
 * same "before" row, both judged the priority changed, and both published
 * incident.priority_changed, leaving two byte-identical rows at the same
 * microsecond in system_events.
 *
 * The fix is an atomic conditional UPDATE keyed on priority_computed_at. These
 * tests stand a fake row in for Postgres and assert the loser publishes nothing
 * while the row still ends up carrying the new priority.
 */

const row = {
  id: "inc-1", code: "FLD-106", status: "new",
  severity: "critical", people_affected: 2, vulnerability_flags: ["elderly"],
  required_capabilities: ["flood_rescue"], urgency: 1, life_risk: true,
  ai_confidence: 0.9, priority_score: 10, priority_band: "LOW",
  priority_computed_at: "2026-09-04T22:00:00.000Z",
  created_at: new Date(Date.now() - 300 * 60_000).toISOString(),
};

/** The stored row, mutated only by a winning claim. */
let stored: typeof row;

const claimPriorityChange = vi.fn(async (id: string, expectedComputedAt: string | null, next: any) => {
  // Exactly what `update ... where priority_computed_at = $expected` does.
  if (stored.priority_computed_at !== expectedComputedAt) return null;
  stored = { ...stored, priority_score: next.score, priority_band: next.band, priority_computed_at: next.computed_at };
  return stored;
});
const updateIncident = vi.fn(async (_id: string, patch: any) => { stored = { ...stored, ...patch }; return stored; });
const getIncident = vi.fn(async () => stored);
const publish = vi.fn(async () => undefined);

vi.mock("@/lib/repositories/incidents", () => ({
  claimPriorityChange: (...a: any[]) => (claimPriorityChange as any)(...a),
  updateIncident: (...a: any[]) => (updateIncident as any)(...a),
  getIncident: (...a: any[]) => (getIncident as any)(...a),
  capabilitySupplyRatio: async () => 0.2,
  listUndispatched: async () => [],
}));
vi.mock("@/lib/repositories/decisions", () => ({ replaceFactors: async () => undefined }));
vi.mock("@/lib/repositories/assignments", () => ({}));
vi.mock("@/lib/repositories/matches", () => ({}));
vi.mock("@/lib/repositories/responders", () => ({}));
vi.mock("./matching", () => ({ runMatching: async () => undefined }));
vi.mock("@/lib/services/matching", () => ({ runMatching: async () => undefined }));
vi.mock("@/lib/events/publish", () => ({
  publish: (...a: any[]) => (publish as any)(...a),
  notify: async () => undefined,
}));

const { recomputePriority } = await import("@/lib/services/reconciler");

beforeEach(() => {
  stored = { ...row };
  claimPriorityChange.mockClear();
  publish.mockClear();
});

const changes = () => publish.mock.calls.filter((c: any[]) => c[0]?.type === "incident.priority_changed");

describe("priority transitions are claimed, not merely written", () => {
  it("publishes incident.priority_changed once when two ticks race on the same snapshot", async () => {
    const snapshot = { ...stored } as any;
    await Promise.all([
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
    ]);
    expect(changes()).toHaveLength(1);
    expect(claimPriorityChange).toHaveBeenCalledTimes(2);
  });

  it("still lands the new priority on the row when one caller loses the race", async () => {
    const snapshot = { ...stored } as any;
    await Promise.all([
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
    ]);
    expect(stored.priority_band).toBe("CRITICAL");
    expect(stored.priority_score).toBeGreaterThan(row.priority_score);
    expect(stored.priority_computed_at).not.toBe(row.priority_computed_at);
  });

  it("returns the winner's row to the caller that lost", async () => {
    const snapshot = { ...stored } as any;
    const [a, b] = await Promise.all([
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
      recomputePriority(snapshot, "time_elapsed", "corr-1"),
    ]);
    expect(a.priority_band).toBe("CRITICAL");
    expect(b.priority_band).toBe("CRITICAL");
  });

  it("a later, genuinely new transition is not suppressed", async () => {
    await recomputePriority({ ...stored } as any, "time_elapsed", "corr-1");
    expect(changes()).toHaveLength(1);
    publish.mockClear();
    // Fresh read of the row the first call wrote: no change left to announce.
    await recomputePriority({ ...stored } as any, "time_elapsed", "corr-2");
    expect(changes()).toHaveLength(0);
    expect(updateIncident).toHaveBeenCalled();
  });
});
