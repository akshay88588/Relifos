/**
 * Shared domain types. These describe the *validated* shape of the world after
 * AI output has passed the validation ladder in lib/ai/validate.ts.
 * Nothing in lib/domain imports Supabase, Next.js or the AI client.
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type PriorityBand = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const VULNERABILITY_FLAGS = [
  "unconscious", "injured", "infant", "elderly", "pregnant",
  "disabled", "child", "non_swimmer", "isolated",
] as const;
export type VulnerabilityFlag = (typeof VULNERABILITY_FLAGS)[number];

export const CAPABILITIES = [
  "flood_rescue", "boat", "swift_water", "medical_first_aid", "advanced_medical",
  "evacuation", "fire_suppression", "structural_rescue", "gas_safety",
  "transport", "supplies", "shelter_support", "debris_clearance",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const HAZARD_TYPES = [
  "flood", "fire", "building_collapse", "medical", "trapped",
  "gas_leak", "road_block", "other",
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export type ResponderType = "rescue" | "medical" | "volunteer" | "logistics" | "fire";
export type ResponderStatus = "available" | "en_route" | "on_scene" | "busy" | "offline";

/** The validated structured output of Agent 1 (Incident Intelligence). */
export interface IncidentIntelligence {
  hazard_type: HazardType;
  severity: Severity;
  people_affected: number;
  vulnerability_flags: VulnerabilityFlag[];
  life_risk: boolean;
  required_capabilities: Capability[];
  urgency: number;      // 0..1
  confidence: number;   // 0..1
  missing_information: string[];
  short_summary: string;
}

/** One row of the "WHY THIS DECISION?" panel. */
export interface DecisionFactor {
  label: string;
  detail?: string;
  contribution: number;
  direction: "positive" | "negative" | "neutral";
}

export interface PriorityInput {
  severity: Severity;
  people_affected: number;
  vulnerability_flags: VulnerabilityFlag[];
  life_risk: boolean;
  urgency: number;
  confidence: number;
  /** minutes the incident has been waiting without a dispatched responder */
  minutes_awaiting_dispatch: number;
  /** available capable responders / open incidents needing that capability */
  capability_supply_ratio: number;
}

export interface PriorityResult {
  score: number;
  band: PriorityBand;
  factors: DecisionFactor[];
}

export interface CandidateResponder {
  id: string;
  name: string;
  org: string | null;
  type: ResponderType;
  status: ResponderStatus;
  capabilities: string[];
  current_load: number;
  max_concurrent: number;
  speed_kmh: number;
  lat: number;
  lng: number;
  distance_m: number;
  /** id of an assignment this responder is already committed to, if any */
  active_assignment_id: string | null;
  /** priority score of the incident they are currently committed to */
  active_incident_priority: number | null;
}

export interface ScoredCandidate {
  responder_id: string;
  name: string;
  type: ResponderType;
  score: number;
  rank: number | null;
  distance_km: number;
  eta_minutes: number;
  eligible: boolean;
  exclusion_reason: string | null;
  factors: DecisionFactor[];
  /** true when taking this responder would mean pulling them off a lower-priority incident */
  preemption_of: string | null;
}
