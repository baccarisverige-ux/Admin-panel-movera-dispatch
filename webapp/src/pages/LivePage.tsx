import { useEffect, useMemo, useState } from "react";
import { useFreeDriverIds } from "../dispatch/RideProgress";
import { Link } from "react-router";
import { useDrivers, useRecords, useSlice, useTrips } from "../api/hooks";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { market } from "../markets/markets";
import {
  liveMarkers,
  moveMarker,
  offerBlock,
  offersFor,
  projectMarker,
  type LiveKind,
  type LiveMarker,
} from "../trips/present";
import { CommandButton } from "../ui/CommandButton";
import { stockholmZones } from "../zones/releases";
import { ZoneCanvas } from "./ZoneCanvas";

const LAYERS: { id: LiveKind | "stale"; label: string }[] = [
  { id: "driver", label: "Online drivers" },
  { id: "stale", label: "Stale positions" },
  { id: "trip", label: "Trips" },
  { id: "request", label: "Open requests" },
  { id: "queue", label: "Airport queue" },
  { id: "boost", label: "Boosts" },
];

function visible(marker: LiveMarker, layers: Record<string, boolean>): boolean {
  if (marker.kind === "driver" && marker.stale) return layers.stale;
  if (marker.kind === "driver") return layers.driver;
  return layers[marker.kind];
}

export function LivePage() {
  return (
    <>
      <LiveBoard />
      <ZoneCanvas
        zones={stockholmZones()}
        selectedId="op-norrmalm"
        mode="select"
        layers={{ drivers: true, trips: true, requests: true, demandHour: false, demand7d: false, pickups: true, queue: true, boosts: true, events: true, gaps: false, before: false, districts: false, satellite: false }}
        focus={null}
        selectionNonce={0}
        onDrawn={() => undefined}
        onEdited={() => undefined}
      />
      <DispatchLink />
    </>
  );
}

