"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Ev, ReliefState } from "@/lib/clientTypes";

export type Connection = "connecting" | "live" | "reconnecting" | "offline";

const MAX_CLIENT_EVENTS = 500;

/**
 * Merge event batches from any source into one ordered, de-duplicated list.
 *
 * The stream is at-least-once: an event can arrive over the socket AND come back
 * in a REST catch-up or a state refetch, and a re-subscribe can replay. The
 * consumer is therefore responsible for de-duplication - keying by the database
 * row id, which is the only identifier guaranteed unique across all three paths.
 */
export function mergeEvents(previous: Ev[], incoming: Ev[]): Ev[] {
  if (!incoming.length) return previous;
  const byId = new Map<string, Ev>();
  for (const e of previous) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  return Array.from(byId.values())
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_CLIENT_EVENTS);
}

/**
 * THE REALTIME CLIENT.
 *
 * Supabase Realtime streams inserts on system_events - the same rows that are
 * the audit trail and the timeline. An arriving event does two things: it lands
 * in the timeline immediately, and it triggers a debounced re-read of
 * authoritative state from /api/state. The server stays the source of truth;
 * the event stream is what tells the client when to look.
 *
 * If a seq gap appears (a dropped packet) the missing events are replayed from
 * /api/events, so the timeline can never silently lose a step.
 */
export function useReliefStream() {
  const [state, setState] = useState<ReliefState | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [lastEvent, setLastEvent] = useState<Ev | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSeq = useRef(0);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  /** a refetch was requested while one was already running */
  const pending = useRef(false);

  const noteSeq = (list: Ev[]) => {
    for (const e of list) if (e.seq > lastSeq.current) lastSeq.current = e.seq;
  };

  const refetch = useCallback(async () => {
    // COALESCE, DO NOT DROP.
    //
    // This used to `return` when a fetch was already in flight, and nothing
    // re-scheduled the skipped read. An event arriving during a fetch was
    // therefore silently discarded, and the screen kept showing stale state
    // until some later event happened to arrive when the hook was idle — which
    // is how /responder could show a unit as available while /command already
    // had it offline. Now a request made during a fetch sets `pending` and the
    // loop runs again, so the last write always wins.
    if (inflight.current) { pending.current = true; return; }
    inflight.current = true;
    try {
      do {
        pending.current = false;
        const res = await fetch("/api/state", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          setError("Sign in as a coordinator to view live state.");
          return;
        }
        if (!res.ok) { setError(`State read failed (${res.status})`); return; }
        const data: ReliefState = await res.json();
        setState(data);
        const incoming = data.events ?? [];
        noteSeq(incoming);
        setEvents((prev) => mergeEvents(prev, incoming));
        setError(null);
      } while (pending.current);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      inflight.current = false;
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(refetch, 350);
  }, [refetch]);

  /** Replay anything missed while the socket was down or a packet was lost. */
  const catchUp = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?after_seq=${lastSeq.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const { events: missed } = await res.json();
      if (missed?.length) {
        noteSeq(missed);
        setEvents((prev) => mergeEvents(prev, missed));
      }
    } catch { /* the debounced refetch below still repairs the view */ }
  }, []);

  useEffect(() => {
    let active = true;
    refetch();

    const supabase = supabaseBrowser();
    // A unique topic per mount: React StrictMode mounts effects twice in
    // development, and two channels sharing one topic deliver every insert
    // twice. The merge above makes that harmless, but not sharing the topic
    // keeps the socket honest too.
    const channel = supabase
      .channel(`reliefos-events-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_events" },
        (payload) => {
          if (!active) return;
          const ev = payload.new as Ev;
          if (lastSeq.current && ev.seq > lastSeq.current + 1) catchUp();
          noteSeq([ev]);
          setEvents((prev) => mergeEvents(prev, [ev]));
          setLastEvent(ev);
          scheduleRefetch();
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") { setConnection("live"); catchUp(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("reconnecting");
        else if (status === "CLOSED") setConnection("offline");
      });

    return () => {
      active = false;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [refetch, scheduleRefetch, catchUp]);

  /** REST fallback: if realtime is not healthy, poll so the console is never stale. */
  useEffect(() => {
    if (connection === "live") return;
    const t = setInterval(refetch, 4000);
    return () => clearInterval(t);
  }, [connection, refetch]);

  /**
   * STALENESS FLOOR - a screen may never be more than one tick behind.
   *
   * "SUBSCRIBED" is not proof that events will keep arriving. A socket can go
   * quiet without ever emitting CLOSED, and a backgrounded tab has its timers
   * throttled to near nothing. Because the poll above is switched OFF while the
   * connection reads `live`, either case froze the screen with nothing behind it
   * to notice - which is how /responder could sit on AVAILABLE for a unit that
   * /command had already shown offline.
   *
   * So: a slow re-read even while live, and an immediate one whenever the tab
   * comes back to the foreground, regains focus, or the network returns. The
   * refetch coalesces, so these never stack up.
   */
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refetch();
    }, 15000);
    const wake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refetch();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [refetch]);

  return { state, events, connection, lastEvent, error, refetch };
}
