import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../ui/maplibreWorker";
import { baseMapStyle } from "../ui/mapStyle";
import type { Market } from "../markets/markets";
import { tr } from "../i18n";

const STYLE = baseMapStyle();

function shapes(point: [number, number] | null, ring: readonly [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (ring.length >= 3) features.push({ type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [[...ring.map(([lat, lng]) => [lng, lat]), [ring[0]![1], ring[0]![0]]]] } });
  if (point) features.push({ type: "Feature", properties: { kind: "pin" }, geometry: { type: "Point", coordinates: [point[1], point[0]] } });
  return { type: "FeatureCollection", features };
}

/**
 * v0.18.6 (owner G4-F6): click the map to put the event's pin at the exact place where the drivers' event icon will
 * stand. The optional area is shown around it. The latitude and longitude fields next to it do the same.
 */
export function PointMap({ market, point, ring, onPick }: { market: Market; point: [number, number] | null; ring: readonly [number, number][]; onPick: (at: [number, number]) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ point, ring });
  latest.current = { point, ring };

  useEffect(() => {
    if (!host.current) return;
    let map: maplibregl.Map;
    try {
      const start = latest.current.point ?? market.center;
      map = new maplibregl.Map({ container: host.current, style: STYLE, center: [start[1], start[0]], zoom: latest.current.point ? 14 : market.zoom + 0.6, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("style.load", () => {
      map.addSource("event", { type: "geojson", data: shapes(latest.current.point, latest.current.ring) });
      map.addLayer({ id: "event-area", type: "fill", source: "event", filter: ["==", ["get", "kind"], "area"], paint: { "fill-color": "#b8860b", "fill-opacity": 0.15 } });
      map.addLayer({ id: "event-edge", type: "line", source: "event", filter: ["==", ["get", "kind"], "area"], paint: { "line-color": "#b8860b", "line-width": 2 } });
      map.addLayer({ id: "event-pin", type: "circle", source: "event", filter: ["==", ["get", "kind"], "pin"], paint: { "circle-radius": 9, "circle-color": "#b8860b", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      setReady(true);
    });
    map.on("click", (event) => pick.current([Math.round(event.lngLat.lat * 1e6) / 1e6, Math.round(event.lngLat.lng * 1e6) / 1e6]));
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [market]);

  useEffect(() => {
    const source = mapRef.current?.getSource("event") as GeoJSONSource | undefined;
    if (ready && source) source.setData(shapes(point, ring));
  }, [ready, point, ring]);

  if (failed) return <p className="dx-calm">{tr("The map could not load. Type the latitude and longitude instead.")}</p>;
  return <div ref={host} className="dx-point-map" data-testid="event-point-map" aria-label={tr("Click the map to put the event's pin")} style={{ height: 280, borderRadius: 12, overflow: "hidden" }} />;
}
