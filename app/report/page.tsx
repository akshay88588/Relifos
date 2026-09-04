"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocationPicker } from "@/components/map/LocationPicker";
import { CheckIcon, MicIcon, PriorityBadge, Spinner, WarnIcon } from "@/components/ui/bits";

type Stage = "idle" | "listening" | "sending" | "done" | "error";
type LocSource = "pending" | "gps" | "manual" | "unavailable";

interface IntakeResult {
  incident: {
    id: string; code: string; short_summary: string | null; priority_band: string;
    priority_score: number; people_affected: number; hazard_type: string | null;
    severity: string | null; ai_confidence: number; missing_information: string[];
  };
  candidates?: unknown[];
  recommendation?: unknown;
  reason?: string;
  degraded?: boolean;
}

/**
 * CITIZEN REPORTING — VOICE FIRST.
 *
 * Speech is transcribed in the browser with the Web Speech API and posted to
 * exactly the same endpoint the text box uses. There is no separate "voice
 * demo" path: voice and text converge on POST /api/incidents and run the
 * identical server pipeline.
 *
 * Designed for a phone held by someone under stress: one column, large targets,
 * a visible progress trail, and no step that can silently fail.
 */
export default function ReportPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locSource, setLocSource] = useState<LocSource>("pending");
  const [addressHint, setAddressHint] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechOk, setSpeechOk] = useState(false);
  const recRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  /** Sticky for the life of the draft, so a dictated report still records source="voice". */
  const usedVoice = useRef(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
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
        // Refused or timed out. Do NOT silently pretend we know where they are —
        // seed the map at the operating area and ask them to place the pin.
        setCoords((c) => c ?? { lat: 17.4718, lng: 78.666 });
        setLocSource("unavailable");
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  function toggleListen() {
    const w = window as unknown as {
      SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never;
    };
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      (new () => Record<string, unknown>) | undefined;
    if (!SR) return;
    if (stage === "listening") { recRef.current?.stop(); setStage("idle"); return; }

    const rec = new SR() as Record<string, unknown> & { start: () => void; stop: () => void };
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
      let final = "", partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " "; else partial += t;
      }
      if (final) { usedVoice.current = true; setText((prev) => (prev + " " + final).trim()); }
      setInterim(partial);
    };
    rec.onerror = (e: { error: string }) => {
      setError(e.error === "not-allowed"
        ? "Microphone access was blocked. Please allow the microphone, or type your report instead."
        : `Speech recognition problem: ${e.error}. You can type the report instead.`);
      setStage("idle");
    };
    rec.onend = () => { setInterim(""); setStage((s) => (s === "listening" ? "idle" : s)); };
    recRef.current = rec;
    setError(null);
    rec.start();
    setStage("listening");
  }

  async function submit() {
    if (text.trim().length < 8) { setError("Please describe what is happening — at least a sentence."); return; }
    recRef.current?.stop();
    setStage("sending"); setError(null); setResult(null);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: text.trim(),
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          source: usedVoice.current ? "voice" : "text",
          address_hint: addressHint.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 429
          ? "Too many reports from this connection. Please wait a moment and try again."
          : data?.error?.message ?? "Your report could not be submitted. Please try again.");
        setStage("error");
        return;
      }
      setResult(data); setStage("done");
    } catch {
      setError("Network problem — your report was not sent. Check your connection and try again.");
      setStage("error");
    }
  }

  const inc = result?.incident;

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="px-5 py-3 flex items-center justify-between gap-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <Link href="/" className="font-semibold tracking-tight">
          RELIEF<span style={{ color: "var(--accent-hover)" }}>OS</span>
        </Link>
        <Link href="/command" className="label hover:text-ink-secondary transition-colors">Command centre →</Link>
      </header>

      <main id="main" className="max-w-2xl mx-auto px-5 py-8 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Report an emergency</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-tertiary leading-relaxed">
          Speak or type what is happening. Say how many people are affected and whether anyone is elderly,
          injured or unable to move on their own.
        </p>

        <div className="mt-7 panel p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleListen}
              disabled={!speechOk || stage === "sending"}
              aria-pressed={stage === "listening"}
              aria-label={stage === "listening" ? "Stop recording" : "Start recording your report by voice"}
              className="w-16 h-16 rounded-full grid place-items-center shrink-0 transition-colors disabled:opacity-30"
              style={{
                background: stage === "listening" ? "var(--danger)" : "var(--surface-active)",
                color: stage === "listening" ? "#fff" : "var(--text-secondary)",
              }}
            >
              <span className={stage === "listening" ? "live-dot" : undefined}><MicIcon /></span>
            </button>
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink-primary">
                {stage === "listening" ? "Listening — speak now" : "Tap to report by voice"}
              </p>
              <p className="text-[11.5px] text-ink-tertiary mt-0.5 leading-snug">
                {speechOk
                  ? "Transcribed in your browser, then sent as text."
                  : "Voice input needs Chrome or Edge. Please type your report below."}
              </p>
            </div>
          </div>

          <label htmlFor="report-text" className="label block mt-4 mb-1.5">What is happening?</label>
          <textarea
            id="report-text"
            value={text + (interim ? ` ${interim}` : "")}
            onChange={(e) => { usedVoice.current = false; setText(e.target.value); setInterim(""); }}
            placeholder="Water has entered our house and my parents are on the ground floor…"
            rows={5}
            className="field resize-none leading-relaxed"
          />

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="label">Where is help needed?</span>
              <button onClick={locate} className="text-[11.5px] text-ink-tertiary hover:text-ink-primary underline transition-colors">
                Use my location
              </button>
            </div>
            <LocationPicker
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              onChange={(c) => { setCoords(c); setLocSource("manual"); }}
            />
            <p className="mt-1.5 text-[11.5px] text-ink-tertiary" role="status" aria-live="polite">
              {locSource === "pending" && "Finding your location…"}
              {locSource === "gps" && "Located from your device. Move the pin if it is not exact."}
              {locSource === "manual" && "Pin placed by you."}
              {locSource === "unavailable" && "We could not get your location — tap the map to place the pin."}
              {coords && (
                <span className="mono text-ink-faint"> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
              )}
            </p>

            <label htmlFor="landmark" className="sr-only">Landmark or address</label>
            <input
              id="landmark"
              value={addressHint}
              onChange={(e) => setAddressHint(e.target.value)}
              placeholder="Landmark or address (optional) — e.g. behind the bus stop, second lane"
              className="field mt-2 !py-1.5 !text-[12.5px]"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button className="btn-primary w-full sm:w-auto" disabled={stage === "sending"} onClick={submit}>
              {stage === "sending" ? <><Spinner /> Sending…</> : "Send report"}
            </button>
          </div>
        </div>

        {stage !== "idle" && (
          <div className="mt-4 panel p-4">
            <h2 className="label mb-2">Progress</h2>
            <Steps stage={stage} result={result} />
          </div>
        )}

        {error && (
          <p className="mt-4 text-[13px] flex items-start gap-2 panel p-3" role="alert"
             style={{ color: "var(--danger)", borderColor: "var(--p-critical-bd)" }}>
            <span className="mt-0.5 shrink-0"><WarnIcon /></span>{error}
          </p>
        )}

        {stage === "done" && inc && (
          <div className="mt-4 panel p-5 sheet-up" role="status">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="mono text-[13px] text-ink-secondary">{inc.code}</span>
              <PriorityBadge band={inc.priority_band} score={inc.priority_score} />
            </div>
            <p className="mt-2.5 text-[13.5px] text-ink-primary leading-relaxed">{inc.short_summary}</p>
            <p className="mt-2 text-[12px] text-ink-tertiary">
              {inc.people_affected} affected · {inc.hazard_type} · assessed with{" "}
              {Math.round(inc.ai_confidence * 100)}% confidence
              {result?.degraded ? " (rule-based fallback — the model was unavailable)" : ""}
            </p>

            {result?.recommendation ? (
              <p className="mt-3 text-[13px] flex items-start gap-1.5" style={{ color: "var(--accent-hover)" }}>
                <span className="mt-0.5 shrink-0"><CheckIcon /></span>
                A responder has been recommended and is awaiting coordinator approval.
              </p>
            ) : (
              <p className="mt-3 text-[13px]" style={{ color: "var(--p-high)" }}>
                {result?.reason ?? "A coordinator is reviewing your report."}
              </p>
            )}

            {inc.missing_information?.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <h3 className="label mb-1.5">This would help responders</h3>
                <ul className="text-[12.5px] text-ink-secondary space-y-1">
                  {inc.missing_information.map((m, n) => (
                    <li key={n} className="flex gap-1.5"><span aria-hidden="true" className="text-ink-faint">·</span>{m}</li>
                  ))}
                </ul>
                <AddDetail incidentId={inc.id} onDone={setResult} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Steps({ stage, result }: { stage: Stage; result: IntakeResult | null }) {
  const done = stage === "done";
  const failed = stage === "error";
  const steps = [
    { k: "Report captured", ok: stage !== "idle", detail: "" },
    { k: "Understanding the report", ok: done,
      detail: done ? `${result?.incident.hazard_type} · ${result?.incident.severity}` : failed ? "" : "model is reading it" },
    { k: "Priority assessed", ok: done,
      detail: done ? `${result?.incident.priority_band} ${Math.round(result?.incident.priority_score ?? 0)}` : "" },
    { k: "Matching responders", ok: done, detail: done ? `${result?.candidates?.length ?? 0} considered` : "" },
    { k: "Ready for coordinator", ok: done && Boolean(result?.recommendation), detail: "" },
  ];
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((s) => (
        <li key={s.k} className="flex items-center gap-2 text-[12.5px]">
          <span aria-hidden="true" style={{ color: s.ok ? "var(--accent-hover)" : failed ? "var(--danger)" : "var(--text-faint)" }}>
            {s.ok ? "●" : failed ? "✕" : "○"}
          </span>
          <span style={{ color: s.ok ? "var(--text-primary)" : "var(--text-tertiary)" }}>{s.k}</span>
          {s.detail && <span className="text-ink-faint">— {s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

function AddDetail({ incidentId, onDone }: { incidentId: string; onDone: (r: IntakeResult) => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/updates`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: v.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error?.message ?? "Could not add the detail."); return; }
      setV("");
      onDone({ incident: data.incident, candidates: [], recommendation: data.match?.recommendation ?? null });
    } catch {
      setErr("Network problem — the detail was not added.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3">
      <label htmlFor="more-detail" className="sr-only">Add more detail</label>
      <div className="flex gap-2">
        <input id="more-detail" value={v} onChange={(e) => setV(e.target.value)}
          placeholder="Add more detail…" className="field !py-1.5 !text-[12.5px] flex-1" />
        <button className="btn-ghost shrink-0" disabled={busy || v.trim().length < 4} onClick={send}>
          {busy ? <Spinner /> : "Add"}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[11.5px]" role="alert" style={{ color: "var(--danger)" }}>{err}</p>}
    </div>
  );
}
