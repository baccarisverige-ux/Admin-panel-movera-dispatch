import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
import { DriversMap, STATE_COLOR } from "../dashboard/DriversMap";
import { EarningsChart } from "../dashboard/EarningsChart";
import { change, COMMISSION_PLACEHOLDER, earningsReport, type Share } from "../dashboard/earnings";
import { activeBoosts, airportQueues, cancellations, ratings, supplyDemand } from "../dashboard/insights";
import { countStates, LIVE_STATES, liveDrivers, type LiveState } from "../dashboard/live";
import { AssignControls, LiveRiders } from "../dashboard/LiveRiders";
import { liveTrip } from "../dashboard/liveTrip";
import { PeriodPicker } from "../dashboard/PeriodPicker";
import { parsePeriod, periodParams, periodWindow, type Period } from "../dashboard/period";
import { RideTable } from "../dashboard/RideTable";
import { candidatesFor, rideRequests, riderCounts, type RideRequest } from "../dashboard/riders";
import { demoShift, rideCounts, scheduledRides } from "../dashboard/scheduled";
import { localDay, startOfLocalDay } from "../dashboard/time";
import { useAlertSignals, type Signal } from "../dashboard/useAlertSignals";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import { ActivityFeed, AirportCard, BoostCard, InsightsCard, LiveStamp, LiveTag, SoundToggle, SupplyDemandCard, type ActivityItem, type DriverRank } from "../dashboard/Widgets";
import { CATEGORIES } from "../domain/contract";
import { statusLabel } from "../domain/labels";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { driverPerformance } from "../fleet/performance";
import { formatMoney } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { openFailures } from "../payments/failures";
import { surgeRows } from "../pricing/rows";
import { SurgeControls, SurgeLegend } from "../pricing/SurgeControls";
import { useSurgePref } from "../pricing/useSurgePref";
import { SLICE_KEY, emptyPricingStore, normalizeStore } from "../pricing/zonePricing";
import { Flag } from "../ui/Flag";
import { BONUS_KEY, bonusState, emptyBonusBook, normalizeBonusBook, type BonusBook } from "../drivers/bonus";
import type { BonusMapArea } from "../dashboard/DriversMap";

