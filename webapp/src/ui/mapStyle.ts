import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * One base map for every MapLibre map in the panel: OpenStreetMap data as vector tiles from OpenFreeMap
 * (no key), drawn in Google-Maps-like colours. The style is an inline object, not a URL, so `style.load`
 * fires at once even when the tile server is slow or unreachable; pins and zones never wait for tiles.
 * Custom layers added with `map.addLayer(layer)` go on top of everything; pass `MAP_LABELS_BEFORE` as the
 * second argument to slip a layer under the place and road names instead.
 */

const SOURCE = "openmaptiles";
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

export const MAP_ATTRIBUTION = '&copy; <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** Google-like palette. */
export const MAP_COLORS = {
  land: "#f5f5f3",
  residential: "#efefec",
  industrial: "#ebe9ed",
  park: "#c8e6c9",
  wood: "#d4ecd5",
  sand: "#f4ecd6",
  water: "#aadaff",
  building: "#e8e8e6",
  buildingLine: "#dcdcda",
  motorway: "#fdd56a",
  motorwayCase: "#f1b84a",
  road: "#ffffff",
  roadCase: "#dadce0",
  minorCase: "#e6e6e3",
  rail: "#c9c9c9",
  boundary: "#b9b9b9",
  label: "#5f6368",
  labelStrong: "#3c4043",
  waterLabel: "#4a90c2",
  halo: "#ffffff",
} as const;

const c = MAP_COLORS;

const MAJOR = ["motorway", "trunk"];
const MAIN = ["primary", "secondary"];
const MID = ["tertiary"];
const MINOR = ["minor", "service", "track"];

const roadFilter = (classes: string[]): FilterSpecification => ["all", ["==", ["geometry-type"], "LineString"], ["match", ["get", "class"], classes, true, false]];

/** Road width by zoom: [z, width] pairs. */
const width = (...stops: [number, number][]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()] as unknown as number;

