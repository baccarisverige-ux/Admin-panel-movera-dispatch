import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDashboardAccess } from "./access";
import { Link } from "react-router";
import { Clock, UserRound, X } from "lucide-react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Market } from "../markets/markets";
import { zoneById } from "../markets/markets";
import { DriverPanel, type DriverInfo } from "./DriverPanel";
import { LIVE_STATES, type LiveDriver, type LiveState } from "./live";
import type { LiveTrip } from "./liveTrip";
import type { RideRequest } from "./riders";
import type { ZoneBalance } from "./insights";
import type { ZoneSurge } from "../pricing/surge";
import type { SurgeStyle } from "../pricing/surgeGeo";
import { installSurgeLayers, updateSurgeLayers } from "../pricing/surgeLayers";
import { along, type LatLng } from "./route";
import { WaybillDialog } from "./TripCard";
import { useEscape } from "../ui/useEscape";

const STYLE = {
  version: 8 as const,
  sources: {
    base: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "base", type: "raster" as const, source: "base" }],
};

export const STATE_COLOR: Record<LiveState, string> = {
  free: "#0ca30c",
  pickup: "#eda100",
  trip: "#2a78d6",
  stale: "#898781",
  sos: "#d03b3b",
};

type Props = {
  drivers: LiveDriver[];
  market: Market;
  zones: string[];
  hidden: Set<LiveState>;
  withScope: (path: string) => string;
  /** Driver to zoom to and open, from a "See on map" link. */
  focusId?: string | null;
  tripFor?: (driver: LiveDriver) => LiveTrip | null;
  infoFor?: (driverId: string) => DriverInfo | null;
  /** Riders waiting for a driver, drawn as pink pins. */
  requests?: RideRequest[];
  showRequests?: boolean;
  /** Open a waiting rider from outside the map (the Live riders list). */
  focusRequest?: { id: string; nonce: number } | null;
  renderAssign?: (request: RideRequest) => ReactNode;
  /** Called when the admin clicks a waiting rider on the map (Dispatch: opens the assign panel, Q13). */
  onRequestOpen?: (tripId: string) => void;
  /** Supply vs demand per zone, drawn as coloured circles when shown. */
  balance?: ZoneBalance[];
  showBalance?: boolean;
  /** Surge per zone, drawn in the style the admin picked when the surge layer is on. */
  surge?: ZoneSurge[];
  surgeShown?: boolean;
  surgeStyle?: SurgeStyle;
  onSurgeZone?: (zoneId: string) => void;
  /** Driver bonus areas, drawn in orange with a label, when shown. */
  bonusAreas?: BonusMapArea[];
  bonusShown?: boolean;
};

export type BonusMapArea = { id: string; label: string; live: boolean; rings: [number, number][][] };

function bonusGeo(areas: readonly BonusMapArea[], shown: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: (shown ? areas : []).flatMap((area) => area.rings.filter((ring) => ring.length >= 3).map((ring) => ({
      type: "Feature" as const,
      properties: { id: area.id, live: area.live ? 1 : 0 },
      geometry: { type: "Polygon" as const, coordinates: [[...ring.map(([lat, lng]) => [lng, lat]), [ring[0]![1], ring[0]![0]]]] },
    }))),
  };
}

const LEVEL_COLOR = { ok: "#0ca30c", tight: "#eda100", short: "#d03b3b" };

function balanceGeo(rows: readonly ZoneBalance[], shown: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: (shown ? rows : []).map((row) => ({
      type: "Feature" as const,
      properties: { color: LEVEL_COLOR[row.level], label: `${row.waiting}/${row.free}` },
      geometry: { type: "Point" as const, coordinates: [row.center[1], row.center[0]] },
    })),
  };
}

function requestGeo(requests: readonly RideRequest[], shown: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: (shown ? requests : []).map((request) => ({
      type: "Feature" as const,
      properties: { id: request.tripId, long: request.waitingMin > 5 },
      geometry: { type: "Point" as const, coordinates: [request.at[1], request.at[0]] },
    })),
  };
}

const ROUTE_COLOR = { done: "#9aa3a8", left: "#2a78d6", approach: "#d9730d", upcoming: "#2a78d6", next: "#6250d6" };

function line(kind: keyof typeof ROUTE_COLOR, points: LatLng[]) {
  return { type: "Feature" as const, properties: { kind }, geometry: { type: "LineString" as const, coordinates: points.map(([lat, lng]) => [lng, lat]) } };
}

