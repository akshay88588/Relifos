"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function UserNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setEmail(data.user.email ?? null);
        setRole((data.user.user_metadata?.role as string) ?? "staff");
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        setRole((session.user.user_metadata?.role as string) ?? "staff");
      } else {
        setEmail(null);
        setRole(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setBusy(true);
    await supabaseBrowser().auth.signOut();
    setBusy(false);
    router.push("/login");
    router.refresh();
  }

  if (!email) {
    return (
      <Link
        href="/login"
        className="text-[12px] text-zinc-400 hover:text-zinc-200 border border-white/10 rounded px-2.5 py-1 bg-white/[0.03] transition-colors"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <div className="hidden sm:flex items-center gap-1.5 text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        <span className="text-zinc-200 font-medium">{email.split("@")[0]}</span>
        {role && <span className="chip bg-white/5 text-zinc-400 text-[10px]">{role}</span>}
      </div>
      <button
        onClick={handleSignOut}
        disabled={busy}
        className="text-[11px] text-zinc-400 hover:text-zinc-200 border border-white/10 hover:border-white/20 rounded px-2 py-1 bg-white/[0.02] transition-colors"
        title={`Signed in as ${email}`}
      >
        {busy ? "..." : "Sign out"}
      </button>
    </div>
  );
}
