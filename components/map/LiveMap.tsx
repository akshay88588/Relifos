"use client";
import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Assignment, Ev, Incident, Responder, Shelter } from "@/lib/clientTypes";
import { ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";

const BAND_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e",
};
const HELP_COLOR: Record<string, string> = {
  rescue: "#3b82f6", fire: "#f43f5e", medical: "#f59e0b",
  volunteer: "#a855f7", logistics: "#14b8a6",
};

/**
 * The NEED <-> HELP map. Needs are incidents coloured by priority band, help is
 * responders coloured by unit type, and a line is drawn for every live
 * assignment. Everything it draws comes from database state.
 */
export function LiveMap({
  incidents, responders, shelters, assignments, lastEvent, onSelect, selectedId,
}: {
  incidents: Incident[]; responders: Responder[]; shelters: Shelter[];
  assignments: Assignment[]; lastEvent: Ev | null;
  onSelect: (id: string) => void; selectedId: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  /** key -> the marker and the element it owns. The element is mutated in place,
   *  never swapped out from under MapLibre. */
  const markers = useRef<Record<string, { marker: Marker; el: HTMLDivElement }>>({});
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [{ id: "carto", type: "raster", source: "carto" }],
      },
      center: [78.666, 17.4718],
      zoom: 12.2,
      attributionControl: { compact: true },
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current.on("load", () => {
      map.current!.addSource("links", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.current!.addLayer({
        id: "links", type: "line", source: "links",
        paint: { "line-color": "#60a5fa", "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.75 },
      });
      ready.current = true;
    });
    return () => {
      Object.values(markers.current).forEach((m) => m.marker.remove());
      markers.current = {};
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // Redraw whenever database state changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const seen = new Set<string>();

    /**
     * Create the marker once, then only ever mutate its element. Replacing the
     * DOM node under MapLibre (element.replaceWith) detaches the node the marker
     * still holds a reference to, which silently kills its click handler - and
     * during Chaos Mode that happens on every tick.
     */
    const put = (
      key: string, lat: number, lng: number,
      paint: (el: HTMLDivElement) => void,
    ) => {
      seen.add(key);
      const existing = markers.current[key];
      if (existing) {
        existing.marker.setLngLat([lng, lat]);
        paint(existing.el);
        return;
      }
      const el = document.createElement("div");
      paint(el);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
      markers.current[key] = { marker, el };
    };

    for (const i of incidents) {
      if (i.lat == null || i.lng == null) continue;
      const color = BAND_COLOR[i.priority_band] ?? "#71717a";
      const selected = selectedId === i.id;
      const pulsing = i.priority_band === "CRITICAL" && !i.resolved_at;
      put(`i:${i.id}`, i.lat, i.lng, (el) => {
        const size = selected ? 18 : 13;
        el.style.cssText =
          `width:${size}px;height:${size}px;border-radius:50%;background:${color};` +
          `box-shadow:0 0 0 ${selected ? 3 : 2}px rgba(255,255,255,${selected ? 0.55 : 0.18});` +
          `cursor:pointer;position:relative`;
        el.title = `${i.code} - ${i.priority_band} ${Math.round(i.priority_score)}`;
        el.onclick = () => onSelect(i.id);

        const ring = el.firstElementChild as HTMLElement | null;
        if (pulsing && !ring) {
          const r = document.createElement("div");
          r.className = "pulse-ring";
          r.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${color};opacity:.5`;
          el.appendChild(r);
        } else if (pulsing && ring) {
          ring.style.background = color;
        } else if (!pulsing && ring) {
          ring.remove();
        }
      });
    }

    for (const r of responders) {
      if (r.lat == null || r.lng == null) continue;
      const color = HELP_COLOR[r.type] ?? "#3b82f6";
      put(`r:${r.id}`, r.lat, r.lng, (el) => {
        el.style.cssText =
          `width:11px;height:11px;background:${color};opacity:${r.status === "offline" ? 0.3 : 1};` +
          `transform:rotate(45deg);box-shadow:0 0 0 2px rgba(255,255,255,.15)`;
        el.title = `${r.name} - ${r.status}`;
      });
    }

    for (const s of shelters) {
      if (s.lat == null || s.lng == null) continue;
      const full = s.capacity_total ? s.capacity_used / s.capacity_total : 0;
      const color = full >= 1 ? "#ef4444" : full >= 0.85 ? "#f59e0b" : "#10b981";
      put(`s:${s.id}`, s.lat, s.lng, (el) => {
        el.style.cssText =
          `width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;` +
          `border-bottom:12px solid ${color};opacity:.9`;
        el.title = `${s.name} - ${s.capacity_used}/${s.capacity_total}`;
      });
    }

    for (const key of Object.keys(markers.current)) {
      if (!seen.has(key)) {
        markers.current[key].marker.remove();
        delete markers.current[key];
      }
    }

    if (ready.current) {
      const byId = Object.fromEntries(responders.map((r) => [r.id, r]));
      const incById = Object.fromEntries(incidents.map((i) => [i.id, i]));
      const features = assignments
        .filter((a) => ACTIVE_ASSIGNMENT.includes(a.status))
        .map((a) => {
          const r = byId[a.responder_id]; const i = incById[a.incident_id];
          if (!r?.lat || !i?.lat) return null;
          return {
            type: "Feature" as const, properties: {},
            geometry: { type: "LineString" as const, coordinates: [[r.lng!, r.lat!], [i.lng!, i.lat!]] },
          };
        })
        .filter(Boolean);
      (map.current!.getSource("links") as any)?.setData({ type: "FeatureCollection", features });
    }
  }, [incidents, responders, shelters, assignments, selectedId, onSelect]);

  // Fly to a brand new incident so the operator sees where it landed.
  useEffect(() => {
    if (!map.current || lastEvent?.type !== "incident.created") return;
    const inc = incidents.find((i) => i.id === lastEvent.incident_id);
    if (inc?.lat != null && inc?.lng != null) {
      map.current.easeTo({ center: [inc.lng, inc.lat], duration: 900 });
    }
  }, [lastEvent, incidents]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />
      <div className="absolute bottom-2 left-2 panel px-2.5 py-2 text-[10px] space-y-1 bg-base-950/85 backdrop-blur">
        <div className="label mb-1">Need</div>
        <div className="flex gap-2.5">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((b) => (
            <span key={b} className="flex items-center gap-1 text-zinc-400">
              <i className="w-2 h-2 rounded-full inline-block" style={{ background: BAND_COLOR[b] }} />{b[0] + b.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
        <div className="label pt-1">Help</div>
        <div className="flex gap-2.5">
          {Object.entries(HELP_COLOR).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-zinc-400">
              <i className="w-2 h-2 inline-block rotate-45" style={{ background: v }} />{k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