/** Route lines for one driver: driven part grey, the rest blue, the way to the pickup orange, the next pickup violet. */
function routeGeo(driver: LiveDriver | null, trip: LiveTrip | null) {
  const features: ReturnType<typeof line>[] = [];
  if (driver?.route && trip) {
    const { route, progress } = driver;
    if (trip.phase === "to_pickup") {
      const at = along(route.approach, progress);
      features.push(line("done", [...route.approach.slice(0, at.index + 1), at.point]));
      features.push(line("approach", [at.point, ...route.approach.slice(at.index + 1)]));
      features.push(line("upcoming", route.path));
    } else {
      const at = along(route.path, progress);
      features.push(line("done", [...route.path.slice(0, at.index + 1), at.point]));
      features.push(line("left", [at.point, ...route.path.slice(at.index + 1)]));
    }
    if (trip.next) features.push(line("next", [route.dropoff, trip.next.stop.at]));
  }
  return { type: "FeatureCollection" as const, features };
}

function pin(letter: string, className: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `route-pin ${className}`;
  element.textContent = letter;
  element.setAttribute("aria-hidden", "true");
  return element;
}

function geo(drivers: LiveDriver[], hidden: Set<LiveState>) {
  return {
    type: "FeatureCollection" as const,
    features: drivers
      .filter((driver) => !hidden.has(driver.state))
      .map((driver) => ({
        type: "Feature" as const,
        properties: { id: driver.id, state: driver.state, color: STATE_COLOR[driver.state] },
        geometry: { type: "Point" as const, coordinates: [driver.lng, driver.lat] },
      })),
  };
}

