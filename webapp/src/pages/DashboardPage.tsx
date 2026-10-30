import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { kpiReport, localDay as kpiDay } from "../live/kpis";
import type { KpiDay } from "../live/types";
import { NotConnected } from "../live/NotConnected";
import { isLiveData } from "../live/realData";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  Car,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  LifeBuoy,
  Megaphone,
  ReceiptText,
  RefreshCw,
  Repeat,
  Search,
  Siren,
  Ticket,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "../api/AdminApiContext";
import { useApprovals, useAudit, useRecords, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { commandById } from "../commands/registry";
import { useAlertsMaybe } from "../alerts/AlertsContext";
import { DriversMap, REQUEST_COLOR, STATE_COLOR } from "../dashboard/DriversMap";
import { EarningsChart } from "../dashboard/EarningsChart";
import { change, COMMISSION_PLACEHOLDER, earningsReport, type Share } from "../dashboard/earnings";
import { activeBoosts, airportQueues, cancellations, ratings, supplyDemand } from "../dashboard/insights";
import { countStates, LIVE_STATES, liveDrivers, type LiveState } from "../dashboard/live";
import { LiveRiders } from "../dashboard/LiveRiders";
import { RiderQuickActions, useDispatchBook } from "../dispatch/HandlePanel";
import { SupplyDemandDrill } from "../dashboard/SupplyDemandDrill";
import type { MapLocate } from "../dashboard/supplyDrill";
import { offersLink } from "../dispatch/MovedCard";
import { useOnTheWay } from "../dispatch/RideProgress";
import { liveTrip } from "../dashboard/liveTrip";
import { PeriodPicker } from "../dashboard/PeriodPicker";
import { parsePeriod, periodParams, periodWindow, type Period } from "../dashboard/period";
import { RideTable } from "../dashboard/RideTable";
import { DashboardAccessContext, HIDDEN_DRIVER, dashboardAccess, maskBookings, maskDrivers, maskRequests, maskRiders, maskTrip } from "../dashboard/access";
import { candidatesFor, rideRequests, riderCounts, ridersOnlineIn, type RideRequest } from "../dashboard/riders";
import { demoShift, rideCounts, scheduledRides } from "../dashboard/scheduled";
import { localDay, startOfLocalDay } from "../dashboard/time";
import { useAlertSignals, type Signal } from "../dashboard/useAlertSignals";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import { ActivityFeed, AirportCard, BoostCard, InsightsCard, LiveStamp, LiveTag, SoundToggle, type ActivityItem, type DriverRank } from "../dashboard/Widgets";
import { CATEGORIES } from "../domain/contract";
import { statusLabel } from "../domain/labels";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { driverPerformance } from "../fleet/performance";
import { formatMoney } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { openFailures } from "../payments/failures";
import { surgeRows } from "../pricing/rows";
import { DriverSurgeLegend, SurgeControls, SurgeLegend } from "../pricing/SurgeControls";
import { useLiveMapSurge } from "../live/useLiveSurge";
import { useSurgePref } from "../pricing/useSurgePref";
import { SLICE_KEY, emptyPricingStore, normalizeStore } from "../pricing/zonePricing";
import { Flag } from "../ui/Flag";
import { LanguageQuickSwitch } from "../i18n/LanguageQuickSwitch";
import { BONUS_KEY, bonusState, emptyBonusBook, normalizeBonusBook, type BonusBook } from "../drivers/bonus";
import type { BonusMapArea } from "../dashboard/DriversMap";
import { LiveMapQuickPopup, type QuickTarget } from "../pricing/LiveMapExtras";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";
import { zoneFilterOf } from "../live/zoneFilter";

const FIVE_MIN = 5 * 60_000;
const DAY_MS = 86_400_000;
const LIVE_MS = 10_000;
const SLOW_MS = 30_000;
const TABS = [
  { id: "overview", get label() { return tr("Overview"); } },
  { id: "live", get label() { return tr("Live"); } },
  { id: "work", get label() { return tr("Work"); } },
  { id: "insights", get label() { return tr("Insights"); } },
] as const;
type Tab = (typeof TABS)[number]["id"];

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(timer);
  }, [stepMs]);
  return now;
}

function Delta({ value, inverse = false, label }: { value: number | null; inverse?: boolean; label: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="delta flat">{tr("No comparison")}</span>;
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={good ? "delta good" : "delta bad"} title={label}>
      <Icon size={14} aria-hidden="true" />
      {up ? "+" : "−"}{Math.abs(value).toFixed(1)}%
      <span className="sr-only"> {trx(label)}</span>
    </span>
  );
}

function Kpi({ icon, tone, label, value, delta, hint }: { icon: ReactNode; tone: string; label: string; value: string; delta?: ReactNode; hint?: ReactNode }) {
  return (
    <article className={`kpi tone-${tone}`}>
      <div className="kpi-icon" aria-hidden="true">{icon}</div>
      <div className="kpi-body">
        <span className="kpi-label">{trx(label)}</span>
        <strong className="kpi-value">{value}</strong>
        <div className="kpi-foot">{delta}{hint ? <small>{trx(hint)}</small> : null}</div>
      </div>
    </article>
  );
}

