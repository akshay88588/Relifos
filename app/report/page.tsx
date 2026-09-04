"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocationPicker } from "@/components/map/LocationPicker";

type Stage = "idle" | "listening" | "sending" | "done" | "error";

/**
 * CITIZEN REPORTING - VOICE FIRST.
 *
 * Speech is transcribed in the browser with the Web Speech API and then posted
 * to exactly the same endpoint the text box uses. There is no separate "voice
 * demo" path: voice and text converge on POST /api/incidents and run the
 * identical server pipeline.
 *
 * Browser speech recognition is available in Chrome and Edge. Everywhere else
 * the textarea is the reporting surface, and we say so rather than pretending.
 */
export default function ReportPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locSource, setLocSource] = useState<"pending" | "gps" | "manual" | "unavailable">("pending");
  const [addressHint, setAddressHint] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechOk, setSpeechOk] = useState(false);
  const recRef = useRef<any>(null);
  /** Sticky for the life of the draft: set the moment the mic produces text, so a
   *  report dictated and then sent still records source="voice". */
  const usedVoice = useRef(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechOk(Boolean(SR));
    locate();
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setLocSource("unavailable");
      setCoords((c) => c ?? { lat: 17.4718, lng: 78.666 });
      return;
    }
    setLocSource("pending");
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocSource("gps"); },
      () => {
        // Refused or timed out. Do NOT silently pretend we know where they are -
        // seed the map at the operating area and ask them to place the pin.
        setCoords((c) => c ?? { lat: 17.4718, lng: 78.666 });
        setLocSource("unavailable");
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  function toggleListen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (stage === "listening") { recRef.current?.stop(); setStage("idle"); return; }

    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let final = "", partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " "; else partial += t;
      }
      if (final) { usedVoice.current = true; setText((prev) => (prev + " " + final).trim()); }
      setInterim(partial);
    };
    rec.onerror = (e: any) => { setError(`Speech recognition: ${e.error}`); setStage("idle"); };
    rec.onend = () => { setInterim(""); setStage((s) => (s === "listening" ? "idle" : s)); };
    recRef.current = rec;
    setError(null);
    rec.start();
    setStage("listening");
  }

  async function submit(source: "voice" | "text") {
    if (text.trim().length < 8) { setError("Please describe what is happening."); return; }
    recRef.current?.stop();
    setStage("sending"); setError(null); setResult(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: text.trim(),
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          source,
          address_hint: addressHint.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message ?? "Could not submit the report"); setStage("error"); return; }
      setResult(data); setStage("done");
    } catch (err: any) {
      setError(err?.message ?? "Network error"); setStage("error");
    }
  }

  const inc = result?.incident;

  return (
    <main className="min-h-screen">
      <header className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">RELIEF<span className="text-emerald-400">OS</span></Link>
        <Link href="/command" className="label hover:text-zinc-300">Command center →</Link>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Report an emergency</h1>
        <p className="mt-1.5 text-[13px] text-zinc-500">
          Speak or type what is happening. Say how many people are affected and whether anyone is
          elderly, injured or unable to move on their own.
        </p>

        <div className="mt-7 panel p-5">
          <div className="flex items-center gap-4">
            <button onClick={toggleListen} disabled={!speechOk || stage === "sending"}
              className={`w-16 h-16 rounded-full grid place-items-center text-2xl transition-colors shrink-0 ${
                stage === "listening" ? "bg-red-600 animate-pulse" : "bg-white/10 hover:bg-white/15"
              } disabled:opacity-30`}>
              🎙
            </button>
            <div className="min-w-0">
              <div className="text-[13px] text-zinc-200">
                {stage === "listening" ? "Listening — speak now" : "Tap to report by voice"}
              </div>
              <div className="text-[11.5px] text-zinc-500">
                {speechOk
                  ? "Transcribed in your browser, then sent as text."
                  : "Voice input needs Chrome or Edge. Please type your report below."}
              </div>
            </div>
          </div>

          <textarea
            value={text + (interim ? ` ${interim}` : "")}
            onChange={(e) => { usedVoice.current = false; setText(e.target.value); setInterim(""); }}
            placeholder="Water has entered our house and my parents are on the ground floor..."
            rows={5}
            className="mt-4 w-full bg-base-950 border border-white/10 rounded p-3 text-[13.5px] leading-relaxed resize-none" />

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="label">Where is help needed?</span>
              <button onClick={locate} className="text-[11px] text-zinc-400 hover:text-zinc-200 underline">
                Use my location
              </button>
            </div>
            <LocationPicker
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              onChange={(c) => { setCoords(c); setLocSource("manual"); }}
            />
            <div className="mt-1.5 text-[11.5px] text-zinc-500">
              {locSource === "pending" && "Finding your location…"}
              {locSource === "gps" && "Located from your device. Drag the pin if it is not exact."}
              {locSource === "manual" && "Pin placed by you."}
              {locSource === "unavailable" &&
                "We could not get your location — tap the map or drag the pin to the right place."}
              {coords && (
                <span className="font-mono text-zinc-600">
                  {" "}{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              )}
            </div>
            <input
              value={addressHint}
              onChange={(e) => setAddressHint(e.target.value)}
              placeholder="Landmark or address (optional) — e.g. behind the bus stop, second lane"
              className="mt-2 w-full bg-base-950 border border-white/10 rounded px-2.5 py-1.5 text-[12.5px]" />
          </div>

          <div className="mt-3 flex items-center justify-end">
            <button className="btn-primary" disabled={stage === "sending"}
              onClick={() => submit(usedVoice.current ? "voice" : "text")}>
              {stage === "sending" ? "Sending…" : "Send report"}
            </button>
          </div>
        </div>

        {stage !== "idle" && (
          <div className="mt-4 panel p-4">
            <div className="label mb-2">Progress</div>
            <Steps stage={stage} result={result} />
          </div>
        )}

        {error && <div className="mt-4 text-[13px] text-red-400">{error}</div>}

        {stage === "done" && inc && (
          <div className="mt-4 panel p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] text-zinc-300">{inc.code}</span>
              <span className={`chip bg-band-${inc.priority_band} ${inc.priority_band === "MEDIUM" ? "text-black" : "text-white"}`}>
                {inc.priority_band} {Math.round(inc.priority_score)}
              </span>
            </div>
            <p className="mt-2.5 text-[13.5px] text-zinc-200">{inc.short_summary}</p>
            <div className="mt-2 text-[12px] text-zinc-500">
              {inc.people_affected} affected · {inc.hazard_type} · assessed with{" "}
              {Math.round(inc.ai_confidence * 100)}% confidence
              {result.degraded ? " (rule-based fallback)" : ""}
            </div>
            {result.recommendation ? (
              <div className="mt-3 text-[13px] text-emerald-300">
                A responder has been recommended and is awaiting coordinator approval.
              </div>
            ) : (
              <div className="mt-3 text-[13px] text-amber-300">
                {result.reason ?? "A coordinator is reviewing your report."}
              </div>
            )}
            {inc.missing_information?.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/[0.07]">
                <div className="label mb-1.5">This would help responders</div>
                <ul className="text-[12.5px] text-zinc-400 space-y-0.5">
                  {inc.missing_information.map((m: string, n: number) => <li key={n}>· {m}</li>)}
                </ul>
                <AddDetail incidentId={inc.id} onDone={setResult} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Steps({ stage, result }: { stage: Stage; result: any }) {
  const done = stage === "done";
  const steps = [
    { k: "Report captured", ok: stage !== "idle" },
    { k: "Understanding the report", ok: done, detail: done ? `${result?.incident?.hazard_type} · ${result?.incident?.severity}` : "model is reading it" },
    { k: "Priority assessed", ok: done, detail: done ? `${result?.incident?.priority_band} ${Math.round(result?.incident?.priority_score)}` : "" },
    { k: "Matching responders", ok: done, detail: done ? `${result?.candidates?.length ?? 0} considered` : "" },
    { k: "Ready for coordinator", ok: done && Boolean(result?.recommendation) },
  ];
  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <div key={s.k} className="flex items-center gap-2 text-[12.5px]">
          <span className={s.ok ? "text-emerald-400" : "text-zinc-600"}>{s.ok ? "●" : "○"}</span>
          <span className={s.ok ? "text-zinc-200" : "text-zinc-500"}>{s.k}</span>
          {s.detail && <span className="text-zinc-600">— {s.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function AddDetail({ incidentId, onDone }: { incidentId: string; onDone: (r: any) => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add more detail…"
        className="flex-1 bg-base-950 border border-white/10 rounded px-2.5 py-1.5 text-[12.5px]" />
      <button className="btn-ghost" disabled={busy || v.trim().length < 4}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/incidents/${incidentId}/updates`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ description: v.trim() }),
          });
          const data = await res.json();
          setBusy(false); setV("");
          if (res.ok) onDone({ incident: data.incident, candidates: [], recommendation: data.match?.recommendation ?? null });
        }}>
        {busy ? "Sending…" : "Add"}
      </button>
    </div>
  );
}
