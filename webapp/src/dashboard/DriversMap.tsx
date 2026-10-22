import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDashboardAccess } from "./access";
import { Link } from "react-router";
import { Clock, UserRound, X } from "lucide-react";
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { baseMapStyle } from "../ui/mapStyle";
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
import { tr, trn, trx } from "../i18n";
import { addMapIcons, CAR_COLOR, carIcon, headingOf, remainingPath, RIDER_COLOR, RIDER_OFFERED_ICON, RIDER_WAITING_ICON } from "./mapIcons";
import type { RideCheck } from "../safety/rideCheck";
import { openRideChecks, RideCheckMapPopup, useDismissedRideChecks } from "../safety/RideCheckMapPopup";
import { MapFocusContext } from "../dispatch/assignContext";
import { RequestState } from "../dispatch/RideProgress";

const STYLE = baseMapStyle();

/** Car colour per driver state: free green, to pickup orange, on trip blue. */
export const STATE_COLOR: Record<LiveState, string> = CAR_COLOR;
/** Rider pin colour: red while looking for a driver, blue once a driver is offered. */
export const REQUEST_COLOR = RIDER_COLOR;

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
  /** Called when the admin clicks a waiting rider on the map, besides opening the pop-up. */
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
  /** A click on a driver bonus area (its fill or its label). */
  onBonusArea?: (id: string) => void;
  /** Drawn on top of the map, e.g. the quick surge and bonus pop-ups. */
  overlay?: ReactNode;
  /** Ride checks to pin on the drivers' cars while they are open; only for admins who may see incidents. */
  rideChecks?: { checks: RideCheck[]; demoShift: number; now: number } | null;
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
      properties: { id: request.tripId, long: request.waitingMin > 5, icon: request.status === "offered" ? RIDER_OFFERED_ICON : RIDER_WAITING_ICON },
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
        properties: { id: driver.id, state: driver.state, color: STATE_COLOR[driver.state], icon: carIcon(driver.state), heading: headingOf(driver) },
        geometry: { type: "Point" as const, coordinates: [driver.lng, driver.lat] },
      })),
  };
}

/** The thin blue line from each car with a rider on board to its drop-off (the selected driver has the full route instead). */
function dropoffGeo(drivers: LiveDriver[], hidden: Set<LiveState>, selectedId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: drivers.flatMap((driver) => {
      if (hidden.has(driver.state) || driver.id === selectedId) return [];
      const path = remainingPath(driver);
      return path && path.length >= 2 ? [line("left", path)] : [];
    }),
  };
}

