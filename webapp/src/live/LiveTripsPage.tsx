import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CarFront, CheckCircle2, Eye, Flag, Layers, Search, XCircle } from "lucide-react";
import { CATEGORIES } from "../domain/contract";
import { statusLabel } from "../domain/labels";
import { MapPanel } from "../dispatch/maps";
import { canAssign } from "../dispatch/assign";
import { zoneById } from "../markets/markets";
import { GROUPS, groupOf, type TripGroup } from "../trips/file";
import { TRIP_STATUSES, type PaymentState } from "../trips/present";
import { RouteMap, type MapStop } from "../trips/RouteMap";
import { NoAccess } from "../ui/kit";
import { tr, trn, trx, uiLocale, type MessageKey } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { fullName, listQuery, liveMoney } from "./format";
import { LiveAssignDialog } from "./LiveAssign";
import { dateQuery, marketOf, statusQuery, type LiveGroup } from "./trips";
import { ErrorLine, LoadMore, SearchBox, Status, useLivePage } from "./ui";
import type { Driver, Page, Rider, Trip } from "./types";

const PAYMENTS: PaymentState[] = ["pending", "authorized", "captured", "failed", "refunded"];

const GROUP_ICON: Record<TripGroup, ReactNode> = {
  all: <Layers size={16} />,
  live: <CarFront size={16} />,
  searching: <Search size={16} />,
  completed: <CheckCircle2 size={16} />,
  cancelled: <XCircle size={16} />,
  problem: <AlertTriangle size={16} />,
  flagged: <Flag size={16} />,
};

const GROUP_TONE: Record<TripGroup, string> = { all: "blue", live: "green", searching: "violet", completed: "aqua", cancelled: "orange", problem: "red", flagged: "pink" };

/** The demo's groups without "Flagged": the server keeps no flag on a trip. Problems are the problem statuses (no-show, failed). */
const LIVE_GROUPS = GROUPS.filter((item) => item.id !== "flagged");

const FILTER_KEYS = ["group", "status", "zone", "category", "payment", "driver", "from", "to", "q"] as const;

/** Offer and payment words the panel's shared status labels do not have (kept here so demo pages read as before). */
const WORDS: Record<string, MessageKey> = { partially_refunded: "Partially refunded", declined: "Declined", claimed: "Claimed" };

export function Word({ code }: { code: string }) {
  const word = WORDS[code];
  return word ? <>{tr(word)}</> : <Status code={code} />;
}

export function wordText(code: string): string {
  const word = WORDS[code];
  return word ? tr(word) : statusLabel(code);
}

/** "Volvo V90 · ABC 123", or the vehicle id when the server sent no summary. */
export function carLabel(trip: Pick<Trip, "driver" | "vehicleId">): string {
  const car = trip.driver?.vehicle;
  const name = [car?.make, car?.model].filter(Boolean).join(" ");
  const label = [name, car?.plate].filter(Boolean).join(" · ");
  return label || trip.vehicleId || "—";
}

export function categoryName(id: string): string {
  return trx(CATEGORIES.find((item) => item.id === id)?.label ?? id);
}

/** The pickup, the stops and the drop-off of a trip as map stops (the server's own coordinates). */
export function tripStops(trip: Pick<Trip, "pickup" | "stops" | "dropoff">): MapStop[] {
  const label = (place: { address?: string; lat: number; lng: number }) => place.address ?? `${place.lat}, ${place.lng}`;
  return [
    { kind: "pickup", label: label(trip.pickup), at: [trip.pickup.lat, trip.pickup.lng] },
    ...trip.stops.map((stop) => ({ kind: "stop" as const, label: label(stop), at: [stop.lat, stop.lng] as [number, number] })),
    { kind: "dropoff", label: label(trip.dropoff), at: [trip.dropoff.lat, trip.dropoff.lng] },
  ];
}

/**
 * The riders' first names for the trips shown (GET /admin/riders?q={riderId}, one per rider, cached): the demo shows
 * the rider's name. Without riders.read, or until the answer comes, the rider id.
 */
