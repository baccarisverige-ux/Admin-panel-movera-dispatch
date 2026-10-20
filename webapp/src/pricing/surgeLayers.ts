import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import type { ZoneSurge } from "./surge.ts";
import { glowGeo, hexGeo, zonesGeo, type SurgeStyle } from "./surgeGeo.ts";

/** Adds, updates and removes the surge layers on any MapLibre map (Pricing and the dashboard). */

const LAYERS: Record<SurgeStyle, string[]> = {
  zones: ["surge-zone-fill", "surge-zone-line", "surge-zone-pulse"],
  glow: ["surge-glow-outer", "surge-glow-inner"],
  hex: ["surge-hex"],
};
const CLICKABLE = ["surge-zone-fill", "surge-glow-inner", "surge-hex"];

const BOLT = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

type State = { pills: maplibregl.Marker[]; pulse: number | null; onZone?: (zoneId: string) => void };
const states = new WeakMap<maplibregl.Map, State>();

/** Call once in the map's load handler. `beforeId` keeps drivers and riders above the surge. */
export function installSurgeLayers(map: maplibregl.Map, onZone?: (zoneId: string) => void, beforeId?: string): void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource("surge-zones", { type: "geojson", data: empty });
  map.addSource("surge-glow", { type: "geojson", data: empty });
  map.addSource("surge-hex", { type: "geojson", data: empty });
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  map.addLayer({ id: "surge-hex", type: "fill-extrusion", source: "surge-hex", layout: { visibility: "none" }, paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.78 } }, before);
  map.addLayer({ id: "surge-glow-outer", type: "circle", source: "surge-glow", layout: { visibility: "none" }, paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, ["*", ["get", "size"], 40], 11, ["*", ["get", "size"], 125], 14, ["*", ["get", "size"], 480]], "circle-blur": 1, "circle-opacity": ["get", "strength"] } }, before);
  map.addLayer({ id: "surge-glow-inner", type: "circle", source: "surge-glow", layout: { visibility: "none" }, paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, ["*", ["get", "size"], 12], 11, ["*", ["get", "size"], 38], 14, ["*", ["get", "size"], 150]], "circle-blur": 0.55, "circle-opacity": ["*", 0.9, ["get", "strength"]] } }, before);
  map.addLayer({ id: "surge-zone-fill", type: "fill", source: "surge-zones", layout: { visibility: "none" }, paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } }, before);
  map.addLayer({ id: "surge-zone-line", type: "line", source: "surge-zones", layout: { visibility: "none", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "selected"], 4, ["==", ["get", "source"], "manual"], 3, 1.6], "line-opacity": 0.9 } }, before);
  map.addLayer({ id: "surge-zone-pulse", type: "line", source: "surge-zones", filter: ["==", ["get", "source"], "smart"], layout: { visibility: "none", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 9, "line-blur": 4, "line-opacity": 0.4 } }, before);
  const state: State = { pills: [], pulse: null, onZone };
  states.set(map, state);
  for (const id of CLICKABLE) {
    map.on("click", id, (event) => {
      const zoneId = event.features?.[0]?.properties?.zoneId;
      if (typeof zoneId === "string") states.get(map)?.onZone?.(zoneId);
    });
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
  // Smart surge borders breathe softly so they read as "automatic, live".
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!reduced) {
    const tick = () => {
      if (!states.has(map) || !map.getLayer("surge-zone-pulse")) return;
      const t = (performance.now() % 2400) / 2400;
      map.setPaintProperty("surge-zone-pulse", "line-opacity", 0.15 + 0.45 * Math.sin(t * Math.PI));
      state.pulse = window.setTimeout(() => requestAnimationFrame(tick), 80);
    };
    tick();
  }
  map.once("remove", () => {
    if (state.pulse) window.clearTimeout(state.pulse);
    for (const pill of state.pills) pill.remove();
    states.delete(map);
  });
}

function pillElement(row: ZoneSurge, selected: boolean, onZone?: (zoneId: string) => void): HTMLElement {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.command = "admin.pricing.zone";
  element.className = `surge-pill lvl-${row.level}${selected ? " selected" : ""}${row.source === "smart" ? " smart" : ""}`;
  const icon = row.source === "manual" ? BOLT : row.source === "scheduled" ? CLOCK : "";
  // C-27: the zone name and numbers go in as text, never as HTML (names will come from the zone editor and the
  // API). Only the fixed icon markup of this file is parsed.
  if (icon) {
    const holder = document.createElement("template");
    holder.innerHTML = icon;
    element.append(holder.content);
  }
  const level = document.createElement("b");
  level.textContent = row.multiplier > 1 ? `×${row.multiplier.toFixed(1)}` : "×1.0";
  const name = document.createElement("span");
  name.textContent = row.name;
  element.append(level, name);
  element.setAttribute("aria-label", `${row.name}: ${row.multiplier > 1 ? `surge ×${row.multiplier.toFixed(1)}, ${row.source}` : "no surge"}`);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onZone?.(row.zoneId);
  });
  return element;
}

export function updateSurgeLayers(map: maplibregl.Map, rows: readonly ZoneSurge[], style: SurgeStyle, shown: boolean, selectedId: string | null = null, onZone?: (zoneId: string) => void): void {
  const state = states.get(map);
  if (!state) return;
  state.onZone = onZone;
  (map.getSource("surge-zones") as GeoJSONSource | undefined)?.setData(zonesGeo(shown && style === "zones" ? rows : [], selectedId));
  (map.getSource("surge-glow") as GeoJSONSource | undefined)?.setData(glowGeo(shown && style === "glow" ? rows : []));
  (map.getSource("surge-hex") as GeoJSONSource | undefined)?.setData(hexGeo(shown && style === "hex" ? rows : []));
  for (const [key, ids] of Object.entries(LAYERS)) {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", shown && key === style ? "visible" : "none");
  }
  for (const pill of state.pills) pill.remove();
  state.pills = shown
    ? rows.filter((row) => row.multiplier > 1 || row.zoneId === selectedId || style === "zones").map((row) => new maplibregl.Marker({ element: pillElement(row, row.zoneId === selectedId, onZone), anchor: "center" }).setLngLat([row.center[1], row.center[0]]).addTo(map))
    : [];
}

/** Hexagons read best tilted; the other styles stay flat. */
export function surgePitch(map: maplibregl.Map, style: SurgeStyle, shown: boolean): void {
  const pitch = shown && style === "hex" ? 48 : 0;
  if (Math.abs(map.getPitch() - pitch) > 1) map.easeTo({ pitch, duration: 700 });
}
