import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { can } from "../auth/permissions";
import { BonusesView } from "../drivers/BonusesView";
import type { BonusDriver } from "../drivers/BonusBuilder";
import { AlertTriangle, CalendarClock, Car, Flame, PauseCircle, UserCheck, Users } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { periodWindow } from "../dashboard/period";
import { DRIVER_DOCUMENTS } from "../drivers/gate";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { countHealth } from "../fleet/documents";
import { useDocWarnDays } from "../drivers/useDocWarnDays";
import { driverPerformance } from "../fleet/performance";
import { liveDrivers } from "../dashboard/live";
import { driverCode } from "../fleet/codes";
import { ContactActions, DocSummary, OnlinePill, type Presence } from "../fleet/ui";
import { CATEGORIES } from "../domain/contract";
import { formatMoney, marketOfZone, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { DataTable } from "../ui/DataTable";
import { tr, trn, trx, uiLocale } from "../i18n";

const VIEWS = [
  { id: "all", get label() { return tr("All"); } },
  { id: "online", get label() { return tr("Online now"); } },
  { id: "active", get label() { return tr("Active"); } },
  { id: "on_hold", get label() { return tr("On hold"); } },
  { id: "pending", get label() { return tr("Pending"); } },
  { id: "suspended", get label() { return tr("Suspended"); } },
  { id: "expiring", get label() { return tr("Documents expiring"); } },
  { id: "invalid", get label() { return tr("Documents missing"); } },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function DriversPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") === "bonuses" ? "bonuses" : "drivers";
  const { agent } = useSession();
  const scope = useMarketScope();
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const fleets = useRecords("fleets", null);
  const trips = useRecords("trips", null);
  const incidents = useRecords("incidents", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const warnDaysFor = useDocWarnDays();
  const [view, setView] = useState<View>("all");
  const [type, setType] = useState("all");
  const [now] = useState(() => Date.now());
  const month = useMemo(() => periodWindow({ kind: "month" }, now, scope.market.timeZone, uiLocale()), [now, scope.market]);

  const presence = useMemo(() => new Map(liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], 0).map((row) => [row.id, row.state as Presence])), [drivers.data, vehicles.data, trips.data, incidents.data]);

  const enriched = useMemo(() => (drivers.data ?? [])
    .filter((driver) => !agent?.scope.fleetPartnerId || driver.fleetId === agent.scope.fleetPartnerId)
    .map((driver) => {
      const ops = driverOps(store.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status, kind: driver.kind });
      const docs = DRIVER_DOCUMENTS.filter((id) => !(driver.fleetId && id === "company_registration")).map((id) => ops.documents[id]);
      const counts = countHealth(docs, now, warnDaysFor(driver.zoneId));
      const perf = driverPerformance({ id: driver.id, zoneId: driver.zoneId, status: driver.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, month, false).current;
      const car = (vehicles.data ?? []).find((row) => row.driverId === driver.id);
      const fleet = (fleets.data ?? []).find((row) => row.id === driver.fleetId);
      const cats = CATEGORIES.filter((category) => ops.categories[category.id]).map((category) => category.label);
      return { driver, counts, total: docs.length, perf, car, fleet, cats, code: driverCode(driver), online: presence.get(driver.id) ?? ("offline" as Presence) };
    }), [drivers.data, vehicles.data, fleets.data, store.value, agent, now, month, presence, warnDaysFor]);

  const counts = {
    all: enriched.length,
    online: enriched.filter((row) => row.online !== "offline").length,
    active: enriched.filter((row) => row.driver.status === "active").length,
    on_hold: enriched.filter((row) => row.driver.status === "on_hold").length,
    pending: enriched.filter((row) => row.driver.status === "pending").length,
    suspended: enriched.filter((row) => row.driver.status === "suspended").length,
    expiring: enriched.filter((row) => row.counts.expiring > 0).length,
    invalid: enriched.filter((row) => row.counts.invalid > 0).length,
  };
  const fleetOptions = Array.from(new Map(enriched.filter((row) => row.fleet).map((row) => [row.fleet!.id, row.fleet!.name])));

  const rows = enriched.filter((row) => {
    if (type === "independent" && row.driver.fleetId) return false;
    if (type === "fleet" && !row.driver.fleetId) return false;
    if (type.startsWith("F") && row.driver.fleetId !== type) return false;
    if (view === "online") return row.online !== "offline";
    if (view === "expiring") return row.counts.expiring > 0;
    if (view === "invalid") return row.counts.invalid > 0;
    return view === "all" || row.driver.status === view;
  });
  const money = (minor: number) => formatMoney(minor, scope.country, { compact: true });
  const bonusDrivers: BonusDriver[] = useMemo(() => enriched
    .filter((row) => marketOfZone(row.driver.zoneId)?.id === scope.country)
    .map((row) => {
      const ops = driverOps(store.value, { id: row.driver.id, name: row.driver.name, fleetId: row.driver.fleetId, status: row.driver.status, kind: row.driver.kind });
      let seed = 0;
      for (const char of row.driver.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
      return {
        facts: { id: row.driver.id, fleetId: row.driver.fleetId ?? null, status: row.driver.status, rating: ops.ratings.stars, joinedDays: seed % 400 },
        name: row.driver.name,
        code: row.code,
        zoneId: row.driver.zoneId,
        home: zoneById(row.driver.zoneId)?.center ?? scope.market.center,
      };
    }), [enriched, store.value, scope.country, scope.market.center]);

  function go(next: "drivers" | "bonuses") {
    const copy = new URLSearchParams(params);
    if (next === "bonuses") copy.set("view", "bonuses");
    else copy.delete("view");
    setParams(copy, { replace: true });
  }

  const tabs = (
    <div className="dash-tabs" role="tablist" aria-label={tr("Drivers sections")}>
      <button data-command="admin.drivers.view" type="button" role="tab" aria-selected={tab === "drivers"} className={tab === "drivers" ? "active" : undefined} onClick={() => go("drivers")}>{trn("{0} Drivers", <Users size={15} aria-hidden="true" />)}</button>
      <button data-command="admin.drivers.view" type="button" role="tab" aria-selected={tab === "bonuses"} className={tab === "bonuses" ? "active" : undefined} onClick={() => go("bonuses")}>{trn("{0} Bonuses", <Flame size={15} aria-hidden="true" />)}</button>
    </div>
  );

  if (tab === "bonuses") {
    return (
      <div className="fd-page">
        <div className="fd-head">
          <div>
            <h2>{tr("Drivers")}</h2>
            <p>{trn("Bonuses drivers see in the driver app: ride bonuses and area bonuses on the map, in {0}.", trx(scope.market.name))}</p>
          </div>
        </div>
        {tabs}
        <BonusesView country={scope.country} drivers={bonusDrivers} fleets={Array.from(new Map((fleets.data ?? []).map((fleet) => [fleet.id, { id: fleet.id, name: fleet.name }])).values())} agentId={agent?.id ?? null} canEdit={Boolean(agent && can(agent.role, "drivers.bonuses"))} />
      </div>
    );
  }
  const keep = params.get("country") || params.get("scope") ? `?${params.toString()}` : "";

  return (
    <div className="fd-page">
      <div className="fd-head">
        <div>
          <h2>{tr("Drivers")}</h2>
          <p>{trn("{0} Open a driver to see every detail, document, performance and earnings. Numbers are for {1}.", drivers.isLoading ? tr("Loading drivers.") : tr("{0} in {1}.", [rows.length, trx(VIEWS.find((item) => item.id === view)?.label)]), trx(month.label))}</p>
        </div>
      </div>

      {tabs}

      <section className="fd-cards" aria-label={tr("Driver summary")}>
        <SummaryCard icon={<Users size={18} />} tone="blue" label={tr("All drivers")} value={counts.all} />
        <SummaryCard icon={<UserCheck size={18} />} tone="green" label={tr("Active")} value={counts.active} hint={tr("{0} online now", [counts.online])} />
        <SummaryCard icon={<PauseCircle size={18} />} tone="amber" label={tr("On hold")} value={counts.on_hold} />
        <SummaryCard icon={<CalendarClock size={18} />} tone="violet" label={tr("Pending approval")} value={counts.pending} />
        <SummaryCard icon={<AlertTriangle size={18} />} tone="orange" label={tr("Documents expiring")} value={counts.expiring} />
        <SummaryCard icon={<Car size={18} />} tone="red" label={tr("Documents missing or wrong")} value={counts.invalid} />
      </section>

      <div className="fd-toolbar">
        <div className="fd-views" role="group" aria-label={tr("Driver views")}>
          {VIEWS.map((item) => (
            <button key={item.id} type="button" data-command="admin.table.filter" className={view === item.id ? "fd-view active" : "fd-view"} aria-pressed={view === item.id} aria-label={trx(item.label)} onClick={() => setView(item.id)}>
              {trx(item.label)}<span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="fd-select">
          <span>{tr("Type")}</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">{tr("All drivers")}</option>
            <option value="independent">{tr("Independent")}</option>
            <option value="fleet">{tr("In a fleet")}</option>
            {fleetOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>

      <DataTable
        className="fd-table"
        head={[tr("Code"), tr("Name"), tr("Online"), tr("Type"), tr("Status"), tr("Zone"), tr("Vehicle"), tr("Categories"), tr("Documents"), tr("Rating"), tr("Trips"), tr("Cancel %"), tr("Earnings"), tr("Contact")]}
        rowIds={rows.map((row) => row.driver.id)}
        rows={rows.map(({ driver, counts: docCounts, total, perf, car, fleet, cats, code, online }) => [
          code,
          driver.name,
          <OnlinePill key={`${driver.id}-online`} presence={online} />,
          fleet ? fleet.name : "Independent",
          driver.status,
          zoneById(driver.zoneId)?.name ?? driver.zoneId,
          car ? `${car.make ?? ""} ${car.model ?? ""} · ${car.plate ?? car.id}`.trim() : "No vehicle",
          cats.join(", ") || "None",
          <DocSummary key={`${driver.id}-docs`} counts={docCounts} total={total} />,
          perf.rating ? perf.rating.toFixed(2) : "—",
          String(perf.trips),
          perf.trips ? `${perf.cancellationPct}%` : "—",
          perf.netMinor ? money(perf.netMinor) : "—",
          <ContactActions
            key={`${driver.id}-contact`}
            kind="driver"
            compact
            id={driver.id}
            name={driver.name}
            phone={driver.phone}
            zoneId={driver.zoneId}
            messageTo={`/drivers/${driver.id}?tab=messages`}
            mapTo={online === "offline" ? null : `/?country=${marketOfZone(driver.zoneId)?.id ?? "SE"}&focus=${driver.id}`}
          />,
        ])}
        state={drivers.isLoading ? "loading" : drivers.isError ? "error" : "ready"}
        onRetry={() => void drivers.refetch()}
        onRow={(index) => {
          const id = rows[index]?.driver.id;
          if (id) navigate({ pathname: `/drivers/${id}`, search: keep });
        }}
      />
    </div>
  );
}

function SummaryCard({ icon, tone, label, value, hint }: { icon: ReactNode; tone: string; label: string; value: number; hint?: string }) {
  return (
    <article className={`fd-card tone-${tone}`}>
      <span className="fd-card-icon" aria-hidden="true">{icon}</span>
      <span className="fd-card-label">{trx(label)}</span>
      <strong>{value}</strong>
      {hint ? <small className="fd-card-hint">{trx(hint)}</small> : null}
    </article>
  );
}
