import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { ringBounds, type MapLocate } from "./supplyDrill";

const SOURCE = "locate-highlight";

/** Shows a map pin target on a MapLibre map: fits a radar zone's outline, centres a zone or a driver, and highlights the area. */
export function showLocate(map: maplibregl.Map, target: Exclude<MapLocate, { kind: "driver" }>): void {
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: `${SOURCE}-fill`, type: "fill", source: SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#4f46e5", "fill-opacity": 0.12 } });
    map.addLayer({ id: `${SOURCE}-line`, type: "line", source: SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#4f46e5", "line-width": 3, "line-dasharray": [2, 1] } });
    map.addLayer({ id: `${SOURCE}-point`, type: "circle", source: SOURCE, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 60, "circle-color": "#4f46e5", "circle-opacity": 0.1, "circle-stroke-color": "#4f46e5", "circle-stroke-width": 2 } });
  }
  const source = map.getSource(SOURCE) as GeoJSONSource;
  if (target.kind === "radar") {
    const ring = target.ring.map(([lat, lng]) => [lng, lat]);
    if (ring.length) ring.push(ring[0]);
    source.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] });
    const box = ringBounds(target.ring);
    if (box) map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 60, duration: 900, maxZoom: 16 });
    return;
  }
  source.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [target.center[1], target.center[0]] } }] });
  map.flyTo({ center: [target.center[1], target.center[0]], zoom: 13.5, duration: 900 });
}
