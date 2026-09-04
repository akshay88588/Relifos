"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAPS, BASEMAP_ORDER, MIN_ZOOM, isValidLngLat, maxZoomFor } from "@/lib/map/basemap";
import { Spinner } from "@/components/ui/bits";

/**
 * Lets a reporter place the pin themselves.
 *
 * Browser geolocation is often refused, times out, or lands hundreds of metres
 * off. Sending a responder to a silent default coordinate would be worse than
 * useless, so the reporter can always move the pin - and sees exactly what they
 * are about to send.
 *
 * Uses the same basemap definitions (and therefore the same `maxzoom` fix) as
 * the command-centre map, so zooming in here cannot break either.
 */
export function LocationPicker({
  lat, lng, onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (c: { lat: number; lng: number }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    const basemap = BASEMAPS[BASEMAP_ORDER[0]];
    const start: [number, number] = [lng ?? 78.666, lat ?? 17.4718];

    let m: MLMap;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: basemap.style,
        center: start,
        zoom: 14,
        minZoom: MIN_ZOOM,
        maxZoom: maxZoomFor(basemap),
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => { m.resize(); setReady(true); });

    const el = document.createElement("div");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Selected location marker");
    el.style.cssText =
      "width:20px;height:20px;border-radius:50%;background:#ef4444;cursor:grab;" +
      "box-shadow:0 0 0 3px rgba(239,68,68,.35), 0 0 0 5px rgba(255,255,255,.22)";
    marker.current = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(start).addTo(m);

    marker.current.on("dragend", () => {
      const p = marker.current!.getLngLat();
      onChangeRef.current({ lat: p.lat, lng: p.lng });
    });
    m.on("click", (e) => {
      marker.current!.setLngLat(e.lngLat);
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(container.current);
    const raf = requestAnimationFrame(() => map.current?.resize());
    const t = setTimeout(() => map.current?.resize(), 200);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro.disconnect();
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
    // Mount-only: `lat`/`lng` seed the initial view and are then followed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Follow coordinates arriving from outside (a successful GPS fix). */
  useEffect(() => {
    if (!isValidLngLat(lng, lat) || !map.current || !marker.current) return;
    const current = marker.current.getLngLat();
    if (Math.abs(current.lat - (lat as number)) < 1e-6 && Math.abs(current.lng - (lng as number)) < 1e-6) return;
    marker.current.setLngLat([lng as number, lat as number]);
    map.current.easeTo({ center: [lng as number, lat as number], duration: 600 });
  }, [lat, lng]);

  if (failed) {
    return (
      <div className="h-[190px] w-full rounded-md grid place-items-center px-4 text-center"
           style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-default)" }} role="alert">
        <p className="text-[12px] text-ink-tertiary leading-relaxed">
          The map could not load in this browser. Your report will still be sent — please describe the
          location in the landmark field below as precisely as you can.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[190px] w-full rounded-md overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
      <div ref={container} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--surface-sunken)" }}
             role="status" aria-live="polite">
          <span className="flex items-center gap-2 text-[12px] text-ink-tertiary"><Spinner /> Loading map…</span>
        </div>
      )}
      <p className="sr-only">
        Interactive map for choosing where help is needed. Tap the map or drag the marker. The exact
        coordinates are shown as text below the map.
      </p>
    </div>
  );
}
