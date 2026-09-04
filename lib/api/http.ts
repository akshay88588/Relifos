import { NextResponse } from "next/server";
import { z } from "zod";

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S) {
  type T = z.infer<S>;
  let raw: unknown;
  try { raw = await req.json(); } catch { return { data: null, error: fail("bad_json", "Body must be JSON") }; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, error: fail("validation_failed", "Invalid request body", 422,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)) };
  }
  return { data: parsed.data as T, error: null };
}

/**
 * Token bucket per IP for the public reporting endpoint.
 * LIMITATION: in-memory, so it is per serverless instance rather than global.
 * Stated in the README rather than papered over.
 */
const buckets = new Map<string, { tokens: number; last: number }>();
export function rateLimit(key: string, perMinute = 10) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, last: now };
  const refill = ((now - b.last) / 60000) * perMinute;
  b.tokens = Math.min(perMinute, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown";
}

export function guardConfigured() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail("not_configured",
      "Supabase is not configured. Copy .env.example to .env.local and fill in the keys.", 503);
  }
  return null;
}