/** Live drivers on a MapLibre map, coloured by state; click a driver for details. */
export function DriversMap({ drivers, market, zones, hidden, withScope, focusId = null, tripFor, infoFor, requests = [], showRequests = true, focusRequest = null, renderAssign, onRequestOpen, balance = [], showBalance = false, surge = [], surgeShown = false, surgeStyle = "zones", onSurgeZone, bonusAreas = [], bonusShown = false }: Props) {
  const access = useDashboardAccess();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ drivers, hidden, requests, showRequests, balance, showBalance, bonusAreas, bonusShown });
  const bonusPins = useRef<maplibregl.Marker[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeShown, setRouteShown] = useState(true);
  const [following, setFollowing] = useState(false);
  const [waybillOpen, setWaybillOpen] = useState(false);
  const surgeClick = useRef(onSurgeZone);
  surgeClick.current = onSurgeZone;
  const requestOpen = useRef(onRequestOpen);
  requestOpen.current = onRequestOpen;
  const pins = useRef<maplibregl.Marker[]>([]);
  latest.current = { drivers, hidden, requests, showRequests, balance, showBalance, bonusAreas, bonusShown };

  function select(id: string | null) {
    setSelectedId(id);
    if (id) setRequestId(null);
    setRouteShown(true);
    setFollowing(false);
    setWaybillOpen(false);
  }

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: node, style: STYLE, center: [market.center[1], market.center[0]], zoom: market.zoom, attributionControl: { compact: true } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      installSurgeLayers(map, (zoneId) => surgeClick.current?.(zoneId));
      map.addSource("bonus-areas", { type: "geojson", data: bonusGeo(latest.current.bonusAreas, latest.current.bonusShown) });
      map.addLayer({ id: "bonus-fill", type: "fill", source: "bonus-areas", paint: { "fill-color": "#f2994a", "fill-opacity": ["case", ["==", ["get", "live"], 1], 0.34, 0.16] } });
      map.addLayer({ id: "bonus-line", type: "line", source: "bonus-areas", paint: { "line-color": "#e36414", "line-width": ["case", ["==", ["get", "live"], 1], 3, 1.5], "line-dasharray": ["case", ["==", ["get", "live"], 1], ["literal", [1, 0]], ["literal", [3, 2]]] } });
      map.addSource("balance", { type: "geojson", data: balanceGeo(latest.current.balance, latest.current.showBalance) });
      map.addLayer({
        id: "balance",
        type: "circle",
        source: "balance",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 18, 11, 46, 14, 120],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.16,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.6,
        },
      });
      map.addSource("drivers", { type: "geojson", data: geo(latest.current.drivers, latest.current.hidden) });
      map.addSource("trip-route", { type: "geojson", data: routeGeo(null, null) });
      const routeLayer = (id: string, kinds: string[], dashed: boolean, width: number) => map.addLayer({
        id,
        type: "line",
        source: "trip-route",
        filter: ["in", ["get", "kind"], ["literal", kinds]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "kind"], "done", ROUTE_COLOR.done, "approach", ROUTE_COLOR.approach, "next", ROUTE_COLOR.next, ROUTE_COLOR.left],
          "line-width": width,
          ...(dashed ? { "line-dasharray": [1.5, 1.6] } : {}),
        },
      });
      routeLayer("route-solid", ["done", "left"], false, 5);
      routeLayer("route-dashed", ["approach", "upcoming", "next"], true, 4);
      map.addSource("requests", { type: "geojson", data: requestGeo(latest.current.requests, latest.current.showRequests) });
      map.addLayer({
        id: "request-halo",
        type: "circle",
        source: "requests",
        paint: { "circle-radius": 13, "circle-color": ["case", ["get", "long"], "#d03b3b", "#e87ba4"], "circle-opacity": 0.22 },
      });
      map.addLayer({
        id: "requests",
        type: "circle",
        source: "requests",
        paint: { "circle-radius": 6, "circle-color": ["case", ["get", "long"], "#d03b3b", "#d55181"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      map.on("click", "requests", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          setSelectedId(null);
          setRequestId(id);
          requestOpen.current?.(id);
        }
      });
      map.on("mouseenter", "requests", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "requests", () => { map.getCanvas().style.cursor = ""; });
      map.addLayer({
        id: "sos-halo",
        type: "circle",
        source: "drivers",
        filter: ["==", ["get", "state"], "sos"],
        paint: { "circle-radius": 16, "circle-color": STATE_COLOR.sos, "circle-opacity": 0.22 },
      });
      map.addLayer({
        id: "drivers",
        type: "circle",
        source: "drivers",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 13, 7],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.on("click", "drivers", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") select(id);
      });
      map.on("mouseenter", "drivers", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "drivers", () => { map.getCanvas().style.cursor = ""; });
      setReady(true);
    });
    map.on("error", () => undefined);
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [market]);

  useEffect(() => {
    const source = mapRef.current?.getSource("drivers") as GeoJSONSource | undefined;
    if (ready && source) source.setData(geo(drivers, hidden));
  }, [drivers, hidden, ready]);

  const bonusKey = bonusShown ? JSON.stringify(bonusAreas.map((area) => [area.id, area.label, area.live, area.rings.length])) : "";
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("bonus-areas") as GeoJSONSource | undefined;
    if (!ready || !map || !source) return;
    source.setData(bonusGeo(bonusAreas, bonusShown));
    bonusPins.current.forEach((marker) => marker.remove());
    bonusPins.current = [];
    if (!bonusShown) return;
    for (const area of bonusAreas) {
      const ring = area.rings[0];
      if (!ring?.length) continue;
      const element = document.createElement("div");
      element.className = area.live ? "bonus-pin live" : "bonus-pin";
      element.textContent = area.label;
      const lat = ring.reduce((sum, [value]) => sum + value, 0) / ring.length;
      const lng = ring.reduce((sum, [, value]) => sum + value, 0) / ring.length;
      bonusPins.current.push(new maplibregl.Marker({ element, anchor: "center" }).setLngLat([lng, lat]).addTo(map));
    }
  }, [bonusKey, ready]);

  useEffect(() => {
    const source = mapRef.current?.getSource("balance") as GeoJSONSource | undefined;
    if (ready && source) source.setData(balanceGeo(balance, showBalance));
  }, [balance, showBalance, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    updateSurgeLayers(map, surge, surgeStyle, surgeShown, null, (zoneId) => surgeClick.current?.(zoneId));
  }, [surge, surgeStyle, surgeShown, ready]);

  useEffect(() => {
    const source = mapRef.current?.getSource("requests") as GeoJSONSource | undefined;
    if (ready && source) source.setData(requestGeo(requests, showRequests));
  }, [requests, showRequests, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusRequest) return;
    const target = latest.current.requests.find((request) => request.tripId === focusRequest.id);
    if (!target) return;
    setSelectedId(null);
    setRequestId(target.tripId);
    map.flyTo({ center: [target.at[1], target.at[0]], zoom: 14.5, duration: 900 });
    host.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequest, ready]);

  const zoneKey = zones.join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const centers = (zoneKey ? zoneKey.split(",") : []).map((id) => zoneById(id)?.center).filter((center): center is [number, number] => Boolean(center));
    if (!centers.length) {
      map.easeTo({ center: [market.center[1], market.center[0]], zoom: market.zoom, duration: 600 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const [lat, lng] of centers) bounds.extend([lng, lat]);
    map.fitBounds(bounds, { padding: 70, maxZoom: 13.5, duration: 600 });
  }, [zoneKey, market, ready]);

  const focused = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusId || focused.current === focusId) return;
    const target = latest.current.drivers.find((driver) => driver.id === focusId);
    if (!target) return;
    focused.current = focusId;
    select(focusId);
    map.flyTo({ center: [target.lng, target.lat], zoom: 14.5, duration: 900 });
    host.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, ready, drivers]);

  const selected = drivers.find((driver) => driver.id === selectedId) ?? null;
  const request = requestId ? requests.find((item) => item.tripId === requestId) ?? null : null;
  const trip = selected && tripFor ? tripFor(selected) : null;
  const info = selected && infoFor ? infoFor(selected.id) : null;
  // Escape closes the rider panel like its close button (the driver panel handles its own).
  useEscape(() => setRequestId(null), Boolean(request && !selected));

  // Draw or clear the selected driver's route and its A / B / next pins.
  const routeKey = selected && trip && routeShown ? `${selected.id}:${selected.progress.toFixed(3)}:${trip.next?.id ?? ""}` : "";
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("trip-route") as GeoJSONSource | undefined;
    if (!map || !ready || !source) return;
    for (const marker of pins.current) marker.remove();
    pins.current = [];
    if (!routeKey || !selected?.route || !trip) {
      source.setData(routeGeo(null, null));
      return;
    }
    source.setData(routeGeo(selected, trip));
    const add = (at: LatLng, letter: string, className: string) => pins.current.push(new maplibregl.Marker({ element: pin(letter, className), anchor: "bottom" }).setLngLat([at[1], at[0]]).addTo(map));
    add(selected.route.pickup, "A", "pin-a");
    add(selected.route.dropoff, "B", "pin-b");
    if (trip.next) add(trip.next.stop.at, "N", "pin-next");
  }, [routeKey, ready]);

  // Fit the whole trip once when a route is first shown for a driver.
  const fitted = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected?.route || !trip || !routeShown || following) return;
    if (fitted.current === selected.id) return;
    fitted.current = selected.id;
    const bounds = new maplibregl.LngLatBounds();
    for (const [lat, lng] of [...selected.route.approach, ...selected.route.path, ...(trip.next ? [trip.next.stop.at] : [])]) bounds.extend([lng, lat]);
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 420 }, maxZoom: 15, duration: 800 });
  }, [selected?.id, routeShown, ready, following]);

  // Follow live keeps the selected driver in the middle as they move.
  useEffect(() => {
    if (!following || !selected) return;
    mapRef.current?.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(mapRef.current.getZoom(), 15), duration: 900 });
  }, [following, selected?.lat, selected?.lng]);

  if (failed) {
    return (
      <div className="map-fallback">
        <p>The map needs WebGL, which this browser has turned off. Drivers online:</p>
        <ul>{drivers.slice(0, 12).map((driver) => <li key={driver.id}>{driver.name} · {driver.zoneName} · {LIVE_STATES.find((state) => state.id === driver.state)?.label}</li>)}</ul>
      </div>
    );
  }

  return (
    <div className="drivers-map">
      <div ref={host} className="drivers-map-canvas" data-testid="dashboard-map" />
      {selected ? (
        <DriverPanel
          driver={selected}
          color={STATE_COLOR[selected.state]}
          info={info}
          trip={trip}
          locale={market.locale}
          timeZone={market.timeZone}
          routeShown={routeShown}
          following={following}
          onToggleRoute={() => { fitted.current = ""; setRouteShown((value) => !value); }}
          onToggleFollow={() => setFollowing((value) => !value)}
          onWaybill={() => setWaybillOpen(true)}
          onClose={() => select(null)}
          withScope={withScope}
        />
      ) : null}
      {request && !selected ? (
        <aside className="driver-panel" role="dialog" aria-label={`Rider ${request.rider}`}>
          <div className="driver-panel-head">
            <span className="request-avatar"><UserRound size={22} aria-hidden="true" /></span>
            <div className="driver-panel-title">
              {request.riderId ? <Link to={`/riders/${request.riderId}`}><strong>{request.rider}</strong></Link> : <strong>{request.rider}</strong>}
              <small className="map-popup-code">{request.tripId}</small>
              <span className="map-popup-state"><i style={{ background: request.waitingMin > 5 ? "#d03b3b" : "#d55181" }} />{request.status === "offered" ? `Offered to ${request.offeredTo}` : "Looking for a driver"}</span>
            </div>
            <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label="Close" onClick={() => setRequestId(null)}><X size={14} /></button>
          </div>
          <dl className="driver-panel-facts">
            <div><dt>Pickup zone</dt><dd>{request.zoneName}</dd></div>
            <div><dt>Category</dt><dd>{request.categoryLabel}</dd></div>
            <div><dt>Waiting</dt><dd><Clock size={12} aria-hidden="true" /> {request.waitingMin} min</dd></div>
            <div><dt>Trip</dt><dd>{access.trips ? <Link to={withScope(`/trips/${request.tripId}`)}>{request.tripId}</Link> : request.tripId}</dd></div>
          </dl>
          {renderAssign ? renderAssign(request) : null}
        </aside>
      ) : null}
      {waybillOpen && trip ? <WaybillDialog waybill={trip.waybill} onClose={() => setWaybillOpen(false)} /> : null}
    </div>
  );
}
