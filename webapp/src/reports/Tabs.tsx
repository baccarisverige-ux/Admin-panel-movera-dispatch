import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { BarChart3, Bell, Car, Clock, CreditCard, Layers, MapPin, Radar, Tags, Trophy, UserRound, Users, Wallet } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useAlertsMaybe } from "../alerts/AlertsContext";
import { agentName } from "../alerts/AlertActions";
import { solvedHistory } from "../alerts/history";
import { EarningsChart } from "../dashboard/EarningsChart";
import { earningsReport } from "../dashboard/earnings";
import type { PeriodWindow } from "../dashboard/period";
import { zoneResults } from "../dispatch/demo";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, mainMode, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { driverPerformance } from "../fleet/performance";
import type { Market, MarketZone } from "../markets/markets";
import { failureHandled } from "../payments/failures";
import { useRidersData } from "../riders/useRidersData";
import { alertsData, dispatchData, driversData, filterShare, moneyData, notesFor, ridersData, ridesData, type Card, type DriverRow, type Filters, type ZoneRow } from "./engine";
import { Bars, Cards, Delta, HourBars, Notes, Panel, SortTable, type Fmt } from "./ui";

export type CsvTable = { name: string; head: string[]; rows: (string | number)[][] };

export type TabProps = {
  market: Market;
  zones: MarketZone[];
  window: PeriodWindow;
  compare: boolean;
  filters: Filters;
  fmt: Fmt;
  money: (minor: number) => string;
  onCsv: (table: CsvTable) => void;
};

export function useZoneRows(market: Market, zones: MarketZone[], window: PeriodWindow): ZoneRow[] {
  return useMemo(() => zones.map((zone) => {
    const one = earningsReport(market.id, [zone.id], window);
    const requested = one.totals.trips + one.totals.cancelled;
    const prevRequested = one.previous.trips + one.previous.cancelled;
    return {
      id: zone.id,
      name: zone.name,
      trips: one.totals.trips,
      cancelled: one.totals.cancelled,
      cancelPct: requested ? Math.round((one.totals.cancelled / requested) * 1000) / 10 : 0,
      waitMin: one.totals.trips ? Math.round((one.totals.waitMinTotal / one.totals.trips) * 10) / 10 : 0,
      grossMinor: one.totals.grossMinor,
      netMinor: one.totals.netMinor,
      previousTrips: one.previous.trips,
      previousCancelPct: prevRequested ? Math.round((one.previous.cancelled / prevRequested) * 1000) / 10 : 0,
    };
  }), [market.id, zones, window]);
}

function useReport(market: Market, zones: MarketZone[], window: PeriodWindow) {
  const ids = zones.map((zone) => zone.id).join(",");
  return useMemo(() => earningsReport(market.id, ids ? ids.split(",") : [], window), [market.id, ids, window]);
}

export function useCsv(onCsv: (table: CsvTable) => void, table: CsvTable) {
  const key = JSON.stringify(table);
  // Hand the table to the page only when it changed, so Export always takes what is on screen.
  useEffect(() => onCsv(JSON.parse(key) as CsvTable), [key, onCsv]);
}

const count = (value: number) => new Intl.NumberFormat("en-GB").format(Math.round(value));

