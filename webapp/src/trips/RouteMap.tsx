import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../ui/maplibreWorker";
import { baseMapStyle } from "../ui/mapStyle";
import type { LatLng } from "../dashboard/route";
import { tr } from "../i18n";

export type MapStop = { kind: "pickup" | "stop" | "dropoff"; label: string; at: LatLng };
export type MapPoint = { id: string; label: string; at: LatLng; tone: "rider" | "driver" | "alert" };

const STYLE = baseMapStyle();
const NO_LINE: readonly LatLng[] = [];

const STOP_COLOR = { pickup: "#1a9256", stop: "#eda100", dropoff: "#c63c3c" };
const POINT_COLOR = { rider: "#6250d6", driver: "#2a78d6", alert: "#e34948" };

function geo(stops: readonly MapStop[], path: readonly LatLng[], approach: readonly LatLng[], points: readonly MapPoint[], driven: readonly LatLng[] = []) {
  const features: GeoJSON.Feature[] = [];
  if (approach.length > 1) features.push({ type: "Feature", properties: { kind: "approach" }, geometry: { type: "LineString", coordinates: approach.map(([lat, lng]) => [lng, lat]) } });
  if (path.length > 1) features.push({ type: "Feature", properties: { kind: "path" }, geometry: { type: "LineString", coordinates: path.map(([lat, lng]) => [lng, lat]) } });
  // BQ-A08: the car's real driven line (GET /admin/trips/{tripId}/trace), drawn over the planned route.
  if (driven.length > 1) features.push({ type: "Feature", properties: { kind: "driven" }, geometry: { type: "LineString", coordinates: driven.map(([lat, lng]) => [lng, lat]) } });
  for (const stop of stops) features.push({ type: "Feature", properties: { kind: "stop", color: STOP_COLOR[stop.kind] }, geometry: { type: "Point", coordinates: [stop.at[1], stop.at[0]] } });
  for (const point of points) features.push({ type: "Feature", properties: { kind: "point", color: POINT_COLOR[point.tone] }, geometry: { type: "Point", coordinates: [point.at[1], point.at[0]] } });
  return { type: "FeatureCollection" as const, features };
}

/** The trip on a real map: the driver's way to the pickup (dashed), the planned ride, the driven line (BQ-A08), the stops and live points. */
export function RouteMap({ stops, path, approach = [], points = [], driven = NO_LINE, label }: { stops: readonly MapStop[]; path: readonly LatLng[]; approach?: readonly LatLng[]; points?: readonly MapPoint[]; driven?: readonly LatLng[]; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ stops, path, approach, points, driven });
  latest.current = { stops, path, approach, points, driven };
  const fitted = useRef(false);

  useEffect(() => {
    if (!host.current) return;
    const first = latest.current;
    const all = [...first.stops.map((stop) => stop.at), ...first.path, ...first.approach, ...first.points.map((point) => point.at)];
    if (!all.length) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: host.current, style: STYLE, center: [all[0][1], all[0][0]], zoom: 12, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // "style.load", not "load": "load" also waits for the base map's TileJSON (tiles.openfreemap.org), so a slow or
    // unreachable tile server kept this map empty. Same as DriversMap.
    map.on("style.load", () => {
      const now = latest.current;
      map.addSource("trip", { type: "geojson", data: geo(now.stops, now.path, now.approach, now.points, now.driven) });
      map.addLayer({ id: "approach", type: "line", source: "trip", filter: ["==", ["get", "kind"], "approach"], paint: { "line-color": "#d9730d", "line-width": 3, "line-dasharray": [1.5, 1.5] } });
      map.addLayer({ id: "path-casing", type: "line", source: "trip", filter: ["==", ["get", "kind"], "path"], paint: { "line-color": "#fff", "line-width": 8 } });
      map.addLayer({ id: "path", type: "line", source: "trip", filter: ["==", ["get", "kind"], "path"], paint: { "line-color": "#2a78d6", "line-width": 4.5 } });
      map.addLayer({ id: "driven-casing", type: "line", source: "trip", filter: ["==", ["get", "kind"], "driven"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 7 } });
      map.addLayer({ id: "driven", type: "line", source: "trip", filter: ["==", ["get", "kind"], "driven"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#1f2937", "line-width": 4 } });
      map.addLayer({ id: "stops", type: "circle", source: "trip", filter: ["==", ["get", "kind"], "stop"], paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      map.addLayer({ id: "points", type: "circle", source: "trip", filter: ["==", ["get", "kind"], "point"], paint: { "circle-radius": 10, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      fitted.current = now.driven.length > 1;
      const bounds = [...all, ...now.driven].reduce((box, [lat, lng]) => box.extend([lng, lat]), new maplibregl.LngLatBounds([all[0][1], all[0][0]], [all[0][1], all[0][0]]));
      map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 15 });
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("trip") as GeoJSONSource | undefined;
    if (ready && source) source.setData(geo(stops, path, approach, points, driven));
    // The trace comes after the map: fit once more when the driven line first shows, so all of it is in view.
    const map = mapRef.current;
    if (ready && map && driven.length > 1 && !fitted.current) {
      fitted.current = true;
      const all = [...stops.map((stop) => stop.at), ...path, ...approach, ...driven];
      const bounds = all.reduce((box, [lat, lng]) => box.extend([lng, lat]), new maplibregl.LngLatBounds([all[0][1], all[0][0]], [all[0][1], all[0][0]]));
      map.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 15 });
    }
  }, [ready, stops, path, approach, points, driven]);

  if (failed) return <p className="dx-map-hidden">{tr("The map needs WebGL, which this browser has turned off. The stops are listed below.")}</p>;
  return <div ref={host} className="op-map" role="img" aria-label={label} />;
}
