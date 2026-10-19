import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Bookmark, CarFront, CheckCircle2, Eye, Flag, Layers, Search, Settings2, XCircle } from "lucide-react";
import { useDrivers, useSlice, useTrips } from "../api/hooks";
import type { TripRecord as DemoRecord } from "../trips/file";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { CATEGORIES } from "../domain/contract";
import { formatMoney, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { MapPanel } from "../dispatch/maps";
import { GROUPS, TRIP_OPS_KEY, emptyTripOps, flaggedIds, groupOf, listStats, normalizeTripOps, routeOf, saveView, type TripGroup, type TripOps } from "../trips/file";
import { categoryOf, fareBreakdown, paymentOf, startedAt, statusLabel, TRIP_STATUSES, type PaymentState } from "../trips/present";
import { RouteMap } from "../trips/RouteMap";
import { TripSettingsView } from "../trips/TripSettings";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";
import { Modal } from "../ui/Modal";

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
  const trips = useTrips(params.get("scope"));
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
  const rows = trips.data ?? [];
  const zones = useMemo(() => [...new Set(rows.map((trip) => trip.zoneId))], [rows]);
  const driverNames = useMemo(() => new Map((drivers.data ?? []).map((row) => [row.id, row.name])), [drivers.data]);

  // Everything the list needs per trip, worked out once. Date and money formatters are made once, not per row.
  const facts = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });
    const whenFormat = new Intl.DateTimeFormat(scope.market.locale, { timeZone: scope.market.timeZone, dateStyle: "short", timeStyle: "short" });
    const priceFormat = new Intl.NumberFormat(scope.market.locale, { style: "currency", currency: scope.market.currency });
    return new Map(rows.map((trip) => {
      const started = new Date(startedAt(trip.id));
      const tripGroup = groupOf(trip.status);
      return [trip.id, {
        day: dayFormat.format(started),
        when: whenFormat.format(started),
        group: tripGroup,
        category: categoryOf(trip.id),
        payment: paymentOf(trip),
        price: tripGroup === "completed" ? priceFormat.format(fareBreakdown(trip).chargedOre / scope.market.minorUnits) : "–",
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
          <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => set({ view: null })}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <div className="dx-head-text">
            <h2>Trip settings</h2>
            <p>Who sees phone numbers and chats, which actions admins have, and when money needs a second admin.</p>
          </div>
        </header>
        <TripSettingsView ops={ops} rev={slice.value.draftRev ?? 1} loading={slice.loading} editable={isSuper} />
      </div>
    );
  }

  return (
    <div className="dx-page op-page">
      <header className="dx-head">
        <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Trips</h2>
          <p data-testid="trip-count">
            {trips.isLoading ? "Loading trips." : `${rows.length} trips in demo data, ${filtered.length} match the filters, ${statusCount} statuses in this view.`}
          </p>
        </div>
        {isSuper ? <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "settings" })}><Settings2 size={14} aria-hidden="true" /> Settings</button> : null}
      </header>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "money" ? money(value) : format === "pct" ? `${value}%` : new Intl.NumberFormat(scope.market.locale).format(value))}
        cards={[
          { id: "count", label: "Trips", value: stats.total, previous: null, format: "count", info: "Trips that match the filters below." },
          { id: "live", label: "On the road now", value: stats.live, previous: null, format: "count", info: "A driver is on the way, waiting or driving." },
          { id: "done", label: "Completed", value: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0, previous: null, format: "pct", info: "Completed trips ÷ all trips in this list." },
          { id: "cancel", label: "Cancelled", value: stats.total ? Math.round((stats.cancelled / stats.total) * 100) : 0, previous: null, format: "pct", info: "Cancelled or expired ÷ all trips in this list.", goodDown: true },
          { id: "avg", label: "Average price", value: stats.avgPrice, previous: null, format: "money", info: "What riders paid on average for completed trips, before tips." },
          { id: "taken", label: "Riders paid", value: stats.taken, previous: null, format: "money", info: "All completed trips together, before tips and refunds." },
        ]}
      />

      <nav className="op-groups" aria-label="Trip groups">
        {GROUPS.map((item) => {
          const count = base.filter((trip) => inGroup(trip, item.id)).length;
          return (
            <button data-command="admin.trip.view" key={item.id} type="button" title={item.help} className={`op-group ${GROUP_TONE[item.id]}${group === item.id ? " active" : ""}`} aria-pressed={group === item.id} onClick={() => set({ group: item.id })}>
              <span className="op-group-icon" aria-hidden="true">{GROUP_ICON[item.id]}</span>
              <span className="op-group-text"><b>{item.label}</b><small>{count}</small></span>
            </button>
          );
        })}
      </nav>

      <section className="rp-bar op-filters" aria-label="Trip filters">
        <label className="op-field">
          <span>Trip status</span>
          <select aria-label="Trip status" value={status} onChange={(event) => set({ status: event.target.value })}>
            <option value="all">All {TRIP_STATUSES.length} statuses</option>
            {TRIP_STATUSES.map((code) => <option key={code} value={code}>{statusLabel(code)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>Zone</span>
          <select aria-label="Trip zone" value={zone} onChange={(event) => set({ zone: event.target.value })}>
            <option value="all">All zones</option>
            {zones.map((id) => <option key={id} value={id}>{zoneById(id)?.name ?? id}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>Category</span>
          <select aria-label="Trip category" value={category} onChange={(event) => set({ category: event.target.value })}>
            <option value="all">All categories</option>
            {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>Payment</span>
          <select aria-label="Payment state" value={payment} onChange={(event) => set({ payment: event.target.value })}>
            <option value="all">All payment states</option>
            {PAYMENTS.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>Driver</span>
          <select aria-label="Trip driver" value={driverId} onChange={(event) => set({ driver: event.target.value })}>
            <option value="all">All drivers</option>
            {(drivers.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>From</span>
          <input aria-label="From date" type="date" value={from} onChange={(event) => { setDates({ ...dates, from: event.target.value }); set({ from: event.target.value }); }} />
        </label>
        <label className="op-field">
          <span>To</span>
          <input aria-label="To date" type="date" value={to} onChange={(event) => { setDates({ ...dates, to: event.target.value }); set({ to: event.target.value }); }} />
        </label>
        <span className="rp-bar-actions">
          {views.length ? (
            <select aria-label="Saved trip views" value="" onChange={(event) => {
              const chosen = views.find((item) => item.id === event.target.value);
              if (!chosen) return;
              const next = new URLSearchParams(chosen.query);
              for (const key of ["country", "scope"]) { const value = params.get(key); if (value) next.set(key, value); }
              setParams(next, { replace: true });
              setNotice(`View ${chosen.name} opened.`);
            }}>
              <option value="">Saved views…</option>
              {views.map((item) => <option key={item.id} value={item.id}>{item.name}{item.shared && item.by !== agent?.id ? " (shared)" : ""}</option>)}
            </select>
          ) : null}
          {hasFilters ? <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={() => { const next = new URLSearchParams(params); for (const key of FILTER_KEYS) next.delete(key); setParams(next, { replace: true }); }}>Clear filters</button> : null}
          <button data-command="admin.trip.saveView" type="button" className="dash-btn small ghost" disabled={!hasFilters} title={hasFilters ? undefined : "Choose a filter first."} onClick={() => setSaveOpen(true)}><Bookmark size={13} aria-hidden="true" /> Save view</button>
        </span>
      </section>
      {notice ? <p className="dx-note" role="status">{notice}</p> : null}

      <div className={peek ? "op-list-grid with-peek" : "op-list-grid"}>
        <DataTable
          head={["Trip", "Rider", "Driver", "Status", "Zone", "Category", "Price", "Payment", "When", "Quick look"]}
          rowIds={filtered.map((trip) => trip.id)}
          rows={filtered.map((trip) => [
            trip.id,
            trip.name,
            trip.driverId ? driverNames.get(trip.driverId) ?? "Driver" : "No driver yet",
            trip.status,
            zoneById(trip.zoneId)?.name ?? trip.zoneId,
            fact(trip).category.label,
            fact(trip).price,
            statusLabel(fact(trip).payment),
            fact(trip).when,
            <button key="peek" data-command="admin.trip.view" type="button" className="dash-btn small ghost op-peek-btn" aria-label={`Quick look at ${trip.id}`} onClick={(event) => { event.stopPropagation(); setPeekId(peekId === trip.id ? null : trip.id); }}><Eye size={13} aria-hidden="true" /> Look</button>,
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

      <SaveViewDialog open={saveOpen} onClose={() => setSaveOpen(false)} ops={ops} query={filterQuery()} country={country} by={agent?.id ?? ""} onSaved={(name) => setNotice(`View ${name} saved.`)} />
    </div>
  );
}

function Peek({ trip, driverName, money, flagged, onClose }: { trip: DemoRecord; driverName: string; money: (minor: number) => string; flagged: boolean; onClose: () => void }) {
  const route = useMemo(() => routeOf(trip), [trip]);
  return (
    <aside className="op-peek" aria-label={`Quick look at ${trip.id}`}>
      <header>
        <span>
          <b>{trip.id}</b> <span className={`op-status ${groupOf(trip.status)}`}>{statusLabel(trip.status)}</span>
          {flagged ? <span className="op-status problem"><Flag size={11} aria-hidden="true" /> Flagged</span> : null}
        </span>
        <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={onClose}>Close</button>
      </header>
      <p className="op-peek-people">{trip.name} → {driverName || "no driver yet"}</p>
      <MapPanel title="Route">
        <RouteMap key={trip.id} stops={route.stops} path={route.path} label={`Route of ${trip.id}`} />
      </MapPanel>
      <ol className="op-stops">
        {route.stops.map((stop, index) => <li key={`${stop.kind}-${index}`} className={stop.kind}><i aria-hidden="true" />{stop.label}</li>)}
      </ol>
      <dl className="op-facts">
        <div><dt>Distance</dt><dd>{route.km} km</dd></div>
        <div><dt>Time</dt><dd>{route.minutes} min</dd></div>
        <div><dt>Price</dt><dd>{groupOf(trip.status) === "completed" ? money(fareBreakdown(trip).chargedOre) : "–"}</dd></div>
      </dl>
      <Link className="dash-btn small" to={`/trips/${trip.id}`}>Open the full trip</Link>
    </aside>
  );
}

function SaveViewDialog({ open, onClose, ops, query, country, by, onSaved }: { open: boolean; onClose: () => void; ops: TripOps; query: string; country: "SE" | "FR" | "TN"; by: string; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const result = saveView(ops, { name, by, shared, country, query });
  return (
    <Modal open={open} title="Save this view" onClose={onClose}>
      <div className="op-form">
        <label className="op-field"><span>View name</span><input aria-label="View name" value={name} onChange={(event) => setName(event.target.value)} placeholder="For example: Failed payments this week" /></label>
        <label className="op-check"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> Share with other admins</label>
        {result.error && name ? <p className="dx-warn">{result.error}</p> : null}
        <div className="op-form-actions">
          <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" onClick={onClose}>Cancel</button>
          <CommandButton command="admin.trip.saveView" className="dash-btn small" sliceKey={TRIP_OPS_KEY} value={result.ops} expectedSliceRev={ops.draftRev} confirmTarget={false} disabled={Boolean(result.error)} onDone={() => { onSaved(name.trim()); setName(""); setShared(false); onClose(); }}>Save view</CommandButton>
        </div>
      </div>
    </Modal>
  );
}
