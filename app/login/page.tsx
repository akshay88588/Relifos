"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Spinner, WarnIcon } from "@/components/ui/bits";

const DEMO = [
  { label: "Coordinator", email: "coordinator@reliefos.com", to: "/command", note: "Approve dispatches, run Chaos Mode" },
  { label: "Responder", email: "responder@reliefos.com", to: "/responder", note: "Accept assignments, change status" },
];

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("coordinator@reliefos.com");
  const [password, setPassword] = useState("reliefos-demo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(null);

  /** Email + password sign-in. Also used by the demo quick-fill buttons. */
  async function signIn(to: string, withEmail = email, withPassword = password) {
    setBusy(to); setError(null); setNotice(null);
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({
      email: withEmail, password: withPassword,
    });
    if (err) { setError(err.message); setBusy(null); return; }
    router.push(to);
    router.refresh();
  }

  /** Create a new account with email + password. */
  async function signUp() {
    setBusy("signup"); setError(null); setNotice(null);
    const { data, error: err } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(null);
    if (err) { setError(err.message); return; }

    // With "Confirm email" enabled in Supabase, signUp returns a user but no
    // session until the link is clicked. Say so rather than silently doing
    // nothing.
    if (data.user && !data.session) {
      setNotice(`Account created. Check ${email} for a confirmation link, then sign in.`);
      setMode("signin");
      return;
    }
    router.push("/command");
    router.refresh();
  }

  const submitting = busy === "signin" || busy === "signup";

  return (
    <main id="main" className="min-h-[100dvh] grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight block mb-1">
          RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
        </Link>
        <h1 className="text-[15px] font-semibold text-ink-primary">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h1>
        <p className="text-[12px] text-ink-tertiary mb-5 mt-0.5">
          {mode === "signin"
            ? "Sign in to the coordination system."
            : "New accounts can run the command centre in this demo environment."}
        </p>

        <div className="panel p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "signin") signIn("/command"); else signUp();
            }}
          >
            <label className="label block mb-1" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} className="field mb-3" />

            <label className="label block mb-1" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} className="field mb-1" />
            {mode === "signup" ? (
              <p className="text-[10.5px] text-ink-faint mb-3">At least 6 characters.</p>
            ) : (
              <div className="mb-3" />
            )}

            {error && (
              <p className="mb-3 text-[12px] flex items-start gap-1.5" role="alert" style={{ color: "var(--danger)" }}>
                <span className="mt-px shrink-0"><WarnIcon /></span>{error}
              </p>
            )}
            {notice && (
              <p className="mb-3 text-[12px]" role="status" style={{ color: "var(--accent-hover)" }}>
                {notice}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={!!busy}>
              {submitting
                ? <><Spinner /> {mode === "signin" ? "Signing in…" : "Creating account…"}</>
                : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-[12px] text-ink-tertiary mt-3 text-center">
            {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="underline"
              style={{ color: "var(--accent-hover)" }}
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null); setNotice(null);
                if (mode === "signin") { setEmail(""); setPassword(""); }
              }}
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>

        <div className="mt-5 panel p-4">
          <h2 className="label mb-2">Demo accounts</h2>
          <p className="text-[11.5px] text-ink-faint mb-2.5 leading-relaxed">
            Fictional operator identities for the demonstration environment.
          </p>
          {DEMO.map((d) => (
            <button
              key={d.email}
              disabled={!!busy}
              onClick={() => {
                setMode("signin");
                setEmail(d.email); setPassword("reliefos-demo");
                signIn(d.to, d.email, "reliefos-demo");
              }}
              className="btn-ghost w-full mb-2 !justify-start text-left !py-2"
            >
              <span className="flex flex-col items-start gap-0.5 min-w-0">
                <span className="text-ink-primary text-[13px]">
                  {busy === d.to ? "Signing in…" : d.label}
                </span>
                <span className="text-[10.5px] text-ink-faint truncate">{d.note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
