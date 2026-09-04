import { NextResponse } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";

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
 * RATE LIMITING.
 *
 * Backed by a Postgres fixed-window counter (public.consume_rate_limit), so the
 * limit is shared across every server instance rather than being per-process.
 * A same-process memory cache short-circuits obvious floods before they reach
 * the database, and if the database call itself fails we fall back to the
 * in-memory window rather than either blocking or waving everything through.
 */
const memory = new Map<string, { count: number; windowStart: number }>();

function memoryAllows(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    memory.set(key, { count: 1, windowStart: now });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

let sharedCounterWarned = false;

export async function rateLimit(key: string, perMinute = 10): Promise<boolean> {
  // The in-process window runs first so an obvious flood never reaches the DB.
  if (!memoryAllows(key, perMinute, 60_000)) return false;
  try {
    const { data, error } = await admin().rpc("consume_rate_limit", {
      p_key: key, p_limit: perMinute, p_window_seconds: 60,
    });
    if (error) {
      // Fail open, because refusing every emergency report when the limiter is
      // broken is worse than a weaker limit - but say so loudly and exactly
      // once, so a missing migration cannot masquerade as a working limiter.
      if (!sharedCounterWarned) {
        sharedCounterWarned = true;
        console.error(
          "[ratelimit] shared counter unavailable - falling back to a PER-PROCESS window. " +
          "On serverless this means the published limit is not globally enforced. " +
          "Apply supabase/migrations/0006_rate_limit.sql. Cause:", error.message,
        );
      }
      return true;
    }
    return data !== false;
  } catch (err) {
    if (!sharedCounterWarned) {
      sharedCounterWarned = true;
      console.error("[ratelimit] shared counter threw - per-process window only:", err);
    }
    return true;
  }
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
