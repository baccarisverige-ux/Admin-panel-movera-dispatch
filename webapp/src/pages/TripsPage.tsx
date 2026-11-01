import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LiveListBar } from "../live/LiveListBar";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Bookmark, CarFront, CheckCircle2, Eye, Flag, Layers, Search, Settings2, XCircle } from "lucide-react";
import { useDrivers, useSlice, useTrips } from "../api/hooks";
import type { TripRecord as DemoRecord } from "../trips/file";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { CATEGORIES } from "../domain/contract";
import { formatMoney, marketOfZone, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { MapPanel } from "../dispatch/maps";
import { GROUPS, TRIP_OPS_KEY, emptyTripOps, flaggedIds, groupOf, listStats, normalizeTripOps, routeOf, saveView, type TripGroup, type TripOps } from "../trips/file";
import { categoryOf, fareBreakdown, paymentOf, startedAt, statusLabel, TRIP_STATUSES, type PaymentState } from "../trips/present";
import { RouteMap } from "../trips/RouteMap";
import { TripSettingsView } from "../trips/TripSettings";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";
import { RiderAssignName } from "../dispatch/AssignPanel";
import { canAssign as canAssignTrip } from "../dispatch/assign";
import { Modal } from "../ui/Modal";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";
import { isLiveData, liveTripOf } from "../live/realData";
import { ETA_EVERY_SECONDS, etaIsStale, etaLine, isLiveWithDriver } from "../live/tripLive";

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

const FILTER_KEYS = ["group", "status", "zone", "category", "payment", "driver", "from", "to"] as const;

export function TripsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agent } = useSession();
  const scope = useMarketScope();
  const country = scope.market.id;
  // v0.18.7 (G5, adminLiveRow): live rows carry the server's ETA, refreshed every 30 s, so the list follows at that pace.
  const trips = useTrips(params.get("scope"), isLiveData() ? { refetchMs: ETA_EVERY_SECONDS * 1000 } : {});
  const drivers = useDrivers(params.get("scope"));
  const slice = useSlice<TripOps>(TRIP_OPS_KEY, emptyTripOps(), { enabled: Boolean(agent && can(agent.role, "trips.read")) });
  const ops = normalizeTripOps(slice.value);
  const flagged = useMemo(() => flaggedIds(ops), [ops]);
  const view = params.get("view") === "settings" ? "settings" : "list";
  const group = (GROUPS.find((item) => item.id === params.get("group"))?.id ?? "all") as TripGroup;
  const status = params.get("status") ?? "all";
  const zone = params.get("zone") ?? "all";
  const category = params.get("category") ?? "all";
  const payment = params.get("payment") ?? "all";
  const driverId = params.get("driver") ?? "all";
  // Dates are mirrored in state: a controlled date input loses an emptied value while the URL updates.
  const [dates, setDates] = useState({ from: params.get("from") ?? "", to: params.get("to") ?? "" });
  const urlFrom = params.get("from") ?? "";
  const urlTo = params.get("to") ?? "";
  useEffect(() => setDates({ from: urlFrom, to: urlTo }), [urlFrom, urlTo]);
  const { from, to } = dates;
  const [peekId, setPeekId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => trips.data ?? [], [trips.data]);
  const zones = useMemo(() => [...new Set(rows.map((trip) => trip.zoneId))], [rows]);
  const driverNames = useMemo(() => new Map((drivers.data ?? []).map((row) => [row.id, row.name])), [drivers.data]);

  // Everything the list needs per trip, worked out once. Date and money formatters are made once, not per row.
  const facts = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });
    const whenFormat = new Intl.DateTimeFormat(uiLocale(), { timeZone: scope.market.timeZone, dateStyle: "short", timeStyle: "short" });
    // Each price in its own currency (the server's fare currency, else its zone's), never the picked country's.
    const priceFormats = new Map<string, Intl.NumberFormat>();
    const priceOf = (trip: DemoRecord, minor: number) => {
      const owner = marketOfZone(trip.zoneId) ?? scope.market;
      const currency = (trip as { liveTrip?: { currency?: string } }).liveTrip?.currency ?? owner.currency;
      let format = priceFormats.get(currency);
      if (!format) priceFormats.set(currency, (format = new Intl.NumberFormat(owner.locale, { style: "currency", currency })));
      return format.format(minor / owner.minorUnits);
    };
    return new Map(rows.map((trip) => {
      const started = new Date(startedAt(trip.id));
      const tripGroup = groupOf(trip.status);
      return [trip.id, {
        day: dayFormat.format(started),
        when: whenFormat.format(started),
        group: tripGroup,
        category: categoryOf(trip.id),
        payment: paymentOf(trip),
        price: tripGroup === "completed" ? priceOf(trip, fareBreakdown(trip).chargedOre) : "–",
      }];
    }));
  }, [rows, scope.market]);
  const fact = (trip: DemoRecord) => facts.get(trip.id)!;
  const inGroup = (trip: DemoRecord, id: TripGroup) => (id === "all" ? true : id === "flagged" ? flagged.has(trip.id) : fact(trip).group === id || (id === "problem" && fact(trip).payment === "failed"));
  const base = useMemo(() => rows.filter((trip) => {
    const item = facts.get(trip.id);
    if (!item) return false;
    if (status !== "all" && trip.status !== status) return false;
    if (zone !== "all" && trip.zoneId !== zone) return false;
    if (category !== "all" && item.category.id !== category) return false;
    if (payment !== "all" && item.payment !== payment) return false;
    if (driverId !== "all" && trip.driverId !== driverId) return false;
    if (from && item.day < from) return false;
    if (to && item.day > to) return false;
    return true;
  }), [rows, facts, status, zone, category, payment, driverId, from, to]);
  const filtered = base.filter((trip) => inGroup(trip, group));
  const statusCount = new Set(filtered.map((trip) => trip.status)).size;
  const stats = listStats(filtered);
  const money = (minor: number) => formatMoney(minor, country);
  const peek = filtered.find((trip) => trip.id === peekId) ?? null;
  const views = ops.views.filter((item) => item.country === country && (item.by === agent?.id || item.shared));
  const isSuper = Boolean(agent && can(agent.role, "team.read"));
  const canIntervene = Boolean(agent && can(agent.role, "trips.intervene"));
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));

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

  function filterQuery(): string {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    return next.toString();
  }

  if (view === "settings") {
    return (
      <div className="dx-page op-page">
        <header className="dx-head">
          <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => set({ view: null })}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
          <div className="dx-head-text">
            <h2>{tr("Trip settings")}</h2>
            <p>{tr("Who sees phone numbers and chats, which actions admins have, and when money needs a second admin.")}</p>
          </div>
        </header>
        <TripSettingsView ops={ops} rev={slice.value.draftRev ?? 1} loading={slice.loading} editable={isSuper} />
      </div>
    );
  }

  return (
    <div className="dx-page op-page">
      <header className="dx-head">
        <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{tr("Trips")}</h2>
          <p data-testid="trip-count">
            {trips.isLoading ? tr("Loading trips.") : tr("{0} trips in demo data, {1} match the filters, {2} statuses in this view.", [rows.length, filtered.length, statusCount])}
          </p>
        </div>
        {isSuper ? <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "settings" })}>{trn("{0} Settings", <Settings2 size={14} aria-hidden="true" />)}</button> : null}
      </header>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "money" ? money(value) : format === "pct" ? `${value}%` : new Intl.NumberFormat(uiLocale()).format(value))}
        cards={[
          { id: "count", label: tr("Trips"), value: stats.total, previous: null, format: "count", info: tr("Trips that match the filters below.") },
          { id: "live", label: tr("On the road now"), value: stats.live, previous: null, format: "count", info: tr("A driver is on the way, waiting or driving.") },
          { id: "done", label: tr("Completed"), value: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0, previous: null, format: "pct", info: tr("Completed trips ÷ all trips in this list.") },
          { id: "cancel", label: tr("Cancelled"), value: stats.total ? Math.round((stats.cancelled / stats.total) * 100) : 0, previous: null, format: "pct", info: tr("Cancelled or expired ÷ all trips in this list."), goodDown: true },
          { id: "avg", label: tr("Average price"), value: stats.avgPrice, previous: null, format: "money", info: tr("What riders paid on average for completed trips, before tips.") },
          { id: "taken", label: tr("Riders paid"), value: stats.taken, previous: null, format: "money", info: tr("All completed trips together, before tips and refunds.") },
        ]}
      />

      <nav className="op-groups" aria-label={tr("Trip groups")}>
        {GROUPS.map((item) => {
          const count = base.filter((trip) => inGroup(trip, item.id)).length;
          return (
            <button data-command="admin.trip.view" key={item.id} type="button" title={trx(item.help)} className={`op-group ${GROUP_TONE[item.id]}${group === item.id ? " active" : ""}`} aria-pressed={group === item.id} onClick={() => set({ group: item.id })}>
              <span className="op-group-icon" aria-hidden="true">{GROUP_ICON[item.id]}</span>
              <span className="op-group-text"><b>{trx(item.label)}</b><small>{count}</small></span>
            </button>
          );
        })}
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
          <select aria-label={tr("Trip zone")} value={zone} onChange={(event) => set({ zone: event.target.value })}>
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
            {(drivers.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
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
          {views.length ? (
            <select aria-label={tr("Saved trip views")} value="" onChange={(event) => {
              const chosen = views.find((item) => item.id === event.target.value);
              if (!chosen) return;
              const next = new URLSearchParams(chosen.query);
              for (const key of ["country", "scope"]) { const value = params.get(key); if (value) next.set(key, value); }
              setParams(next, { replace: true });
              setNotice(tr("View {0} opened.", [chosen.name]));
            }}>
              <option value="">{tr("Saved views…")}</option>
              {views.map((item) => <option key={item.id} value={item.id}>{item.name}{item.shared && item.by !== agent?.id ? tr(" (shared)") : ""}</option>)}
            </select>
          ) : null}
          {hasFilters ? <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={() => { const next = new URLSearchParams(params); for (const key of FILTER_KEYS) next.delete(key); setParams(next, { replace: true }); }}>{tr("Clear filters")}</button> : null}
          <button data-command="admin.trip.saveView" type="button" className="dash-btn small ghost" disabled={!hasFilters} title={hasFilters ? undefined : tr("Choose a filter first.")} onClick={() => setSaveOpen(true)}>{trn("{0} Save view", <Bookmark size={13} aria-hidden="true" />)}</button>
        </span>
      </section>
      {notice ? <p className="dx-note" role="status">{trSentences(notice)}</p> : null}

      <LiveListBar list="trips" />
      <div className={peek ? "op-list-grid with-peek" : "op-list-grid"}>
        <DataTable
          serverSearch="trips"
          head={[tr("Trip"), tr("Rider"), tr("Driver"), tr("Status"), tr("Zone"), tr("Category"), tr("Paid waiting"), tr("Price"), tr("Payment"), tr("When"), tr("Quick look")]}
          rowIds={filtered.map((trip) => trip.id)}
          rows={filtered.map((trip) => [
            trip.id,
            // Q13: a waiting rider's name opens the assign panel.
            canAssignTrip(trip.status) && canIntervene ? { text: trip.name, node: <RiderAssignName tripId={trip.id} rider={trip.name} /> } : trip.name,
            trip.driverId ? driverNames.get(trip.driverId) ?? "Driver" : "No driver yet",
            liveStatusCell(trip),
            zoneById(trip.zoneId)?.name ?? trip.zoneId,
            fact(trip).category.label,
            paidWaitingCell(trip),
            fact(trip).price,
            statusLabel(fact(trip).payment),
            fact(trip).when,
            <button key="peek" data-command="admin.trip.view" type="button" className="dash-btn small ghost op-peek-btn" aria-label={tr("Quick look at {0}", [trip.id])} onClick={(event) => { event.stopPropagation(); setPeekId(peekId === trip.id ? null : trip.id); }}>{trn("{0} Look", <Eye size={13} aria-hidden="true" />)}</button>,
          ])}
          state={trips.isLoading ? "loading" : trips.isError ? "error" : "ready"}
          onRetry={() => void trips.refetch()}
          onRow={(index) => {
            const id = filtered[index]?.id;
            if (id) navigate(`/trips/${id}`);
          }}
        />
        {peek ? <Peek trip={peek} driverName={peek.driverId ? driverNames.get(peek.driverId) ?? "" : ""} money={money} flagged={flagged.has(peek.id)} onClose={() => setPeekId(null)} /> : null}
      </div>

      <SaveViewDialog open={saveOpen} onClose={() => setSaveOpen(false)} ops={ops} query={filterQuery()} country={country} by={agent?.id ?? ""} onSaved={(name) => setNotice(tr("View {0} saved.", [name]))} />
    </div>
  );
}

