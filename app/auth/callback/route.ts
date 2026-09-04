import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Email confirmation landing point.
 *
 * When "Confirm email" is enabled in Supabase, the link sent to a new account
 * lands here with a one-time `code`. The PKCE verifier lives in a cookie
 * written by the browser client, so the exchange has to happen server-side —
 * that is what turns the code into a session cookie the rest of the app
 * (middleware, route handlers, RLS) can read.
 *
 * The signed-in role decides where the user lands, so a citizen is never
 * dropped onto a command centre that will refuse them.
 */
function landingFor(role: string | null | undefined) {
  if (role === "coordinator" || role === "admin") return "/command";
  if (role === "responder") return "/responder";
  return "/report";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  // Supabase refused the link (expired, already used, misconfigured).
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(providerError)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Missing+sign-in+code", url.origin));
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`, url.origin),
    );
  }

  // The profile row is created by the handle_new_user trigger. Read it back so
  // the redirect matches the role the user actually has.
  let role: string | null = null;
  try {
    const { data: profile } = await admin()
      .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    role = (profile as { role: string } | null)?.role ?? null;
  } catch {
    /* fall through to the citizen landing page */
  }

  const destination = next && next.startsWith("/") ? next : landingFor(role);
  return NextResponse.redirect(new URL(destination, url.origin));
}
