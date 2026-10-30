import { useEffect, useMemo, useState } from "react";
import { isLiveData } from "../live/realData";
import { useLiveZoneList } from "../live/LiveZones";
import { shapeOfServerZone } from "../zones/live";
import { useFreeDriverIds } from "../dispatch/RideProgress";
import { Link } from "react-router";
import { useDrivers, useRecords, useSlice, useTrips } from "../api/hooks";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { market } from "../markets/markets";
import {
  liveBoardLayers,
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
import { currentLanguage, tr, trx } from "../i18n";

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
  // G3-R5 (owner 2026-10-30): on live the zone map draws the server's zones (GET /admin/zones) and none of the demo
  // activity (drivers, trips, requests, airport queue, boosts, events); those are on the live board above from the server.
  const live = isLiveData();
  const serverZones = useLiveZoneList();
  const zones = useMemo(() => (live ? (serverZones ?? []).map((zone) => shapeOfServerZone(zone, currentLanguage())) : stockholmZones()), [live, serverZones]);
  const activity = !live;
  return (
    <>
      <LiveBoard />
      <div data-testid="live-zone-map" data-zone-ids={zones.map((zone) => zone.id).join(",")} data-activity={activity ? "on" : "off"}>
        <ZoneCanvas
          zones={zones}
          selectedId={live ? "" : "op-norrmalm"}
          mode="select"
          layers={{ drivers: activity, trips: activity, requests: activity, demandHour: false, demand7d: false, pickups: activity, queue: activity, boosts: activity, events: activity, gaps: false, before: false, districts: false, satellite: false }}
          focus={null}
          selectionNonce={0}
          onDrawn={() => undefined}
          onEdited={() => undefined}
          {...(live ? { fitIds: zones.map((zone) => zone.id), viewKey: zones.map((zone) => zone.id).join(",") } : {})}
        />
      </div>
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

  const live = isLiveData();
  const shownLayers = LAYERS.filter((layer) => liveBoardLayers(live).includes(layer.id));
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
    ? offerBlock(selectedTrip.status) ?? (candidates.length === 0 ? tr("No eligible driver with a matching eligible vehicle is available.") : null)
    : tr("Select an open request.");

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
          <h2>{tr("Live map")}</h2>
          <p>{live ? tr("OpenStreetMap. Positions from the server. Stale markers stay grey and cannot be selected as dispatch candidates.") : tr("OpenStreetMap. Positions refresh in the demo. Stale markers stay grey and cannot be selected as dispatch candidates.")}</p>
        </div>
      </div>

      <p className="state-line" data-live="counts" data-testid="live-tick" data-tick={tick}>
        {live
          ? tr("Drivers {0}. Trips in the book {1}. Online {2}. Stale {3}. Trips on the map {4} of {5} active. Open requests plotted {6} of {7}.", [drivers.data?.length ?? 0, trips.data?.length ?? 0, online.length, stale.length, tripMarks.length, activeAll, requests.length, openAll])
          : tr("Drivers {0}. Trips in the book {1}. Online {2}. Stale {3}. Trips on the map {4} of {5} active. Open requests plotted {6} of {7}. Airport queue {8}. Boosts {9}.", [drivers.data?.length ?? 0, trips.data?.length ?? 0, online.length, stale.length, tripMarks.length, activeAll, requests.length, openAll, queue.length, boosts.length])}
        {notice ? ` ${notice}` : ""}
      </p>

      <div className="actions" aria-label={tr("Map layers")}>
        {shownLayers.map((layer) => (
          <label key={layer.id} className="check-row">
            <input
              type="checkbox"
              checked={layers[layer.id] ?? false}
              onChange={() => setLayers((current) => ({ ...current, [layer.id]: !current[layer.id] }))}
            />
            {trx(layer.label)}
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
                title={marker.stale ? tr("{0}, last seen {1}", [marker.name, marker.lastSeen]) : marker.name}
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
          <h3>{tr("Selected")}</h3>
          {selected ? (
            <>
              <p><strong>{selected.name}</strong></p>
              <p>{selected.stale ? tr("Last seen {0}", [selected.lastSeen]) : tr("Live position")}</p>
              <p>{selected.kind} · {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</p>
              <Link to={selected.href}>{tr("Open page")}</Link>

              {selected.kind === "request" && selectedTrip ? (
                <div data-testid="quick-dispatch">
                  <h4>{tr("Quick dispatch")}</h4>
                  <p>{selectedOfferWhy ?? tr("{0} eligible drivers with eligible matching vehicles.", [candidates.length])}</p>
                  <label>
                    {tr("Driver")}
                    <select
                      aria-label={tr("Quick dispatch driver")}
                      value={chosen}
                      disabled={Boolean(selectedOfferWhy)}
                      onChange={(event) => setOfferDriverId(event.target.value)}
                    >
                      {candidates.length === 0 ? <option value="">{tr("No eligible driver")}</option> : null}
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
                      setNotice(tr("{0} offered to {1}.", [selectedTrip.id, chosen]));
                      setSelectedId(null);
                      setOfferDriverId("");
                    }}
                  >
                    {tr("Offer request")}
                  </CommandButton>
                </div>
              ) : null}
            </>
          ) : (
            <p>{live ? tr("Choose a driver, trip or request.") : tr("Choose a driver, trip, request, queue or boost.")}</p>
          )}
        </aside>
      </div>

      <div className="split">
        <article className="panel">
          <h3>{tr("Drivers")}</h3>
          <ul aria-label={tr("Live drivers")}>
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
                  {marker.name} · {marker.stale ? tr("Stale · last seen {0}", [marker.lastSeen]) : tr("Live")}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>{live ? tr("Open requests") : tr("Open requests, airport queue and boosts")}</h3>
          <ul aria-label={tr("Open requests")}>
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
          {live ? null : <>
          <ul aria-label={tr("Airport queue")}>
            {queue.map((marker) => (
              <li key={marker.id}>
                <button data-command="admin.live.focus" className="link-action" type="button" onClick={() => setSelectedId(marker.id)}>{marker.name}</button>
              </li>
            ))}
          </ul>
          <ul aria-label={tr("Boosts")}>
            {boosts.map((marker) => (
              <li key={marker.id}>
                <button data-command="admin.live.focus" className="link-action" type="button" onClick={() => setSelectedId(marker.id)}>{marker.name}</button>
              </li>
            ))}
          </ul>
          </>}
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
      <h3>{tr("Dispatch rules")}</h3>
      <p>{tr("Offer times, search distance and every other dispatch rule are set per zone in Dispatch. These are the live values.")}</p>
      <ul aria-label={tr("Live dispatch values")}>
        {zones.map((zone) => {
          const rules = liveRules(book, zone.id);
          return (
            <li key={zone.id}>
              <Link to={`/dispatch/rules?zone=${zone.id}`}>{trx(zone.name)}</Link>
              <small>{tr("Exclusive {0} · Radar {1} · Search {2} km", [rules.exclusive.on ? `${rules.exclusive.seconds} s` : tr("off"), rules.radar.on ? `${rules.radar.seconds} s` : tr("off"), rules.radius.steps.join(" → ")])}</small>
            </li>
          );
        })}
      </ul>
      <Link className="dash-btn small" to="/dispatch/rules">{tr("Open Dispatch")}</Link>
    </article>
  );
}
