import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { ZoneSurge } from "./surge.ts";
import { dotsGeo, glowGeo, hexGeo, pointsGeo, zonesGeo, type SurgeStyle } from "./surgeGeo.ts";

/** Adds, updates and removes the surge layers on any MapLibre map (Pricing, the dashboard and Dispatch). */

const LAYERS: Record<SurgeStyle, string[]> = {
  zones: ["surge-zone-fill", "surge-zone-line", "surge-zone-pulse"],
  glow: ["surge-glow-outer", "surge-glow-inner"],
  hex: ["surge-hex"],
  heat: ["surge-heat", "surge-point-hit"],
  flat: ["surge-hex-flat"],
  label: ["surge-zone-hit", "surge-zone-line", "surge-label"],
  rings: ["surge-rings", "surge-point-hit"],
  bubbles: ["surge-bubbles"],
  dots: ["surge-zone-hit", "surge-dots"],
  soft: ["surge-zone-hit", "surge-soft-glow", "surge-soft-line"],
};
/** Layers a click on the map reads the zone from, one or more in every style. */
export const CLICKABLE = ["surge-zone-fill", "surge-glow-inner", "surge-hex", "surge-hex-flat", "surge-point-hit", "surge-zone-hit", "surge-bubbles", "surge-dots", "surge-rings"];
/** Styles that read the zone outlines, the zone centres, the hexagon grid or the dots. */
const USES = {
  zones: new Set<SurgeStyle>(["zones", "label", "dots", "soft"]),
  points: new Set<SurgeStyle>(["heat", "rings", "bubbles", "label"]),
  hex: new Set<SurgeStyle>(["hex", "flat"]),
  dots: new Set<SurgeStyle>(["dots"]),
};

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
  map.addSource("surge-points", { type: "geojson", data: empty });
  map.addSource("surge-dots", { type: "geojson", data: empty });
  // An almost invisible fill: styles that draw no area (label, dots, soft outline) stay clickable inside the zone.
  map.addLayer({ id: "surge-zone-hit", type: "fill", source: "surge-zones", layout: { visibility: "none" }, paint: { "fill-color": "#000", "fill-opacity": 0.01 } }, before);
  map.addLayer({ id: "surge-hex-flat", type: "fill", source: "surge-hex", layout: { visibility: "none" }, paint: { "fill-color": ["get", "color"], "fill-opacity": ["*", 0.7, ["get", "opacity"]], "fill-outline-color": "rgba(255,255,255,0.6)" } }, before);
  map.addLayer({ id: "surge-heat", type: "heatmap", source: "surge-points", layout: { visibility: "none" }, paint: {
    "heatmap-weight": ["get", "weight"],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 1, 14, 2.4],
    "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, 30, 11, 70, 14, 260],
    "heatmap-opacity": 0.78,
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(27,175,122,0)", 0.15, "rgba(27,175,122,0.35)", 0.35, "#f2c94c", 0.6, "#f2994a", 0.8, "#e34948", 1, "#7b3fe4"],
  } }, before);
  map.addLayer({ id: "surge-point-hit", type: "circle", source: "surge-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, 10, 11, 28, 14, 110], "circle-color": "#000", "circle-opacity": 0.01 } }, before);
  map.addLayer({ id: "surge-rings", type: "circle", source: "surge-points", filter: [">", ["get", "weight"], 0.05], layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, ["*", ["get", "size"], 14], 11, ["*", ["get", "size"], 40], 14, ["*", ["get", "size"], 150]], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 3, "circle-stroke-opacity": 0.8 } }, before);
  map.addLayer({ id: "surge-bubbles", type: "circle", source: "surge-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, ["*", ["get", "size"], 9], 11, ["*", ["get", "size"], 24], 14, ["*", ["get", "size"], 90]], "circle-color": ["get", "color"], "circle-opacity": 0.55, "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.5 } }, before);
  map.addLayer({ id: "surge-dots", type: "circle", source: "surge-dots", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 12, 3.2, 15, 5], "circle-color": ["get", "color"], "circle-opacity": 0.85 } }, before);
  map.addLayer({ id: "surge-soft-glow", type: "line", source: "surge-zones", layout: { visibility: "none", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 14, "line-blur": 10, "line-opacity": 0.55 } }, before);
  map.addLayer({ id: "surge-soft-line", type: "line", source: "surge-zones", layout: { visibility: "none", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 1.4, "line-opacity": 0.9 } }, before);
  // "×1.4" written on the map needs a font (glyphs). A base map without glyphs gets the map pills instead.
  if (map.getStyle()?.glyphs) {
    map.addLayer({ id: "surge-label", type: "symbol", source: "surge-points", layout: { visibility: "none", "text-field": ["get", "label"], "text-size": 14, "text-allow-overlap": true, "text-font": ["Noto Sans Bold", "Open Sans Bold"] }, paint: { "text-color": ["get", "color"], "text-halo-color": "#ffffff", "text-halo-width": 2 } }, before);
  }
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
      // Pulse rings grow and fade, only while that style is on.
      if (map.getLayer("surge-rings") && map.getLayoutProperty("surge-rings", "visibility") === "visible") {
        const grow = 0.55 + t * 0.9;
        map.setPaintProperty("surge-rings", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 8, ["*", ["get", "size"], 14 * grow], 11, ["*", ["get", "size"], 40 * grow], 14, ["*", ["get", "size"], 150 * grow]]);
        map.setPaintProperty("surge-rings", "circle-stroke-opacity", 0.9 * (1 - t));
      }
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
  (map.getSource("surge-zones") as GeoJSONSource | undefined)?.setData(zonesGeo(shown && USES.zones.has(style) ? rows : [], selectedId));
  (map.getSource("surge-glow") as GeoJSONSource | undefined)?.setData(glowGeo(shown && style === "glow" ? rows : []));
  (map.getSource("surge-hex") as GeoJSONSource | undefined)?.setData(hexGeo(shown && USES.hex.has(style) ? rows : []));
  (map.getSource("surge-points") as GeoJSONSource | undefined)?.setData(pointsGeo(shown && USES.points.has(style) ? rows : []));
  (map.getSource("surge-dots") as GeoJSONSource | undefined)?.setData(dotsGeo(shown && USES.dots.has(style) ? rows : []));
  const visible = new Set(shown ? LAYERS[style] : []);
  for (const ids of Object.values(LAYERS)) {
    for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible.has(id) ? "visible" : "none");
  }
  for (const pill of state.pills) pill.remove();
  // Label only: the "×1.4" is the style itself; without a map font the pills write it for every zone.
  const labelled = style === "label" && Boolean(map.getLayer("surge-label"));
  state.pills = shown && !labelled
    ? rows.filter((row) => row.multiplier > 1 || row.zoneId === selectedId || style === "zones" || style === "label").map((row) => new maplibregl.Marker({ element: pillElement(row, row.zoneId === selectedId, onZone), anchor: "center" }).setLngLat([row.center[1], row.center[0]]).addTo(map))
    : [];
}

/** Hexagons read best tilted; the other styles stay flat. */
export function surgePitch(map: maplibregl.Map, style: SurgeStyle, shown: boolean): void {
  const pitch = shown && style === "hex" ? 48 : 0;
  if (Math.abs(map.getPitch() - pitch) > 1) map.easeTo({ pitch, duration: 700 });
}