function LiveBoard() {
  const drivers = useDrivers(null);
  const trips = useTrips(null);
  const vehicles = useRecords("vehicles", null);
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offerDriverId, setOfferDriverId] = useState("");
  const [notice, setNotice] = useState("");
  const [layers, setLayers] = useState<Record<string, boolean>>({
    driver: true,
    stale: true,
    trip: true,
    request: true,
    queue: true,
    boost: true,
  });

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1200);
    return () => window.clearInterval(id);
  }, []);

  const markers = liveMarkers(drivers.data ?? [], trips.data ?? []).map((marker) => moveMarker(marker, tick));
  const selected = markers.find((marker) => marker.id === selectedId) ?? null;
  const selectedTripId = selected?.kind === "request"
    ? selected.id.replace(/^req-/, "")
    : selected?.kind === "trip"
      ? selected.id
      : null;
  const selectedTrip = selectedTripId ? (trips.data ?? []).find((trip) => trip.id === selectedTripId) ?? null : null;
  // Only drivers who can take an offer now: the server refuses an exclusive offer to a busy driver.
  const free = useFreeDriverIds();
  const candidates = useMemo(
    () => selectedTrip ? offersFor(selectedTrip, drivers.data ?? [], vehicles.data ?? []).filter((driver) => !free || free.has(driver.id)) : [],
    [drivers.data, selectedTrip, vehicles.data, free],
  );
  const chosen = candidates.some((item) => item.id === offerDriverId) ? offerDriverId : candidates[0]?.id ?? "";
  const selectedOfferWhy = selectedTrip
    ? offerBlock(selectedTrip.status) ?? (candidates.length === 0 ? "No eligible driver with a matching eligible vehicle is available." : null)
    : "Select an open request.";

  const online = markers.filter((marker) => marker.kind === "driver" && !marker.stale);
  const stale = markers.filter((marker) => marker.kind === "driver" && marker.stale);
  const tripMarks = markers.filter((marker) => marker.kind === "trip");
  const requests = markers.filter((marker) => marker.kind === "request");
  const queue = markers.filter((marker) => marker.kind === "queue");
  const boosts = markers.filter((marker) => marker.kind === "boost");
  const openAll = (trips.data ?? []).filter((trip) => trip.status === "requested" || trip.status === "searching").length;
  const activeAll = (trips.data ?? []).filter((trip) =>
    ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"].includes(trip.status),
  ).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Live map</h2>
          <p>OpenStreetMap. Positions refresh in the demo. Stale markers stay grey and cannot be selected as dispatch candidates.</p>
        </div>
      </div>

      <p className="state-line" data-live="counts" data-testid="live-tick" data-tick={tick}>
        Drivers {drivers.data?.length ?? 0}. Trips in the book {trips.data?.length ?? 0}. Online {online.length}. Stale {stale.length}. Trips on the map {tripMarks.length} of {activeAll} active. Open requests plotted {requests.length} of {openAll}. Airport queue {queue.length}. Boosts {boosts.length}.
        {notice ? ` ${notice}` : ""}
      </p>

      <div className="actions" aria-label="Map layers">
        {LAYERS.map((layer) => (
          <label key={layer.id} className="check-row">
            <input
              type="checkbox"
              checked={layers[layer.id] ?? false}
              onChange={() => setLayers((current) => ({ ...current, [layer.id]: !current[layer.id] }))}
            />
            {layer.label}
          </label>
        ))}
      </div>

      <div className="split">
        <div className="ops-map" data-testid="live-map">
          {markers.filter((marker) => marker.onMap && visible(marker, layers)).map((marker) => {
            const point = projectMarker(marker.lat, marker.lng);
            return (
              <button
                key={marker.id}
                data-command="admin.live.focus"
                type="button"
                className={`ops-marker ${marker.kind}${marker.stale ? " stale" : ""}`}
                style={{ left: point.left, top: point.top }}
                data-lat={marker.lat.toFixed(6)}
                data-stale={marker.stale ? "yes" : "no"}
                title={marker.stale ? `${marker.name}, last seen ${marker.lastSeen}` : marker.name}
                onClick={() => {
                  setSelectedId(marker.id);
                  setOfferDriverId("");
                }}
              >
                <span className="sr-only">{marker.name}</span>
              </button>
            );
          })}
        </div>

        <aside className="panel" data-testid="live-panel">
          <h3>Selected</h3>
          {selected ? (
            <>
              <p><strong>{selected.name}</strong></p>
              <p>{selected.stale ? `Last seen ${selected.lastSeen}` : "Live position"}</p>
              <p>{selected.kind} · {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</p>
              <Link to={selected.href}>Open page</Link>

              {selected.kind === "request" && selectedTrip ? (
                <div data-testid="quick-dispatch">
                  <h4>Quick dispatch</h4>
                  <p>{selectedOfferWhy ?? `${candidates.length} eligible drivers with eligible matching vehicles.`}</p>
                  <label>
                    Driver
                    <select
                      aria-label="Quick dispatch driver"
                      value={chosen}
                      disabled={Boolean(selectedOfferWhy)}
                      onChange={(event) => setOfferDriverId(event.target.value)}
                    >
                      {candidates.length === 0 ? <option value="">No eligible driver</option> : null}
                      {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}
                    </select>
                  </label>
                  {/* A real exclusive offer (the assign tool): offer record, the money added for the driver, countdown. */}
                  <CommandButton
                    command="admin.trip.assign"
                    className="primary-btn"
                    type="button"
                    targetId={selectedTrip.id}
                    confirmTarget={false}
                    entityState={selectedTrip.status}
                    scope={selectedTrip.zoneId}
                    collection="trips"
                    before={selectedTrip.status}
                    after={`exclusive offer to ${chosen}`}
                    patch={{ status: "offered" }}
                    value={{ driverId: chosen }}
                    disabled={Boolean(selectedOfferWhy)}
                    title={selectedOfferWhy ?? undefined}
                    onDone={() => {
                      setNotice(`${selectedTrip.id} offered to ${chosen}.`);
                      setSelectedId(null);
                      setOfferDriverId("");
                    }}
                  >
                    Offer request
                  </CommandButton>
                </div>
              ) : null}
            </>
          ) : (
            <p>Choose a driver, trip, request, queue or boost.</p>
          )}
        </aside>
      </div>

      <div className="split">
        <article className="panel">
          <h3>Drivers</h3>
          <ul aria-label="Live drivers">
            {[...online, ...stale].map((marker) => (
              <li key={marker.id}>
                <button
                  data-command="admin.live.focus"
                  className="link-action"
                  type="button"
                  onClick={() => {
                    setSelectedId(marker.id);
                    setOfferDriverId("");
                  }}
                >
                  {marker.name} · {marker.stale ? `Stale · last seen ${marker.lastSeen}` : "Live"}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Open requests, airport queue and boosts</h3>
          <ul aria-label="Open requests">
            {requests.map((marker) => (
              <li key={marker.id}>
                <button
                  data-command="admin.live.focus"
                  className="link-action"
                  type="button"
                  onClick={() => {
                    setSelectedId(marker.id);
                    setOfferDriverId("");
                  }}
                >
                  {marker.name}
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="Airport queue">
            {queue.map((marker) => (
              <li key={marker.id}>
                <button data-command="admin.live.focus" className="link-action" type="button" onClick={() => setSelectedId(marker.id)}>{marker.name}</button>
              </li>
            ))}
          </ul>
          <ul aria-label="Boosts">
            {boosts.map((marker) => (
              <li key={marker.id}>
                <button data-command="admin.live.focus" className="link-action" type="button" onClick={() => setSelectedId(marker.id)}>{marker.name}</button>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </>
  );
}

/** Dispatch is the one place for offer times and search distance. The Live map only shows what is live there. */
function DispatchLink() {
  const store = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const book = normalizeDispatchBook(store.value);
  const zones = market("SE").zones;
  return (
    <article className="panel dp-link-panel" data-testid="dispatch-link">
      <h3>Dispatch rules</h3>
      <p>Offer times, search distance and every other dispatch rule are set per zone in Dispatch. These are the live values.</p>
      <ul aria-label="Live dispatch values">
        {zones.map((zone) => {
          const rules = liveRules(book, zone.id);
          return (
            <li key={zone.id}>
              <Link to={`/dispatch?zone=${zone.id}`}>{zone.name}</Link>
              <small>Exclusive {rules.exclusive.on ? `${rules.exclusive.seconds} s` : "off"} · Radar {rules.radar.on ? `${rules.radar.seconds} s` : "off"} · Search {rules.radius.steps.join(" → ")} km</small>
            </li>
          );
        })}
      </ul>
      <Link className="dash-btn small" to="/dispatch">Open Dispatch</Link>
    </article>
  );
}
