"use client";
import clsx from "clsx";

export function BandChip({ band, score }: { band: string; score?: number }) {
  return (
    <span className={clsx("chip", `bg-band-${band}`, band === "MEDIUM" ? "text-black" : "text-white")}>
      {band}{score != null ? ` ${Math.round(score)}` : ""}
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  available: "bg-emerald-500", en_route: "bg-blue-400", on_scene: "bg-violet-400",
  busy: "bg-amber-500", offline: "bg-zinc-600",
};

export function StatusDot({ status }: { status: string }) {
  return <span className={clsx("inline-block w-1.5 h-1.5 rounded-full", STATUS_COLOR[status] ?? "bg-zinc-600")} />;
}

export function Bar({ value, max, tone = "emerald" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : `bg-${tone}-500`;
  return (
    <div className="h-1 w-full bg-white/10 rounded overflow-hidden">
      <div className={clsx("h-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

export function FactorRow({ f }: { f: { label: string; detail?: string | null; contribution: number; direction: string } }) {
  const negative = f.direction === "negative" || f.contribution < 0;
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0">
        <div className="text-[12.5px] text-zinc-200 flex items-center gap-1.5">
          <span className={negative ? "text-amber-400" : "text-emerald-400"}>{negative ? "−" : "✓"}</span>
          {f.label}
        </div>
        {f.detail && <div className="text-[11px] text-zinc-500 pl-4">{f.detail}</div>}
      </div>
      <div className={clsx("text-[12px] font-mono shrink-0", negative ? "text-amber-400" : "text-emerald-400")}>
        {f.contribution > 0 ? "+" : ""}{Number(f.contribution).toFixed(1)}
      </div>
    </div>
  );
}
