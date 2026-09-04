"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Me { id: string; email: string | null; role: string; display_name: string }

/**
 * Shows who is signed in and lets them leave. Without this the only way to switch
 * between the coordinator and responder accounts was to clear cookies by hand.
 */
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
    try { await supabaseBrowser().auth.signOut(); } catch { /* cookie is cleared below anyway */ }
    router.push("/login");
    router.refresh();
  }

  if (!loaded) return null;

  if (!me) {
    return <Link href="/login" className="btn-ghost !py-1 text-[11.5px]">Sign in</Link>;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight hidden sm:block">
        <div className="text-[11.5px] text-zinc-300">{me.display_name}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{me.role}</div>
      </div>
      <button onClick={signOut} disabled={busy}
        className="btn-ghost !py-1 text-[11.5px]" title={me.email ?? undefined}>
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
