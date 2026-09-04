import { z } from "zod";
import { CAPABILITIES, HAZARD_TYPES, VULNERABILITY_FLAGS } from "@/lib/domain/types";

/**
 * Strict schemas for every AI stage. Model output that does not satisfy these
 * never reaches a repository. This is gate 3 of the validation ladder.
 */

export const incidentIntelligenceSchema = z.object({
  hazard_type: z.enum(HAZARD_TYPES),
  severity: z.enum(["critical", "high", "medium", "low"]),
  people_affected: z.number().int().min(0).max(500),
  vulnerability_flags: z.array(z.enum(VULNERABILITY_FLAGS)).max(9),
  life_risk: z.boolean(),
  required_capabilities: z.array(z.enum(CAPABILITIES)).min(1).max(6),
  urgency: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  missing_information: z.array(z.string().max(120)).max(5),
  short_summary: z.string().min(3).max(180),
});

export type IncidentIntelligenceOut = z.infer<typeof incidentIntelligenceSchema>;

export const responsePlanSchema = z.object({
  recommended_responder_id: z.string().min(1),
  rationale_bullets: z.array(z.string().max(140)).min(1).max(3),
  risk_notes: z.array(z.string().max(140)).max(3).default([]),
  requires_human_approval: z.boolean(),
});

export type ResponsePlanOut = z.infer<typeof responsePlanSchema>;

/** JSON Schema handed to the model inside the prompt so it knows the exact contract. */
export const INCIDENT_INTELLIGENCE_CONTRACT = {
  hazard_type: HAZARD_TYPES,
  severity: ["critical", "high", "medium", "low"],
  people_affected: "integer 0-500",
  vulnerability_flags: VULNERABILITY_FLAGS,
  life_risk: "boolean - true only if people are likely to die without intervention",
  required_capabilities: CAPABILITIES,
  urgency: "number 0-1",
  confidence: "number 0-1 - your own certainty in this assessment",
  missing_information: "array of short questions whose answers would change the assessment",
  short_summary: "<=140 chars, control-room phrasing, no speculation",
};
