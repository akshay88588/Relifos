import Link from "next/link";

const PILLARS = [
  { k: "AI-powered", v: "Featherless models extract structure; deterministic engines make the decision." },
  { k: "Real-time", v: "Every state change is a database event the console subscribes to." },
  { k: "Explainable", v: "Each decision stores the exact factors that produced it." },
  { k: "Human-in-the-loop", v: "AI recommends. A coordinator commits. Nothing dispatches itself." },
];

const FLOW = ["Report", "Understand", "Prioritize", "Match", "Approve", "Dispatch", "Replan"];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to main content</a>

      <header className="px-5 sm:px-6 py-4 flex items-center justify-between gap-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-lg font-semibold tracking-tight">
            RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
          </span>
          <span className="label hidden sm:inline">Emergency coordination OS</span>
        </div>
        <Link href="/login" className="btn-ghost">Sign in</Link>
      </header>

      <main id="main" className="flex-1 px-5 sm:px-6 py-12 sm:py-16 max-w-5xl mx-auto w-full">
        <p className="label mb-4">Real-time AI emergency coordination</p>
        <h1 className="text-[2rem] leading-[1.12] sm:text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
          When every second matters, coordination becomes the emergency.
        </h1>
        <p className="mt-5 text-ink-secondary max-w-2xl leading-relaxed text-[15px]">
          During a disaster the hard problem is not collecting reports. It is deciding what should happen
          next, with incomplete information that keeps changing. ReliefOS turns fragmented emergency
          reports into prioritized, explainable and coordinated response actions — and keeps re-deciding
          as conditions change.
        </p>

        <nav aria-label="Primary" className="mt-8 flex flex-wrap gap-3">
          <Link href="/command" className="btn-primary !px-5 !py-2.5">Enter command centre</Link>
          <Link href="/report" className="btn-ghost !px-5 !py-2.5">Report an emergency</Link>
          <Link href="/responder" className="btn-ghost !px-5 !py-2.5">Responder console</Link>
        </nav>

        <section aria-label="Decision pipeline" className="mt-12">
          <h2 className="label mb-3">The pipeline</h2>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {FLOW.map((s, n) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="panel px-2.5 py-1 text-[12px] text-ink-secondary">{s}</span>
                {n < FLOW.length - 1 && <span className="text-ink-faint" aria-hidden="true">→</span>}
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="What makes it work" className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PILLARS.map((p) => (
            <div key={p.k} className="panel p-4">
              <h3 className="text-[13px] font-semibold text-ink-primary">{p.k}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-tertiary">{p.v}</p>
            </div>
          ))}
        </section>

        <aside className="mt-10 panel p-4 text-[12px] text-ink-tertiary leading-relaxed"
               style={{ borderColor: "var(--p-medium-bd)" }}>
          <strong style={{ color: "var(--p-medium)" }} className="font-semibold">Demonstration system.</strong>{" "}
          ReliefOS runs in a controlled environment with clearly labelled demo responders and shelters. It
          is not connected to any live emergency service, does not use live hazard feeds, and estimates
          travel times in a straight line rather than by routing. It is a hackathon prototype, not
          production emergency infrastructure.
        </aside>
      </main>
    </div>
  );
}
