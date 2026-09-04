import type { IncidentIntelligenceOut } from "./schemas";
import type { Capability, HazardType, Severity, VulnerabilityFlag } from "@/lib/domain/types";

/**
 * DETERMINISTIC FALLBACK - NOT AN AI.
 *
 * Used only when Featherless is unreachable or returns unusable output twice.
 * It is a keyword extractor, it knows it is worse than the model, and every
 * incident it touches is flagged `degraded` in the database and shown with a
 * "RULE-BASED ASSESSMENT" badge in the UI. We would rather show a coordinator a
 * visibly weaker assessment than silently pretend the model succeeded.
 */

const HAZARD_RULES: [RegExp, HazardType, Capability[]][] = [
  [/\b(flood|water|drown|submerg|inundat|waterlogg)/i, "flood", ["flood_rescue", "boat"]],
  [/\b(fire|burning|flames|smoke)\b/i, "fire", ["fire_suppression", "evacuation"]],
  [/\b(collapse|building fell|debris|rubble|wall fell)/i, "building_collapse", ["structural_rescue", "debris_clearance"]],
  [/\b(gas|leak|cylinder|lpg)\b/i, "gas_leak", ["gas_safety", "evacuation"]],
  [/\b(trapped|stuck|cannot get out|can't get out|locked in)/i, "trapped", ["structural_rescue", "evacuation"]],
  [/\b(bleeding|unconscious|heart attack|breathing|injur|wound|fracture)/i, "medical", ["medical_first_aid", "advanced_medical"]],
  [/\b(road|blocked|tree fell|landslide|bridge)/i, "road_block", ["debris_clearance", "transport"]],
];

const VULN_RULES: [RegExp, VulnerabilityFlag][] = [
  [/\b(elderly|old|aged|grandmother|grandfather|senior|parents)\b/i, "elderly"],
  [/\b(baby|infant|newborn|toddler)\b/i, "infant"],
  [/\b(child|kid|children|son|daughter|school)\b/i, "child"],
  [/\b(pregnan)/i, "pregnant"],
  [/\b(disab|wheelchair|paralys|blind|deaf)/i, "disabled"],
  [/\b(unconscious|not responding|passed out|fainted)/i, "unconscious"],
  [/\b(injur|bleeding|wound|fracture|broken)/i, "injured"],
  [/\b(cannot swim|can't swim|non.?swimmer)/i, "non_swimmer"],
  [/\b(alone|stranded|isolated|cut off|no help|trapped)/i, "isolated"],
];

const CRITICAL = /\b(dying|drowning|unconscious|not breathing|urgent|immediately|emergency|help us|save|critical)\b/i;
const HIGH = /\b(trapped|rising|spreading|injured|bleeding|stuck|quickly|fast)\b/i;

export function deterministicAssessment(report: string): IncidentIntelligenceOut {
  const text = report || "";

  let hazard: HazardType = "other";
  let caps: Capability[] = ["evacuation"];
  for (const [re, h, c] of HAZARD_RULES) {
    if (re.test(text)) { hazard = h; caps = c; break; }
  }

  const flags = Array.from(new Set(VULN_RULES.filter(([re]) => re.test(text)).map(([, f]) => f)));

  const explicit = text.match(/\b(\d{1,3})\s*(people|persons|members|family|adults|children|kids)\b/i);
  const plural = /\b(parents|people|they|them|family|we|us|children)\b/i.test(text);
  const people = explicit ? Math.min(500, parseInt(explicit[1], 10)) : plural ? 2 : 1;

  const lifeRisk = CRITICAL.test(text) || flags.includes("unconscious");
  const severity: Severity = lifeRisk ? "critical" : HIGH.test(text) ? "high" : flags.length ? "medium" : "low";
  const urgency = lifeRisk ? 0.85 : HIGH.test(text) ? 0.6 : 0.4;

  if (flags.includes("injured") || flags.includes("unconscious")) {
    if (!caps.includes("medical_first_aid")) caps = [...caps, "medical_first_aid"];
  }

  return {
    hazard_type: hazard,
    severity,
    people_affected: people,
    vulnerability_flags: flags,
    life_risk: lifeRisk,
    required_capabilities: caps.slice(0, 6),
    urgency,
    // Hard cap: a keyword match must never look as trustworthy as a real assessment.
    confidence: 0.35,
    missing_information: ["Exact number of people", "Precise location detail", "Current condition of those affected"],
    short_summary: text.slice(0, 130) || "Unclassified emergency report",
  };
}
