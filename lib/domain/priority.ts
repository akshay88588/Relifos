import { PRIORITY_BANDS, PRIORITY_WEIGHTS as W } from "./weights";
import type { DecisionFactor, PriorityBand, PriorityInput, PriorityResult } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * THE PRIORITY ENGINE.
 *
 * A pure, deterministic, reproducible function. The language model never
 * produces a priority score; it produces the *observations* (severity, urgency,
 * how many people, which vulnerabilities, whether life is at immediate risk,
 * and how sure it is). This function turns observations into a number, and
 * records exactly how it got there so the coordinator can audit the reasoning
 * without ever seeing model chain-of-thought.
 *
 * Same inputs -> same score, every time. Different report -> different score.
 */
export function computePriority(input: PriorityInput): PriorityResult {
  const factors: DecisionFactor[] = [];
  let score = 0;

  // 1. Assessed severity
  const sev = W.severity[input.severity] ?? 0;
  score += sev;
  factors.push({
    label: `Severity assessed ${input.severity}`,
    contribution: sev,
    direction: "positive",
  });

  // 2. Immediate threat to life
  if (input.life_risk) {
    score += W.lifeRisk;
    factors.push({
      label: "Immediate life risk reported",
      detail: "Report indicates people cannot survive without intervention",
      contribution: W.lifeRisk,
      direction: "positive",
    });
  }

  // 3. Vulnerable people present
  const vulnRaw = input.vulnerability_flags.reduce(
    (sum, f) => sum + (W.vulnerability[f] ?? 0), 0,
  );
  const vuln = Math.min(W.vulnerabilityCap, vulnRaw);
  if (vuln > 0) {
    score += vuln;
    factors.push({
      label: "Vulnerable people present",
      detail: input.vulnerability_flags.join(", "),
      contribution: round1(vuln),
      direction: "positive",
    });
  }

  // 4. Number of people affected (diminishing returns - 8 people is not 8x one person)
  const people = Math.min(
    W.people.cap,
    W.people.coefficient * Math.log2(1 + Math.max(0, input.people_affected)),
  );
  if (people > 0) {
    score += people;
    factors.push({
      label: `${input.people_affected} ${input.people_affected === 1 ? "person" : "people"} affected`,
      contribution: round1(people),
      direction: "positive",
    });
  }

  // 5. Urgency expressed in the report
  const urgency = W.urgency * clamp01(input.urgency);
  score += urgency;
  factors.push({
    label: "Urgency of language in report",
    detail: `${Math.round(clamp01(input.urgency) * 100)}% urgency`,
    contribution: round1(urgency),
    direction: "positive",
  });

  // 6. Time pressure - an incident nobody has dispatched to climbs on its own.
  const time = Math.min(
    W.timePressure.cap,
    W.timePressure.perMinute * Math.max(0, input.minutes_awaiting_dispatch),
  );
  if (time > 0) {
    score += time;
    factors.push({
      label: "Waiting without dispatch",
      detail: `${Math.round(input.minutes_awaiting_dispatch)} min since report`,
      contribution: round1(time),
      direction: "positive",
    });
  }

  // 7. System-wide scarcity - when capable responders run out, everyone waiting
  //    for that capability becomes more urgent. This is what makes the queue
  //    react to the state of the whole system, not just to its own text.
  const scarcity = W.scarcity * (1 - Math.min(1, Math.max(0, input.capability_supply_ratio)));
  if (scarcity > 0.05) {
    score += scarcity;
    factors.push({
      label: "Capable responders scarce",
      detail: `supply ratio ${input.capability_supply_ratio.toFixed(2)}`,
      contribution: round1(scarcity),
      direction: "positive",
    });
  }

  // 8. Uncertainty penalty - a low-confidence assessment should not outrank a
  //    well-understood incident on the strength of guesses.
  const penalty = W.confidencePenalty * (1 - clamp01(input.confidence));
  if (penalty > 0.05) {
    score -= penalty;
    factors.push({
      label: "Assessment confidence below certainty",
      detail: `${Math.round(clamp01(input.confidence) * 100)}% confidence`,
      contribution: -round1(penalty),
      direction: "negative",
    });
  }

  const final = Math.max(0, Math.min(100, score));
  return { score: round1(final), band: bandFor(final), factors };
}

export function bandFor(score: number): PriorityBand {
  if (score >= PRIORITY_BANDS.CRITICAL) return "CRITICAL";
  if (score >= PRIORITY_BANDS.HIGH) return "HIGH";
  if (score >= PRIORITY_BANDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

/** A priority change is worth announcing if the band moved or the score moved materially. */
export function isMaterialPriorityChange(
  prev: { score: number; band: string },
  next: { score: number; band: string },
): boolean {
  return prev.band !== next.band || Math.abs(next.score - prev.score) >= 3;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}