const LAYERS: LayerSpecification[] = [
  { id: "background", type: "background", paint: { "background-color": c.land } },
  {
    id: "landuse",
    type: "fill",
    source: SOURCE,
    "source-layer": "landuse",
    paint: {
      "fill-color": ["match", ["get", "class"], ["residential", "suburb", "neighbourhood"], c.residential, ["industrial", "commercial", "retail", "railway"], c.industrial, ["cemetery", "grass", "recreation_ground", "pitch", "playground"], c.wood, c.residential],
      "fill-opacity": 0.8,
    },
  },
  {
    id: "landcover",
    type: "fill",
    source: SOURCE,
    "source-layer": "landcover",
    paint: {
      "fill-color": ["match", ["get", "class"], ["wood", "forest"], c.wood, ["grass", "farmland", "wetland"], c.wood, ["sand", "rock"], c.sand, c.wood],
      "fill-opacity": 0.85,
    },
  },
  { id: "park", type: "fill", source: SOURCE, "source-layer": "park", paint: { "fill-color": c.park, "fill-opacity": 0.9 } },
  { id: "water", type: "fill", source: SOURCE, "source-layer": "water", paint: { "fill-color": c.water } },
  { id: "waterway", type: "line", source: SOURCE, "source-layer": "waterway", paint: { "line-color": c.water, "line-width": width([10, 0.6], [16, 3]) } },
  { id: "aeroway", type: "fill", source: SOURCE, "source-layer": "aeroway", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": c.industrial } },
  { id: "building", type: "fill", source: SOURCE, "source-layer": "building", minzoom: 14, paint: { "fill-color": c.building, "fill-outline-color": c.buildingLine } },
  // Road casings, then fills, smallest first so the big roads sit on top.
  { id: "road-minor-case", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 13, filter: roadFilter(MINOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.minorCase, "line-width": width([13, 1.5], [18, 14]) } },
  { id: "road-mid-case", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 11, filter: roadFilter(MID), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.roadCase, "line-width": width([11, 1.5], [18, 18]) } },
  { id: "road-main-case", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 8, filter: roadFilter(MAIN), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.roadCase, "line-width": width([8, 1], [18, 22]) } },
  { id: "road-major-case", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 5, filter: roadFilter(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.motorwayCase, "line-width": width([5, 1], [18, 26]) } },
  { id: "road-path", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 15, filter: roadFilter(["path"]), paint: { "line-color": "#d8d5ce", "line-width": 1, "line-dasharray": [2, 2] } },
  { id: "road-minor", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 13, filter: roadFilter(MINOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": width([13, 0.8], [18, 11]) } },
  { id: "road-mid", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 11, filter: roadFilter(MID), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": width([11, 0.8], [18, 15]) } },
  { id: "road-main", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 8, filter: roadFilter(MAIN), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": width([8, 0.6], [18, 19]) } },
  { id: "road-major", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 5, filter: roadFilter(MAJOR), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.motorway, "line-width": width([5, 0.6], [18, 22]) } },
  { id: "rail", type: "line", source: SOURCE, "source-layer": "transportation", minzoom: 11, filter: roadFilter(["rail", "transit"]), paint: { "line-color": c.rail, "line-width": width([11, 0.6], [18, 2]), "line-dasharray": [3, 3] } },
  { id: "boundary", type: "line", source: SOURCE, "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 4], paint: { "line-color": c.boundary, "line-width": width([3, 0.6], [12, 1.4]), "line-dasharray": [3, 2] } },
  // Names on top.
  {
    id: "label-water",
    type: "symbol",
    source: SOURCE,
    "source-layer": "water_name",
    layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": 12 },
    paint: { "text-color": c.waterLabel, "text-halo-color": c.halo, "text-halo-width": 1.2 },
  },
  {
    id: "label-road",
    type: "symbol",
    source: SOURCE,
    "source-layer": "transportation_name",
    minzoom: 13,
    layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": width([13, 10], [18, 13]), "symbol-placement": "line" },
    paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.4 },
  },
  {
    id: "label-poi",
    type: "symbol",
    source: SOURCE,
    "source-layer": "poi",
    minzoom: 16,
    filter: ["<=", ["get", "rank"], 20],
    layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": 11, "text-max-width": 8 },
    paint: { "text-color": "#8a8f94", "text-halo-color": c.halo, "text-halo-width": 1.2 },
  },
  {
    id: "label-place-small",
    type: "symbol",
    source: SOURCE,
    "source-layer": "place",
    minzoom: 11,
    filter: ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter", "village", "hamlet"], true, false],
    layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": width([11, 11], [16, 14]), "text-max-width": 8 },
    paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
  },
  {
    id: "label-place-city",
    type: "symbol",
    source: SOURCE,
    "source-layer": "place",
    filter: ["match", ["get", "class"], ["city", "town"], true, false],
    layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT_BOLD, "text-size": width([6, 12], [14, 18]), "text-max-width": 8 },
    paint: { "text-color": c.labelStrong, "text-halo-color": c.halo, "text-halo-width": 1.8 },
  },
];

/** Id of the first name layer: pass it as `beforeId` to draw a layer under the names but over roads. */
export const MAP_LABELS_BEFORE = "label-water";

const VECTOR_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: { [SOURCE]: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: MAP_ATTRIBUTION } },
  layers: LAYERS,
};

/** The old raster OpenStreetMap tiles, kept in case the vector map has to be turned off. Not used by default. */
export const rasterFallbackStyle: StyleSpecification = {
  version: 8,
  sources: { base: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "&copy; OpenStreetMap contributors" } },
  layers: [{ id: "base", type: "raster", source: "base" }],
};

/**
 * A fresh copy of the base map style (maps change their style, so each map gets its own).
 * `extraSources` / `extraLayers` add raster layers such as satellite imagery; they go under the names.
 */
export function baseMapStyle(extra?: { sources?: StyleSpecification["sources"]; layers?: LayerSpecification[] }): StyleSpecification {
  const style = structuredClone(VECTOR_STYLE);
  if (extra?.sources) Object.assign(style.sources, structuredClone(extra.sources));
  if (extra?.layers?.length) {
    const at = style.layers.findIndex((layer) => layer.id === MAP_LABELS_BEFORE);
    style.layers.splice(at === -1 ? style.layers.length : at, 0, ...structuredClone(extra.layers));
  }
  return style;
}
