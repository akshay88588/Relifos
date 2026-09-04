"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Assignment, Ev, Incident, Responder, Shelter } from "@/lib/clientTypes";
import { ACTIVE_ASSIGNMENT } from "@/lib/clientTypes";
import {
  BASEMAPS, BASEMAP_ORDER, CENTRE, DEFAULT_ZOOM, MIN_ZOOM,
  isValidLngLat, maxZoomFor, type BasemapId,
} from "@/lib/map/basemap";
import { CollapseIcon, ExpandIcon, MapIcon, Spinner, TargetIcon, WarnIcon } from "@/components/ui/bits";

const BAND_COLOR: Record<string, string> = {
  CRITICAL: "#ff4d4f", HIGH: "#ff9138", MEDIUM: "#f0c44c", LOW: "#34d399",
};
const HELP_COLOR: Record<string, string> = {
  rescue: "#60a5fa", fire: "#fb7185", medical: "#fbbf24", volunteer: "#c084fc", logistics: "#2dd4bf",
};

type Layers = { incidents: boolean; responders: boolean; shelters: boolean };
type MapPhase = "loading" | "ready" | "degraded" | "failed";

/**
 * THE NEED <-> HELP MAP.
 *
 * Needs are incidents coloured by priority band; help is responders by unit
 * type; a dashed line joins every live assignment. Everything drawn here comes
 * from database state - there is no decorative geometry on this map.
 *
 * Marker shape carries meaning independently of colour (circle = incident,
 * diamond = responder, triangle = shelter) and every marker is a real focusable
 * button with an accessible name, so the map is operable from the keyboard.
 */
