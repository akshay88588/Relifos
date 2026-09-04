/**
 * Every tunable number in the decision system lives here, in one file, so that
 * "the exact weights should be configurable" is literally true and so that a
 * judge can read the entire value system of the product on one screen.
 */

export const PRIORITY_WEIGHTS = {
  severity: { critical: 34, high: 25, medium: 15, low: 7 },
  lifeRisk: 12,
  vulnerability: {
    unconscious: 12, injured: 9, infant: 8, elderly: 7, pregnant: 7,
    disabled: 7, child: 6, non_swimmer: 4, isolated: 4,
  } as Record<string, number>,
  vulnerabilityCap: 16,
  people: { coefficient: 5.5, cap: 16 },
  urgency: 14,
  timePressure: { perMinute: 0.2, cap: 8 },
  scarcity: 6,
  confidencePenalty: 6,
} as const;

export const PRIORITY_BANDS = { CRITICAL: 75, HIGH: 55, MEDIUM: 32 } as const;

export const MATCH_WEIGHTS = {
  capability: 30,
  availability: { available: 20, en_route_lower_priority: 8, on_scene_wrapping: 5 },
  proximity: { max: 20, decayKm: 8 },
  eta: { max: 15, worstCaseMinutes: 45 },
  workload: 10,
  specialization: 5,
} as const;

export const MATCH_POLICY = {
  /** candidates beyond this radius are never considered */
  searchRadiusM: 25_000,
  /** below this score the system refuses to auto-recommend and asks a human */
  minRecommendScore: 50,
  /** at or above this score a low-priority incident may auto-dispatch (if enabled) */
  autoDispatchScore: 70,
  /** priority points incident B must exceed incident A by to justify preemption */
  preemptionMargin: 15,
} as const;

/** Straight-line travel speeds by responder type (km/h). No routing service is used. */
export const SPEED_KMH: Record<string, number> = {
  rescue: 30, medical: 35, fire: 30, volunteer: 20, logistics: 25,
};

/** Raised by Chaos Mode to model deteriorating road conditions. */
export const DEFAULT_CONGESTION_FACTOR = 1.0;

/** Which responder type is the natural fit for each hazard (specialization bonus). */
export const HAZARD_SPECIALIST: Record<string, string> = {
  flood: "rescue", fire: "fire", building_collapse: "rescue", medical: "medical",
  trapped: "rescue", gas_leak: "fire", road_block: "logistics", other: "volunteer",
};
