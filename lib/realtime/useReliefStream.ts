"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Ev, ReliefState } from "@/lib/clientTypes";

export type Connection = "connecting" | "live" | "reconnecting" | "offline";

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

  const refetch = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setError("Sign in as a coordinator to view live state."); return;
      }
      if (!res.ok) { setError(`State read failed (${res.status})`); return; }
      const data: ReliefState = await res.json();
      setState(data);
      setEvents(data.events ?? []);
      lastSeq.current = Math.max(lastSeq.current, ...(data.events ?? []).map((e) => e.seq), 0);
      setError(null);
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
        setEvents((prev) => [...prev, ...missed].slice(-300));
        lastSeq.current = Math.max(lastSeq.current, ...missed.map((e: Ev) => e.seq));
      }
    } catch { /* the debounced refetch below still repairs the view */ }
  }, []);

  useEffect(() => {
    refetch();
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel("reliefos-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_events" },
        (payload) => {
          const ev = payload.new as Ev;
          if (lastSeq.current && ev.seq > lastSeq.current + 1) catchUp();
          lastSeq.current = Math.max(lastSeq.current, ev.seq);
          setEvents((prev) => [...prev, ev].slice(-300));
          setLastEvent(ev);
          scheduleRefetch();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setConnection("live"); catchUp(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("reconnecting");
        else if (status === "CLOSED") setConnection("offline");
      });

    return () => {
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

  return { state, events, connection, lastEvent, error, refetch };
}