export function LiveMap({
  incidents, responders, shelters, assignments, lastEvent,
  onSelect, selectedId, isExpanded, onToggleExpand,
}: {
  incidents: Incident[]; responders: Responder[]; shelters: Shelter[];
  assignments: Assignment[]; lastEvent: Ev | null;
  onSelect: (id: string) => void; selectedId: string | null;
  isExpanded?: boolean; onToggleExpand?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  /** key -> marker + the element it owns. The element is mutated in place and
   *  never swapped, so MapLibre keeps the node its handlers are bound to. */
  const markers = useRef<Record<string, { marker: Marker; el: HTMLButtonElement }>>({});
  const styleReady = useRef(false);
  const tileErrors = useRef(0);
  const swapped = useRef(false);

  const [basemapId, setBasemapId] = useState<BasemapId>(BASEMAP_ORDER[0]);
  const [phase, setPhase] = useState<MapPhase>("loading");
  const [note, setNote] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ incidents: true, responders: true, shelters: true });

  /** Only ever hand MapLibre coordinates that are real numbers in range. */
  const plottable = useMemo(() => ({
    incidents: incidents.filter((i) => isValidLngLat(i.lng, i.lat)),
    responders: responders.filter((r) => isValidLngLat(r.lng, r.lat)),
    shelters: shelters.filter((s) => isValidLngLat(s.lng, s.lat)),
  }), [incidents, responders, shelters]);

  const dropped =
    (incidents.length - plottable.incidents.length) +
    (responders.length - plottable.responders.length) +
    (shelters.length - plottable.shelters.length);

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!container.current || map.current) return;
    const basemap = BASEMAPS[basemapId];

    let m: MLMap;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: basemap.style,
        center: CENTRE,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        // Capped to the provider's real depth plus a little overzoom, so the
        // camera can never reach a level with no tiles behind it.
        maxZoom: maxZoomFor(basemap),
        trackResize: true,
        attributionControl: { compact: true },
        fadeDuration: 120,
      });
    } catch (err) {
      setPhase("failed");
      setNote(err instanceof Error ? err.message : "WebGL is unavailable in this browser.");
      return;
    }
    map.current = m;

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 88, unit: "metric" }), "bottom-right");

    m.on("load", () => {
      m.resize();
      if (!m.getSource("links")) {
        m.addSource("links", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "links", type: "line", source: "links",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#60a5fa", "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.7 },
        });
      }
      styleReady.current = true;
      setPhase("ready");
    });

    /**
     * Tile failures used to be silent - the map simply fell apart. Now they are
     * counted: a burst means this provider is unreachable, so we fail over to
     * the other basemap once, and if that also fails we surface an honest
     * degraded state instead of a blank rectangle.
     */
    m.on("error", (e: { error?: Error & { status?: number } }) => {
      const status = e?.error?.status;
      const msg = e?.error?.message ?? "";
      const isTile = typeof status === "number" || /tile|fetch|load/i.test(msg);
      if (!isTile) return;
      tileErrors.current += 1;
      if (tileErrors.current >= 6 && !swapped.current) {
        swapped.current = true;
        const next = BASEMAP_ORDER.find((b) => b !== basemapId);
        if (next) {
          tileErrors.current = 0;
          setNote(`Basemap tiles failed — switched to ${BASEMAPS[next].label}.`);
          setBasemapId(next);
          return;
        }
      }
      if (tileErrors.current >= 12) {
        setPhase("degraded");
        setNote("Basemap tiles are not loading. Incident data is unaffected.");
      }
    });

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(container.current);
    const raf = requestAnimationFrame(() => m.resize());
    const t1 = setTimeout(() => m.resize(), 120);
    const t2 = setTimeout(() => m.resize(), 500);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1); clearTimeout(t2);
      ro.disconnect();
      Object.values(markers.current).forEach((x) => x.marker.remove());
      markers.current = {};
      styleReady.current = false;
      map.current?.remove();
      map.current = null;
    };
    // Re-initialising when the basemap changes is intentional: it is the failover path.
  }, [basemapId]);

  useEffect(() => {
    const t = setTimeout(() => map.current?.resize(), 60);
    return () => clearTimeout(t);
  }, [isExpanded]);

  // ---------------------------------------------------------------- markers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();

    const put = (key: string, lat: number, lng: number, paint: (el: HTMLButtonElement) => void) => {
      seen.add(key);
      const existing = markers.current[key];
      if (existing) {
        existing.marker.setLngLat([lng, lat]);
        paint(existing.el);
        return;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = "rp-marker";
      paint(el);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
      markers.current[key] = { marker, el };
    };

    if (layers.incidents) {
      for (const i of plottable.incidents) {
        const color = BAND_COLOR[i.priority_band] ?? "#71717a";
        const selected = selectedId === i.id;
        const pulsing = i.priority_band === "CRITICAL" && !i.resolved_at;
        put(`i:${i.id}`, i.lat as number, i.lng as number, (el) => {
          const size = selected ? 20 : i.priority_band === "CRITICAL" ? 16 : 13;
          el.style.cssText =
            `width:${size}px;height:${size}px;border-radius:50%;background:${color};` +
            `box-shadow:0 0 0 ${selected ? 3 : 2}px rgba(255,255,255,${selected ? 0.6 : 0.2});` +
            `cursor:pointer;position:relative;padding:0;border:none;` +
            `transition:width 160ms,height 160ms,box-shadow 160ms`;
          el.setAttribute("aria-label",
            `${i.code}, ${i.priority_band} priority, score ${Math.round(i.priority_score)}. ${i.short_summary ?? ""}`);
          el.setAttribute("aria-pressed", String(selected));
          el.title = `${i.code} — ${i.priority_band} ${Math.round(i.priority_score)}`;
          el.onclick = () => onSelect(i.id);

          const ring = el.querySelector(".pulse-ring") as HTMLElement | null;
          if (pulsing && !ring) {
            const r = document.createElement("span");
            r.className = "pulse-ring";
            r.setAttribute("aria-hidden", "true");
            r.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${color};opacity:.5;pointer-events:none`;
            el.appendChild(r);
          } else if (pulsing && ring) {
            ring.style.background = color;
          } else if (!pulsing && ring) {
            ring.remove();
          }
        });
      }
    }

    if (layers.responders) {
      for (const r of plottable.responders) {
        const color = HELP_COLOR[r.type] ?? "#60a5fa";
        put(`r:${r.id}`, r.lat as number, r.lng as number, (el) => {
          el.style.cssText =
            `width:11px;height:11px;background:${color};opacity:${r.status === "offline" ? 0.32 : 1};` +
            `transform:rotate(45deg);box-shadow:0 0 0 2px rgba(255,255,255,.16);padding:0;border:none;` +
            `transition:opacity 160ms`;
          el.setAttribute("aria-label", `${r.name}, ${r.type} unit, status ${r.status.replace(/_/g, " ")}`);
          el.title = `${r.name} — ${r.status.replace(/_/g, " ")}`;
        });
      }
    }

    if (layers.shelters) {
      for (const s of plottable.shelters) {
        const full = s.capacity_total ? s.capacity_used / s.capacity_total : 0;
        const color = full >= 1 ? "#ef4444" : full >= 0.85 ? "#fbbf24" : "#10b981";
        put(`s:${s.id}`, s.lat as number, s.lng as number, (el) => {
          el.style.cssText =
            `width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;` +
            `border-bottom:12px solid ${color};opacity:.92;padding:0;background:none`;
          el.setAttribute("aria-label", `Shelter ${s.name}, ${s.capacity_used} of ${s.capacity_total} occupied`);
          el.title = `${s.name} — ${s.capacity_used}/${s.capacity_total}`;
        });
      }
    }

    for (const key of Object.keys(markers.current)) {
      if (!seen.has(key)) {
        markers.current[key].marker.remove();
        delete markers.current[key];
      }
    }

    if (styleReady.current) {
      const rById = Object.fromEntries(plottable.responders.map((r) => [r.id, r]));
      const iById = Object.fromEntries(plottable.incidents.map((i) => [i.id, i]));
      const features = assignments
        .filter((a) => ACTIVE_ASSIGNMENT.includes(a.status))
        .map((a) => {
          const r = rById[a.responder_id]; const i = iById[a.incident_id];
          if (!r || !i) return null;
          return {
            type: "Feature" as const, properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: [[r.lng as number, r.lat as number], [i.lng as number, i.lat as number]],
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
      const src = m.getSource("links") as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features });
    }
  }, [plottable, assignments, selectedId, onSelect, layers]);

  // ------------------------------------------------- camera reacts to events
  useEffect(() => {
    if (!map.current || lastEvent?.type !== "incident.created") return;
    const inc = incidents.find((i) => i.id === lastEvent.incident_id);
    if (inc && isValidLngLat(inc.lng, inc.lat)) {
      map.current.easeTo({ center: [inc.lng as number, inc.lat as number], duration: 900 });
    }
  }, [lastEvent, incidents]);

  const fitAll = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const pts: [number, number][] = [
      ...plottable.incidents.map((i) => [i.lng as number, i.lat as number] as [number, number]),
      ...plottable.responders.map((r) => [r.lng as number, r.lat as number] as [number, number]),
    ];
    if (!pts.length) { m.easeTo({ center: CENTRE, zoom: DEFAULT_ZOOM, duration: 500 }); return; }
    const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    m.fitBounds(b, { padding: 64, maxZoom: 15, duration: 600 });
  }, [plottable]);

  const toggle = (k: keyof Layers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div ref={container} className="absolute inset-0" aria-hidden="true" />

      {/* The map is a picture; this is its text equivalent for assistive tech. */}
      <p className="sr-only">
        Operational map. {plottable.incidents.length} incidents, {plottable.responders.length} responders
        and {plottable.shelters.length} shelters plotted. The priority queue lists the same incidents in
        text form.
      </p>

      {phase === "loading" && (
        <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--surface-raised)" }}
             role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-2 text-ink-tertiary">
            <Spinner size={18} />
            <span className="text-[12px]">Loading basemap…</span>
          </div>
        </div>
      )}

      {phase === "failed" && (
        <div className="absolute inset-0 grid place-items-center p-6" style={{ background: "var(--surface-raised)" }} role="alert">
          <div className="text-center max-w-[38ch]">
            <div className="flex justify-center mb-2" style={{ color: "var(--warn)" }}><MapIcon size={22} /></div>
            <div className="text-[13px] text-ink-primary font-medium">Map could not start</div>
            <p className="mt-1 text-[12px] text-ink-tertiary leading-relaxed">
              {note ?? "This browser could not create a WebGL context."} The priority queue and incident
              detail remain fully usable — no operational information is lost.
            </p>
          </div>
        </div>
      )}

      {/* --- controls --- */}
      <div className="absolute top-2 left-2 right-12 z-10 flex flex-col gap-1.5 items-start">
        {/* Degraded is NOT hidden: tiles are missing and the operator is told so,
            while markers keep rendering over the empty canvas. Kept inside the
            control stack so it can never overlap the buttons or the layer
            checkboxes at any viewport width. */}
        {phase === "degraded" && (
          <div className="panel px-2.5 py-1.5 flex items-start gap-2 shadow-md max-w-full backdrop-blur"
               style={{ background: "rgba(22,22,26,.94)", borderColor: "var(--p-high-bd)" }} role="status">
            <span className="mt-px shrink-0" style={{ color: "var(--warn)" }}><WarnIcon /></span>
            <span className="text-[11.5px] text-ink-secondary leading-snug">{note}</span>
          </div>
        )}
        <div className="flex gap-1.5">
          {onToggleExpand && (
            <button onClick={onToggleExpand} className="btn-ghost btn-sm backdrop-blur"
              style={{ background: "rgba(16,16,19,.9)" }}
              aria-pressed={Boolean(isExpanded)}
              title={isExpanded ? "Collapse to split view" : "Expand map to full width"}>
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
              <span className="hidden sm:inline">{isExpanded ? "Split" : "Full map"}</span>
            </button>
          )}
          <button onClick={fitAll} className="btn-ghost btn-sm backdrop-blur"
            style={{ background: "rgba(16,16,19,.9)" }} title="Fit all incidents and responders in view">
            <TargetIcon /><span className="hidden sm:inline">Fit</span>
          </button>
        </div>

        <fieldset className="panel px-2 py-1.5 backdrop-blur flex flex-wrap gap-x-3 gap-y-1"
          style={{ background: "rgba(16,16,19,.9)" }}>
          <legend className="sr-only">Map layers</legend>
          {([["incidents", "Needs"], ["responders", "Help"], ["shelters", "Shelters"]] as const).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-1.5 text-[10.5px] text-ink-secondary cursor-pointer select-none">
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)}
                className="w-3 h-3 accent-emerald-500 cursor-pointer" />
              {lbl}
            </label>
          ))}
        </fieldset>
      </div>

      {/* --- legend: shape + colour + word, so it survives greyscale --- */}
      <div className="absolute bottom-2 left-2 panel px-2.5 py-2 text-[10px] space-y-1.5 backdrop-blur z-10 max-w-[calc(100%-1rem)]"
           style={{ background: "rgba(16,16,19,.9)" }}>
        <div>
          <div className="label mb-1">Need — priority</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1 text-ink-secondary">
                <i className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: BAND_COLOR[b] }} aria-hidden="true" />
                {b[0] + b.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1">Help — unit type</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {Object.entries(HELP_COLOR).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 text-ink-secondary">
                <i className="w-2 h-2 inline-block rotate-45 shrink-0" style={{ background: v }} aria-hidden="true" />{k}
              </span>
            ))}
          </div>
        </div>
        {dropped > 0 && (
          <div className="pt-1 text-ink-faint border-t" style={{ borderColor: "var(--border-subtle)" }}>
            {dropped} record{dropped === 1 ? "" : "s"} without valid coordinates not shown
          </div>
        )}
      </div>
    </div>
  );
}
