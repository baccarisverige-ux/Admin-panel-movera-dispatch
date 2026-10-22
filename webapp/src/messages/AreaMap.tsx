import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseMapStyle } from "../ui/mapStyle";

const STYLE = baseMapStyle();

function ring(center: [number, number], km: number): [number, number][] {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((center[0] * Math.PI) / 180));
  return Array.from({ length: 49 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 48;
    return [center[1] + Math.cos(angle) * dLng, center[0] + Math.sin(angle) * dLat] as [number, number];
  });
}

function shape(center: [number, number], km: number) {
  return {
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring(center, km)] } },
      { type: "Feature" as const, properties: { kind: "center" }, geometry: { type: "Point" as const, coordinates: [center[1], center[0]] } },
    ],
  };
}

/** The area of a demand message, as the driver sees it on the map. Click to move it. */
export function AreaMap({ center, radiusKm, onPick, label }: { center: [number, number]; radiusKm: number; onPick: (at: [number, number]) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ center, radiusKm });
  latest.current = { center, radiusKm };

  useEffect(() => {
    if (!host.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: host.current, style: STYLE, center: [latest.current.center[1], latest.current.center[0]], zoom: 11, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("area", { type: "geojson", data: shape(latest.current.center, latest.current.radiusKm) });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#e34948", "fill-opacity": 0.14 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#e34948", "line-width": 2 } });
      map.addLayer({ id: "area-center", type: "circle", source: "area", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#e34948", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      setReady(true);
    });
    map.on("click", (event) => pick.current([event.lngLat.lat, event.lngLat.lng]));
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  const key = `${center[0].toFixed(4)},${center[1].toFixed(4)},${radiusKm}`;
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("area") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    source.setData(shape(center, radiusKm));
    const points = ring(center, radiusKm);
    const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
    map.fitBounds(bounds, { padding: 24, duration: 400, maxZoom: 15 });
    // Refit only when the area changes.
  }, [ready, key]);

  if (failed) return <p className="dx-map-hidden">The map needs WebGL, which this browser has turned off. Pick the area in the list instead.</p>;
  return <div ref={host} className="dn-map" role="img" aria-label={label} data-testid="notice-area-map" />;
}
