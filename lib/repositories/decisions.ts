import { admin } from "@/lib/supabase/admin";
import type { AiDecisionRecord } from "@/lib/agents/incidentIntelligence";
import type { DecisionFactor } from "@/lib/domain/types";

/** Persist the verifiable AI record. Every model call lands here, valid or not. */
export async function recordAiDecision(incidentId: string | null, rec: AiDecisionRecord) {
  const { data, error } = await admin().from("ai_decisions").insert({
    incident_id: incidentId,
    agent: rec.agent, provider: rec.provider, model: rec.model,
    prompt_version: rec.prompt_version, input_summary: rec.input_summary,
    structured_output: rec.structured_output as any, raw_output: rec.raw_output,
    confidence: rec.confidence, latency_ms: rec.latency_ms,
    prompt_tokens: rec.prompt_tokens, completion_tokens: rec.completion_tokens,
    validation_status: rec.validation_status, fallback_used: rec.fallback_used,
    error_text: rec.error_text,
  }).select("id").single();
  if (error) {
    console.error("[ai] failed to record decision", error.message);
    return null;
  }
  return data.id as string;
}

export async function replaceFactors(args: {
  subject_type: "priority" | "match";
  subject_id: string;
  incident_id: string;
  factors: DecisionFactor[];
}) {
  await admin().from("decision_factors")
    .delete().eq("subject_type", args.subject_type).eq("subject_id", args.subject_id);
  if (!args.factors.length) return;
  const { error } = await admin().from("decision_factors").insert(
    args.factors.map((f) => ({
      subject_type: args.subject_type, subject_id: args.subject_id,
      incident_id: args.incident_id, label: f.label, detail: f.detail ?? null,
      contribution: f.contribution, direction: f.direction,
    })),
  );
  if (error) console.error("[factors] insert failed", error.message);
}

export async function listFactors(subjectType: "priority" | "match", subjectId: string) {
  const { data } = await admin().from("decision_factors")
    .select("label, detail, contribution, direction")
    .eq("subject_type", subjectType).eq("subject_id", subjectId)
    .order("contribution", { ascending: false });
  return data ?? [];
}

/**
 * Priority factors for many incidents at once, so the queue can show WHY each
 * card scored what it did without a round trip per card. Read back from
 * decision_factors - the same rows the detail panel shows - so the bar and the
 * breakdown can never disagree.
 */
export async function priorityFactorsFor(incidentIds: string[]) {
  if (!incidentIds.length) return {} as Record<string, DecisionFactor[]>;
  const { data, error } = await admin().from("decision_factors")
    .select("subject_id, label, detail, contribution, direction")
    .eq("subject_type", "priority")
    .in("subject_id", incidentIds)
    .order("contribution", { ascending: false });
  if (error) {
    console.error("[factors] priorityFactorsFor", error.message);
    return {} as Record<string, DecisionFactor[]>;
  }
  const out: Record<string, DecisionFactor[]> = {};
  for (const row of (data ?? []) as any[]) {
    (out[row.subject_id] ??= []).push({
      label: row.label, detail: row.detail,
      contribution: Number(row.contribution), direction: row.direction,
    });
  }
  return out;
}

export async function listAiDecisions(incidentId: string) {
  const { data } = await admin().from("ai_decisions")
    .select("id, agent, provider, model, validation_status, fallback_used, confidence, latency_ms, structured_output, error_text, created_at")
    .eq("incident_id", incidentId).order("created_at", { ascending: false });
  return data ?? [];
}
