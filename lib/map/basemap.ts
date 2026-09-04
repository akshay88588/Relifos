import type { StyleSpecification } from "maplibre-gl";

/**
 * BASEMAP CONFIGURATION
 *
 * ---------------------------------------------------------------------------
 * 1. THE ZOOM BUG (fixed)
 * ---------------------------------------------------------------------------
 * The original style declared its raster sources with no `maxzoom`. MapLibre's
 * raster source defaults `maxzoom` to 22 (confirmed in the installed bundle:
 * `this.type="raster",this.minzoom=0,this.maxzoom=22`). So zooming past a
 * provider's deepest cached level requested tiles that do not exist - Esri's
 * Canvas services stop at z16 - and every one came back 404, tearing the
 * basemap apart on zoom-in.
 *
 * FIX: declare each source's true `maxzoom`. MapLibre then OVERZOOMS (keeps
 * drawing the deepest real tile, upscaled) instead of requesting tiles that
 * were never published. `maxZoom` on the map caps how far that may go.
 *
 * ---------------------------------------------------------------------------
 * 2. THE WATERMARK BUG (fixed)
 * ---------------------------------------------------------------------------
 * CARTO's basemaps are NOT keyless. Requesting basemaps.cartocdn.com without an
 * API key returns tiles that are stamped "API KEY REQUIRED" - and it returns
 * them with HTTP 200, so no error handler can detect the problem. The map looks
 * broken while every request technically succeeds.
 *
 * Esri's Dark Gray Canvas requires no key and is not watermarked, so it is the
 * default. Anything keyed must be supplied deliberately via the environment
 * escape hatch below - this file never ships a provider that silently degrades.
 */

export type BasemapId = "esri" | "osm" | "custom";

export interface BasemapDef {
  id: BasemapId;
  label: string;
  /** Deepest zoom level the provider actually publishes tiles for. */
  nativeMaxZoom: number;
  style: StyleSpecification;
}

/**
 * PRIMARY - Esri Dark Gray Canvas.
 * No API key, no watermark, dark by design. Cached to z16; the overzoom
 * allowance below carries the view to z19 on upscaled tiles.
 */
const ESRI: BasemapDef = {
  id: "esri",
  label: "Esri Dark Gray Canvas",
  nativeMaxZoom: 16,
  style: {
    version: 8,
    sources: {
      esri_base: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
      },
      esri_ref: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
      },
    },
    layers: [
      { id: "esri_base", type: "raster", source: "esri_base" },
      { id: "esri_ref", type: "raster", source: "esri_ref" },
    ],
  },
};

/**
 * FALLBACK - OpenStreetMap standard, darkened in the renderer.
 * Keyless and cached to z19, so it is the deep-zoom safety net if Esri is
 * unreachable. The tiles are light, so raster paint properties desaturate and
 * dim them to sit in a dark console rather than flashbanging the operator.
 *
 * NOTE: openstreetmap.org's tile policy discourages heavy application use. It
 * is a fallback for a demo, not a production basemap. Set the environment
 * override below for anything beyond that.
 */
const OSM: BasemapDef = {
  id: "osm",
  label: "OpenStreetMap (darkened)",
  nativeMaxZoom: 19,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -0.86,
        "raster-brightness-min": 0.02,
        "raster-brightness-max": 0.44,
        "raster-contrast": 0.12,
      },
    }],
  },
};

/**
 * ENVIRONMENT OVERRIDE - for a keyed provider you have actually signed up for.
 *
 *   NEXT_PUBLIC_BASEMAP_TILE_URL   full tile template INCLUDING your key, e.g.
 *     https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png?api_key=YOUR_KEY
 *   NEXT_PUBLIC_BASEMAP_MAX_ZOOM   deepest level that provider publishes (default 20)
 *   NEXT_PUBLIC_BASEMAP_ATTRIBUTION  attribution string the provider requires
 *
 * Supply the whole URL yourself so this file never has to guess a provider's
 * query-parameter format.
 */
function customBasemap(): BasemapDef | null {
  const url = process.env.NEXT_PUBLIC_BASEMAP_TILE_URL;
  if (!url) return null;
  const maxzoom = Number(process.env.NEXT_PUBLIC_BASEMAP_MAX_ZOOM ?? 20);
  const safeMax = Number.isFinite(maxzoom) ? Math.min(22, Math.max(1, maxzoom)) : 20;
  return {
    id: "custom",
    label: "Configured basemap",
    nativeMaxZoom: safeMax,
    style: {
      version: 8,
      sources: {
        custom: {
          type: "raster",
          tiles: [url],
          tileSize: 256,
          minzoom: 0,
          maxzoom: safeMax,
          attribution: process.env.NEXT_PUBLIC_BASEMAP_ATTRIBUTION ?? "",
        },
      },
      layers: [{ id: "custom", type: "raster", source: "custom" }],
    },
  };
}

const CUSTOM = customBasemap();

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  esri: ESRI,
  osm: OSM,
  custom: CUSTOM ?? ESRI,
};

/** Primary first, then the automatic fallback if the primary's tiles fail. */
export const BASEMAP_ORDER: BasemapId[] = CUSTOM ? ["custom", "esri", "osm"] : ["esri", "osm"];

/**
 * How far the user may zoom: a little past the deepest real tile (upscaled but
 * still readable) and no further.
 */
export const OVERZOOM_ALLOWANCE = 3;
export const MIN_ZOOM = 3;
export function maxZoomFor(b: BasemapDef) {
  return Math.min(22, b.nativeMaxZoom + OVERZOOM_ALLOWANCE);
}

/** Operating area: Ghatkesar / SNIST, Hyderabad. */
export const CENTRE: [number, number] = [78.666, 17.4718];
export const DEFAULT_ZOOM = 12.2;

/** Guards against NaN / out-of-range coordinates ever reaching MapLibre. */
export function isValidLngLat(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" && typeof lat === "number" &&
    Number.isFinite(lng) && Number.isFinite(lat) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}