export function RidesTab({ market, zones, window, compare, filters, fmt, onCsv }: TabProps) {
  const report = useReport(market, zones, window);
  const zoneRows = useZoneRows(market, zones, window);
  const share = filterShare(report, filters);
  const data = ridesData(report, zoneRows, share);
  useCsv(onCsv, { name: "rides", head: ["Zone", "Rides", "Cancelled", "Cancel rate %", "Average wait min", "Rides before"], rows: zoneRows.map((row) => [row.name, Math.round(row.trips * share), Math.round(row.cancelled * share), row.cancelPct, row.waitMin, Math.round(row.previousTrips * share)]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title="Rides over time" icon={<BarChart3 size={16} aria-hidden="true" />} wide>
          <EarningsChart points={data.series} format={(value) => `${count(value)} rides`} formatAxis={(value) => count(value)} compareLabel={compare ? window.compareLabel : ""} />
        </Panel>
        <Panel title="Busiest hours" icon={<Clock size={16} aria-hidden="true" />}>
          <HourBars rows={data.byHour} />
        </Panel>
        <Panel title="By category" icon={<Tags size={16} aria-hidden="true" />}>
          <Bars rows={data.byCategory.filter((row) => !filters.category || row.label.toLowerCase() === filters.category || data.byCategory.length === 1).map((row) => ({ label: row.label, value: row.trips }))} format={count} />
        </Panel>
        <Panel title="By zone" icon={<MapPin size={16} aria-hidden="true" />} wide>
          <SortTable label="Rides by zone" rows={zoneRows} rowKey={(row) => row.id} initial="trips" columns={[
            { id: "name", label: "Zone", value: (row) => row.name },
            { id: "trips", label: "Rides", value: (row) => Math.round(row.trips * share), show: (row) => <>{count(row.trips * share)} {compare ? <Delta now={row.trips} before={row.previousTrips} /> : null}</>, numeric: true },
            { id: "cancelled", label: "Cancelled", value: (row) => Math.round(row.cancelled * share), numeric: true },
            { id: "cancelPct", label: "Cancel rate", value: (row) => row.cancelPct, show: (row) => <>{row.cancelPct}% {compare ? <Delta now={row.cancelPct} before={row.previousCancelPct} goodDown /> : null}</>, numeric: true },
            { id: "waitMin", label: "Average wait", value: (row) => row.waitMin, show: (row) => `${row.waitMin} min`, numeric: true },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

export function MoneyTab({ market, zones, window, compare, filters, fmt, money, onCsv }: TabProps) {
  const report = useReport(market, zones, window);
  const zoneRows = useZoneRows(market, zones, window);
  const payments = useRecords("payments");
  const ids = new Set(zones.map((zone) => zone.id));
  const open = (payments.data ?? []).filter((row) => row.status === "failed" && !failureHandled(row) && ids.has(row.zoneId));
  const share = filterShare(report, filters);
  const data = moneyData(report, zoneRows, share, { count: open.length, minor: open.reduce((sum, row) => sum + (row.fareOre ?? 0), 0) });
  useCsv(onCsv, { name: "money", head: ["Zone", "Bookings", "Net revenue"], rows: zoneRows.map((row) => [row.name, Math.round(row.grossMinor * share) / market.minorUnits, Math.round(row.netMinor * share) / market.minorUnits]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title="Bookings over time" icon={<BarChart3 size={16} aria-hidden="true" />} wide>
          <EarningsChart points={data.series} format={money} formatAxis={(value) => money(value)} compareLabel={compare ? window.compareLabel : ""} />
        </Panel>
        <Panel title="By payment method" icon={<CreditCard size={16} aria-hidden="true" />}>
          <Bars rows={data.byMethod.map((row) => ({ label: row.label, value: row.minor }))} format={money} />
        </Panel>
        <Panel title="By category" icon={<Tags size={16} aria-hidden="true" />}>
          <Bars rows={data.byCategory.map((row) => ({ label: row.label, value: row.minor }))} format={money} />
        </Panel>
        <Panel title="By zone" icon={<MapPin size={16} aria-hidden="true" />} wide>
          <SortTable label="Money by zone" rows={zoneRows} rowKey={(row) => row.id} initial="gross" columns={[
            { id: "name", label: "Zone", value: (row) => row.name },
            { id: "gross", label: "Bookings", value: (row) => row.grossMinor * share, show: (row) => money(row.grossMinor * share), numeric: true },
            { id: "net", label: "Net revenue", value: (row) => row.netMinor * share, show: (row) => money(row.netMinor * share), numeric: true },
            { id: "trips", label: "Rides", value: (row) => Math.round(row.trips * share), numeric: true },
            { id: "avg", label: "Average fare", value: (row) => (row.trips ? row.grossMinor / row.trips : 0), show: (row) => money(row.trips ? row.grossMinor / row.trips : 0), numeric: true },
          ]} />
        </Panel>
      </div>
      <p className="rp-foot">VAT and taxes per country are in the <Link to="/reports?tab=taxes">Taxes</Link> tab.</p>
    </div>
  );
}

export function DriversTab({ market, zones, window, compare, filters, fmt, money, onCsv }: TabProps) {
  const drivers = useRecords("drivers");
  const fleets = useRecords("fleets");
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const ids = new Set(zones.map((zone) => zone.id));
  const rows: DriverRow[] = useMemo(() => (drivers.data ?? [])
    .filter((row) => ids.has(row.zoneId) && (!filters.driverId || row.id === filters.driverId) && (!filters.fleetId || row.fleetId === filters.fleetId))
    .map((row) => {
      const ops = driverOps(store.value, { id: row.id, name: row.name, fleetId: row.fleetId ?? null, status: row.status, kind: row.kind });
      const perf = driverPerformance({ id: row.id, zoneId: row.zoneId, status: row.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, window, false);
      return {
        id: row.id,
        name: row.name,
        zone: zones.find((zone) => zone.id === row.zoneId)?.name ?? row.zoneId,
        fleet: (fleets.data ?? []).find((fleet) => fleet.id === row.fleetId)?.name ?? "",
        rides: perf.current.trips,
        hours: perf.current.onlineHours,
        netMinor: perf.current.netMinor,
        bonusMinor: perf.current.bonusMinor,
        acceptancePct: perf.current.acceptancePct,
        cancelPct: perf.current.cancellationPct,
        rating: perf.current.rating,
        previousRides: perf.previous.trips,
      };
    }), [drivers.data, fleets.data, store.value, window, filters.driverId, filters.fleetId, zones.map((zone) => zone.id).join(",")]);
  const data = driversData(rows);
  useCsv(onCsv, { name: "drivers", head: ["Driver", "Zone", "Fleet", "Rides", "Online hours", "Earnings", "Bonuses", "Acceptance %", "Cancel %", "Rating"], rows: data.rows.map((row) => [row.name, row.zone, row.fleet, row.rides, row.hours, row.netMinor / market.minorUnits, row.bonusMinor / market.minorUnits, row.acceptancePct, row.cancelPct, row.rating]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <Panel title="Drivers" icon={<Car size={16} aria-hidden="true" />} wide>
        <SortTable label="Drivers" rows={data.rows} rowKey={(row) => row.id} initial="rides" columns={[
          { id: "name", label: "Driver", value: (row) => row.name, show: (row) => <Link to={`/drivers/${row.id}`}>{row.name}</Link> },
          { id: "zone", label: "Zone", value: (row) => row.zone },
          { id: "fleet", label: "Fleet", value: (row) => row.fleet || "Own" },
          { id: "rides", label: "Rides", value: (row) => row.rides, show: (row) => <>{row.rides} {compare ? <Delta now={row.rides} before={row.previousRides} /> : null}</>, numeric: true },
          { id: "hours", label: "Online", value: (row) => row.hours, show: (row) => `${row.hours} h`, numeric: true },
          { id: "net", label: "Earnings", value: (row) => row.netMinor, show: (row) => money(row.netMinor), numeric: true },
          { id: "bonus", label: "Bonuses", value: (row) => row.bonusMinor, show: (row) => money(row.bonusMinor), numeric: true },
          { id: "acc", label: "Acceptance", value: (row) => row.acceptancePct, show: (row) => `${row.acceptancePct}%`, numeric: true },
          { id: "cancel", label: "Cancels", value: (row) => row.cancelPct, show: (row) => `${row.cancelPct}%`, numeric: true },
          { id: "rating", label: "Rating", value: (row) => row.rating, numeric: true },
        ]} />
      </Panel>
    </div>
  );
}

export function RidersTab({ market, window, compare, fmt, money, onCsv }: TabProps) {
  const riders = useRidersData("year");
  const inWindow = (at: number, start: number, end: number) => at >= start && at < end;
  const rows = useMemo(() => riders.rows.filter((row) => row.profile.country === market.id).map((row) => {
    const done = row.bookings.filter((booking) => booking.status === "completed" && inWindow(booking.at, window.start, window.end));
    return { id: row.rider.id, name: row.rider.name, rides: done.length, spentMinor: done.reduce((sum, booking) => sum + booking.fareMinor, 0), isNew: inWindow(row.profile.joinedAt, window.start, window.end), promo: done.some((booking) => booking.promo), cancelRate: row.profile.cancelRate };
  }), [riders.rows, market.id, window]);
  const before = riders.rows.filter((row) => row.profile.country === market.id && row.bookings.some((booking) => booking.status === "completed" && inWindow(booking.at, window.prevStart, window.prevEnd)));
  const data = ridersData(rows, before.length, before.filter((row) => inWindow(row.profile.joinedAt, window.prevStart, window.prevEnd)).length);
  useCsv(onCsv, { name: "riders", head: ["Rider", "Rides", "Spent", "New", "Used a promotion"], rows: data.top.map((row) => [row.name, row.rides, row.spentMinor / market.minorUnits, row.isNew ? "yes" : "no", row.promo ? "yes" : "no"]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <Panel title="Top riders" icon={<Trophy size={16} aria-hidden="true" />} wide>
        <SortTable label="Top riders" rows={data.top} rowKey={(row) => row.id} initial="spent" columns={[
          { id: "name", label: "Rider", value: (row) => row.name, show: (row) => <Link to={`/riders/${row.id}`}>{row.name}</Link> },
          { id: "rides", label: "Rides", value: (row) => row.rides, numeric: true },
          { id: "spent", label: "Spent", value: (row) => row.spentMinor, show: (row) => money(row.spentMinor), numeric: true },
          { id: "new", label: "New", value: (row) => (row.isNew ? "New" : ""), show: (row) => (row.isNew ? <span className="rp-tag">New</span> : null) },
          { id: "promo", label: "Promotion", value: (row) => (row.promo ? "Yes" : ""), show: (row) => (row.promo ? <span className="rp-tag">Used</span> : null) },
        ]} />
      </Panel>
    </div>
  );
}

export function DispatchTab({ zones, window, compare, fmt, onCsv }: TabProps) {
  const slice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const book = normalizeDispatchBook(slice.value);
  const rows = zones.map((zone) => {
    const rules = liveRules(book, zone.id);
    // Reports are not shown in a live build; the demo model always answers here.
    const result = zoneResults(zone.id, rules) ?? { findSec: NaN, acceptedPct: NaN, noDriverPct: NaN, pickupMin: NaN, radarPct: NaN, exclusivePct: NaN, requests: NaN };
    const mode = mainMode(rules);
    return { id: zone.id, name: zone.name, ...result, mode: mode === "auto" ? "Automatic" : mode === "radar" ? "Radar" : "Exclusive" };
  });
  const data = dispatchData(rows);
  useCsv(onCsv, { name: "dispatch", head: ["Zone", "Main mode", "Requests", "Time to find a driver s", "Accepted %", "No driver %", "Pickup min"], rows: data.rows.map((row) => [row.name, row.mode, row.requests, row.findSec, row.acceptedPct, row.noDriverPct, row.pickupMin]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <Panel title="By zone" icon={<Radar size={16} aria-hidden="true" />} wide aside={<Link className="link-action" to="/dispatch?view=history">Dispatch history</Link>}>
        <SortTable label="Dispatch by zone" rows={data.rows} rowKey={(row) => row.id} initial="requests" columns={[
          { id: "name", label: "Zone", value: (row) => row.name },
          { id: "mode", label: "Main mode", value: (row) => row.mode },
          { id: "requests", label: "Requests", value: (row) => row.requests, numeric: true },
          { id: "find", label: "Find a driver", value: (row) => row.findSec, show: (row) => `${row.findSec} s`, numeric: true },
          { id: "accepted", label: "Accepted", value: (row) => row.acceptedPct, show: (row) => `${row.acceptedPct}%`, numeric: true },
          { id: "nodriver", label: "No driver", value: (row) => row.noDriverPct, show: (row) => `${row.noDriverPct}%`, numeric: true },
          { id: "pickup", label: "Pickup", value: (row) => row.pickupMin, show: (row) => `${row.pickupMin} min`, numeric: true },
        ]} />
      </Panel>
    </div>
  );
}

export function AlertsTab({ window, compare, fmt, onCsv }: TabProps) {
  const shared = useAlertsMaybe();
  const history = useMemo(() => (shared ? solvedHistory(shared.book, shared.safety.value, (id) => shared.facts.incidents.find((row) => row.id === id)?.zoneId ?? null, (id) => shared.facts.incidents.find((row) => row.id === id)?.kind === "ride_check") : []), [shared?.book, shared?.safety.value, shared?.facts.incidents]);
  const data = alertsData(history, window, shared?.counts ?? { critical: 0, important: 0, info: 0 });
  useCsv(onCsv, { name: "alerts", head: ["Alert", "Level", "Taken by", "Solved by", "Solved at", "Minutes to solve", "Note"], rows: data.rows.map((row) => [row.title, row.level, agentName(row.takenBy), agentName(row.solvedBy), row.doneAt, row.solveMin, row.note]) });
  return (
    <div className="rp-tab">
      <Notes notes={data.notes} />
      <Cards cards={data.cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title="Solved by" icon={<Users size={16} aria-hidden="true" />}>
          {data.byAdmin.length ? <Bars rows={data.byAdmin.map((row) => ({ label: agentName(row.admin), value: row.count, hint: `${row.avgSolve} min` }))} format={count} /> : <p className="dx-calm">No alert solved in this period.</p>}
        </Panel>
        <Panel title="Solved alerts" icon={<Bell size={16} aria-hidden="true" />} aside={<Link className="link-action" to="/alerts?view=history">All alert history</Link>}>
          <SortTable label="Solved alerts" rows={data.rows} rowKey={(row) => `${row.id}-${row.doneAt}`} initial="done" columns={[
            { id: "title", label: "Alert", value: (row) => row.title },
            { id: "solved", label: "Solved by", value: (row) => agentName(row.solvedBy) },
            { id: "solve", label: "Minutes", value: (row) => row.solveMin, numeric: true },
            { id: "done", label: "When", value: (row) => row.doneAt, show: (row) => row.doneAt.slice(0, 16).replace("T", " ") },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

export function OverviewTab(props: TabProps) {
  const { market, zones, window, compare, filters, fmt, money } = props;
  const report = useReport(market, zones, window);
  const share = filterShare(report, filters);
  const zoneRows = useZoneRows(market, zones, window);
  const rides = ridesData(report, zoneRows, share);
  const cash = moneyData(report, zoneRows, share, { count: 0, minor: 0 });
  const pick = (cards: Card[], id: string) => cards.find((card) => card.id === id)!;
  const cards = [pick(cash.cards, "gross"), pick(cash.cards, "commission"), pick(cash.cards, "net"), pick(rides.cards, "completed"), pick(rides.cards, "cancelRate"), pick(rides.cards, "wait")];
  useCsv(props.onCsv, { name: "overview", head: ["Number", "Value", "Before"], rows: cards.map((card) => [card.label, card.format === "money" ? card.value / market.minorUnits : card.value, card.previous === null ? "" : card.format === "money" ? card.previous / market.minorUnits : card.previous]) });
  const best = [...zoneRows].sort((a, b) => b.grossMinor - a.grossMinor).slice(0, 5);
  return (
    <div className="rp-tab">
      <Notes notes={[...notesFor(cards), ...rides.notes.filter((note) => note.text.startsWith("Cancels in"))]} />
      <Cards cards={cards} fmt={fmt} compareLabel={window.compareLabel} compare={compare} />
      <div className="rp-grid">
        <Panel title="Bookings over time" icon={<Wallet size={16} aria-hidden="true" />} wide>
          <EarningsChart points={cash.series} format={money} formatAxis={(value) => money(value)} compareLabel={compare ? window.compareLabel : ""} />
        </Panel>
        <Panel title="Top zones" icon={<Layers size={16} aria-hidden="true" />}>
          <Bars rows={best.map((row) => ({ label: row.name, value: row.grossMinor * share }))} format={money} />
        </Panel>
        <Panel title="Busiest hours" icon={<UserRound size={16} aria-hidden="true" />}>
          <HourBars rows={rides.byHour} />
        </Panel>
      </div>
    </div>
  );
}
