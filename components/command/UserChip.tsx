"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Me { id: string; email: string | null; role: string; display_name: string }

/** Shows who is signed in, with their role, and lets them leave. */
export function UserChip() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) { setMe(d.user); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  async function signOut() {
    setBusy(true);
    try { await supabaseBrowser().auth.signOut(); } catch { /* cookie is cleared by the redirect anyway */ }
    router.push("/login");
    router.refresh();
  }

  if (!loaded) return <div className="skeleton h-6 w-20 rounded" aria-hidden="true" />;

  if (!me) return <Link href="/login" className="btn-ghost btn-sm">Sign in</Link>;

  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight hidden sm:block">
        <div className="text-[11.5px] text-ink-secondary truncate max-w-[130px]">{me.display_name}</div>
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">{me.role}</div>
      </div>
      <button onClick={signOut} disabled={busy} className="btn-ghost btn-sm" title={me.email ?? undefined}>
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
