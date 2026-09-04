"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Spinner, WarnIcon } from "@/components/ui/bits";

const DEMO = [
  { label: "Coordinator", email: "coordinator@reliefos.com", to: "/command", note: "Approve dispatches, run Chaos Mode" },
  { label: "Responder", email: "responder@reliefos.com", to: "/responder", note: "Accept assignments, change status" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("coordinator@reliefos.com");
  const [password, setPassword] = useState("reliefos-demo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(to: string, withEmail = email, withPassword = password) {
    setBusy(to); setError(null);
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({
      email: withEmail, password: withPassword,
    });
    if (err) { setError(err.message); setBusy(null); return; }
    router.push(to);
    router.refresh();
  }

  return (
    <main id="main" className="min-h-[100dvh] grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-lg font-semibold tracking-tight block mb-1">
          RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
        </Link>
        <h1 className="text-[15px] font-semibold text-ink-primary">Sign in</h1>
        <p className="text-[12px] text-ink-tertiary mb-5 mt-0.5">Sign in to the coordination system.</p>

        <form
          className="panel p-5"
          onSubmit={(e) => { e.preventDefault(); signIn("/command"); }}
        >
          <label className="label block mb-1" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} className="field mb-3" />

          <label className="label block mb-1" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} className="field mb-4" />

          {error && (
            <p className="mb-3 text-[12px] flex items-start gap-1.5" role="alert" style={{ color: "var(--danger)" }}>
              <span className="mt-px shrink-0"><WarnIcon /></span>{error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={!!busy}>
            {busy === "/command" ? <><Spinner /> Signing in…</> : "Sign in"}
          </button>
        </form>

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
