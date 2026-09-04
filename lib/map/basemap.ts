import type { StyleSpecification } from "maplibre-gl";

/**
 * BASEMAP CONFIGURATION - and the fix for the "zoom in, map breaks" bug.
 *
 * ROOT CAUSE of the original defect: the raster sources declared no `maxzoom`.
 * MapLibre's raster source defaults `maxzoom` to 22 (confirmed in the installed
 * bundle: `this.type="raster",this.minzoom=0,this.maxzoom=22`, and the
 * style-spec default for `source_raster.maxzoom` is 22). So as soon as the user
 * zoomed past a provider's deepest cached level, the map requested tiles that do
 * not exist. Esri's World_Dark_Gray_Base is cached to z16; every request at
 * z17+ returned 404 with an ArcGIS REST error body, and the basemap fell apart.
 *
 * THE FIX: declare each source's true `maxzoom`. MapLibre then OVERZOOMS - it
 * keeps drawing the deepest real tile, scaled up - instead of asking for tiles
 * the provider never published. `maxZoom` on the map caps how far that
 * upscaling may go, so the view never lands somewhere with no tiles behind it.
 *
 * Native depth per provider (this number must match the service):
 *   carto dark_all ............. z20
 *   esri World_Dark_Gray_Base .. z16
 */

export type BasemapId = "carto" | "esri";

export interface BasemapDef {
  id: BasemapId;
  label: string;
  /** Deepest zoom level the provider actually publishes tiles for. */
  nativeMaxZoom: number;
  style: StyleSpecification;
}

const CARTO: BasemapDef = {
  id: "carto",
  label: "CARTO Dark Matter",
  nativeMaxZoom: 20,
  style: {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20, // <- the fix. Without this MapLibre assumes 22.
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  },
};

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
        maxzoom: 16, // <- Esri caches this service to z16 only.
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

export const BASEMAPS: Record<BasemapId, BasemapDef> = { carto: CARTO, esri: ESRI };

/** Primary first, then the automatic fallback if the primary's tiles fail. */
export const BASEMAP_ORDER: BasemapId[] = ["carto", "esri"];

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
