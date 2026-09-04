"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const DEMO = [
  { label: "Coordinator", email: "coordinator@reliefos.demo", to: "/command" },
  { label: "Responder", email: "responder@reliefos.demo", to: "/responder" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("coordinator@reliefos.demo");
  const [password, setPassword] = useState("reliefos-demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(to: string) {
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push(to);
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="panel p-6 w-full max-w-sm">
        <div className="text-lg font-semibold tracking-tight mb-1">
          RELIEF<span className="text-emerald-400">OS</span>
        </div>
        <p className="text-[12px] text-zinc-500 mb-5">Sign in to the coordination system.</p>

        <label className="label">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full mt-1 mb-3 bg-base-950 border border-white/10 rounded px-2.5 py-2 text-[13px]" />
        <label className="label">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-1 mb-4 bg-base-950 border border-white/10 rounded px-2.5 py-2 text-[13px]" />

        {error && <div className="mb-3 text-[12px] text-red-400">{error}</div>}

        <button className="btn-primary w-full" disabled={busy} onClick={() => signIn("/command")}>
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <div className="mt-5 pt-4 border-t border-white/[0.07]">
          <div className="label mb-2">Demo accounts</div>
          {DEMO.map((d) => (
            <button key={d.email} disabled={busy}
              onClick={() => { setEmail(d.email); setPassword("reliefos-demo"); signIn(d.to); }}
              className="btn-ghost w-full mb-2 text-left">
              {d.label} <span className="text-zinc-500">- {d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