function ShareBars({ rows, format }: { rows: Share[]; format: (minor: number) => string }) {
  const max = Math.max(...rows.map((row) => row.minor), 1);
  const total = rows.reduce((sum, row) => sum + row.minor, 0) || 1;
  return (
    <ul className="share-bars">
      {rows.slice(0, 8).map((row) => (
        <li key={row.id} title={`${row.label}: ${format(row.minor)}`}>
          <div className="share-head"><span>{trx(row.label)}</span><strong>{format(row.minor)}</strong><small>{Math.round((row.minor / total) * 100)}%</small></div>
          <div className="share-track"><i style={{ width: `${(row.minor / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

type Action = { id: string; label: string; icon: ReactNode; path?: string; permission: string; onRun?: () => void };

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const api = useAdminApi();
  const { agent } = useSession();
  const scope = useMarketScope();
  const { market, country } = scope;
  const role = agent?.role ?? "viewer";
  const zoneKey = (Array.isArray(scope.effective) ? scope.effective : [scope.effective]).filter((zone) => zone !== "__scope-denied__").join(",");
  const period = parsePeriod(params);
  const now = useNow(LIVE_MS);
  const reportNow = Math.floor(now / FIVE_MIN) * FIVE_MIN;
  const tab: Tab = (TABS.find((item) => item.id === params.get("tab"))?.id) ?? (params.get("focus") ? "live" : "overview");
  const [tick, setTick] = useState(0);
  const [hidden, setHidden] = useState<Set<LiveState>>(() => new Set());
  const [rideTab, setRideTab] = useState<"upcoming" | "past" | "calendar">("upcoming");
  const [shareTab, setShareTab] = useState<"zone" | "category" | "method">("zone");
  const [insightTab, setInsightTab] = useState<"drivers" | "cancellations" | "ratings">("drivers");
  const [moreOpen, setMoreOpen] = useState(false);
  const [showRequests, setShowRequests] = useState(true);
  const [showBalance, setShowBalance] = useState(false);
  const [showBonus, setShowBonus] = useState(true);
  const [quick, setQuick] = useState<QuickTarget>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [locate, setLocate] = useState<MapLocate | null>(null);
  const supplyBook = useDispatchBook();
  const [liveNotice, setLiveNotice] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  // Live parts reload every 10 seconds, slower parts every 30, until the backend pushes changes.
  const drivers = useRecords("drivers", undefined, { refetchMs: LIVE_MS });
  const trips = useRecords("trips", undefined, { refetchMs: LIVE_MS });
  const incidents = useRecords("incidents", undefined, { refetchMs: LIVE_MS });
  const tickets = useRecords("tickets", undefined, { refetchMs: LIVE_MS });
  const reservations = useRecords("reservations", undefined, { refetchMs: LIVE_MS });
  const payments = useRecords("payments", undefined, { refetchMs: LIVE_MS });
  const vehicles = useRecords("vehicles", undefined, { refetchMs: SLOW_MS });
  const payouts = useRecords("payouts", undefined, { refetchMs: SLOW_MS });
  const riders = useRecords("riders", undefined, { refetchMs: SLOW_MS });
  const ridersOnline = useRecords("ridersOnline", undefined, { refetchMs: LIVE_MS });
  const bonuses = useRecords("bonuses", undefined, { refetchMs: SLOW_MS });
  const fleets = useRecords("fleets");
  const audit = useAudit(LIVE_MS);
  // Names, phones and links follow the viewer's own read permissions (UI-06); counts and money stay.
  const access = useMemo(() => dashboardAccess(role), [role]);
  const driverRows = useMemo(() => maskDrivers(drivers.data ?? [], access), [drivers.data, access]);
  const riderRows = useMemo(() => maskRiders(riders.data ?? [], access), [riders.data, access]);
  const tripRows = useMemo(() => maskBookings(trips.data ?? [], access), [trips.data, access]);
  const reservationRows = useMemo(() => maskBookings(reservations.data ?? [], access), [reservations.data, access]);
  const approvals = useApprovals(LIVE_MS);
  const driverStore = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const bonusSlice = useSlice<BonusBook>(BONUS_KEY, emptyBonusBook());
  const bonusMinute = Math.floor(now / 60_000);
  const bonusAreas: BonusMapArea[] = useMemo(() => normalizeBonusBook(bonusSlice.value).bonuses
    .filter((bonus) => bonus.country === country && bonus.kind === "area")
    .map((bonus) => ({ bonus, state: bonusState(bonus, bonusMinute * 60_000, market.timeZone) }))
    .filter((item) => item.state === "live" || item.state === "today")
    .map(({ bonus, state }) => ({ id: bonus.id, label: state === "live" ? tr("Bonus now · {0}", [bonus.name]) : tr("{0} · from {1}", [bonus.name, bonus.start]), live: state === "live", rings: bonus.areas.map((area) => area.ring) })), [bonusSlice.value, country, bonusMinute, market.timeZone]);
  const liveQueries = [drivers, trips, incidents, tickets, reservations, payments];
  const failed = liveQueries.find((query) => query.error);
  const updatedAt = Math.max(refreshedAt, ...liveQueries.map((query) => query.dataUpdatedAt || 0));

  const money = (minor: number) => formatMoney(minor, country);
  const compact = (minor: number) => formatMoney(minor, country, { compact: true });
  const withScope = (path: string) => {
    const keep = new URLSearchParams();
    if (params.get("country") || params.get("scope")) keep.set("country", country);
    if (params.get("scope")) keep.set("scope", params.get("scope")!);
    const [base, query] = path.split("?");
    if (query) new URLSearchParams(query).forEach((value, key) => keep.set(key, value));
    return keep.size ? `${base}?${keep.toString()}` : base;
  };
  function setTab(next: Tab) {
    const search = new URLSearchParams(params);
    search.set("tab", next);
    setParams(search);
  }

  const periodKey = `${period.kind}|${period.on ?? ""}|${period.from ?? ""}|${period.to ?? ""}`;
  const span = useMemo(() => periodWindow(parsePeriod(new URLSearchParams(periodKeyToSearch(periodKey))), reportNow, market.timeZone, uiLocale()), [periodKey, reportNow, market]);
  // The old numbers stay on screen, faded, while a long period such as a year is worked out.
  const shownSpan = useDeferredValue(span);
  const stale = shownSpan !== span;
  // Live (contract v0.9.0): the server's KPI days (today live, earlier days from the nightly summary).
  const liveSession = useLiveSessionMaybe();
  const kpiZones = zoneKey ? zoneKey.split(",") : market.zones.map((zone) => zone.id);
  const kpiFrom = kpiDay(shownSpan.prevStart, market.timeZone);
  const kpiTo = kpiDay(Math.max(shownSpan.start, shownSpan.end - 1), market.timeZone);
  // v0.17.2: the server counts only the zones picked in the top bar.
  const kpiFilter = new URLSearchParams(zoneFilterOf(scope.effective).params).toString();
  const kpiQuery = useQuery({ queryKey: ["live", "kpis", kpiFrom, kpiTo, kpiFilter], queryFn: () => liveSession!.client.json<{ days: KpiDay[] }>(`/admin/kpis?fromDate=${kpiFrom}&toDate=${kpiTo}${kpiFilter ? `&${kpiFilter}` : ""}`), enabled: Boolean(liveSession) && !scope.denied });
  const demoReport = useMemo(() => earningsReport(country, zoneKey ? zoneKey.split(",") : [], shownSpan), [country, zoneKey, shownSpan]);
  const report = liveSession ? kpiReport(kpiQuery.data?.days ?? [], kpiZones, shownSpan, market.timeZone, uiLocale()) : demoReport;
  useEffect(() => {
    if (period.kind === "year") return;
    const timer = window.setTimeout(() => earningsReport(country, zoneKey ? zoneKey.split(",") : [], periodWindow({ kind: "year" }, Date.now(), market.timeZone, uiLocale())), 2500);
    return () => window.clearTimeout(timer);
  }, [country, zoneKey, market, period.kind]);
  const { totals, previous } = report;
  const known = Number.isFinite(totals.trips);
  const cancelRate = !known ? NaN : totals.trips + totals.cancelled ? (totals.cancelled / (totals.trips + totals.cancelled)) * 100 : 0;
  const prevCancelRate = previous.trips + previous.cancelled ? (previous.cancelled / (previous.trips + previous.cancelled)) * 100 : 0;
  const avgWait = !known ? NaN : totals.trips ? totals.waitMinTotal / totals.trips : 0;
  const prevWait = previous.trips ? previous.waitMinTotal / previous.trips : 0;
  const avgFare = !known ? NaN : totals.trips ? totals.grossMinor / totals.trips : 0;
  const prevAvgFare = previous.trips ? previous.grossMinor / previous.trips : 0;
  const numberFormat = new Intl.NumberFormat(uiLocale());
  // Live: a total without a source is NaN and reads "Not connected yet" (owner rule, part 3).
  const number = { format: (value: number) => (Number.isFinite(value) ? numberFormat.format(value) : tr("Not connected yet")) };
  const liveData = isLiveData();

  const live = useMemo(
    () => liveDrivers(driverRows, vehicles.data ?? [], tripRows, incidents.data ?? [], tick),
    [driverRows, vehicles.data, tripRows, incidents.data, tick],
  );
  const liveCounts = countStates(live);
  const onlineIds = useMemo(() => new Set(live.map((driver) => driver.id)), [live]);
  const allowedCategories = (driverId: string) => {
    const record = (driverRows).find((row) => row.id === driverId);
    if (!record) return [];
    const ops = driverOps(driverStore.value, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
    return CATEGORIES.filter((category) => ops.categories[category.id]).map((category) => category.id);
  };
  // Offers only count when they went to a driver who could really take them.
  const requests = useMemo(() => maskRequests(rideRequests(tripRows, riderRows, (driverId) => onlineIds.has(driverId)), access), [tripRows, riderRows, onlineIds, access]);
  // G3-R4 (owner "Real numbers only"): live, the server's riders online in the zones in view; demo, no invented share.
  const riderStats = riderCounts(requests, live, riderRows, liveData ? ridersOnlineIn(ridersOnline.data ?? [], scope.zones.length ? scope.zones : market.zones.map((zone) => zone.id)) : null);
  // Rides a driver just accepted: listed apart under the waiting riders and kept on the map (never counted as waiting).
  const allOnTheWay = useOnTheWay();
  const onTheWay = useMemo(() => maskRequests(allOnTheWay.filter((item) => !requests.some((request) => request.tripId === item.tripId)), access).map((item) => ({ ...item, driverName: access.drivers ? item.driverName : HIDDEN_DRIVER })), [allOnTheWay, requests, access]);
  const ridersOnMap = useMemo(() => (onTheWay.length ? [...requests, ...onTheWay] : requests), [requests, onTheWay]);
  const candidatesOf = (request: RideRequest) => candidatesFor(request, live, allowedCategories);
  const balance = useMemo(() => supplyDemand(country, scope.zones, requests, live), [country, scope.zones, requests, live]);
  const pricingSlice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  const pricing = useMemo(() => normalizeStore(pricingSlice.value), [pricingSlice.value]);
  const surgePref = useSurgePref("dashboard", { shown: false, style: "zones" });
  const surgeMinute = Math.floor(now / 60_000) * 60_000;
  const surgeZoneKey = (scope.zones.length ? scope.zones : market.zones.map((zone) => zone.id)).join(",");
  // Live (contract.json#driverSurgeMap): the server's surge now (GET /admin/surge/now) in the driver map's colours.
  const liveSurge = useLiveMapSurge(surgeZoneKey.split(","), pricing);
  const demoSurge = useMemo(
    () => surgeRows(pricing, surgeZoneKey.split(","), new Map(balance.map((row) => [row.zoneId, { waiting: row.waiting, free: row.free }])), Math.max(surgeMinute, Date.now())).map((row) => row.surge),
    [pricing, surgeZoneKey, balance, surgeMinute],
  );
  const surge = liveSurge ? liveSurge.rows : demoSurge;

  const shift = demoShift(now, api.demo);
  const rides = useMemo(() => scheduledRides(reservationRows, driverRows, now, shift), [reservationRows, driverRows, now, shift]);
  const counts = rideCounts(rides, now);
  const inPeriod = rides.filter((ride) => ride.pickupAt >= span.start && ride.pickupAt < span.end);
  const periodCounts = {
    completed: inPeriod.filter((ride) => ride.status === "completed").length,
    cancelled: inPeriod.filter((ride) => ride.status === "cancelled").length,
    noShow: inPeriod.filter((ride) => ride.status === "no_show").length,
  };
  const upcoming = rides.filter((ride) => ride.pickupAt >= now && ride.pickupAt < now + 7 * DAY_MS);
  const past = rides.filter((ride) => ride.pickupAt < now && ride.pickupAt >= span.start).reverse();

  // Ride check incidents have their own red banner; the SOS counts stay SOS only.
  const sos = (incidents.data ?? []).filter((row) => row.status === "queued" && row.kind !== "ride_check");
  const openTickets = (tickets.data ?? []).filter((row) => row.status === "open");
  const pendingDrivers = (driverRows).filter((row) => row.status === "pending");
  const scheduledPayouts = (payouts.data ?? []).filter((row) => row.status === "scheduled");
  const failures = openFailures(payments.data ?? []);
  const refundApprovals = (approvals.data ?? []).filter((row) => row.status === "pending" && row.action.includes("refund"));
  const urgentRides = rides.filter((ride) => ride.warning === "red");
  const longWaits = requests.filter((request) => request.waitingMin > 5 && request.status === "searching");
  // SOS responders (incidents.read) need the driver's name even without drivers.read.
  const driverName = (id: string | null | undefined) => (can(role, "incidents.read") ? drivers.data ?? [] : driverRows).find((row) => row.id === id)?.name ?? null;

  const signals: Signal[] = [
    ...(can(role, "incidents.read") ? sos.map((row) => ({ id: `sos:${row.id}`, title: tr("New SOS"), body: `${driverName(row.driverId) ?? row.name} needs help (${row.id})`, urgent: true })) : []),
    ...(can(role, "trips.read") ? longWaits.map((request) => ({ id: `wait:${request.tripId}`, title: tr("Rider waiting too long"), body: `${request.rider} has waited ${request.waitingMin} min in ${request.zoneName}`, urgent: false })) : []),
  ];
  // Alerts is the one source by default; the older counts and sound only run when switched back on there.
  const shared = useAlertsMaybe();
  const legacy = shared?.book.settings.legacy ?? { dashboardCounts: true, dashboardSound: true };
  const alertSignals = useAlertSignals(legacy.dashboardSound ? signals : [], !incidents.isLoading && !trips.isLoading);
  const sharedPills = shared ? (["critical", "important", "info"] as const).map((level) => {
    const list = shared.active.filter((alert) => alert.level === level);
    return { level, count: list.length, first: list[0]?.title ?? "", tone: level === "critical" ? "critical" : level === "important" ? "serious" : "warning" };
  }).filter((pill) => pill.count > 0) : [];

  const alerts = [
    { id: "sos", tone: "critical", icon: <Siren size={16} aria-hidden="true" />, permission: "incidents.read", count: sos.length, text: sos.length === 1 ? `SOS from ${driverName(sos[0].driverId) ?? sos[0].name}` : "SOS alerts waiting for a responder", path: "/incidents" },
    { id: "late", tone: "critical", icon: <CalendarClock size={16} aria-hidden="true" />, permission: "trips.read", count: urgentRides.length, text: "scheduled rides start within the hour with no driver", path: "/reservations" },
    { id: "wait", tone: "serious", icon: <Clock size={16} aria-hidden="true" />, permission: "trips.read", count: longWaits.length, text: "riders waiting over 5 min for a driver", path: "/?tab=live" },
    { id: "pay", tone: "serious", icon: <CreditCard size={16} aria-hidden="true" />, permission: "finance.read", count: failures.count, text: `failed payments · ${failures.rider} rider · ${failures.system} system · ${money(failures.owedMinor)}`, path: "/payments" },
    { id: "support", tone: "warning", icon: <LifeBuoy size={16} aria-hidden="true" />, permission: "support.reply", count: openTickets.length, text: "open support tickets", path: "/support" },
  ].filter((alert) => alert.count > 0 && can(role, alert.permission));

  const actions: Action[] = ([
    { id: "sos", label: tr("Claim SOS"), icon: <Siren size={16} aria-hidden="true" />, path: "/incidents", permission: "incidents.read" },
    { id: "assign", label: tr("Assign ride"), icon: <CalendarClock size={16} aria-hidden="true" />, path: "/reservations", permission: "trips.intervene" },
    { id: "review", label: tr("Review drivers"), icon: <UserCheck size={16} aria-hidden="true" />, path: "/onboarding", permission: "documents.approve" },
    { id: "refund", label: tr("Refund / voucher"), icon: <Repeat size={16} aria-hidden="true" />, path: "/payments", permission: "payments.refund" },
    { id: "payouts", label: tr("Approve payouts"), icon: <Banknote size={16} aria-hidden="true" />, path: "/payouts", permission: "finance.read" },
    { id: "surge", label: tr("Surge & boost"), icon: <Zap size={16} aria-hidden="true" />, path: "/pricing", permission: "settings.edit" },
    { id: "message", label: tr("Send message"), icon: <Megaphone size={16} aria-hidden="true" />, path: "/messages", permission: "settings.edit" },
    { id: "promo", label: tr("Create promo"), icon: <Ticket size={16} aria-hidden="true" />, path: "/promotions", permission: "settings.edit" },
    { id: "export", label: tr("Export report"), icon: <Download size={16} aria-hidden="true" />, path: "/reports", permission: "overview.read" },
    {
      id: "search",
      label: tr("Search (Ctrl+K)"),
      icon: <Search size={16} aria-hidden="true" />,
      permission: "overview.read",
      onRun: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })),
    },
  ] satisfies Action[]).filter((action) => can(role, action.permission));
  const mainActions = actions.slice(0, 6);
  const moreActions = actions.slice(6);

  const unassigned = rides.filter((ride) => ride.pickupAt >= now && (ride.status === "waiting" || ride.status === "booked") && !ride.driver);
  const queues = [
    { label: tr("Unclaimed SOS"), permission: "incidents.read", count: sos.length, path: "/incidents", icon: <Siren size={16} />, tone: "critical" },
    { label: tr("Open support"), permission: "support.reply", count: openTickets.length, path: "/support", icon: <LifeBuoy size={16} />, tone: "warning" },
    { label: tr("Drivers to review"), permission: "drivers.read", count: pendingDrivers.length, path: "/onboarding", icon: <UserPlus size={16} />, tone: "info" },
    { label: tr("Rides without driver"), permission: "trips.read", count: unassigned.length, path: "/reservations", icon: <CalendarClock size={16} />, tone: "serious" },
    { label: tr("Refunds waiting for approval"), permission: "approval.decide", count: refundApprovals.length, path: "/payments", icon: <ReceiptText size={16} />, tone: "serious" },
    { label: tr("Payouts scheduled"), permission: "finance.read", count: scheduledPayouts.length, path: "/payouts", icon: <Banknote size={16} />, tone: "good" },
  ].filter((queue) => can(role, queue.permission));

  function setPeriod(next: Period) {
    setParams(periodParams(next, params));
  }

  const loading = drivers.isLoading || trips.isLoading;
  const timeFormat = new Intl.DateTimeFormat(uiLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: market.timeZone });
  const dayFormat = new Intl.DateTimeFormat(uiLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: market.timeZone });
  const surgeLink = (zoneId: string) => (can(role, "settings.read") ? withScope(`/pricing?zone=${zoneId}&tab=surge`) : null);
  const busy = liveCounts.trip + liveCounts.pickup;

  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const start = startOfLocalDay(now, market.timeZone, index);
    const end = startOfLocalDay(now, market.timeZone, index + 1);
    const dayRides = rides.filter((ride) => ride.pickupAt >= start && ride.pickupAt < end && ride.status !== "cancelled");
    return { key: localDay(start + 3_600_000, market.timeZone), start, total: dayRides.length, open: dayRides.filter((ride) => !ride.driver).length };
  });
  const calendarMax = Math.max(1, ...calendarDays.map((day) => day.total));
  const rideRows = rideTab === "upcoming" ? upcoming : past;

  // Insights are only worked out when their tab is open; long periods use the last 30 days for the ranking.
  const rankSpan = useMemo(() => shownSpan.end - shownSpan.start > 31 * DAY_MS ? periodWindow({ kind: "month" }, reportNow, market.timeZone, uiLocale()) : shownSpan, [shownSpan, reportNow, market]);
  const weekSpan = useMemo(() => periodWindow({ kind: "week" }, reportNow, market.timeZone, uiLocale()), [reportNow, market]);
  const ranking = useMemo(() => {
    if (tab !== "insights") return null;
    const active = (driverRows).filter((row) => row.status === "active");
    const rank = (span: typeof rankSpan): DriverRank[] => active.map((row) => {
      const ops = driverOps(driverStore.value, { id: row.id, name: row.name, fleetId: row.fleetId, status: row.status, kind: row.kind });
      const perf = driverPerformance({ id: row.id, zoneId: row.zoneId, status: row.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, span, false).current;
      return { id: row.id, name: row.name, zoneId: row.zoneId, trips: perf.trips, rating: perf.rating, cancellationPct: perf.trips ? perf.cancellationPct : 0 };
    }).filter((row) => row.trips > 0);
    // Early in a short period nobody has finished a trip yet; rank on this week instead and say so.
    let rows = rank(rankSpan);
    let label = rankSpan === shownSpan ? shownSpan.label : "Last 30 days";
    if (!rows.length && rankSpan.end - rankSpan.start < 7 * DAY_MS) {
      rows = rank(weekSpan);
      label = "This week (no trips yet in this period)";
    }
    return {
      label,
      rated: [...rows].sort((a, b) => b.rating - a.rating).slice(0, 5),
      busiest: [...rows].sort((a, b) => b.trips - a.trips).slice(0, 5),
      cancelling: [...rows].sort((a, b) => b.cancellationPct - a.cancellationPct).slice(0, 5),
    };
  }, [tab, driverRows, driverStore.value, rankSpan, shownSpan, weekSpan]);

  const activity: ActivityItem[] = [
    ...(audit.data ?? []).slice(0, 20).map((row) => ({
      id: row.id,
      at: Date.parse(row.at),
      who: row.actorId,
      text: `${commandById(row.action)?.label ?? row.action} · ${row.targetId}${row.result !== "committed" ? ` (${row.result.replace("_", " ")})` : ""}`,
      system: false,
    })),
    ...sos.map((row) => ({ id: `sys-sos-${row.id}`, at: now - 3 * 60_000, who: "System", text: `SOS raised by ${can(role, "incidents.read") ? driverName(row.driverId) ?? row.name : HIDDEN_DRIVER}`, link: can(role, "incidents.read") ? withScope("/incidents") : undefined, system: true })),
    ...longWaits.slice(0, 4).map((request) => ({ id: `sys-wait-${request.tripId}`, at: now - request.waitingMin * 60_000, who: "System", text: `${request.rider} started waiting for a driver in ${request.zoneName}`, system: true })),
    ...live.filter((driver) => driver.state === "stale").slice(0, 3).map((driver) => ({ id: `sys-gps-${driver.id}`, at: now - driver.lastSeenMin * 60_000, who: "System", text: `${driver.name} lost GPS signal`, link: access.drivers ? withScope(`/drivers/${driver.id}`) : undefined, system: true })),
  ].sort((a, b) => b.at - a.at);
  const activityTime = (at: number) => {
    const minutes = Math.round((now - at) / 60_000);
    return minutes < 1 ? tr("just now") : minutes < 60 ? tr("{0} min ago", [minutes]) : timeFormat.format(at);
  };

  return (
    <DashboardAccessContext.Provider value={access}>
    <div className="dash" data-testid="dashboard">
      <div className="dash-head">
        <div>
          <h2>{tr("Dashboard")}</h2>
          <p>
            <Flag id={country} /> {trx(market.name)} · {scope.zones.length ? tr("{0} zone{1}", [scope.zones.length, scope.zones.length > 1 ? "s" : ""]) : tr("All zones")} · {trx(span.label)} · <LiveStamp updatedAt={updatedAt} offline={Boolean(failed)} />
          </p>
        </div>
        <div className="dash-head-actions">
          <PeriodPicker key={periodKey} period={period} today={localDay(now, market.timeZone)} onChange={setPeriod} />
          {legacy.dashboardSound ? <SoundToggle muted={alertSignals.muted} onToggle={alertSignals.toggleMute} permission={alertSignals.permission} onAsk={() => void alertSignals.askPermission()} /> : null}
          <button data-command="admin.ui.refresh" type="button" className="dash-btn ghost icon" aria-label={tr("Refresh")} onClick={() => { setRefreshedAt(Date.now()); void client.invalidateQueries(); }}><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
      </div>

      {failed?.error ? <p role="alert" className="dash-error">{trSentences(failed.error.message)}</p> : null}

      {!legacy.dashboardCounts && shared ? (
        sharedPills.length ? (
          <div className="alert-strip" role="region" aria-label={tr("Urgent")}>
            {sharedPills.map((pill) => (
              <Link key={pill.level} to={withScope("/alerts")} className={`alert-pill ${pill.tone}`}>
                <strong>{pill.count}</strong> {pill.level === "critical" ? tr("Critical") : pill.level === "important" ? tr("Important") : tr("Info")} · {pill.first}{pill.count > 1 ? tr(" and {0} more", [pill.count - 1]) : ""}
              </Link>
            ))}
            <Link to={withScope("/alerts")} className="alert-pill all">{tr("See all alerts")}</Link>
          </div>
        ) : null
      ) : alerts.length ? (
        <div className="alert-strip" role="region" aria-label={tr("Urgent")}>
          {alerts.map((alert) => (
            <Link key={alert.id} to={withScope(alert.path)} className={`alert-pill ${alert.tone}${alertSignals.fresh.some((id) => id.startsWith(alert.id === "wait" ? "wait:" : `${alert.id}:`)) ? " flash" : ""}`}>
              {alert.icon}<strong>{alert.count}</strong> {alert.text}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="dash-tabs" role="tablist" aria-label={tr("Dashboard sections")}>
        {TABS.map((item) => (
          <button data-command="admin.ui.dashboardTab" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => setTab(item.id)}>
            {trx(item.label)}
            {item.id === "live" && requests.length ? <span className="tab-count">{requests.length}</span> : null}
            {item.id === "work" && unassigned.length ? <span className="tab-count">{unassigned.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div className="quick-actions" role="toolbar" aria-label={tr("Quick actions")}>
            {mainActions.map((action) => action.path ? (
              <Link key={action.id} className="quick-action" to={withScope(action.path)}>{action.icon}{trx(action.label)}</Link>
            ) : (
              <button data-command="admin.ui.quickAction" key={action.id} type="button" className="quick-action" onClick={action.onRun}>{action.icon}{trx(action.label)}</button>
            ))}
            {moreActions.length ? (
              <div className="more-wrap" ref={moreRef}>
                <button data-command="admin.ui.quickAction" type="button" className="quick-action" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>{trn("More {0}", <ChevronDown size={14} aria-hidden="true" />)}</button>
                {moreOpen ? (
                  <div className="more-menu">
                    {moreActions.map((action) => action.path ? (
                      <Link key={action.id} to={withScope(action.path)} onClick={() => setMoreOpen(false)}>{action.icon}{trx(action.label)}</Link>
                    ) : (
                      <button data-command="admin.ui.quickAction" key={action.id} type="button" onClick={() => { setMoreOpen(false); action.onRun?.(); }}>{action.icon}{trx(action.label)}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <LanguageQuickSwitch compact />
          </div>

          <section className={stale ? "earnings-card is-stale" : "earnings-card"} aria-labelledby="earnings-title" aria-busy={stale}>
            <div className="earnings-main">
              <div className="earnings-top">
                <div>
                  <h3 id="earnings-title">{tr("Gross bookings")}</h3>
                  <div className="hero-number" data-testid="gross-bookings">{money(totals.grossMinor)}</div>
                  <div className="hero-sub"><Delta value={change(totals.grossMinor, previous.grossMinor)} label={shownSpan.compareLabel} /> <span>{shownSpan.compareLabel}</span></div>
                </div>
                <span className="currency-badge">{market.currency}</span>
              </div>
              <EarningsChart points={report.series} format={money} formatAxis={compact} compareLabel={shownSpan.compareLabel} />
            </div>
            <dl className="earnings-side">
              <div className="side-row accent">
                <dt>{liveData ? tr("Movera earnings") : trn("Movera earnings {0}", <small>{trn("Commission {0}% placeholder · set later in Pricing", Math.round(COMMISSION_PLACEHOLDER * 100))}</small>)}</dt>
                <dd>{money(totals.commissionMinor)} <Delta value={change(totals.commissionMinor, previous.commissionMinor)} label={shownSpan.compareLabel} /></dd>
              </div>
              <div className="side-row"><dt>{tr("Driver earnings")}</dt><dd>{money(totals.driverMinor)} <Delta value={change(totals.driverMinor, previous.driverMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>{tr("Tips")}</dt><dd>{money(totals.tipsMinor)} <Delta value={change(totals.tipsMinor, previous.tipsMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>{tr("Refunds & vouchers")}</dt><dd>−{money(totals.refundsMinor)} <Delta value={change(totals.refundsMinor, previous.refundsMinor)} inverse label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row strong"><dt>{tr("Net revenue")}</dt><dd>{money(totals.netMinor)} <Delta value={change(totals.netMinor, previous.netMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>{tr("Average fare")}</dt><dd>{money(avgFare)} <Delta value={change(avgFare, prevAvgFare)} label={shownSpan.compareLabel} /></dd></div>
            </dl>
          </section>

          <section className={stale ? "kpi-grid is-stale" : "kpi-grid"} aria-label={tr("Key numbers")}>
            <Kpi icon={<TrendingUp size={18} />} tone="blue" label={tr("Completed trips")} value={number.format(totals.trips)} delta={<Delta value={change(totals.trips, previous.trips)} label={shownSpan.compareLabel} />} />
            <Kpi
              icon={<Car size={18} />}
              tone="green"
              label={tr("Drivers online now")}
              value={loading ? "…" : number.format(liveCounts.free + busy + liveCounts.sos)}
              hint={<>{trn("{0} free · {1} busy{2}", liveCounts.free, busy, liveCounts.sos ? <> · <b className="sos-text">{trn("{0} SOS", liveCounts.sos)}</b></> : null)}</>}
            />
            <Kpi icon={<XCircle size={18} />} tone="red" label={tr("Cancellation rate")} value={Number.isFinite(cancelRate) ? `${cancelRate.toFixed(1)}%` : tr("Not connected yet")} delta={<Delta value={change(cancelRate, prevCancelRate)} inverse label={shownSpan.compareLabel} />} />
            <Kpi icon={<Clock size={18} />} tone="amber" label={tr("Avg pickup wait")} value={Number.isFinite(avgWait) ? `${avgWait.toFixed(1)} min` : tr("Not connected yet")} delta={<Delta value={change(avgWait, prevWait)} inverse label={shownSpan.compareLabel} />} />
            <Kpi icon={<Users size={18} />} tone="violet" label={tr("New riders")} value={number.format(totals.newRiders)} delta={<Delta value={change(totals.newRiders, previous.newRiders)} label={shownSpan.compareLabel} />} />
            <Kpi icon={<UserPlus size={18} />} tone="aqua" label={tr("New drivers")} value={number.format(totals.newDrivers)} delta={<Delta value={previous.newDrivers < 5 ? null : change(totals.newDrivers, previous.newDrivers)} label={shownSpan.compareLabel} />} />
          </section>
        </>
      ) : null}

      {tab === "live" ? (
        <>
          <div className="dash-row">
            <section className="dash-card map-card" aria-labelledby="map-title">
              <div className="card-head">
                <h3 id="map-title">{trn("{0} Live drivers", <span className="live-dot" aria-hidden="true" />)}</h3>
                <span className="card-head-tools"><LiveTag />{can(role, "trips.read") ? <Link className="link-action" to={withScope("/live")}>{tr("Open full live map →")}</Link> : null}</span>
              </div>
              <div className="state-filters" role="group" aria-label={tr("Show drivers")}>
                {LIVE_STATES.map((state) => {
                  const off = hidden.has(state.id);
                  return (
                    <button data-command="admin.ui.mapLayer"
                      key={state.id}
                      type="button"
                      aria-pressed={!off}
                      className={off ? "state-chip off" : "state-chip"}
                      onClick={() => setHidden((current) => {
                        const next = new Set(current);
                        if (next.has(state.id)) next.delete(state.id);
                        else next.add(state.id);
                        return next;
                      })}
                    >
                      <i className="car" style={{ background: STATE_COLOR[state.id] }} />{trx(state.label)}<strong>{liveCounts[state.id]}</strong>
                    </button>
                  );
                })}
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showRequests} className={showRequests ? "state-chip" : "state-chip off"} onClick={() => setShowRequests((value) => !value)}>{trn("{0}Riders waiting{1}", <i className="rider" style={{ background: REQUEST_COLOR.waiting }} />, <strong>{requests.length}</strong>)}</button>
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showBalance} className={showBalance ? "state-chip" : "state-chip off"} onClick={() => setShowBalance((value) => !value)}>{trn("{0}Supply vs demand", <i style={{ background: "linear-gradient(90deg,#0ca30c,#eda100,#d03b3b)" }} />)}</button>
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showBonus} className={showBonus ? "state-chip" : "state-chip off"} onClick={() => setShowBonus((value) => !value)}>{trn("{0}Driver bonus areas{1}", <i style={{ background: "#f2994a" }} />, <strong>{bonusAreas.length}</strong>)}</button>
                <SurgeControls compact shown={surgePref.shown} style={surgePref.style} onShown={surgePref.setShown} onStyle={surgePref.setStyle} noStyle={Boolean(liveSurge)} />
              </div>
              {liveNotice ? <p className="fd-notice" role="status">{liveNotice}</p> : null}
              <DriversMap
                drivers={live}
                requests={ridersOnMap}
                showRequests={showRequests}
                focusRequest={focusRequest}
                locate={locate}
                balance={balance}
                showBalance={showBalance}
                surge={surge}
                surgeShown={surgePref.shown}
                surgeStyle={surgePref.style}
                surgeDriver={Boolean(liveSurge)}
                bonusAreas={bonusAreas}
                bonusShown={showBonus}
                rideChecks={shared && (can(role, "incidents.read") || can(role, "trips.intervene")) ? { checks: shared.rideCheck.checks, demoShift: shared.rideCheck.demoShift, now: shared.now } : null}
                onSurgeZone={(zoneId) => setQuick({ kind: "surge", zoneId })}
                onBonusArea={(id) => setQuick({ kind: "bonus", id })}
                overlay={<LiveMapQuickPopup target={quick} surge={surge} country={country} market={market} withScope={withScope} onClose={() => setQuick(null)} onNotice={setLiveNotice} />}
                renderAssign={can(role, "trips.intervene") ? (request) => <RiderQuickActions request={request} candidates={candidatesOf(request)} onNotice={setLiveNotice} /> : undefined}
                market={market}
                zones={scope.zones}
                hidden={hidden}
                withScope={withScope}
                focusId={params.get("focus")}
                tripFor={(driver) => maskTrip(liveTrip(driver, { trips: tripRows, reservations: reservationRows, vehicles: vehicles.data ?? [], fleets: fleets.data ?? [], riders: riderRows }, now, shift), access)}
                infoFor={(driverId) => {
                  if (!access.drivers) return null;
                  const record = (driverRows).find((row) => row.id === driverId);
                  if (!record) return null;
                  const ops = driverOps(driverStore.value, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
                  const today = driverPerformance({ id: record.id, zoneId: record.zoneId, status: record.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, periodWindow({ kind: "today" }, now, market.timeZone, uiLocale()), false).current;
                  return {
                    phone: record.phone,
                    account: statusLabel(record.status),
                    rating: ops.ratings.stars,
                    fleet: (fleets.data ?? []).find((row) => row.id === record.fleetId)?.name ?? null,
                    todayTrips: today.trips,
                    todayNet: formatMoney(today.netMinor, country, { compact: true }),
                    onlineHours: today.onlineHours,
                    acceptancePct: ops.ratings.acceptancePct,
                    cancellationPct: ops.ratings.cancellationPct,
                    categories: CATEGORIES.filter((category) => ops.categories[category.id]).map((category) => category.label),
                  };
                }}
              />
              {surgePref.shown ? (liveSurge ? <DriverSurgeLegend failed={liveSurge.state === "failed"} /> : <SurgeLegend />) : null}
              <p className="fine-print">{trn("{0}Drivers move every 5 seconds; data reloads every 10 seconds.", api.demo ? tr("Simulated positions from demo data. ") : "")}</p>
            </section>

            <SupplyDemandDrill rows={balance} showOnMap={showBalance} onToggleMap={() => setShowBalance((value) => !value)} surgeLink={surgeLink} drivers={live} requests={requests} radarZones={supplyBook.radarZones} onLocate={setLocate} radarZoneLink={can(role, "trips.read") ? (zoneId) => withScope(offersLink("radar", zoneId)) : null} />
          </div>

          <LiveRiders
            counts={riderStats}
            requests={requests}
            candidatesOf={candidatesOf}
            onLocate={(id) => setFocusRequest({ id, nonce: Date.now() })}
            canAssign={can(role, "trips.intervene")}
            onAssigned={setLiveNotice}
            onTheWay={onTheWay}
          />

          <div className="dash-grid-2">
            <AirportCard rows={airportQueues(country, live, Math.floor(now / 3_600_000))} />
            <BoostCard rows={activeBoosts(bonuses.data ?? [], balance, surge)} surgeLink={surgeLink} />
          </div>
        </>
      ) : null}

      {tab === "work" ? (
        <>
          <div className="dash-row">
            <section className="dash-card rides-card" aria-labelledby="rides-title">
              <div className="card-head">
                <h3 id="rides-title">{tr("Scheduled rides")}</h3>
                {can(role, "trips.read") ? <Link className="link-action" to={withScope("/reservations")}>{tr("See all →")}</Link> : null}
              </div>
              <div className="ride-counters">
                <span>{trn("{0} Upcoming", <strong>{counts.upcoming}</strong>)}</span>
                <span className={counts.unassigned ? "warn" : undefined}>{trn("{0} Unassigned", <strong>{counts.unassigned}</strong>)}</span>
                <span>{trn("{0} Assigned", <strong>{counts.assigned}</strong>)}</span>
                <span title={trx(span.label)}>{trn("{0} Completed", <strong>{periodCounts.completed}</strong>)}</span>
                <span title={trx(span.label)}>{trn("{0} Cancelled", <strong>{periodCounts.cancelled}</strong>)}</span>
                <span title={trx(span.label)} className={periodCounts.noShow ? "warn" : undefined}>{trn("{0} No-show", <strong>{periodCounts.noShow}</strong>)}</span>
              </div>
              <p className="fine-print">{trn("Upcoming, unassigned and assigned are the next 7 days. Completed, cancelled and no-show follow the period: {0}.", trx(span.label))}</p>
              <div className="tabs-row" role="tablist" aria-label={tr("Scheduled rides")}>
                {(["upcoming", "past", "calendar"] as const).map((item) => (
                  <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={rideTab === item} className={rideTab === item ? "active" : undefined} onClick={() => setRideTab(item)}>
                    {item === "upcoming" ? tr("Upcoming · next 7 days") : item === "past" ? tr("Past · {0}", [trx(span.label)]) : tr("Calendar")}
                  </button>
                ))}
              </div>
              {rideTab === "calendar" ? (
                <div className="ride-calendar">
                  {calendarDays.map((day) => (
                    <div key={day.key} className="cal-day">
                      <span className="cal-name">{dayFormat.format(day.start + 3_600_000)}</span>
                      <div className="cal-bar"><i style={{ height: `${(day.total / calendarMax) * 100}%` }} /></div>
                      <strong>{day.total}</strong>
                      <small className={day.open ? "warn" : undefined}>{day.open ? tr("{0} without driver", [day.open]) : tr("All assigned")}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <RideTable rides={rideRows} now={now} upcoming={rideTab === "upcoming"} timeFormat={timeFormat} dayFormat={dayFormat} money={money} withScope={withScope} />
              )}
            </section>

            <section className="dash-card queues-card" aria-labelledby="queues-title">
              <div className="card-head"><h3 id="queues-title">{tr("Work queues")}</h3><LiveTag /></div>
              <ul className="queue-list">
                {queues.map((queue) => (
                  <li key={queue.label}>
                    <Link to={withScope(queue.path)} className={`queue tone-${queue.tone}`}>
                      <span className="queue-icon" aria-hidden="true">{queue.icon}</span>
                      <span className="queue-label">{trx(queue.label)}</span>
                      <strong>{loading ? "…" : queue.count}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <ActivityFeed items={activity} format={activityTime} />
          {can(role, "trips.read") || can(role, "safety.edit") ? <div className="dash-ridecheck"><RideCheckSettingsCard where="dashboard" /></div> : null}
        </>
      ) : null}

      {tab === "insights" ? (
        <div className="dash-row">
          <InsightsCard
            tab={insightTab}
            onTab={setInsightTab}
            top={ranking}
            cancel={cancellations(totals)}
            rating={ratings(totals, `${country}:${shownSpan.start}`)}
            periodLabel={shownSpan.label}
            topLabel={ranking?.label ?? shownSpan.label}
            money={null}
            rankingConnected={!liveData}
          />
          <section className="dash-card shares-card" aria-labelledby="shares-title">
            <div className="card-head"><h3 id="shares-title">{tr("Where the money comes from")}</h3></div>
            <div className="tabs-row" role="tablist" aria-label={tr("Breakdown")}>
              {(["zone", "category", "method"] as const).map((item) => (
                <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={shareTab === item} className={shareTab === item ? "active" : undefined} onClick={() => setShareTab(item)}>
                  {item === "zone" ? tr("Zones") : item === "category" ? tr("Categories") : tr("Payment")}
                </button>
              ))}
            </div>
            {liveData && (shareTab !== "zone" || !report.byZone.length) ? <NotConnected block /> : totals.grossMinor ? <ShareBars rows={shareTab === "zone" ? report.byZone : shareTab === "category" ? report.byCategory : report.byMethod} format={compact} /> : <p className="state-line">{tr("No earnings in this period yet.")}</p>}
          </section>
        </div>
      ) : null}
    </div>
    </DashboardAccessContext.Provider>
  );
}

function periodKeyToSearch(key: string): string {
  const [kind, on, from, to] = key.split("|");
  const search = new URLSearchParams({ period: kind });
  if (on) search.set("on", on);
  if (from) search.set("from", from);
  if (to) search.set("to", to);
  return search.toString();
}
