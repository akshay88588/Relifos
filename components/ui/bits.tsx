"use client";
import clsx from "clsx";
import type { ReactNode } from "react";

/* ============================================================
   DESIGN SYSTEM PRIMITIVES
   Every screen composes from these, so a change here changes the
   whole product rather than one corner of it.
   ============================================================ */

export type Band = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
const BANDS: Band[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const isBand = (v: string): v is Band => (BANDS as string[]).includes(v);

/**
 * Priority is never communicated by colour alone.
 * Each band carries a distinct SHAPE, a text LABEL and a numeric SCORE, so the
 * signal survives greyscale, colour blindness and a screen reader.
 */
const BAND_GLYPH: Record<Band, string> = {
  CRITICAL: "M12 2 L22 20 H2 Z",                  // triangle - most visually urgent
  HIGH: "M12 3 L21 12 L12 21 L3 12 Z",            // diamond
  MEDIUM: "M4 4 H20 V20 H4 Z",                    // square
  LOW: "M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4",  // circle
};

export function BandIcon({ band, size = 10 }: { band: Band; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="shrink-0">
      <path d={BAND_GLYPH[band]} fill="currentColor" />
    </svg>
  );
}

export function PriorityBadge({ band, score, size = "md" }: { band: string; score?: number; size?: "sm" | "md" }) {
  const b: Band = isBand(band) ? band : "LOW";
  const rounded = score != null ? Math.round(score) : null;
  return (
    <span
      className={clsx("chip", `pri-bg-${b}`, size === "sm" && "!text-[9px] !px-1")}
      title={rounded != null ? `Priority ${b}, score ${rounded} of 100` : `Priority ${b}`}
    >
      <BandIcon band={b} size={size === "sm" ? 8 : 9} />
      <span>{b}</span>
      {rounded != null && <span className="opacity-75 tabular-nums">{rounded}</span>}
    </span>
  );
}

/** Status shown as a coloured dot AND its word. The dot alone is never the message. */
const STATUS_VAR: Record<string, string> = {
  available: "var(--st-available)", en_route: "var(--st-enroute)", on_scene: "var(--st-onscene)",
  busy: "var(--st-busy)", offline: "var(--st-offline)",
  dispatched: "var(--st-enroute)", accepted: "var(--st-enroute)",
  completed: "var(--st-available)", declined: "var(--danger)", invalidated: "var(--st-offline)",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx("inline-block w-2 h-2 rounded-full shrink-0", className)}
      style={{ background: STATUS_VAR[status] ?? "var(--st-offline)" }}
    />
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className="chip chip-neutral" title={`Status: ${label}`}>
      <StatusDot status={status} />
      <span>{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------- layout */

export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("panel flex flex-col min-h-0", className)} {...rest}>{children}</div>;
}

export function PanelHead({ title, count, children }: { title: string; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <span>{title}</span>
      <span className="flex items-center gap-2 normal-case tracking-normal">
        {children}
        {count != null && <span className="text-ink-faint font-normal">{count}</span>}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------- async states */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden="true" />;
}

/** Announced politely so a screen reader hears that work is in flight. */
export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="p-3 space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="p-6 text-center flex flex-col items-center gap-2">
      {icon && <div className="text-ink-faint" aria-hidden="true">{icon}</div>}
      <div className="text-[13px] text-ink-secondary font-medium">{title}</div>
      {hint && <p className="text-[12px] text-ink-tertiary max-w-[36ch] leading-relaxed">{hint}</p>}
      {action}
    </div>
  );
}

/** Errors are announced assertively - an operator must not miss one. */
export function ErrorState({ title, detail, onRetry, retrying }: {
  title: string; detail?: string | null; onRetry?: () => void; retrying?: boolean;
}) {
  return (
    <div className="p-4 flex flex-col items-start gap-2" role="alert">
      <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--danger)" }}>
        <WarnIcon /> {title}
      </div>
      {detail && <p className="text-[12px] text-ink-tertiary leading-relaxed break-words">{detail}</p>}
      {onRetry && (
        <button className="btn-ghost btn-sm" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------- data display */

export function Bar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tone = pct >= 100 ? "var(--danger)" : pct >= 85 ? "var(--warn)" : "var(--accent)";
  return (
    <div
      className="h-1.5 w-full rounded-full overflow-hidden"
      style={{ background: "var(--surface-active)" }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Capacity"}
    >
      <div className="h-full rounded-full transition-all duration-500 ease-ops" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function FactorRow({ f }: { f: { label: string; detail?: string | null; contribution: number; direction: string } }) {
  const negative = f.direction === "negative" || f.contribution < 0;
  const tone = negative ? "var(--warn)" : "var(--accent-hover)";
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-primary flex items-start gap-1.5">
          <span aria-hidden="true" style={{ color: tone }} className="mt-px shrink-0">{negative ? "−" : "+"}</span>
          <span className="leading-snug">{f.label}</span>
        </div>
        {f.detail && <div className="text-[11px] text-ink-tertiary pl-4 mt-0.5 leading-snug">{f.detail}</div>}
      </div>
      <div className="text-[12px] mono shrink-0 tabular-nums" style={{ color: tone }}>
        {f.contribution > 0 ? "+" : ""}{Number(f.contribution).toFixed(1)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- time */

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

/* ---------------------------------------------------------- icons
   A single small inline set. No icon-font dependency, no network fetch,
   consistent 24-unit grid and stroke weight throughout.               */

const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export function WarnIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></svg>;
}
export function MapIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3-6-3Z" /><path d="M9 4v13M15 7v13" /></svg>;
}
export function ListIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>;
}
export function ActivityIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>;
}
export function CloseIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
export function ExpandIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M9 3H3v6M15 21h6v-6M3 15v6h6M21 9V3h-6" /></svg>;
}
export function CollapseIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="M3 9h6V3M21 15h-6v6M15 3v6h6M9 21v-6H3" /></svg>;
}
export function MicIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" /></svg>;
}
export function CheckIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" /></svg>;
}
export function TargetIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...ico} aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></svg>;
}