/** Live drivers on a MapLibre map, coloured by state; click a driver for details. */
export function DriversMap({ drivers, market, zones, hidden, withScope, focusId = null, tripFor, infoFor, requests = [], showRequests = true, focusRequest = null, renderAssign, onRequestOpen, balance = [], showBalance = false, surge = [], surgeShown = false, surgeStyle = "zones", onSurgeZone, bonusAreas = [], bonusShown = false, rideChecks = null, onBonusArea, overlay }: Props) {
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
  const bonusClick = useRef(onBonusArea);
  bonusClick.current = onBonusArea;
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
    // "style.load" rather than "load": the pins, pop-ups and focus work as soon as the style is in, even while the
    // street tiles are still (or never) loading.
    map.on("style.load", async () => {
      await addMapIcons(map);
      if (mapRef.current !== map) return;
      installSurgeLayers(map, (zoneId) => surgeClick.current?.(zoneId));
      map.addSource("bonus-areas", { type: "geojson", data: bonusGeo(latest.current.bonusAreas, latest.current.bonusShown) });
      map.addLayer({ id: "bonus-fill", type: "fill", source: "bonus-areas", paint: { "fill-color": "#f2994a", "fill-opacity": ["case", ["==", ["get", "live"], 1], 0.34, 0.16] } });
      map.addLayer({ id: "bonus-line", type: "line", source: "bonus-areas", paint: { "line-color": "#e36414", "line-width": ["case", ["==", ["get", "live"], 1], 3, 1.5], "line-dasharray": ["case", ["==", ["get", "live"], 1], ["literal", [1, 0]], ["literal", [3, 2]]] } });
      map.on("click", "bonus-fill", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string" && bonusClick.current) bonusClick.current(id);
      });
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
      map.addSource("dropoffs", { type: "geojson", data: dropoffGeo(latest.current.drivers, latest.current.hidden, null) });
      map.addLayer({
        id: "dropoffs",
        type: "line",
        source: "dropoffs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR.left, "line-width": 1.6, "line-opacity": 0.45 },
      });
      map.addSource("requests", { type: "geojson", data: requestGeo(latest.current.requests, latest.current.showRequests) });
      map.addLayer({
        id: "request-halo",
        type: "circle",
        source: "requests",
        filter: ["get", "long"],
        paint: { "circle-radius": 14, "circle-color": RIDER_COLOR.waiting, "circle-opacity": 0.14 },
      });
      map.addLayer({
        id: "requests",
        type: "symbol",
        source: "requests",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 13, 1],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
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
        type: "symbol",
        source: "drivers",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.55, 12, 0.8, 15, 1.05],
          "icon-rotate": ["get", "heading"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
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

  useEffect(() => {
    const source = mapRef.current?.getSource("dropoffs") as GeoJSONSource | undefined;
    if (ready && source) source.setData(dropoffGeo(drivers, hidden, selectedId));
  }, [drivers, hidden, selectedId, ready]);

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
      if (bonusClick.current) element.classList.add("clickable");
      element.addEventListener("click", (event) => {
        if (!bonusClick.current) return;
        event.stopPropagation();
        bonusClick.current(area.id);
      });
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
  // Once a driver accepts, the rider leaves the waiting list: the open pop-up stays, showing who is on the way.
  const lastRequest = useRef<RideRequest | null>(null);
  const found = requestId ? requests.find((item) => item.tripId === requestId) ?? null : null;
  if (found) lastRequest.current = found;
  const request = found ?? (requestId && lastRequest.current?.tripId === requestId ? lastRequest.current : null);
  const mapFocus = useMemo(() => ({
    focusDriver: (driverId: string) => {
      const target = latest.current.drivers.find((driver) => driver.id === driverId);
      select(driverId);
      if (target) mapRef.current?.flyTo({ center: [target.lng, target.lat], zoom: 14.5, duration: 900 });
    },
  }), []);
  const trip = selected && tripFor ? tripFor(selected) : null;
  const info = selected && infoFor ? infoFor(selected.id) : null;
  // Escape closes the rider panel like its close button (the driver panel handles its own).
  useEscape(() => setRequestId(null), Boolean(request && !selected));

  // Ride checks still open on a live trip: a small card pinned to the driver's car.
  const [dismissed, dismiss] = useDismissedRideChecks();
  const driverTrips = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver.tripId])), [drivers]);
  const openChecks = useMemo(() => (rideChecks ? openRideChecks(rideChecks.checks, driverTrips, rideChecks.demoShift, dismissed) : []), [rideChecks, driverTrips, dismissed]);
  const checkMarkers = useRef(new Map<string, maplibregl.Marker>());
  const [checkNodes, setCheckNodes] = useState<Record<string, HTMLElement>>({});
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const keep = new Set(openChecks.map((item) => item.check.id));
    let changed = false;
    for (const [id, marker] of checkMarkers.current) {
      if (keep.has(id)) continue;
      marker.remove();
      checkMarkers.current.delete(id);
      changed = true;
    }
    for (const item of openChecks) {
      const driver = latest.current.drivers.find((row) => row.id === item.driverId);
      if (!driver) continue;
      const marker = checkMarkers.current.get(item.check.id);
      if (marker) {
        marker.setLngLat([driver.lng, driver.lat]);
        continue;
      }
      const element = document.createElement("div");
      element.className = "ride-check-anchor";
      checkMarkers.current.set(item.check.id, new maplibregl.Marker({ element, anchor: "center" }).setLngLat([driver.lng, driver.lat]).addTo(map));
      changed = true;
    }
    if (changed) setCheckNodes(Object.fromEntries([...checkMarkers.current].map(([id, marker]) => [id, marker.getElement()])));
  }, [openChecks, drivers, ready]);
  useEffect(() => () => {
    for (const marker of checkMarkers.current.values()) marker.remove();
    checkMarkers.current.clear();
  }, [market]);

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
        <p>{tr("The map needs WebGL, which this browser has turned off. Drivers online:")}</p>
        <ul>{drivers.slice(0, 12).map((driver) => <li key={driver.id}>{driver.name} · {driver.zoneName} · {trx(LIVE_STATES.find((state) => state.id === driver.state)?.label)}</li>)}</ul>
      </div>
    );
  }

  return (
    <div className="drivers-map">
      <div ref={host} className="drivers-map-canvas" data-testid="dashboard-map" />
      {overlay}
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
        <aside className="driver-panel rider-panel" role="dialog" aria-label={tr("Rider {0}", [request.rider])} data-testid="rider-popup">
          <div className="driver-panel-head">
            <span className="request-avatar"><UserRound size={22} aria-hidden="true" /></span>
            <div className="driver-panel-title">
              {request.riderId ? <Link to={`/riders/${request.riderId}`}><strong>{request.rider}</strong></Link> : <strong>{request.rider}</strong>}
              <small className="map-popup-code">{request.tripId}</small>
              <RequestState request={request} />
            </div>
            <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label={tr("Close")} onClick={() => setRequestId(null)}><X size={14} /></button>
          </div>
          <dl className="driver-panel-facts">
            <div><dt>{tr("Pickup zone")}</dt><dd>{request.zoneName}</dd></div>
            <div><dt>{tr("Category")}</dt><dd>{request.categoryLabel}</dd></div>
            <div><dt>{tr("Waiting")}</dt><dd>{trn("{0} {1} min", <Clock size={12} aria-hidden="true" />, request.waitingMin)}</dd></div>
            <div><dt>{tr("Trip")}</dt><dd>{access.trips ? <Link to={withScope(`/trips/${request.tripId}`)}>{request.tripId}</Link> : request.tripId}</dd></div>
          </dl>
          {renderAssign ? <MapFocusContext.Provider value={mapFocus}>{renderAssign(request)}</MapFocusContext.Provider> : null}
        </aside>
      ) : null}
      {waybillOpen && trip ? <WaybillDialog waybill={trip.waybill} onClose={() => setWaybillOpen(false)} /> : null}
      {rideChecks ? openChecks.map((item) => {
        const node = checkNodes[item.check.id];
        const driver = drivers.find((row) => row.id === item.driverId);
        if (!node || !driver) return null;
        return createPortal(
          <RideCheckMapPopup
            key={item.check.id}
            item={item}
            now={rideChecks.now}
            driverName={driver.name}
            driverPhone={infoFor?.(driver.id)?.phone ?? null}
            openTo={access.trips ? withScope(`/trips/${item.check.tripId}`) : "/alerts"}
            driverTo={access.drivers ? withScope(`/drivers/${driver.id}`) : null}
            onDismiss={() => dismiss(item.check.id)}
          />,
          node,
          item.check.id,
        );
      }) : null}
    </div>
  );
}
