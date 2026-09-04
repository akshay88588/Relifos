import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export type AppRole = "citizen" | "coordinator" | "responder" | "admin";

export interface AppUser {
  id: string;
  email: string | null;
  role: AppRole;
  display_name: string;
  responder_id: string | null;
}

/**
 * Identity resolution. Browser sessions arrive as Supabase cookies; scripted
 * clients (our verification script, and anything else that talks to the API
 * directly) may send an Authorization: Bearer <access_token> header instead.
 * Both are verified against Supabase Auth - neither is trusted on its word.
 */
async function authUser() {
  const h = await headers();
  const bearer = h.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await anon.auth.getUser(token);
    if (data.user) return data.user;
  }
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function currentUser(): Promise<AppUser | null> {
  try {
    const user = await authUser();
    if (!user) return null;
    const { data: profile } = await admin()
      .from("profiles")
      .select("role, display_name, responder_id")
      .eq("id", user.id)
      .maybeSingle();
    return {
      id: user.id,
      email: user.email ?? null,
      role: (profile?.role as AppRole) ?? "citizen",
      display_name: profile?.display_name ?? user.email?.split("@")[0] ?? "User",
      responder_id: profile?.responder_id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side authorization. Hiding a button is not access control; every
 * protected route handler calls this before it touches a service.
 */
export async function requireRole(roles: AppRole[]) {
  const user = await currentUser();
  if (!user) {
    return { user: null, deny: NextResponse.json(
      { error: { code: "unauthenticated", message: "Sign in required" } }, { status: 401 }) };
  }
  if (!roles.includes(user.role) && user.role !== "admin") {
    return { user, deny: NextResponse.json(
      { error: { code: "forbidden", message: `Requires role: ${roles.join(" or ")}` } }, { status: 403 }) };
  }
  return { user, deny: null as NextResponse | null };
}
