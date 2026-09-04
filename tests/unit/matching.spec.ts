import { describe, expect, it } from "vitest";
import { requiresHumanApproval, scoreCandidates } from "@/lib/domain/matching";
import type { CandidateResponder } from "@/lib/domain/types";

const incident = {
  incidentId: "i1", incidentPriority: 80, hazardType: "flood",
  requiredCapabilities: ["flood_rescue", "boat"],
  location: { lat: 17.47, lng: 78.66 },
};

const unit = (over: Partial<CandidateResponder> = {}): CandidateResponder => ({
  id: "r1", name: "Alpha Rescue", org: "demo", type: "rescue", status: "available",
  capabilities: ["flood_rescue", "boat"], current_load: 0, max_concurrent: 1, speed_kmh: 30,
  lat: 17.47, lng: 78.66, distance_m: 2000,
  active_assignment_id: null, active_incident_priority: null, ...over,
});

describe("matching engine", () => {
  it("ranks a close, capable, idle unit first", () => {
    const out = scoreCandidates(incident, [
      unit({ id: "far", name: "Far unit", distance_m: 18_000 }),
      unit({ id: "near", name: "Near unit", distance_m: 1_500 }),
    ]);
    expect(out[0].responder_id).toBe("near");
    expect(out[0].rank).toBe(1);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("excludes an offline unit and says why", () => {
    const [c] = scoreCandidates(incident, [unit({ status: "offline" })]);
    expect(c.eligible).toBe(false);
    expect(c.exclusion_reason).toMatch(/offline/i);
    expect(c.score).toBe(0);
  });

  it("excludes a unit with no matching capability", () => {
    const [c] = scoreCandidates(incident, [unit({ capabilities: ["supplies"] })]);
    expect(c.eligible).toBe(false);
    expect(c.exclusion_reason).toMatch(/capability/i);
  });

  it("excludes a unit at maximum load", () => {
    const [c] = scoreCandidates(incident, [unit({ current_load: 1, max_concurrent: 1 })]);
    expect(c.eligible).toBe(false);
    expect(c.exclusion_reason).toMatch(/load/i);
  });

  it("excludes a unit outside the operating radius", () => {
    const [c] = scoreCandidates(incident, [unit({ distance_m: 40_000 })]);
    expect(c.eligible).toBe(false);
    expect(c.exclusion_reason).toMatch(/radius/i);
  });

  it("protects a committed responder unless this incident clearly outranks theirs", () => {
    const committed = unit({ status: "en_route", active_assignment_id: "a1", active_incident_priority: 75 });
    const [blocked] = scoreCandidates({ ...incident, incidentPriority: 80 }, [committed]);
    expect(blocked.eligible).toBe(false);

    const [offered] = scoreCandidates({ ...incident, incidentPriority: 95 }, [committed]);
    expect(offered.eligible).toBe(true);
    expect(offered.preemption_of).toBe("a1");
  });

  it("degrades scores when road congestion rises", () => {
    const clear = scoreCandidates({ ...incident, congestionFactor: 1 }, [unit({ distance_m: 9000 })])[0];
    const jammed = scoreCandidates({ ...incident, congestionFactor: 2 }, [unit({ distance_m: 9000 })])[0];
    expect(jammed.eta_minutes).toBeGreaterThan(clear.eta_minutes);
    expect(jammed.score).toBeLessThan(clear.score);
  });

  it("records a factor breakdown for every eligible candidate", () => {
    const [c] = scoreCandidates(incident, [unit()]);
    const labels = c.factors.map((f) => f.label);
    expect(labels).toContain("Capability match");
    expect(labels.some((l) => l.includes("Proximity"))).toBe(true);
    expect(c.factors.reduce((s, f) => s + f.contribution, 0)).toBeCloseTo(c.score, 0);
  });
});

describe("approval policy", () => {
  it("requires a human whenever auto-dispatch is disabled", () => {
    const r = requiresHumanApproval({ band: "LOW", matchScore: 99, isPreemption: false,
      responderStatus: "available", autoDispatchEnabled: false });
    expect(r.required).toBe(true);
  });

  it("always requires a human for critical and high incidents", () => {
    for (const band of ["CRITICAL", "HIGH"]) {
      const r = requiresHumanApproval({ band, matchScore: 99, isPreemption: false,
        responderStatus: "available", autoDispatchEnabled: true });
      expect(r.required).toBe(true);
    }
  });

  it("requires a human before pulling a responder off another incident", () => {
    const r = requiresHumanApproval({ band: "MEDIUM", matchScore: 95, isPreemption: true,
      responderStatus: "available", autoDispatchEnabled: true });
    expect(r.required).toBe(true);
  });
});
