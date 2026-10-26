import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Eye, EyeOff, Maximize2, Minimize2 } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseMapStyle } from "../ui/mapStyle";
import type { Market } from "../markets/markets";
import type { Ranked } from "./rules";
import { tr, trn, trx } from "../i18n";

/** A map card with "Hide map" and "Full screen". Esc or Back leaves full screen. */
export function MapPanel({ title, tools, children, note }: { title: string; tools?: ReactNode; children: ReactNode; note?: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    if (!full) return () => window.clearTimeout(timer);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFull(false); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("dx-no-scroll");
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("dx-no-scroll");
    };
  }, [full, hidden]);
  return (
    <section className={full ? "dx-map-panel full" : "dx-map-panel"} aria-label={title}>
      <header className="dx-map-head">
        {full ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setFull(false)}>{trn("{0} Back", <ArrowLeft size={14} aria-hidden="true" />)}</button> : null}
        <b>{trx(title)}</b>
        <span className="dx-map-tools">
          {tools}
          {!full ? (
            <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" aria-pressed={hidden} onClick={() => setHidden((value) => !value)}>
              {hidden ? <>{trn("{0} Show map", <Eye size={14} aria-hidden="true" />)}</> : <>{trn("{0} Hide map", <EyeOff size={14} aria-hidden="true" />)}</>}
            </button>
          ) : null}
          {!hidden ? (
            <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setFull((value) => !value)}>
              {full ? <>{trn("{0} Exit full screen", <Minimize2 size={14} aria-hidden="true" />)}</> : <>{trn("{0} Full screen", <Maximize2 size={14} aria-hidden="true" />)}</>}
            </button>
          ) : null}
        </span>
      </header>
      {hidden ? <p className="dx-map-hidden">{tr("The map is hidden. Everything else still works.")}</p> : <div className="dx-map-body">{children}</div>}
      {note && !hidden ? <div className="dx-map-note">{note}</div> : null}
    </section>
  );
}

const STYLE = baseMapStyle();

function circle(center: [number, number], km: number): [number, number][] {
  const dLat = km / 111.32 / 1.25;
  const dLng = km / (111.32 * 1.25 * Math.cos((center[0] * Math.PI) / 180));
  return Array.from({ length: 49 }, (_, index) => {
    const angle = (2 * Math.PI * index) / 48;
    return [center[1] + Math.cos(angle) * dLng, center[0] + Math.sin(angle) * dLat] as [number, number];
  });
}

function data(pickup: [number, number] | null, ranked: readonly Ranked[], steps: readonly number[], highlight: number) {
  const features: GeoJSON.Feature[] = [];
  if (pickup) {
    steps.forEach((km, index) => features.push({ type: "Feature", properties: { kind: "ring", label: `${km} km`, step: index }, geometry: { type: "Polygon", coordinates: [circle(pickup, km)] } }));
    ranked.slice(0, highlight).filter((row) => !row.out).forEach((row) => features.push({ type: "Feature", properties: { kind: "line" }, geometry: { type: "LineString", coordinates: [[row.driver.lng, row.driver.lat], [pickup[1], pickup[0]]] } }));
    features.push({ type: "Feature", properties: { kind: "pickup", label: tr("Pickup") }, geometry: { type: "Point", coordinates: [pickup[1], pickup[0]] } });
  }
  let place = 0;
  for (const row of ranked) {
    const rank = row.out ? 0 : ++place;
    features.push({ type: "Feature", properties: { kind: "driver", rank, label: rank ? String(rank) : "", state: row.out ? "out" : rank <= highlight ? "top" : "ok", finishing: row.driver.finishing ? 1 : 0 }, geometry: { type: "Point", coordinates: [row.driver.lng, row.driver.lat] } });
  }
  return { type: "FeatureCollection" as const, features };
}

