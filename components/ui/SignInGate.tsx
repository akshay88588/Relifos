"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SKIP_KEY = "reliefos:skip-signin";

/** sessionStorage throws in some privacy modes; a gate must never break the page. */
const readSkip = () => {
  try { return sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
};
const writeSkip = () => {
  try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* the choice just won't persist */ }
};

/**
 * THE SIGN-IN GATE.
 *
 * A signed-out coordinator used to get a red error strip and an empty console,
 * which reads like a broken page rather than a missing session. Instead: a
 * modal that says what signing in buys, with an explicit way past it — because
 * a judge or a passer-by should be able to look around without an account.
 *
 * Skipping is honest about what it leaves you with. The console stays on screen
 * with whatever the API returns anonymously, and a permanent read-only bar
 * replaces the modal so the state is never ambiguous. The choice lasts for the
 * tab, not forever: a new tab asks again.
 */
export function SignInGate({ next, blurb }: { next: string; blurb: string }) {
  const [skipped, setSkipped] = useState(true); // assume skipped until mounted, so nothing flashes
  const [ready, setReady] = useState(false);
  const signInRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => { setSkipped(readSkip()); setReady(true); }, []);

  const skip = () => { writeSkip(); setSkipped(true); };

  useEffect(() => {
    if (skipped || !ready) return;
    signInRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipped, ready]);

  if (!ready) return null;

  if (skipped) {
    return (
      <div
        className="px-4 py-1.5 flex items-center justify-between gap-3 shrink-0 text-[12px]"
        role="status"
        style={{
          background: "var(--p-medium-bg)",
          borderBottom: "1px solid var(--p-medium-bd)",
          color: "var(--p-medium)",
        }}
      >
        <span className="min-w-0 truncate">
          Signed out — read-only. Actions are disabled.
        </span>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-ghost btn-sm shrink-0">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-5"
      style={{ background: "rgba(0,0,0,0.66)" }}
      onClick={(e) => { if (e.target === e.currentTarget) skip(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-gate-title"
        className="panel p-5 w-full max-w-sm sheet-up"
      >
        <h2 id="signin-gate-title" className="text-[15px] font-semibold text-ink-primary">
          Sign in to ReliefOS
        </h2>
        <p className="mt-1.5 text-[12.5px] text-ink-tertiary leading-relaxed">{blurb}</p>
        <p className="mt-2 text-[12px] text-ink-faint leading-relaxed">
          You can skip and look around instead. Live state stays visible where it is public, but nothing
          can be approved, dispatched or changed until you sign in.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <Link
            ref={signInRef}
            href={`/login?next=${encodeURIComponent(next)}`}
            className="btn-primary w-full"
          >
            Sign in
          </Link>
          <button type="button" onClick={skip} className="btn-ghost w-full">
            Skip — browse read-only
          </button>
        </div>

        <p className="mt-3 text-[11px] text-ink-faint text-center">
          Demo accounts are listed on the sign-in page.
        </p>
      </div>
    </div>
  );
}