/**
 * v0.18.8 (G6, admin-fake "Trips waiting minutes"): the server's paid waiting minutes (TripProjection.waiting.paidMinutes,
 * also on GET /admin/trips rows). No waiting yet, or a trip without the field: "–", never an invented number.
 */
function paidWaitingCell(trip: DemoRecord): string {
  const minutes = liveTripOf(trip)?.waiting?.paidMinutes ?? trip.waitingMin;
  return typeof minutes === "number" ? tr("{0} min", [minutes]) : "–";
}

/**
 * v0.18.7 (G5 status item 10, contract.json#pickupWaiting.adminLiveRow): a trip going on with a driver shows
 * "driver_to_pickup · 4 min · 1,2 km" from the server's ETA and a link to the map with the car's position.
 */
function liveStatusCell(trip: DemoRecord): string | { text: string; node: ReactNode } {
  const live = liveTripOf(trip);
  if (!live || !isLiveWithDriver(trip.status, trip.driverId)) return trip.status;
  const eta = live.eta;
  const line = eta ? etaLine(eta, uiLocale()) : null;
  // G5 live test: the words of the status (sv/fr/en), never the raw code.
  const words = statusLabel(trip.status);
  const text = line ? `${words} · ${line}` : words;
  return {
    text,
    node: (
      <span className="op-live-cell" data-testid={`trip-live-${trip.id}`}>
        <span>{words}</span>
        {line ? <small className={eta && etaIsStale(eta, Date.now()) ? "op-eta stale" : "op-eta"} title={eta?.source === "estimate" ? tr("Straight-line estimate, no road route yet.") : undefined}>{line}</small> : <small className="op-eta">{tr("No position yet")}</small>}
        {live.driverLocation ? <Link to={`/trips/${trip.id}#route`} onClick={(event) => event.stopPropagation()} aria-label={tr("Map of {0}", [trip.id])}>{tr("Map")}</Link> : null}
      </span>
    ),
  };
}

