import { PROMPT_VERSION, RESPONSE_PLANNER_SYSTEM, responsePlannerUser } from "@/lib/ai/prompts";
import { getProvider } from "@/lib/ai/provider";
import { responsePlanSchema, type ResponsePlanOut } from "@/lib/ai/schemas";
import { extractJson, validateWithSchema } from "@/lib/ai/validate";
import type { ScoredCandidate } from "@/lib/domain/types";
import type { AgentResult, AiDecisionRecord } from "./incidentIntelligence";

/**
 * AGENT 2 - RESPONSE PLANNER.
 *
 * Given the top candidates the deterministic engine already scored, the model
 * chooses one and justifies it in operational language.
 *
 * GUARD RAIL: if it names a responder that is not on the shortlist, the output
 * is rejected and the deterministic rank-1 candidate stands. The model can
 * reorder within a shortlist it was handed; it can never conjure a responder,
 * and it can never reduce the human-approval requirement.
 */
export async function planResponse(args: {
  incident: { code: string; hazard_type: string; severity: string; priority_score: number;
              priority_band: string; people_affected: number; vulnerability_flags: string[];
              required_capabilities: string[]; short_summary: string };
  candidates: ScoredCandidate[];
}): Promise<AgentResult<ResponsePlanOut>> {
  const eligible = args.candidates.filter((c) => c.eligible).slice(0, 3);
  const deterministicTop = eligible[0];

  const fallbackPlan: ResponsePlanOut = {
    recommended_responder_id: deterministicTop?.responder_id ?? "",
    rationale_bullets: deterministicTop
      ? [
          `Highest match score (${deterministicTop.score}) of ${eligible.length} eligible units`,
          `${deterministicTop.distance_km} km away, est. ${Math.round(deterministicTop.eta_minutes)} min response`,
          `Capabilities cover ${args.incident.required_capabilities.join(", ")}`,
        ]
      : ["No eligible responder available"],
    risk_notes: [],
    requires_human_approval: true,
  };

  const provider = getProvider();
  if (!provider || !deterministicTop) {
    return {
      data: fallbackPlan,
      degraded: true,
      decision: baseDecision({
        provider: provider?.name ?? "none",
        model: "none",
        input: args.incident.code,
        output: fallbackPlan,
        status: "rejected",
        fallback: true,
        error: provider ? "No eligible candidates to plan over" : "FEATHERLESS_API_KEY not configured",
      }),
    };
  }

  try {
    const payload = {
      incident: args.incident,
      candidates: eligible.map((c) => ({
        id: c.responder_id, name: c.name, type: c.type, match_score: c.score,
        distance_km: c.distance_km, eta_minutes: Math.round(c.eta_minutes),
        would_preempt_another_incident: Boolean(c.preemption_of),
      })),
    };

    const completion = await provider.complete({
      system: RESPONSE_PLANNER_SYSTEM,
      user: responsePlannerUser(payload),
      maxTokens: 350,
      temperature: 0.2,
    });

    const outcome = validateWithSchema(responsePlanSchema, extractJson(completion.text));
    const allowed = new Set(eligible.map((c) => c.responder_id));

    if (outcome.status === "rejected" || !allowed.has(outcome.data.recommended_responder_id)) {
      return {
        data: fallbackPlan,
        degraded: true,
        decision: baseDecision({
          provider: provider.name,
          model: completion.model,
          input: args.incident.code,
          output: fallbackPlan,
          status: "rejected",
          fallback: true,
          raw: completion.text,
          latency: completion.latencyMs,
          error: outcome.status === "rejected"
            ? outcome.issues.slice(0, 3).join("; ")
            : "Model named a responder outside the supplied shortlist",
        }),
      };
    }

    // The model may never weaken the approval requirement.
    const plan: ResponsePlanOut = {
      ...outcome.data,
      risk_notes: outcome.data.risk_notes ?? [],
      requires_human_approval:
        outcome.data.requires_human_approval ||
        args.incident.priority_band === "CRITICAL" ||
        args.incident.priority_band === "HIGH",
    };

    return {
      data: plan,
      degraded: false,
      decision: baseDecision({
        provider: provider.name,
        model: completion.model,
        input: args.incident.code,
        output: plan,
        status: outcome.status,
        fallback: false,
        raw: completion.text,
        latency: completion.latencyMs,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
      }),
    };
  } catch (err: any) {
    return {
      data: fallbackPlan,
      degraded: true,
      decision: baseDecision({
        provider: provider.name, model: "unknown", input: args.incident.code,
        output: fallbackPlan, status: "rejected", fallback: true,
        error: err?.message ?? String(err),
      }),
    };
  }
}

function baseDecision(a: {
  provider: string; model: string; input: string; output: unknown;
  status: "valid" | "repaired" | "rejected"; fallback: boolean;
  raw?: string; latency?: number; promptTokens?: number; completionTokens?: number; error?: string;
}): AiDecisionRecord {
  return {
    agent: "response_planner",
    provider: a.provider,
    model: a.model,
    prompt_version: PROMPT_VERSION,
    input_summary: a.input,
    structured_output: a.output,
    raw_output: a.raw ? a.raw.slice(0, 4000) : null,
    confidence: null,
    latency_ms: a.latency ?? null,
    prompt_tokens: a.promptTokens ?? null,
    completion_tokens: a.completionTokens ?? null,
    validation_status: a.status,
    fallback_used: a.fallback,
    error_text: a.error ? a.error.slice(0, 500) : null,
  };
}
