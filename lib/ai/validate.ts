import type { z } from "zod";

export type ValidationOutcome<T> =
  | { status: "valid"; data: T; issues: string[] }
  | { status: "repaired"; data: T; issues: string[] }
  | { status: "rejected"; data: null; issues: string[] };

/**
 * Gate 2 of the validation ladder: pull the first balanced JSON object out of a
 * completion, tolerating markdown fences and stray prose without ever executing
 * or trusting the text.
 */
export function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();

  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Gates 3 and 4: schema validation, then a coercion pass for the small set of
 * mistakes that are worth repairing locally instead of spending another model
 * call on (a number sent as a string, an out-of-range float, an unknown enum
 * member in an array). Anything else is rejected outright.
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  coerce?: (v: any) => any,
): ValidationOutcome<T> {
  const direct = schema.safeParse(value);
  if (direct.success) return { status: "valid", data: direct.data, issues: [] };

  const issues = direct.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  if (!coerce || value === null || typeof value !== "object") {
    return { status: "rejected", data: null, issues };
  }

  const repaired = schema.safeParse(coerce({ ...(value as object) }));
  if (repaired.success) return { status: "repaired", data: repaired.data, issues };
  return {
    status: "rejected",
    data: null,
    issues: [...issues, ...repaired.error.issues.map((i) => `after-repair ${i.path.join(".")}: ${i.message}`)],
  };
}

export const num = (v: unknown, fallback: number) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const keepKnown = (v: unknown, allowed: readonly string[]) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && allowed.includes(x)) : [];
