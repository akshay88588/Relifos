"use client";
import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Lets a reporter place the pin themselves.
 *
 * Browser geolocation is often refused, times out, or lands hundreds of metres
 * off. Sending a responder to a silent default coordinate would be worse than
 * useless, so the reporter can always drag the pin to where help is actually
 * needed - and the map shows them exactly what they are about to send.
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

  useEffect(() => {
    if (!container.current || map.current) return;
    const start: [number, number] = [lng ?? 78.666, lat ?? 17.4718];

    map.current = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
          },
        },
        layers: [{ id: "carto", type: "raster", source: "carto" }],
      },
      center: start,
      zoom: 14,
      attributionControl: { compact: true },
    });

    const el = document.createElement("div");
    el.style.cssText =
      "width:18px;height:18px;border-radius:50%;background:#ef4444;cursor:grab;" +
      "box-shadow:0 0 0 3px rgba(239,68,68,.35), 0 0 0 5px rgba(255,255,255,.2)";
    marker.current = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat(start)
      .addTo(map.current);

    marker.current.on("dragend", () => {
      const p = marker.current!.getLngLat();
      onChangeRef.current({ lat: p.lat, lng: p.lng });
    });

    map.current.on("click", (e) => {
      marker.current!.setLngLat(e.lngLat);
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    const ro = new ResizeObserver(() => {
      map.current?.resize();
    });
    ro.observe(container.current);

    requestAnimationFrame(() => map.current?.resize());
    const t = setTimeout(() => map.current?.resize(), 200);

    return () => {
      clearTimeout(t);
      ro.disconnect();
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow coordinates that arrive from outside (a successful GPS fix).
  useEffect(() => {
    if (lat == null || lng == null || !map.current || !marker.current) return;
    const current = marker.current.getLngLat();
    if (Math.abs(current.lat - lat) < 1e-6 && Math.abs(current.lng - lng) < 1e-6) return;
    marker.current.setLngLat([lng, lat]);
    map.current.easeTo({ center: [lng, lat], duration: 600 });
  }, [lat, lng]);

  return <div ref={container} className="h-[180px] w-full rounded overflow-hidden border border-white/10" />;
}