/** Click the map to set a pickup. Drivers are numbered by rank; grey ones cannot take the ride. */
export function TestMap({ market, pickup, ranked, steps, highlight, onPick }: { market: Market; pickup: [number, number] | null; ranked: readonly Ranked[]; steps: readonly number[]; highlight: number; onPick: (at: [number, number]) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const latest = useRef({ pickup, ranked, steps, highlight });
  latest.current = { pickup, ranked, steps, highlight };

  useEffect(() => {
    if (!host.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: host.current, style: STYLE, center: [market.center[1], market.center[0]], zoom: market.zoom + 0.6, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      const now = latest.current;
      map.addSource("test", { type: "geojson", data: data(now.pickup, now.ranked, now.steps, now.highlight) });
      map.addLayer({ id: "rings", type: "line", source: "test", filter: ["==", ["get", "kind"], "ring"], paint: { "line-color": "#6250d6", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.7 } });
      map.addLayer({ id: "ring-fill", type: "fill", source: "test", filter: ["==", ["get", "kind"], "ring"], paint: { "fill-color": "#6250d6", "fill-opacity": 0.04 } });
      map.addLayer({ id: "lines", type: "line", source: "test", filter: ["==", ["get", "kind"], "line"], paint: { "line-color": "#2a78d6", "line-width": 2.5, "line-opacity": 0.8 } });
      map.addLayer({ id: "drivers", type: "circle", source: "test", filter: ["==", ["get", "kind"], "driver"], paint: {
        "circle-radius": ["case", ["==", ["get", "state"], "top"], 11, 7],
        "circle-color": ["case", ["==", ["get", "state"], "out"], "#a3a8ab", ["==", ["get", "state"], "top"], "#2a78d6", "#0ca30c"],
        "circle-stroke-color": ["case", ["==", ["get", "finishing"], 1], "#eda100", "#fff"],
        "circle-stroke-width": 2.5,
      } });
      map.addLayer({ id: "pickup", type: "circle", source: "test", filter: ["==", ["get", "kind"], "pickup"], paint: { "circle-radius": 10, "circle-color": "#e34948", "circle-stroke-color": "#fff", "circle-stroke-width": 4 } });
      setReady(true);
    });
    map.on("click", (event) => pick.current([event.lngLat.lat, event.lngLat.lng]));
    map.getCanvas().style.cursor = "crosshair";
    (window as unknown as { __moveraTestMap?: unknown }).__moveraTestMap = { project: (lat: number, lng: number) => map.project([lng, lat]) };
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [market]);

  useEffect(() => {
    const source = mapRef.current?.getSource("test") as GeoJSONSource | undefined;
    if (ready && source) source.setData(data(pickup, ranked, steps, highlight));
  }, [ready, pickup, ranked, steps, highlight]);

  const pickKey = pickup ? `${pickup[0].toFixed(4)},${pickup[1].toFixed(4)}` : "";
  useEffect(() => {
    if (!ready || !pickup || !mapRef.current) return;
    const map = mapRef.current;
    const widest = steps[steps.length - 1] ?? 5;
    const ring = circle(pickup, widest);
    const bounds = ring.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(ring[0], ring[0]));
    map.fitBounds(bounds, { padding: 30, duration: 600, maxZoom: 15 });
    // Only refit when the pickup or the widest step changes, not on every ranking update.
  }, [ready, pickKey, steps[steps.length - 1]]);

  // Rank numbers on the best drivers, as small labels.
  const markers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    for (const marker of markers.current) marker.remove();
    markers.current = [];
    const map = mapRef.current;
    if (!ready || !map) return;
    ranked.filter((row) => !row.out).slice(0, highlight).forEach((row, index) => {
      const node = document.createElement("span");
      node.className = "dx-rank-pin";
      node.textContent = String(index + 1);
      node.setAttribute("aria-hidden", "true");
      markers.current.push(new maplibregl.Marker({ element: node }).setLngLat([row.driver.lng, row.driver.lat]).addTo(map));
    });
  }, [ready, ranked, highlight]);

  if (failed) return <p className="dx-map-hidden">{tr("The map needs WebGL, which this browser has turned off. Pick a place in the list instead.")}</p>;
  return <div ref={host} className="dx-test-map" data-testid="dispatch-test-map" />;
}