const FIVE_MIN = 5 * 60_000;
const DAY_MS = 86_400_000;
const LIVE_MS = 10_000;
const SLOW_MS = 30_000;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live" },
  { id: "work", label: "Work" },
  { id: "insights", label: "Insights" },
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
  if (value === null || !Number.isFinite(value)) return <span className="delta flat">No comparison</span>;
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={good ? "delta good" : "delta bad"} title={label}>
      <Icon size={14} aria-hidden="true" />
      {up ? "+" : "−"}{Math.abs(value).toFixed(1)}%
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function Kpi({ icon, tone, label, value, delta, hint }: { icon: ReactNode; tone: string; label: string; value: string; delta?: ReactNode; hint?: ReactNode }) {
  return (
    <article className={`kpi tone-${tone}`}>
      <div className="kpi-icon" aria-hidden="true">{icon}</div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        <div className="kpi-foot">{delta}{hint ? <small>{hint}</small> : null}</div>
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
          <div className="share-head"><span>{row.label}</span><strong>{format(row.minor)}</strong><small>{Math.round((row.minor / total) * 100)}%</small></div>
          <div className="share-track"><i style={{ width: `${(row.minor / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

type Action = { id: string; label: string; icon: ReactNode; path?: string; permission: string; onRun?: () => void };

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
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
  const bonuses = useRecords("bonuses", undefined, { refetchMs: SLOW_MS });
  const fleets = useRecords("fleets");
  const audit = useAudit(LIVE_MS);
  const approvals = useApprovals(LIVE_MS);
  const driverStore = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const bonusSlice = useSlice<BonusBook>(BONUS_KEY, emptyBonusBook());
  const bonusMinute = Math.floor(now / 60_000);
  const bonusAreas: BonusMapArea[] = useMemo(() => normalizeBonusBook(bonusSlice.value).bonuses
    .filter((bonus) => bonus.country === country && bonus.kind === "area")
    .map((bonus) => ({ bonus, state: bonusState(bonus, bonusMinute * 60_000, market.timeZone) }))
    .filter((item) => item.state === "live" || item.state === "today")
    .map(({ bonus, state }) => ({ id: bonus.id, label: state === "live" ? `Bonus now · ${bonus.name}` : `${bonus.name} · from ${bonus.start}`, live: state === "live", rings: bonus.areas.map((area) => area.ring) })), [bonusSlice.value, country, bonusMinute, market.timeZone]);
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
  const span = useMemo(() => periodWindow(parsePeriod(new URLSearchParams(periodKeyToSearch(periodKey))), reportNow, market.timeZone, market.locale), [periodKey, reportNow, market]);
  // The old numbers stay on screen, faded, while a long period such as a year is worked out.
  const shownSpan = useDeferredValue(span);
  const stale = shownSpan !== span;
  const report = useMemo(() => earningsReport(country, zoneKey ? zoneKey.split(",") : [], shownSpan), [country, zoneKey, shownSpan]);
  useEffect(() => {
    if (period.kind === "year") return;
    const timer = window.setTimeout(() => earningsReport(country, zoneKey ? zoneKey.split(",") : [], periodWindow({ kind: "year" }, Date.now(), market.timeZone, market.locale)), 2500);
    return () => window.clearTimeout(timer);
  }, [country, zoneKey, market, period.kind]);
  const { totals, previous } = report;
  const cancelRate = totals.trips + totals.cancelled ? (totals.cancelled / (totals.trips + totals.cancelled)) * 100 : 0;
  const prevCancelRate = previous.trips + previous.cancelled ? (previous.cancelled / (previous.trips + previous.cancelled)) * 100 : 0;
  const avgWait = totals.trips ? totals.waitMinTotal / totals.trips : 0;
  const prevWait = previous.trips ? previous.waitMinTotal / previous.trips : 0;
  const avgFare = totals.trips ? totals.grossMinor / totals.trips : 0;
  const prevAvgFare = previous.trips ? previous.grossMinor / previous.trips : 0;
  const number = new Intl.NumberFormat(market.locale);

  const live = useMemo(
    () => liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], tick),
    [drivers.data, vehicles.data, trips.data, incidents.data, tick],
  );
  const liveCounts = countStates(live);
  const onlineIds = useMemo(() => new Set(live.map((driver) => driver.id)), [live]);
  const allowedCategories = (driverId: string) => {
    const record = (drivers.data ?? []).find((row) => row.id === driverId);
    if (!record) return [];
    const ops = driverOps(driverStore.value, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
    return CATEGORIES.filter((category) => ops.categories[category.id]).map((category) => category.id);
  };
  // Offers only count when they went to a driver who could really take them.
  const requests = useMemo(() => rideRequests(trips.data ?? [], riders.data ?? [], (driverId) => onlineIds.has(driverId)), [trips.data, riders.data, onlineIds]);
  const riderStats = riderCounts(requests, live, riders.data ?? []);
  const candidatesOf = (request: RideRequest) => candidatesFor(request, live, allowedCategories);
  const balance = useMemo(() => supplyDemand(country, scope.zones, requests, live), [country, scope.zones, requests, live]);
  const pricingSlice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  const pricing = useMemo(() => normalizeStore(pricingSlice.value), [pricingSlice.value]);
  const surgePref = useSurgePref("dashboard", { shown: false, style: "zones" });
  const surgeMinute = Math.floor(now / 60_000) * 60_000;
  const surgeZoneKey = (scope.zones.length ? scope.zones : market.zones.map((zone) => zone.id)).join(",");
  const surge = useMemo(
    () => surgeRows(pricing, surgeZoneKey.split(","), new Map(balance.map((row) => [row.zoneId, { waiting: row.waiting, free: row.free }])), surgeMinute).map((row) => row.surge),
    [pricing, surgeZoneKey, balance, surgeMinute],
  );

  const shift = demoShift(now, api.demo);
  const rides = useMemo(() => scheduledRides(reservations.data ?? [], drivers.data ?? [], now, shift), [reservations.data, drivers.data, now, shift]);
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
  const pendingDrivers = (drivers.data ?? []).filter((row) => row.status === "pending");
  const scheduledPayouts = (payouts.data ?? []).filter((row) => row.status === "scheduled");
  const failures = openFailures(payments.data ?? []);
  const refundApprovals = (approvals.data ?? []).filter((row) => row.status === "pending" && row.action.includes("refund"));
  const urgentRides = rides.filter((ride) => ride.warning === "red");
  const longWaits = requests.filter((request) => request.waitingMin > 5 && request.status === "searching");
  const driverName = (id: string | null | undefined) => (drivers.data ?? []).find((row) => row.id === id)?.name ?? null;

  const signals: Signal[] = [
    ...(can(role, "incidents.read") ? sos.map((row) => ({ id: `sos:${row.id}`, title: "New SOS", body: `${driverName(row.driverId) ?? row.name} needs help (${row.id})`, urgent: true })) : []),
    ...(can(role, "trips.read") ? longWaits.map((request) => ({ id: `wait:${request.tripId}`, title: "Rider waiting too long", body: `${request.rider} has waited ${request.waitingMin} min in ${request.zoneName}`, urgent: false })) : []),
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
    { id: "sos", label: "Claim SOS", icon: <Siren size={16} aria-hidden="true" />, path: "/incidents", permission: "incidents.read" },
    { id: "assign", label: "Assign ride", icon: <CalendarClock size={16} aria-hidden="true" />, path: "/reservations", permission: "trips.intervene" },
    { id: "review", label: "Review drivers", icon: <UserCheck size={16} aria-hidden="true" />, path: "/onboarding", permission: "documents.approve" },
    { id: "refund", label: "Refund / voucher", icon: <Repeat size={16} aria-hidden="true" />, path: "/payments", permission: "payments.refund" },
    { id: "payouts", label: "Approve payouts", icon: <Banknote size={16} aria-hidden="true" />, path: "/payouts", permission: "finance.read" },
    { id: "surge", label: "Surge & boost", icon: <Zap size={16} aria-hidden="true" />, path: "/pricing", permission: "settings.edit" },
    { id: "message", label: "Send message", icon: <Megaphone size={16} aria-hidden="true" />, path: "/messages", permission: "settings.edit" },
    { id: "promo", label: "Create promo", icon: <Ticket size={16} aria-hidden="true" />, path: "/promotions", permission: "settings.edit" },
    { id: "export", label: "Export report", icon: <Download size={16} aria-hidden="true" />, path: "/reports", permission: "overview.read" },
    {
      id: "search",
      label: "Search (Ctrl+K)",
      icon: <Search size={16} aria-hidden="true" />,
      permission: "overview.read",
      onRun: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })),
    },
  ] satisfies Action[]).filter((action) => can(role, action.permission));
  const mainActions = actions.slice(0, 6);
  const moreActions = actions.slice(6);

  const unassigned = rides.filter((ride) => ride.pickupAt >= now && (ride.status === "waiting" || ride.status === "booked") && !ride.driver);
  const queues = [
    { label: "Unclaimed SOS", permission: "incidents.read", count: sos.length, path: "/incidents", icon: <Siren size={16} />, tone: "critical" },
    { label: "Open support", permission: "support.reply", count: openTickets.length, path: "/support", icon: <LifeBuoy size={16} />, tone: "warning" },
    { label: "Drivers to review", permission: "drivers.read", count: pendingDrivers.length, path: "/onboarding", icon: <UserPlus size={16} />, tone: "info" },
    { label: "Rides without driver", permission: "trips.read", count: unassigned.length, path: "/reservations", icon: <CalendarClock size={16} />, tone: "serious" },
    { label: "Refunds waiting for approval", permission: "approval.decide", count: refundApprovals.length, path: "/payments", icon: <ReceiptText size={16} />, tone: "serious" },
    { label: "Payouts scheduled", permission: "finance.read", count: scheduledPayouts.length, path: "/payouts", icon: <Banknote size={16} />, tone: "good" },
  ].filter((queue) => can(role, queue.permission));

  function setPeriod(next: Period) {
    setParams(periodParams(next, params));
  }

  const loading = drivers.isLoading || trips.isLoading;
  const timeFormat = new Intl.DateTimeFormat(market.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: market.timeZone });
  const dayFormat = new Intl.DateTimeFormat(market.locale, { weekday: "short", day: "numeric", month: "short", timeZone: market.timeZone });
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
  const rankSpan = useMemo(() => shownSpan.end - shownSpan.start > 31 * DAY_MS ? periodWindow({ kind: "month" }, reportNow, market.timeZone, market.locale) : shownSpan, [shownSpan, reportNow, market]);
  const weekSpan = useMemo(() => periodWindow({ kind: "week" }, reportNow, market.timeZone, market.locale), [reportNow, market]);
  const ranking = useMemo(() => {
    if (tab !== "insights") return null;
    const active = (drivers.data ?? []).filter((row) => row.status === "active");
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
  }, [tab, drivers.data, driverStore.value, rankSpan, shownSpan, weekSpan]);

  const activity: ActivityItem[] = [
    ...(audit.data ?? []).slice(0, 20).map((row) => ({
      id: row.id,
      at: Date.parse(row.at),
      who: row.actorId,
      text: `${commandById(row.action)?.label ?? row.action} · ${row.targetId}${row.result !== "committed" ? ` (${row.result.replace("_", " ")})` : ""}`,
      system: false,
    })),
    ...sos.map((row) => ({ id: `sys-sos-${row.id}`, at: now - 3 * 60_000, who: "System", text: `SOS raised by ${driverName(row.driverId) ?? row.name}`, link: withScope("/incidents"), system: true })),
    ...longWaits.slice(0, 4).map((request) => ({ id: `sys-wait-${request.tripId}`, at: now - request.waitingMin * 60_000, who: "System", text: `${request.rider} started waiting for a driver in ${request.zoneName}`, system: true })),
    ...live.filter((driver) => driver.state === "stale").slice(0, 3).map((driver) => ({ id: `sys-gps-${driver.id}`, at: now - driver.lastSeenMin * 60_000, who: "System", text: `${driver.name} lost GPS signal`, link: withScope(`/drivers/${driver.id}`), system: true })),
  ].sort((a, b) => b.at - a.at);
  const activityTime = (at: number) => {
    const minutes = Math.round((now - at) / 60_000);
    return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : timeFormat.format(at);
  };

  return (
    <div className="dash" data-testid="dashboard">
      <div className="dash-head">
        <div>
          <h2>Dashboard</h2>
          <p>
            <Flag id={country} /> {market.name} · {scope.zones.length ? `${scope.zones.length} zone${scope.zones.length > 1 ? "s" : ""}` : "All zones"} · {span.label} · <LiveStamp updatedAt={updatedAt} offline={Boolean(failed)} />
          </p>
        </div>
        <div className="dash-head-actions">
          <PeriodPicker key={periodKey} period={period} today={localDay(now, market.timeZone)} onChange={setPeriod} />
          {legacy.dashboardSound ? <SoundToggle muted={alertSignals.muted} onToggle={alertSignals.toggleMute} permission={alertSignals.permission} onAsk={() => void alertSignals.askPermission()} /> : null}
          <button data-command="admin.ui.refresh" type="button" className="dash-btn ghost icon" aria-label="Refresh" onClick={() => { setRefreshedAt(Date.now()); void client.invalidateQueries(); }}><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
      </div>

      {failed?.error ? <p role="alert" className="dash-error">{failed.error.message}</p> : null}

      {!legacy.dashboardCounts && shared ? (
        sharedPills.length ? (
          <div className="alert-strip" role="region" aria-label="Urgent">
            {sharedPills.map((pill) => (
              <Link key={pill.level} to={withScope("/alerts")} className={`alert-pill ${pill.tone}`}>
                <strong>{pill.count}</strong> {pill.level === "critical" ? "Critical" : pill.level === "important" ? "Important" : "Info"} · {pill.first}{pill.count > 1 ? ` and ${pill.count - 1} more` : ""}
              </Link>
            ))}
            <Link to={withScope("/alerts")} className="alert-pill all">See all alerts</Link>
          </div>
        ) : null
      ) : alerts.length ? (
        <div className="alert-strip" role="region" aria-label="Urgent">
          {alerts.map((alert) => (
            <Link key={alert.id} to={withScope(alert.path)} className={`alert-pill ${alert.tone}${alertSignals.fresh.some((id) => id.startsWith(alert.id === "wait" ? "wait:" : `${alert.id}:`)) ? " flash" : ""}`}>
              {alert.icon}<strong>{alert.count}</strong> {alert.text}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        {TABS.map((item) => (
          <button data-command="admin.ui.dashboardTab" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => setTab(item.id)}>
            {item.label}
            {item.id === "live" && requests.length ? <span className="tab-count">{requests.length}</span> : null}
            {item.id === "work" && unassigned.length ? <span className="tab-count">{unassigned.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div className="quick-actions" role="toolbar" aria-label="Quick actions">
            {mainActions.map((action) => action.path ? (
              <Link key={action.id} className="quick-action" to={withScope(action.path)}>{action.icon}{action.label}</Link>
            ) : (
              <button data-command="admin.ui.quickAction" key={action.id} type="button" className="quick-action" onClick={action.onRun}>{action.icon}{action.label}</button>
            ))}
            {moreActions.length ? (
              <div className="more-wrap" ref={moreRef}>
                <button data-command="admin.ui.quickAction" type="button" className="quick-action" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>More <ChevronDown size={14} aria-hidden="true" /></button>
                {moreOpen ? (
                  <div className="more-menu">
                    {moreActions.map((action) => action.path ? (
                      <Link key={action.id} to={withScope(action.path)} onClick={() => setMoreOpen(false)}>{action.icon}{action.label}</Link>
                    ) : (
                      <button data-command="admin.ui.quickAction" key={action.id} type="button" onClick={() => { setMoreOpen(false); action.onRun?.(); }}>{action.icon}{action.label}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <section className={stale ? "earnings-card is-stale" : "earnings-card"} aria-labelledby="earnings-title" aria-busy={stale}>
            <div className="earnings-main">
              <div className="earnings-top">
                <div>
                  <h3 id="earnings-title">Gross bookings</h3>
                  <div className="hero-number" data-testid="gross-bookings">{money(totals.grossMinor)}</div>
                  <div className="hero-sub"><Delta value={change(totals.grossMinor, previous.grossMinor)} label={shownSpan.compareLabel} /> <span>{shownSpan.compareLabel}</span></div>
                </div>
                <span className="currency-badge">{market.currency}</span>
              </div>
              <EarningsChart points={report.series} format={money} formatAxis={compact} compareLabel={shownSpan.compareLabel} />
            </div>
            <dl className="earnings-side">
              <div className="side-row accent">
                <dt>Movera earnings <small>Commission {Math.round(COMMISSION_PLACEHOLDER * 100)}% placeholder · set later in Pricing</small></dt>
                <dd>{money(totals.commissionMinor)} <Delta value={change(totals.commissionMinor, previous.commissionMinor)} label={shownSpan.compareLabel} /></dd>
              </div>
              <div className="side-row"><dt>Driver earnings</dt><dd>{money(totals.driverMinor)} <Delta value={change(totals.driverMinor, previous.driverMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>Tips</dt><dd>{money(totals.tipsMinor)} <Delta value={change(totals.tipsMinor, previous.tipsMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>Refunds &amp; vouchers</dt><dd>−{money(totals.refundsMinor)} <Delta value={change(totals.refundsMinor, previous.refundsMinor)} inverse label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row strong"><dt>Net revenue</dt><dd>{money(totals.netMinor)} <Delta value={change(totals.netMinor, previous.netMinor)} label={shownSpan.compareLabel} /></dd></div>
              <div className="side-row"><dt>Average fare</dt><dd>{money(avgFare)} <Delta value={change(avgFare, prevAvgFare)} label={shownSpan.compareLabel} /></dd></div>
            </dl>
          </section>

          <section className={stale ? "kpi-grid is-stale" : "kpi-grid"} aria-label="Key numbers">
            <Kpi icon={<TrendingUp size={18} />} tone="blue" label="Completed trips" value={number.format(totals.trips)} delta={<Delta value={change(totals.trips, previous.trips)} label={shownSpan.compareLabel} />} />
            <Kpi
              icon={<Car size={18} />}
              tone="green"
              label="Drivers online now"
              value={loading ? "…" : number.format(liveCounts.free + busy + liveCounts.sos)}
              hint={<>{liveCounts.free} free · {busy} busy{liveCounts.sos ? <> · <b className="sos-text">{liveCounts.sos} SOS</b></> : null}</>}
            />
            <Kpi icon={<XCircle size={18} />} tone="red" label="Cancellation rate" value={`${cancelRate.toFixed(1)}%`} delta={<Delta value={change(cancelRate, prevCancelRate)} inverse label={shownSpan.compareLabel} />} />
            <Kpi icon={<Clock size={18} />} tone="amber" label="Avg pickup wait" value={`${avgWait.toFixed(1)} min`} delta={<Delta value={change(avgWait, prevWait)} inverse label={shownSpan.compareLabel} />} />
            <Kpi icon={<Users size={18} />} tone="violet" label="New riders" value={number.format(totals.newRiders)} delta={<Delta value={change(totals.newRiders, previous.newRiders)} label={shownSpan.compareLabel} />} />
            <Kpi icon={<UserPlus size={18} />} tone="aqua" label="New drivers" value={number.format(totals.newDrivers)} delta={<Delta value={previous.newDrivers < 5 ? null : change(totals.newDrivers, previous.newDrivers)} label={shownSpan.compareLabel} />} />
          </section>
        </>
      ) : null}

      {tab === "live" ? (
        <>
          <div className="dash-row">
            <section className="dash-card map-card" aria-labelledby="map-title">
              <div className="card-head">
                <h3 id="map-title"><span className="live-dot" aria-hidden="true" /> Live drivers</h3>
                <span className="card-head-tools"><LiveTag />{can(role, "trips.read") ? <Link className="link-action" to={withScope("/live")}>Open full live map →</Link> : null}</span>
              </div>
              <div className="state-filters" role="group" aria-label="Show drivers">
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
                      <i style={{ background: STATE_COLOR[state.id] }} />{state.label}<strong>{liveCounts[state.id]}</strong>
                    </button>
                  );
                })}
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showRequests} className={showRequests ? "state-chip" : "state-chip off"} onClick={() => setShowRequests((value) => !value)}>
                  <i style={{ background: "#d55181" }} />Riders waiting<strong>{requests.length}</strong>
                </button>
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showBalance} className={showBalance ? "state-chip" : "state-chip off"} onClick={() => setShowBalance((value) => !value)}>
                  <i style={{ background: "linear-gradient(90deg,#0ca30c,#eda100,#d03b3b)" }} />Supply vs demand
                </button>
                <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showBonus} className={showBonus ? "state-chip" : "state-chip off"} onClick={() => setShowBonus((value) => !value)}>
                  <i style={{ background: "#f2994a" }} />Driver bonus areas<strong>{bonusAreas.length}</strong>
                </button>
                <SurgeControls compact shown={surgePref.shown} style={surgePref.style} onShown={surgePref.setShown} onStyle={surgePref.setStyle} />
              </div>
              {liveNotice ? <p className="fd-notice" role="status">{liveNotice}</p> : null}
              <DriversMap
                drivers={live}
                requests={requests}
                showRequests={showRequests}
                focusRequest={focusRequest}
                balance={balance}
                showBalance={showBalance}
                surge={surge}
                surgeShown={surgePref.shown}
                surgeStyle={surgePref.style}
                bonusAreas={bonusAreas}
                bonusShown={showBonus}
                onSurgeZone={(zoneId) => { const link = surgeLink(zoneId); if (link) navigate(link); }}
                renderAssign={can(role, "trips.intervene") ? (request) => <AssignControls request={request} candidates={candidatesOf(request)} onDone={setLiveNotice} /> : undefined}
                market={market}
                zones={scope.zones}
                hidden={hidden}
                withScope={withScope}
                focusId={params.get("focus")}
                tripFor={(driver) => liveTrip(driver, { trips: trips.data ?? [], reservations: reservations.data ?? [], vehicles: vehicles.data ?? [], fleets: fleets.data ?? [], riders: riders.data ?? [] }, now, shift)}
                infoFor={(driverId) => {
                  const record = (drivers.data ?? []).find((row) => row.id === driverId);
                  if (!record) return null;
                  const ops = driverOps(driverStore.value, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
                  const today = driverPerformance({ id: record.id, zoneId: record.zoneId, status: record.status, stars: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancellationPct: ops.ratings.cancellationPct }, periodWindow({ kind: "today" }, now, market.timeZone, market.locale), false).current;
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
              {surgePref.shown ? <SurgeLegend /> : null}
              <p className="fine-print">{api.demo ? "Simulated positions from demo data. " : ""}Drivers move every 5 seconds; data reloads every 10 seconds.</p>
            </section>

            <SupplyDemandCard rows={balance} showOnMap={showBalance} onToggleMap={() => setShowBalance((value) => !value)} surgeLink={surgeLink} />
          </div>

          <LiveRiders
            counts={riderStats}
            requests={requests}
            candidatesOf={candidatesOf}
            onLocate={(id) => setFocusRequest({ id, nonce: Date.now() })}
            canAssign={can(role, "trips.intervene")}
            onAssigned={setLiveNotice}
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
                <h3 id="rides-title">Scheduled rides</h3>
                {can(role, "trips.read") ? <Link className="link-action" to={withScope("/reservations")}>See all →</Link> : null}
              </div>
              <div className="ride-counters">
                <span><strong>{counts.upcoming}</strong> Upcoming</span>
                <span className={counts.unassigned ? "warn" : undefined}><strong>{counts.unassigned}</strong> Unassigned</span>
                <span><strong>{counts.assigned}</strong> Assigned</span>
                <span title={span.label}><strong>{periodCounts.completed}</strong> Completed</span>
                <span title={span.label}><strong>{periodCounts.cancelled}</strong> Cancelled</span>
                <span title={span.label} className={periodCounts.noShow ? "warn" : undefined}><strong>{periodCounts.noShow}</strong> No-show</span>
              </div>
              <p className="fine-print">Upcoming, unassigned and assigned are the next 7 days. Completed, cancelled and no-show follow the period: {span.label}.</p>
              <div className="tabs-row" role="tablist" aria-label="Scheduled rides">
                {(["upcoming", "past", "calendar"] as const).map((item) => (
                  <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={rideTab === item} className={rideTab === item ? "active" : undefined} onClick={() => setRideTab(item)}>
                    {item === "upcoming" ? "Upcoming · next 7 days" : item === "past" ? `Past · ${span.label}` : "Calendar"}
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
                      <small className={day.open ? "warn" : undefined}>{day.open ? `${day.open} without driver` : "All assigned"}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <RideTable rides={rideRows} now={now} upcoming={rideTab === "upcoming"} timeFormat={timeFormat} dayFormat={dayFormat} money={money} withScope={withScope} />
              )}
            </section>

            <section className="dash-card queues-card" aria-labelledby="queues-title">
              <div className="card-head"><h3 id="queues-title">Work queues</h3><LiveTag /></div>
              <ul className="queue-list">
                {queues.map((queue) => (
                  <li key={queue.label}>
                    <Link to={withScope(queue.path)} className={`queue tone-${queue.tone}`}>
                      <span className="queue-icon" aria-hidden="true">{queue.icon}</span>
                      <span className="queue-label">{queue.label}</span>
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
          />
          <section className="dash-card shares-card" aria-labelledby="shares-title">
            <div className="card-head"><h3 id="shares-title">Where the money comes from</h3></div>
            <div className="tabs-row" role="tablist" aria-label="Breakdown">
              {(["zone", "category", "method"] as const).map((item) => (
                <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={shareTab === item} className={shareTab === item ? "active" : undefined} onClick={() => setShareTab(item)}>
                  {item === "zone" ? "Zones" : item === "category" ? "Categories" : "Payment"}
                </button>
              ))}
            </div>
            {totals.grossMinor ? <ShareBars rows={shareTab === "zone" ? report.byZone : shareTab === "category" ? report.byCategory : report.byMethod} format={compact} /> : <p className="state-line">No earnings in this period yet.</p>}
          </section>
        </div>
      ) : null}
    </div>
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