function Peek({ trip, driverName, money, flagged, onClose }: { trip: DemoRecord; driverName: string; money: (minor: number) => string; flagged: boolean; onClose: () => void }) {
  const route = useMemo(() => routeOf(trip), [trip]);
  return (
    <aside className="op-peek" aria-label={tr("Quick look at {0}", [trip.id])}>
      <header>
        <span>
          <b>{trip.id}</b> <span className={`op-status ${groupOf(trip.status)}`}>{statusLabel(trip.status)}</span>
          {flagged ? <span className="op-status problem">{trn("{0} Flagged", <Flag size={11} aria-hidden="true" />)}</span> : null}
        </span>
        <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={onClose}>{tr("Close")}</button>
      </header>
      <p className="op-peek-people">{trip.name} → {driverName || tr("no driver yet")}</p>
      <MapPanel title={tr("Route")}>
        <RouteMap key={trip.id} stops={route.stops} path={route.path} label={tr("Route of {0}", [trip.id])} />
      </MapPanel>
      <ol className="op-stops">
        {route.stops.map((stop, index) => <li key={`${stop.kind}-${index}`} className={stop.kind}><i aria-hidden="true" />{trx(stop.label)}</li>)}
      </ol>
      <dl className="op-facts">
        <div><dt>{tr("Distance")}</dt><dd>{trn("{0} km", route.km)}</dd></div>
        <div><dt>{tr("Time")}</dt><dd>{trn("{0} min", route.minutes)}</dd></div>
        <div><dt>{tr("Price")}</dt><dd>{groupOf(trip.status) === "completed" ? money(fareBreakdown(trip).chargedOre) : "–"}</dd></div>
      </dl>
      <Link className="dash-btn small" to={`/trips/${trip.id}`}>{tr("Open the full trip")}</Link>
    </aside>
  );
}

function SaveViewDialog({ open, onClose, ops, query, country, by, onSaved }: { open: boolean; onClose: () => void; ops: TripOps; query: string; country: "SE" | "FR" | "TN"; by: string; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const result = saveView(ops, { name, by, shared, country, query });
  return (
    <Modal open={open} title={tr("Save this view")} onClose={onClose}>
      <div className="op-form">
        <label className="op-field"><span>{tr("View name")}</span><input aria-label={tr("View name")} value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("For example: Failed payments this week")} /></label>
        <label className="op-check">{trn("{0} Share with other admins", <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />)}</label>
        {result.error && name ? <p className="dx-warn">{trSentences(result.error)}</p> : null}
        <div className="op-form-actions">
          <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={onClose}>{tr("Cancel")}</button>
          <CommandButton command="admin.trip.saveView" className="dash-btn small" sliceKey={TRIP_OPS_KEY} value={result.ops} expectedSliceRev={ops.draftRev} confirmTarget={false} disabled={Boolean(result.error)} onDone={() => { onSaved(name.trim()); setName(""); setShared(false); onClose(); }}>{tr("Save view")}</CommandButton>
        </div>
      </div>
    </Modal>
  );
}
