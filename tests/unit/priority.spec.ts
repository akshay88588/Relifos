import { describe, expect, it } from "vitest";
import { computePriority } from "@/lib/domain/priority";
import type { PriorityInput } from "@/lib/domain/types";

const base: PriorityInput = {
  severity: "low", people_affected: 1, vulnerability_flags: [], life_risk: false,
  urgency: 0.3, confidence: 0.9, minutes_awaiting_dispatch: 0, capability_supply_ratio: 1,
};

const demoCase: PriorityInput = {
  severity: "critical", people_affected: 2, vulnerability_flags: ["elderly", "isolated"],
  life_risk: true, urgency: 0.94, confidence: 0.91,
  minutes_awaiting_dispatch: 0, capability_supply_ratio: 1,
};

describe("priority engine", () => {
  it("is deterministic: identical inputs give an identical score", () => {
    const a = computePriority(demoCase);
    const b = computePriority(demoCase);
    expect(a.score).toBe(b.score);
    expect(a.band).toBe(b.band);
  });

  it("rates the demo emergency CRITICAL", () => {
    const r = computePriority(demoCase);
    expect(r.band).toBe("CRITICAL");
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("rates a minor single-person report far lower", () => {
    const r = computePriority(base);
    expect(r.band).toBe("LOW");
    expect(r.score).toBeLessThan(32);
  });

  // The anti-'hardcoded AI decision' test: change the report, change the outcome.
  it("produces a different decision when the report changes", () => {
    const minor = computePriority(base);
    const severe = computePriority(demoCase);
    expect(severe.score).toBeGreaterThan(minor.score + 30);
    expect(severe.band).not.toBe(minor.band);
  });

  it("raises priority when a vulnerable person is present", () => {
    const without = computePriority({ ...base, severity: "high" });
    const with_ = computePriority({ ...base, severity: "high", vulnerability_flags: ["unconscious"] });
    expect(with_.score).toBeGreaterThan(without.score);
    expect(with_.factors.some((f) => f.label.includes("Vulnerable"))).toBe(true);
  });

  it("applies diminishing returns to the number of people affected", () => {
    const one = computePriority({ ...base, people_affected: 1 }).score;
    const two = computePriority({ ...base, people_affected: 2 }).score;
    const eight = computePriority({ ...base, people_affected: 8 }).score;
    expect(two).toBeGreaterThan(one);
    expect(eight - two).toBeLessThan((two - one) * 6);
  });

  it("ages an undispatched incident upward over time", () => {
    const fresh = computePriority({ ...base, severity: "medium" }).score;
    const stale = computePriority({ ...base, severity: "medium", minutes_awaiting_dispatch: 40 }).score;
    expect(stale).toBeGreaterThan(fresh);
  });

  it("raises priority when capable responders are scarce", () => {
    const plenty = computePriority({ ...base, severity: "high", capability_supply_ratio: 1 }).score;
    const none = computePriority({ ...base, severity: "high", capability_supply_ratio: 0 }).score;
    expect(none).toBeGreaterThan(plenty);
  });

  it("penalises a low-confidence assessment", () => {
    const sure = computePriority({ ...base, severity: "high", confidence: 1 }).score;
    const unsure = computePriority({ ...base, severity: "high", confidence: 0.2 }).score;
    expect(unsure).toBeLessThan(sure);
  });

  it("clamps to 0..100 and records a factor for every contribution", () => {
    const max = computePriority({
      severity: "critical", people_affected: 500, vulnerability_flags: ["unconscious", "infant", "elderly"],
      life_risk: true, urgency: 1, confidence: 1, minutes_awaiting_dispatch: 10_000,
      capability_supply_ratio: 0,
    });
    expect(max.score).toBeLessThanOrEqual(100);
    expect(max.band).toBe("CRITICAL");
    expect(max.factors.length).toBeGreaterThanOrEqual(6);
  });
});
