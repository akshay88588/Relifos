import { deterministicAssessment } from "@/lib/ai/fallback";
import { INCIDENT_INTELLIGENCE_SYSTEM, PROMPT_VERSION, incidentIntelligenceUser } from "@/lib/ai/prompts";
import { getProvider } from "@/lib/ai/provider";
import { incidentIntelligenceSchema, type IncidentIntelligenceOut } from "@/lib/ai/schemas";
import { CAPABILITIES, VULNERABILITY_FLAGS, HAZARD_TYPES } from "@/lib/domain/types";
import { clamp, extractJson, keepKnown, num, validateWithSchema } from "@/lib/ai/validate";

export interface AiDecisionRecord {
  agent: "incident_intelligence" | "response_planner" | "ops_summarizer";
  provider: string;
  model: string;
  prompt_version: string;
  input_summary: string;
  structured_output: unknown;
  raw_output: string | null;
  confidence: number | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  validation_status: "valid" | "repaired" | "rejected";
  fallback_used: boolean;
  error_text: string | null;
}

export interface AgentResult<T> {
  data: T;
  decision: AiDecisionRecord;
  degraded: boolean;
}

/** Local coercion for the small mistakes worth repairing without another model call. */
function coerceIntelligence(v: any) {
  return {
    ...v,
    hazard_type: HAZARD_TYPES.includes(v.hazard_type) ? v.hazard_type : "other",
    severity: ["critical", "high", "medium", "low"].includes(v.severity) ? v.severity : "medium",
    people_affected: Math.round(clamp(num(v.people_affected, 1), 0, 500)),
    vulnerability_flags: keepKnown(v.vulnerability_flags, VULNERABILITY_FLAGS),
    life_risk: Boolean(v.life_risk),
    required_capabilities: (() => {
      const k = keepKnown(v.required_capabilities, CAPABILITIES);
      return k.length ? k.slice(0, 6) : ["evacuation"];
    })(),
    urgency: clamp(num(v.urgency, 0.5), 0, 1),
    confidence: clamp(num(v.confidence, 0.5), 0, 1),
    missing_information: Array.isArray(v.missing_information)
      ? v.missing_information.filter((x: unknown) => typeof x === "string").slice(0, 5)
      : [],
    short_summary: typeof v.short_summary === "string" && v.short_summary.trim()
      ? v.short_summary.slice(0, 180)
      : "Emergency report received",
  };
}

/**
 * AGENT 1 - INCIDENT INTELLIGENCE.
 *
 * Turns a free-text or transcribed emergency report into structured operational
 * data. Every field it returns is consumed by the priority engine or the
 * matching engine - this agent is the reason the rest of the system knows
 * anything at all about what is happening.
 */
export async function assessIncident(
  report: string,
  locationHint?: string | null,
): Promise<AgentResult<IncidentIntelligenceOut>> {
  const inputSummary = report.slice(0, 200);
  const provider = getProvider();

  if (!provider) {
    return degradedResult(report, inputSummary, "FEATHERLESS_API_KEY not configured", "none", "none");
  }

  let raw = "";
  let model = "unknown";
  let latency: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  try {
    const completion = await provider.complete({
      system: INCIDENT_INTELLIGENCE_SYSTEM,
      user: incidentIntelligenceUser(report, locationHint),
      maxTokens: 320,
      temperature: 0.1,
    });
    raw = completion.text;
    model = completion.model;
    latency = completion.latencyMs;
    promptTokens = completion.promptTokens ?? null;
    completionTokens = completion.completionTokens ?? null;

    let outcome = validateWithSchema(incidentIntelligenceSchema, extractJson(raw), coerceIntelligence);

    // One repair attempt: hand the model its own output plus the exact errors.
    if (outcome.status === "rejected") {
      const repair = await provider.complete({
        system: INCIDENT_INTELLIGENCE_SYSTEM,
        user: `Your previous output was invalid.

PREVIOUS OUTPUT:
${raw.slice(0, 1200)}

VALIDATION ERRORS:
${outcome.issues.join("\n")}

Return ONLY the corrected JSON object.`,
        maxTokens: 320,
        temperature: 0,
      });
      raw = repair.text;
      latency = (latency ?? 0) + repair.latencyMs;
      const second = validateWithSchema(incidentIntelligenceSchema, extractJson(raw), coerceIntelligence);
      outcome = second.status === "valid" ? { ...second, status: "repaired" } : second;
    }

    if (outcome.status === "rejected") {
      return degradedResult(
        report, inputSummary,
        `AI output rejected after repair: ${outcome.issues.slice(0, 3).join("; ")}`,
        provider.name, model, raw, latency,
      );
    }

    return {
      data: outcome.data,
      degraded: false,
      decision: {
        agent: "incident_intelligence",
        provider: provider.name,
        model,
        prompt_version: PROMPT_VERSION,
        input_summary: inputSummary,
        structured_output: outcome.data,
        raw_output: raw.slice(0, 4000),
        confidence: outcome.data.confidence,
        latency_ms: latency,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        validation_status: outcome.status,
        fallback_used: false,
        error_text: outcome.issues.length ? outcome.issues.slice(0, 3).join("; ") : null,
      },
    };
  } catch (err: any) {
    return degradedResult(
      report, inputSummary, err?.message ?? String(err),
      provider.name, model, raw, latency,
    );
  }
}

function degradedResult(
  report: string,
  inputSummary: string,
  error: string,
  provider: string,
  model: string,
  raw: string | null = null,
  latency: number | null = null,
): AgentResult<IncidentIntelligenceOut> {
  const data = deterministicAssessment(report);
  return {
    data,
    degraded: true,
    decision: {
      agent: "incident_intelligence",
      provider,
      model,
      prompt_version: PROMPT_VERSION,
      input_summary: inputSummary,
      structured_output: data,
      raw_output: raw ? raw.slice(0, 4000) : null,
      confidence: data.confidence,
      latency_ms: latency,
      prompt_tokens: null,
      completion_tokens: null,
      validation_status: "rejected",
      fallback_used: true,
      error_text: error.slice(0, 500),
    },
  };
}
