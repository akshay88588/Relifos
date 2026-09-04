import Link from "next/link";

const PILLARS = [
  { k: "AI-Powered", v: "Featherless models extract structure; deterministic engines decide" },
  { k: "Real-Time", v: "Every state change is a database event the UI subscribes to" },
  { k: "Explainable", v: "Each decision stores the factors that produced it" },
  { k: "Human-in-the-Loop", v: "AI recommends. A coordinator commits." },
];

export default function Landing() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold tracking-tight">RELIEF<span className="text-emerald-400">OS</span></span>
          <span className="label">Emergency Coordination OS</span>
        </div>
        <Link href="/login" className="btn-ghost">Sign in</Link>
      </header>

      <section className="flex-1 px-6 py-16 max-w-5xl mx-auto w-full">
        <p className="label mb-4">Real-time AI emergency coordination</p>
        <h1 className="text-4xl md:text-5xl font-semibold leading-[1.1] tracking-tight max-w-3xl">
          When every second matters, coordination becomes the emergency.
        </h1>
        <p className="mt-5 text-zinc-400 max-w-2xl leading-relaxed">
          During a disaster the hard problem is not collecting reports. It is deciding what should
          happen next, with incomplete information that keeps changing. ReliefOS turns fragmented
          emergency reports into prioritized, explainable and coordinated response actions.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/command" className="btn-primary px-5 py-2.5">Enter command center</Link>
          <Link href="/report" className="btn-ghost px-5 py-2.5">Report an emergency</Link>
          <Link href="/responder" className="btn-ghost px-5 py-2.5">Responder console</Link>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PILLARS.map((p) => (
            <div key={p.k} className="panel p-4">
              <div className="text-sm font-medium text-zinc-100">{p.k}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{p.v}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 panel p-4 text-[12px] text-zinc-500 leading-relaxed">
          <span className="text-amber-400/90 font-medium">Demonstration system.</span>{" "}
          ReliefOS runs in a controlled simulation environment with clearly labelled demo
          responders and shelters. It is not connected to any live emergency service, does not use
          live hazard feeds, and estimates travel times in a straight line rather than by routing.
          It is a hackathon prototype, not production emergency infrastructure.
        </div>
      </section>
    </main>
  );
}