export function useRiderNames(riderIds: readonly string[]): Map<string, string> {
  const { client, can } = useLiveSession();
  const ids = [...new Set(riderIds)];
  const answers = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["live", "rider-name", id],
      queryFn: () => client.json<Page<Rider>>(`/admin/riders?q=${encodeURIComponent(id)}&limit=1`),
      enabled: can("riders.read"),
      staleTime: 5 * 60_000,
    })),
  });
  return new Map(ids.map((id, index) => [id, answers[index]?.data?.items.find((rider) => rider.riderId === id)?.firstName || id]));
}

/**
 * GET /api/v1/admin/trips: the demo Trips list (pages/TripsPage.tsx) on the server's trips. The demo's groups (but
 * Flagged), its filters (status, zone, category, payment, driver, from and to) sent to the server, its columns and its
 * Quick look; Load more for older trips. A row opens the trip (GET /admin/trips/{tripId}).
 */
export function LiveTripsPage() {
  const { client, can } = useLiveSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const group = (LIVE_GROUPS.find((item) => item.id === params.get("group"))?.id ?? "all") as LiveGroup;
  const status = params.get("status") ?? "all";
  const zone = params.get("zone") ?? params.get("scope") ?? "";
  const category = params.get("category") ?? "all";
  const payment = params.get("payment") ?? "all";
  const driverId = params.get("driver") ?? "all";
  const q = params.get("q") ?? "";
  // Dates are mirrored in state: a controlled date input loses an emptied value while the URL updates.
  const [dates, setDates] = useState({ from: params.get("from") ?? "", to: params.get("to") ?? "" });
  const urlFrom = params.get("from") ?? "";
  const urlTo = params.get("to") ?? "";
  useEffect(() => setDates({ from: urlFrom, to: urlTo }), [urlFrom, urlTo]);
  const { from, to } = dates;
  const [peekId, setPeekId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const timeZone = marketOf(zone).timeZone;
  const statuses = statusQuery(group, status);
  const path = (cursor: string | null) => {
    const base = listQuery({
      q,
      zoneId: zone,
      categoryId: category === "all" ? "" : category,
      paymentStatus: payment === "all" ? "" : payment,
      driverId: driverId === "all" ? "" : driverId,
      ...dateQuery(urlFrom, urlTo, timeZone),
      cursor,
      limit: 50,
    });
    const statusPart = (statuses ?? []).map((code) => `status=${encodeURIComponent(code)}`).join("&");
    return `/admin/trips${base}${statusPart ? `${base ? "&" : "?"}${statusPart}` : ""}`;
  };
  const page = useLivePage<Trip>(["live", "trips", group, status, zone, category, payment, driverId, urlFrom, urlTo, q], path, can("trips.read") && statuses !== null);
  const drivers = useQuery({ queryKey: ["live", "trip-drivers"], queryFn: () => client.json<Page<Driver>>("/admin/drivers?limit=200"), enabled: can("drivers.read"), staleTime: 60_000 });
  const rows = useMemo(() => (statuses === null ? [] : page.items), [statuses, page.items]);
  const riders = useRiderNames(rows.map((trip) => trip.riderId));
  const zones = useMemo(() => [...new Set([...rows.map((trip) => trip.zoneId), ...(zone ? [zone] : [])])], [rows, zone]);
  const whenFormat = useMemo(() => new Map<string, Intl.DateTimeFormat>(), []);
  const when = (trip: Trip) => {
    const place = marketOf(trip.zoneId);
    let format = whenFormat.get(place.timeZone);
    if (!format) {
      format = new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, dateStyle: "short", timeStyle: "short" });
      whenFormat.set(place.timeZone, format);
    }
    return format.format(new Date(trip.createdAt));
  };
  const canIntervene = can("trips.intervene");
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));
  const peek = rows.find((trip) => trip.tripId === peekId) ?? null;
  const assignTrip = rows.find((trip) => trip.tripId === assignId) ?? null;

  if (!can("trips.read")) return <NoAccess />;

  // Two quick changes in a row never undo each other.
  function set(patch: Record<string, string | null>) {
    setParams(() => {
      // The browser URL is already up to date when a previous change has not rendered yet.
      const next = new URLSearchParams(globalThis.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }

  const loading = page.isLoading && statuses !== null;

  return (
    <div className="dx-page op-page">
      <header className="dx-head">
        <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{tr("Trips")}</h2>
          <p data-testid="trip-count">{loading ? tr("Loading trips.") : tr("{0} trips from the server match the filters. Load more shows older ones.", [rows.length])}</p>
        </div>
      </header>

      <nav className="op-groups" aria-label={tr("Trip groups")}>
        {LIVE_GROUPS.map((item) => (
          <button data-command="admin.trip.view" key={item.id} type="button" title={trx(item.help)} className={`op-group ${GROUP_TONE[item.id]}${group === item.id ? " active" : ""}`} aria-pressed={group === item.id} onClick={() => set({ group: item.id })}>
            <span className="op-group-icon" aria-hidden="true">{GROUP_ICON[item.id]}</span>
            <span className="op-group-text"><b>{trx(item.label)}</b>{group === item.id && !loading ? <small>{rows.length}{page.hasMore ? "+" : ""}</small> : null}</span>
          </button>
        ))}
      </nav>

      <section className="rp-bar op-filters" aria-label={tr("Trip filters")}>
        <label className="op-field">
          <span>{tr("Trip status")}</span>
          <select aria-label={tr("Trip status")} value={status} onChange={(event) => set({ status: event.target.value })}>
            <option value="all">{trn("All {0} statuses", TRIP_STATUSES.length)}</option>
            {TRIP_STATUSES.map((code) => <option key={code} value={code}>{statusLabel(code)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>{tr("Zone")}</span>
          <select aria-label={tr("Trip zone")} value={zone || "all"} onChange={(event) => set({ zone: event.target.value, scope: null })}>
            <option value="all">{tr("All zones")}</option>
            {zones.map((id) => <option key={id} value={id}>{zoneById(id)?.name ?? id}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>{tr("Category")}</span>
          <select aria-label={tr("Trip category")} value={category} onChange={(event) => set({ category: event.target.value })}>
            <option value="all">{tr("All categories")}</option>
            {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>{tr("Payment")}</span>
          <select aria-label={tr("Payment state")} value={payment} onChange={(event) => set({ payment: event.target.value })}>
            <option value="all">{tr("All payment states")}</option>
            {PAYMENTS.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>{tr("Driver")}</span>
          <select aria-label={tr("Trip driver")} value={driverId} onChange={(event) => set({ driver: event.target.value })}>
            <option value="all">{tr("All drivers")}</option>
            {(drivers.data?.items ?? []).map((row) => <option key={row.driverId} value={row.driverId}>{fullName(row.firstName, row.lastName, row.driverId)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>{tr("From")}</span>
          <input aria-label={tr("From date")} type="date" value={from} onChange={(event) => { setDates({ ...dates, from: event.target.value }); set({ from: event.target.value }); }} />
        </label>
        <label className="op-field">
          <span>{tr("To")}</span>
          <input aria-label={tr("To date")} type="date" value={to} onChange={(event) => { setDates({ ...dates, to: event.target.value }); set({ to: event.target.value }); }} />
        </label>
        <span className="rp-bar-actions">
          {hasFilters ? <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={() => { const next = new URLSearchParams(params); for (const key of FILTER_KEYS) next.delete(key); setParams(next, { replace: true }); }}>{tr("Clear filters")}</button> : null}
        </span>
      </section>
      <SearchBox value={q} onChange={(next) => set({ q: next })} placeholder={tr("Search by trip id or rider phone")} />

      {statuses === null ? <p className="state-line">{tr("No trip can be in this group and this status at once.")}</p> : null}
      {loading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={page.error} onRetry={page.reload} />
      {statuses !== null && !loading && !page.error && rows.length === 0 ? <p className="state-line">{tr("No trips match.")}</p> : null}
      {rows.length > 0 ? (
        <div className={peek ? "op-list-grid with-peek" : "op-list-grid"}>
          <div className="table-wrap">
            <table className="live-table live-rows">
              <thead>
                <tr>
                  {[tr("Trip"), tr("Rider"), tr("Driver"), tr("Status"), tr("Zone"), tr("Category"), tr("Price"), tr("Payment"), tr("When"), tr("Quick look")].map((label) => <th key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((trip) => {
                  const open = () => navigate(`/trips/${encodeURIComponent(trip.tripId)}`);
                  const rider = riders.get(trip.riderId) ?? trip.riderId;
                  return (
                    <tr key={trip.tripId} data-trip-id={trip.tripId} className="live-row" onClick={open}>
                      <td>
                        <button data-command="admin.server.openRecord" type="button" className="link-action" onClick={(event) => { event.stopPropagation(); open(); }}>{trip.tripId}</button>
                      </td>
                      <td>
                        {/* Q13: a waiting rider's name opens the assign panel. */}
                        {canAssign(trip.status) && canIntervene ? (
                          <button data-command="admin.dispatch.view" type="button" className="link-action as-rider-name" title={tr("Assign a driver")} aria-label={tr("{0}, assign a driver", [rider])} onClick={(event) => { event.stopPropagation(); setAssignId(trip.tripId); }}>{rider}</button>
                        ) : rider}
                      </td>
                      <td>{trip.driverId ? trip.driver?.firstName ?? tr("Driver") : tr("No driver yet")}</td>
                      <td><Status code={trip.status} /></td>
                      <td>{zoneById(trip.zoneId)?.name ?? trip.zoneId}</td>
                      <td>{categoryName(trip.categoryId)}</td>
                      <td>{trip.status === "completed" ? liveMoney(trip.fare) : "–"}</td>
                      <td>{trip.paymentStatus ? wordText(trip.paymentStatus) : "–"}</td>
                      <td>{when(trip)}</td>
                      <td>
                        <button data-command="admin.trip.view" type="button" className="dash-btn small ghost op-peek-btn" aria-label={tr("Quick look at {0}", [trip.tripId])} onClick={(event) => { event.stopPropagation(); setPeekId(peekId === trip.tripId ? null : trip.tripId); }}>{trn("{0} Look", <Eye size={13} aria-hidden="true" />)}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {peek ? <Peek trip={peek} rider={riders.get(peek.riderId) ?? peek.riderId} onClose={() => setPeekId(null)} /> : null}
        </div>
      ) : null}
      <LoadMore hasMore={page.hasMore && statuses !== null} loading={page.loadingMore} onClick={() => void page.loadMore()} />
      {assignTrip ? <LiveAssignDialog trip={assignTrip} rider={riders.get(assignTrip.riderId) ?? assignTrip.riderId} onClose={() => setAssignId(null)} onChanged={page.reload} /> : null}
    </div>
  );
}

function Peek({ trip, rider, onClose }: { trip: Trip; rider: string; onClose: () => void }) {
  const stops = useMemo(() => tripStops(trip), [trip]);
  return (
    <aside className="op-peek" aria-label={tr("Quick look at {0}", [trip.tripId])}>
      <header>
        <span>
          <b>{trip.tripId}</b> <span className={`op-status ${groupOf(trip.status)}`}>{statusLabel(trip.status)}</span>
        </span>
        <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={onClose}>{tr("Close")}</button>
      </header>
      <p className="op-peek-people">{rider} → {trip.driver?.firstName ?? (trip.driverId ? tr("Driver") : tr("no driver yet"))}</p>
      <MapPanel title={tr("Route")}>
        <RouteMap key={trip.tripId} stops={stops} path={[]} label={tr("Route of {0}", [trip.tripId])} />
      </MapPanel>
      <ol className="op-stops">
        {stops.map((stop, index) => <li key={`${stop.kind}-${index}`} className={stop.kind}><i aria-hidden="true" />{stop.label}</li>)}
      </ol>
      <dl className="op-facts">
        <div><dt>{tr("Distance")}</dt><dd>–</dd></div>
        <div><dt>{tr("Time")}</dt><dd>–</dd></div>
        <div><dt>{tr("Price")}</dt><dd>{trip.status === "completed" ? liveMoney(trip.fare) : "–"}</dd></div>
      </dl>
      <Link className="dash-btn small" to={`/trips/${encodeURIComponent(trip.tripId)}`}>{tr("Open the full trip")}</Link>
    </aside>
  );
}
