import type { Factor } from "@/lib/clientTypes";

/** Stable colour per priority term, keyed off the label the engine writes. */
const TERM: [RegExp, string, string][] = [
  [/^severity/i,      "severity",      "#ff4d4f"],
  [/life risk/i,      "life risk",     "#ff7849"],
  [/vulnerable/i,     "vulnerability", "#ff9138"],
  [/people|person/i,  "people",        "#f0c44c"],
  [/urgency/i,        "urgency",       "#a3d94c"],
  [/waiting/i,        "waiting",       "#34d399"],
  [/scarce/i,         "scarcity",      "#60a5fa"],
];
const term = (label: string) => TERM.find(([re]) => re.test(label));

/**
 * "Why this priority" at a glance, without selecting the incident. One row, no
 * legend: each segment is a term the engine actually scored, widths in
 * proportion to their contributions, and the confidence penalty hatched on the
 * end as a distinct negative segment. Values come from decision_factors; the
 * component never recomputes them. The full named breakdown stays in the panel.
 */
export function PriorityBar({ factors }: { factors?: Factor[] }) {
  if (!factors?.length) return null;
  const parts = factors
    .map((f) => ({ f, t: term(f.label), v: Math.abs(Number(f.contribution)) }))
    .filter((p) => p.v > 0);
  const total = parts.reduce((n, p) => n + p.v, 0);
  if (!total) return null;

  return (
    <div className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full"
         style={{ background: "var(--surface-active)" }}
         role="img"
         aria-label={`Priority contributions: ${parts.map((p) => `${p.t?.[1] ?? p.f.label} ${p.f.contribution > 0 ? "+" : ""}${Number(p.f.contribution).toFixed(1)}`).join(", ")}`}>
      {parts.map((p, n) => {
        const negative = p.f.direction === "negative" || Number(p.f.contribution) < 0;
        return (
          <span key={n} style={{
            width: `${(p.v / total) * 100}%`,
            background: negative
              ? "repeating-linear-gradient(135deg, var(--warn) 0 2px, transparent 2px 4px)"
              : p.t?.[2] ?? "var(--text-faint)",
          }} />
        );
      })}
    </div>
  );
}
