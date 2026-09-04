import { haversineKm, estimateEtaMinutes } from "./geo";
import { DEFAULT_CONGESTION_FACTOR, HAZARD_SPECIALIST, MATCH_POLICY, MATCH_WEIGHTS as M } from "./weights";
import type { CandidateResponder, DecisionFactor, ScoredCandidate } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface MatchContext {
  incidentId: string;
  incidentPriority: number;
  hazardType: string;
  requiredCapabilities: string[];
  location: { lat: number; lng: number };
  congestionFactor?: number;
}

/**
 * THE NEED<->HELP MATCHING ENGINE.
 *
 * Deterministic and transparent. Excluded responders are returned too, with the
 * reason they were excluded, so the command centre can show a coordinator who
 * was NOT chosen and why - which is usually the more useful half of the answer.
 */
export function scoreCandidates(
  ctx: MatchContext,
  candidates: CandidateResponder[],
): ScoredCandidate[] {
  const congestion = ctx.congestionFactor ?? DEFAULT_CONGESTION_FACTOR;
  const required = ctx.requiredCapabilities ?? [];

  const scored = candidates.map<ScoredCandidate>((c) => {
    const distanceKm = c.distance_m != null
      ? c.distance_m / 1000
      : haversineKm(ctx.location, { lat: c.lat, lng: c.lng });
    const speed = c.speed_kmh > 0 ? c.speed_kmh : 20;
    const eta = estimateEtaMinutes(distanceKm, speed, congestion);

    const base = {
      responder_id: c.id,
      name: c.name,
      type: c.type,
      distance_km: round1(distanceKm),
      eta_minutes: round1(eta),
      rank: null,
      preemption_of: null as string | null,
    };

    // ---- HARD GATES ----
    const gate = firstFailingGate(c, required, distanceKm, ctx.incidentPriority);
    if (gate) {
      return { ...base, score: 0, eligible: false, exclusion_reason: gate, factors: [] };
    }

    // ---- SCORE ----
    const factors: DecisionFactor[] = [];
    let score = 0;

    const matched = required.filter((r) => c.capabilities.includes(r));
    const coverage = required.length === 0 ? 1 : matched.length / required.length;
    const capPts = M.capability * coverage;
    score += capPts;
    factors.push({
      label: "Capability match",
      detail: required.length ? `${matched.length}/${required.length}: ${matched.join(", ") || "none"}` : "no specific capability required",
      contribution: round1(capPts),
      direction: "positive",
    });

    let availPts = 0;
    let availLabel = "";
    let preemptionOf: string | null = null;
    if (c.status === "available") {
      availPts = M.availability.available;
      availLabel = "Available now";
    } else if (c.status === "en_route" && c.active_assignment_id) {
      availPts = M.availability.en_route_lower_priority;
      availLabel = "En route to a lower-priority incident";
      preemptionOf = c.active_assignment_id;
    } else if (c.status === "on_scene") {
      availPts = M.availability.on_scene_wrapping;
      availLabel = "On scene, wrapping up";
    }
    score += availPts;
    factors.push({ label: availLabel || "Availability", contribution: round1(availPts), direction: "positive" });

    const proxPts = M.proximity.max * Math.exp(-distanceKm / M.proximity.decayKm);
    score += proxPts;
    factors.push({
      label: "Proximity",
      detail: `${round1(distanceKm)} km away`,
      contribution: round1(proxPts),
      direction: "positive",
    });

    const etaPts = M.eta.max * (1 - Math.min(1, eta / M.eta.worstCaseMinutes));
    score += etaPts;
    factors.push({
      label: "Estimated response time",
      detail: `~${Math.round(eta)} min (est., straight-line)`,
      contribution: round1(etaPts),
      direction: "positive",
    });

    const headroom = c.max_concurrent > 0 ? 1 - c.current_load / c.max_concurrent : 0;
    const loadPts = M.workload * Math.max(0, headroom);
    score += loadPts;
    factors.push({
      label: "Workload headroom",
      detail: `${c.current_load}/${c.max_concurrent} assigned`,
      contribution: round1(loadPts),
      direction: "positive",
    });

    if (HAZARD_SPECIALIST[ctx.hazardType] === c.type) {
      score += M.specialization;
      factors.push({
        label: "Specialist for this hazard",
        detail: `${c.type} unit for ${ctx.hazardType}`,
        contribution: M.specialization,
        direction: "positive",
      });
    }

    return {
      ...base,
      score: round1(Math.max(0, Math.min(100, score))),
      eligible: true,
      exclusion_reason: null,
      factors,
      preemption_of: preemptionOf,
    };
  });

  const eligible = scored.filter((s) => s.eligible).sort((a, b) => b.score - a.score);
  eligible.forEach((s, i) => (s.rank = i + 1));
  const excluded = scored.filter((s) => !s.eligible);
  return [...eligible, ...excluded];
}

function firstFailingGate(
  c: CandidateResponder,
  required: string[],
  distanceKm: number,
  incidentPriority: number,
): string | null {
  if (c.status === "offline") return "Responder offline";
  if (c.status === "busy") return "Responder busy";
  if (required.length > 0 && !required.some((r) => c.capabilities.includes(r))) {
    return `No matching capability (needs ${required.join(" or ")})`;
  }
  if (c.current_load >= c.max_concurrent) return "At maximum concurrent load";
  if (distanceKm * 1000 > MATCH_POLICY.searchRadiusM) {
    return `Outside ${MATCH_POLICY.searchRadiusM / 1000} km operating radius`;
  }
  // Already committed elsewhere: only offerable as a preemption, and only when
  // this incident materially outranks the one they are already serving.
  if (c.active_assignment_id) {
    const theirPriority = c.active_incident_priority ?? 0;
    if (c.status === "on_scene") return "Already on scene at another incident";
    if (incidentPriority - theirPriority < MATCH_POLICY.preemptionMargin) {
      return `Committed to a comparable incident (${theirPriority.toFixed(0)} vs ${incidentPriority.toFixed(0)})`;
    }
  }
  return null;
}

/** Does this dispatch need a human to sign it off? See docs/ARCHITECTURE.md section 9. */
export function requiresHumanApproval(args: {
  band: string;
  matchScore: number;
  isPreemption: boolean;
  responderStatus: string;
  autoDispatchEnabled: boolean;
}): { required: true; reason: string } | { required: false; reason: string } {
  if (!args.autoDispatchEnabled) {
    return { required: true, reason: "Auto-dispatch disabled: every dispatch is human-approved" };
  }
  if (args.band === "CRITICAL" || args.band === "HIGH") {
    return { required: true, reason: `${args.band} incidents always require coordinator approval` };
  }
  if (args.isPreemption) {
    return { required: true, reason: "Reassigning a committed responder requires approval" };
  }
  if (args.matchScore < MATCH_POLICY.autoDispatchScore) {
    return { required: true, reason: `Match confidence ${args.matchScore} below auto-dispatch threshold` };
  }
  if (args.responderStatus !== "available") {
    return { required: true, reason: "Responder is not idle" };
  }
  return { required: false, reason: "Low-priority incident with a strong, idle match" };
}

export { MATCH_POLICY };
