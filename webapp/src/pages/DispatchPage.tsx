import { NotConnected } from "../live/NotConnected";
import { isLiveData } from "../live/realData";
import { logExport } from "../reports/activityLog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, CalendarDays, Download, FlaskConical, HandHeart, History, ListX, Radio, Save, Scale, ListTree, ScrollText, Send, Undo2, UserRoundCheck } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { liveDrivers } from "../dashboard/live";
import { reservationFareMinor } from "../dashboard/scheduled";
import { activeCategories, emptyPricingStore, normalizeStore, SLICE_KEY as PRICING_KEY, zoneBook, type PricingStore } from "../pricing/zonePricing";
import { candidatesFor, rideRequests, type RideRequest } from "../dashboard/riders";
import { CATEGORIES } from "../domain/contract";
import { driverOps, emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { standardZone, standardZoneId, zoneById } from "../markets/markets";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { PublishTargetsLine, StandardBar } from "../live/StandardBar";
import { zoneAllowed } from "../markets/scope";
import { useMarketScope } from "../markets/useMarketScope";
import { CommandButton } from "../ui/CommandButton";
import { useAlertsMaybe } from "../alerts/AlertsContext";
import { DispatchAlerts } from "../alerts/DispatchAlerts";
import { cancelRecords, driverFacts, onlyFinishingNearby } from "../dispatch/demo";
import { CancelView } from "../dispatch/CancelView";
import { ActivityView } from "../dispatch/ActivityView";
import { AllFeaturesView } from "../dispatch/AllFeaturesView";
import { largeCancelFeeChanges } from "../dispatch/cancelFees";
import { CancelReasonsView } from "../dispatch/CancelReasonsView";
import { EventsView } from "../dispatch/EventsView";
import { Approvals, HistoryView } from "../dispatch/HistoryView";
import { LiveView } from "../dispatch/LiveView";
import { RulesView } from "../dispatch/RulesView";
import { TestView } from "../dispatch/TestView";
import { useRideCheckSettings } from "../safety/RideCheckSettingsCard";
import { RIDE_CHECK_SETTINGS_KEY } from "../safety/rideCheckSettings";
import { appConfigFileName, appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs";
import { DRIVER_TEXTS_KEY } from "../content/driverTexts";
import { COUNTRY_SETTINGS_KEY } from "../config/countrySettings";
import { largeWaitChanges } from "../dispatch/offers";
import { DRIVER_NOTICES_KEY } from "../messages/driverNotices";
import {
  countryLines, DISPATCH_KEY, draftCountry, draftRules, emptyDispatchBook, liveCountry, liveRules, normalizeDispatchBook, OFFER_TABS, pendingChanges, publish, rulesFile, saveDraft, TABS,
  type CountryDispatch, type DispatchBook, type TabId, type ZoneDispatch,
} from "../dispatch/rules";
import { DriverGroupsCard } from "../dispatch/DriverGroupsCard";
import { RadarZoneRulesCard, RadarZonesCard } from "../dispatch/RadarZones";
import { offersLink } from "../dispatch/MovedCard";
import { dispatchHref } from "../dispatch/section";
import { tr, trn, trx, uiLocale, trSentences } from "../i18n";

const VIEWS = [
  { id: "rules", get label() { return tr("Rules"); }, icon: ScrollText },
  { id: "live", get label() { return tr("Live"); }, icon: Radio },
  { id: "test", get label() { return tr("Test a ride"); }, icon: FlaskConical },
  { id: "events", get label() { return tr("Events & groups"); }, icon: CalendarDays },
  { id: "cancels", get label() { return tr("Cancel checks"); }, icon: Scale },
  { id: "reasons", get label() { return tr("Cancel reasons"); }, icon: ListX },
  { id: "history", get label() { return tr("History"); }, icon: History },
] as const;

/** Views opened from a header button rather than a tab. */
const EXTRA_VIEWS = ["activity", "features"] as const;

type View = (typeof VIEWS)[number]["id"] | (typeof EXTRA_VIEWS)[number];

const SYMBOL = { SE: "kr", FR: "€", TN: "DT" } as const;

/**
 * Two sections share this page and the same rule book: Dispatch (the rules views) and Radar · Exclusive · Reservations
 * (three tabs: Radar, Exclusive, Reservations, plus radar zones, their rules and driver groups). Each setting lives in one of them.
 */
export function DispatchPage({ section = "dispatch" }: { section?: "dispatch" | "offers" | "bookings" } = {}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Radar · Exclusive and Bookings are the offer tabs of the Dispatch section; Rules is the rest.
  const offers = section !== "dispatch";
  const bookings = section === "bookings";
  const tabs = section === "offers" ? OFFER_TABS.filter((item) => item.id !== "reservations") : bookings ? OFFER_TABS.filter((item) => item.id === "reservations") : TABS;
  const defaultTab: TabId = section === "offers" ? "radar" : bookings ? "reservations" : "modes";
  const { agent } = useSession();
  const scope = useMarketScope();
  const market = scope.market;
  const country = scope.country;
  const view: View = !offers && (VIEWS.some((item) => item.id === params.get("view")) || (EXTRA_VIEWS as readonly string[]).includes(params.get("view") ?? "")) ? (params.get("view") as View) : "rules";
  const tab: TabId = tabs.some((item) => item.id === params.get("tab")) ? (params.get("tab") as TabId) : defaultTab;
  // The reservation tab moved to Radar · Exclusive · Reservations: an old Dispatch link lands there, same zone.
  useEffect(() => {
    if (offers) return;
    const wanted = params.get("tab");
    if (wanted === "reservations" || wanted === "radar" || wanted === "exclusive") navigate(offersLink(wanted, params.get("zone") ?? undefined, params.get("card") ?? undefined), { replace: true });
  }, [offers, params, navigate]);
  const slice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const rideCheck = useRideCheckSettings();
  const book = useMemo(() => normalizeDispatchBook(slice.value), [slice.value]);
  const driverStore = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const pricingSlice = useSlice<PricingStore>(PRICING_KEY, emptyPricingStore());
  const pricing = useMemo(() => normalizeStore(pricingSlice.value), [pricingSlice.value]);
  const drivers = useRecords("drivers", undefined, { refetchMs: 10_000 });
  const trips = useRecords("trips", undefined, { refetchMs: 10_000 });
  const vehicles = useRecords("vehicles");
  // The app config documents read these too; until all are loaded the download waits, so it never exports defaults by mistake.
  const appSources = {
    config: useSlice<unknown>("config", null),
    finance: useSlice<unknown>("finance", null),
    reservations: useSlice<unknown>("reservationOps", null),
    driverTexts: useSlice<unknown>(DRIVER_TEXTS_KEY, null),
    driverNotices: useSlice<unknown>(DRIVER_NOTICES_KEY, null),
    rideCheck: useSlice<unknown>(RIDE_CHECK_SETTINGS_KEY, null),
    countrySettings: useSlice<unknown>(COUNTRY_SETTINGS_KEY, null),
  };
  const appSourcesReady = !slice.loading && !pricingSlice.loading && !slice.error && !pricingSlice.error && Object.values(appSources).every((source) => !source.loading && !source.error);
  const incidents = useRecords("incidents");
  const riders = useRecords("riders");
  const [working, setWorking] = useState<Record<string, ZoneDispatch>>({});
  const [workingCountry, setWorkingCountry] = useState<Record<string, CountryDispatch>>({});
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => { setTick((value) => value + 1); setNow(Date.now()); }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  // "All features" links name a card (Q40): once the rules are drawn, scroll to it and flash it.
  const card = params.get("card");
  useEffect(() => {
    if (!card || slice.loading) return;
    const node = [...document.querySelectorAll<HTMLElement>("section.dx-card")].find((item) => item.getAttribute("aria-label") === trx(card));
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    node.classList.add("pl-flash");
    const timer = window.setTimeout(() => node.classList.remove("pl-flash"), 1600);
    return () => window.clearTimeout(timer);
  }, [card, slice.loading, params]);

  const access = agent?.scope ?? { zones: "all" as const };
  const zones = market.zones.filter((zone) => zoneAllowed(access, zone.id) && (!scope.zones.length || scope.zones.includes(zone.id)));
  // v0.8.0 (owner 2026-10-27): the live panel edits each country's Standard like a zone; no second admin.
  const liveSession = useLiveSessionMaybe();
  // Owner 2026-10-27: only what is chosen at the top; the Standard only when it is chosen there.
  const ruleZones = liveSession && scope.zones.includes(standardZoneId(country)) ? [standardZone(country), ...zones] : zones;
  const zoneParam = params.get("zone");
  const zoneId = zoneParam && ruleZones.some((zone) => zone.id === zoneParam) ? zoneParam : "";
  // Radar · Exclusive · Reservations opens on the first zone, straight into its three tabs.
  useEffect(() => {
    if (!offers || zoneId || !zones.length) return;
    const next = new URLSearchParams(params);
    next.set("zone", zones[0].id);
    setParams(next, { replace: true });
  }, [offers, zoneId, zones, params, setParams]);
  const canEditRole = Boolean(agent && can(agent.role, "dispatch.edit"));
  const canApprove = Boolean(agent && can(agent.role, "dispatch.approve"));
  const canControl = Boolean(agent && can(agent.role, "trips.intervene"));
  const canEdit = useCallback((id: string) => canEditRole && Boolean(agent && (agent.scope.zones === "all" || agent.scope.zones.includes(id))), [canEditRole, agent]);
  const symbol = SYMBOL[country];
  const money = (value: number) => `${new Intl.NumberFormat(market.locale, { maximumFractionDigits: 2 }).format(value)} ${symbol}`;
  const hhmm = new Intl.DateTimeFormat(uiLocale(), { timeZone: market.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));

  const rulesOf = useCallback((id: string) => working[id] ?? draftRules(book, id), [working, book]);
  const liveOf = useCallback((id: string) => liveRules(book, id), [book]);
  const countryRules = workingCountry[country] ?? draftCountry(book, country);
  const zoneIds = ruleZones.map((zone) => zone.id);
  const allRules = Object.fromEntries(zoneIds.map((id) => [id, rulesOf(id)]));
  const changes = pendingChanges(book, allRules, zoneIds);
  const countryChanged = countryLines(liveCountry(book, country), countryRules);
  const changed = new Set(changes.map((change) => change.zoneId));
  const unsaved = Object.keys(working).some((id) => JSON.stringify(working[id]) !== JSON.stringify(draftRules(book, id))) || Boolean(workingCountry[country] && JSON.stringify(workingCountry[country]) !== JSON.stringify(draftCountry(book, country)));
  const lineCount = changes.reduce((sum, change) => sum + change.lines.length, 0) + countryChanged.length;
  const at = new Date(now).toISOString();
  const countries = { ...(book.countries[country] ? { [country]: draftCountry(book, country) } : {}), ...(workingCountry[country] ? { [country]: countryRules } : {}) };
  const published = agent ? publish(book, allRules, countries, zoneIds, agent.id, at, note.trim(), { direct: Boolean(liveSession) }) : { book, live: [], waiting: [], error: "Sign in again." };
  const drafted = saveDraft(book, working, workingCountry);

  const live = useMemo(() => liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], tick), [drivers.data, vehicles.data, trips.data, incidents.data, tick]);
  const onlineIds = useMemo(() => new Set(live.map((driver) => driver.id)), [live]);
  const requests = useMemo(() => rideRequests(trips.data ?? [], riders.data ?? [], (id) => onlineIds.has(id)), [trips.data, riders.data, onlineIds]);
  const statsOf = useCallback((id: string) => {
    const record = (drivers.data ?? []).find((row) => row.id === id);
    if (!record) return { rating: 4.7, acceptancePct: 85, cancelPct: 5, categories: ["economy"] };
    const ops = driverOps(driverStore.value, { id: record.id, name: record.name, fleetId: record.fleetId, status: record.status, kind: record.kind });
    return { rating: ops.ratings.stars, acceptancePct: ops.ratings.acceptancePct, cancelPct: ops.ratings.cancellationPct, categories: CATEGORIES.filter((category) => ops.categories[category.id]).map((category) => category.id) };
  }, [drivers.data, driverStore.value]);
  const candidatesOf = (request: RideRequest) => candidatesFor(request, live, (id) => statsOf(id).categories);
  const busyOf = (id: string) => {
    const free = live.filter((driver) => driver.zoneId === id && driver.state === "free").length;
    const waiting = requests.filter((request) => request.zoneId === id).length;
    return Math.round((waiting / Math.max(1, free)) * 10) / 10;
  };
  const countryLive = useMemo(() => live.filter((driver) => market.zones.some((zone) => zone.id === driver.zoneId)), [live, market]);
  const factsFor = useCallback((pickup: [number, number]) => onlyFinishingNearby(driverFacts(countryLive, statsOf, pickup)), [countryLive, statsOf]);
  const [loadedAt] = useState(() => Date.now());
  const sharedAlerts = useAlertsMaybe();
  // Ride checks still open on a live trip, pinned to the car on the live map (safety team and dispatchers).
  const canRideCheck = Boolean(agent && (can(agent.role, "incidents.read") || can(agent.role, "trips.intervene")));
  const mapRideChecks = canRideCheck && sharedAlerts ? { checks: sharedAlerts.rideCheck.checks, demoShift: sharedAlerts.rideCheck.demoShift, now: sharedAlerts.now } : null;
  const ownAlerts = sharedAlerts ? sharedAlerts.book.settings.legacy.dispatchAlerts : true;
  const records = useMemo(() => cancelRecords(country, zones.map((zone) => ({ id: zone.id, name: zone.name, center: zone.center })), (drivers.data ?? []).map((row) => ({ id: row.id, name: row.name, zoneId: row.zoneId })), loadedAt), [country, zones.map((zone) => zone.id).join(","), drivers.data, loadedAt]);

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  function back() {
    if (view !== "rules") go({ view: null });
    else if (zoneId) go({ zone: null });
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }

  function downloadJson(name: string, value: unknown) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadRules() {
    const file = rulesFile(book, country, new Date().toISOString(), rideCheck.settings, activeCategories(pricing).map(({ id, label }) => ({ id, label })));
    downloadJson(`movera-dispatch-rules-${country}-rev${book.draftRev}.json`, file);
    logExport(agent?.id, `Dispatch rules file ${country}`);
    setNotice(`Rules file downloaded: every zone in ${market.name}, revision ${book.draftRev}.`);
  }

  /** RiderAppConfig / DriverAppConfig (contract §6) for the open zone, from the live (published) settings. */
  function downloadAppConfig(app: "rider" | "driver") {
    if (!zoneId) return;
    const state = appConfigState({
      now: new Date().toISOString(),
      dispatch: slice.value,
      pricing: pricingSlice.value,
      ...Object.fromEntries(Object.entries(appSources).map(([key, source]) => [key, source.value])),
    });
    const doc = app === "rider" ? riderAppConfig(zoneId, state) : driverAppConfig(zoneId, state);
    downloadJson(appConfigFileName(app, doc), doc);
    const name = zoneById(zoneId)?.name ?? zoneId;
    logExport(agent?.id, `${app === "rider" ? "Rider" : "Driver"} app config ${zoneId}`);
    setNotice(`${app === "rider" ? "RiderAppConfig" : "DriverAppConfig"} downloaded for ${name}, version ${doc.version}. Live settings only; drafts are not in it.`);
  }

  const say = (text: string) => setNotice(text);
  const commissionOf = (id: string) => zoneBook(pricing, id).commission.economy ?? 20;
  const sampleFareOf = (id: string) => reservationFareMinor({ zoneId: id, category: "economy" }).minor / market.minorUnits;
  /** The car types Pricing offers in a zone (not deleted, switched on there), the same list as waiting at pickup. */
  const feeCategoriesOf = (id: string) => {
    const prices = zoneBook(pricing, id).prices;
    return activeCategories(pricing).filter((category) => prices[category.id]?.enabled).map(({ id: categoryId, label }) => ({ id: categoryId, label }));
  };
  // A cancel fee moving more than 50 % from its published value asks "Are you sure?" on Save and Publish (A-O3).
  const largeChangesIn = (ids: readonly string[]) => ids.flatMap((id) => {
    const before = liveRules(book, id);
    const after = allRules[id];
    const name = zoneById(id)?.name ?? id;
    return [
      ...largeCancelFeeChanges(before.riderCancel.fees, after.riderCancel.fees, feeCategoriesOf(id), `${name} · Rider cancels`, symbol),
      ...largeCancelFeeChanges(before.reservation.riderFees, after.reservation.riderFees, feeCategoriesOf(id), `${name} · Reservations`, symbol),
      ...largeWaitChanges(before.pickupWait, after.pickupWait, `${name} · Waiting at pickup`, symbol),
    ];
  });
  const largeChanges = largeChangesIn(zoneIds);
  const largeDraftChanges = largeChangesIn(zoneIds.filter((id) => id in working));
  const waitBasesOf = (id: string) => {
    const prices = zoneBook(pricing, id).prices;
    return activeCategories(pricing).filter((category) => prices[category.id]?.enabled).map((category) => ({ id: category.id, label: category.label, base: { freeWaitMin: prices[category.id].freeWaitMin, perMin: prices[category.id].waitPerMin, noShowFee: prices[category.id].noShowFee } }));
  };
  const scopeLabel = (ids: string[]) => (ids.length === 1 ? ids[0] : "all");

  return (
    <div className="dx-page">
      <header className="dx-head">
        <button data-command="admin.dispatch.view" type="button" className="dash-btn ghost dx-back" onClick={back} aria-label={tr("Go back")}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{bookings ? trn("Bookings in {0}", trx(market.name)) : offers ? trn("Radar · Exclusive in {0}", trx(market.name)) : trn("Dispatch rules in {0}", trx(market.name))}</h2>
          <p>{bookings ? tr("Rules for booked rides in every zone: who gets the offer, when it goes out, and the cancel fees.") : offers ? tr("Radar and its radar zones, Exclusive offers and driver groups, for every zone.") : tr("How ride requests find a driver, with rules for every zone. Radar, Exclusive and bookings have their own tabs.")}</p>
        </div>
        {!offers ? <button data-command="admin.dispatch.view" type="button" className={view === "features" ? "dash-btn ghost active" : "dash-btn ghost"} aria-pressed={view === "features"} onClick={() => go({ view: view === "features" ? null : "features" })} title={tr("Every setting and feature, with a search")}>{trn("{0} All features", <ListTree size={15} aria-hidden="true" />)}</button> : null}
        {!offers ? <button data-command="admin.dispatch.view" type="button" className="dash-btn ghost" onClick={() => navigate("/pricing?tab=extras&section=tips")} title={tr("Tips and raise-offer quick steps per country, in Pricing")}>{trn("{0} Tips & raise steps", <HandHeart size={15} aria-hidden="true" />)}</button> : null}
        {!offers ? <button data-command="admin.dispatch.view" type="button" className={view === "activity" ? "dash-btn ghost active" : "dash-btn ghost"} aria-pressed={view === "activity"} onClick={() => go({ view: view === "activity" ? null : "activity" })} title={tr("Everything you did, this session and earlier, with done or failed")}>{trn("{0} My activity", <UserRoundCheck size={15} aria-hidden="true" />)}</button> : null}
        <button data-command="admin.dispatch.rulesFile" type="button" className="dash-btn ghost" onClick={downloadRules} title={tr("All live rules in one file for the backend team")}>{trn("{0} Rules file", <Download size={15} aria-hidden="true" />)}</button>
        {zoneId ? (
          <>
            <button data-command="admin.dispatch.appConfig" type="button" className="dash-btn ghost" onClick={() => downloadAppConfig("rider")} disabled={!appSourcesReady} title={appSourcesReady ? tr("RiderAppConfig JSON for this zone, as the rider app reads it") : tr("Loading the settings the rider app config is made from")}>{trn("{0} Rider app config", <Download size={15} aria-hidden="true" />)}</button>
            <button data-command="admin.dispatch.appConfig" type="button" className="dash-btn ghost" onClick={() => downloadAppConfig("driver")} disabled={!appSourcesReady} title={appSourcesReady ? tr("DriverAppConfig JSON for this zone, as the driver app reads it") : tr("Loading the settings the driver app config is made from")}>{trn("{0} Driver app config", <Download size={15} aria-hidden="true" />)}</button>
          </>
        ) : null}
      </header>

      {offers ? null : <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Dispatch sections")}>
        {VIEWS.map((item) => {
          const Icon = item.icon;
          const count = item.id === "history" ? book.approvals.length : 0;
          return (
            <button data-command="admin.dispatch.view" key={item.id} type="button" role="tab" aria-selected={view === item.id} className={view === item.id ? "active" : undefined} onClick={() => go({ view: item.id === "rules" ? null : item.id })}>
              <Icon size={15} aria-hidden="true" /> {trx(item.label)}{count ? <span className="tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>}

      {view !== "history" ? <Approvals book={book} agentId={agent?.id ?? ""} canApprove={canApprove} onNotice={say} compact /> : null}

      {view === "rules" || view === "test" || view === "reasons" ? (
        <section className={changes.length || countryChanged.length ? "dx-publish has-changes" : "dx-publish"} aria-label={tr("Publish")}>
          <div className="dx-publish-text">
            {changes.length || countryChanged.length ? (
              <>
                <b>{trn("{0} change{1} not live yet", lineCount, lineCount === 1 ? "" : tr("s"))}</b>
                <small>{[...changes.map((change) => zoneById(change.zoneId)?.name ?? change.zoneId), ...(countryChanged.length ? [`${market.name} rules`] : [])].join(", ")}{unsaved ? tr(" · not saved") : tr(" · saved as a draft")}</small>
              </>
            ) : (
              <>
                <b>{tr("Everything is live")}</b>
                <small>{tr("Change a rule, then publish it now or save it as a draft and test it first.")}</small>
              </>
            )}
          </div>
          {changes.length || countryChanged.length ? (
            <div className="dx-publish-actions">
              <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" aria-expanded={showChanges} onClick={() => setShowChanges((value) => !value)}>{showChanges ? tr("Hide changes") : tr("See changes")}</button>
              {unsaved ? <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" onClick={() => { setWorking({}); setWorkingCountry({}); setNotice("Unsaved changes were thrown away."); }}>{trn("{0} Discard", <Undo2 size={13} aria-hidden="true" />)}</button> : null}
              {unsaved ? (
                <CommandButton command="admin.dispatch.saveDraft" className="dash-btn small ghost" targetId="dispatch draft" confirmTarget={false} scope={scopeLabel([...changed])} before={`draft ${book.draftRev}`} after={`draft ${drafted.draftRev}`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={drafted} disabled={!canEditRole} largeChanges={largeDraftChanges} onDone={() => { setWorking({}); setWorkingCountry({}); setNotice("Draft saved. Nothing is live yet. Test it in Test a ride, then publish."); }}>{trn("{0} Save draft", <Save size={13} aria-hidden="true" />)}</CommandButton>
              ) : null}
              {view !== "test" ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => go({ view: "test" })}>{trn("{0} Test it", <FlaskConical size={13} aria-hidden="true" />)}</button> : null}
              <CommandButton command="admin.dispatch.publish" className="dash-btn small publish" targetId="dispatch rules" confirmTarget={false} summary={liveSession ? <PublishTargetsLine zoneIds={[...changed]} /> : undefined} scope={scopeLabel([...changed])} before={`rev ${book.draftRev}`} after={`rev ${published.book.draftRev}`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={published.book} disabled={!canEditRole || Boolean(published.error)} title={published.error} largeChanges={largeChanges} onDone={() => {
                const liveNames = published.live.map((id) => zoneById(id)?.name ?? id);
                const waitNames = published.waiting.map((id) => zoneById(id)?.name ?? id);
                setWorking({});
                setWorkingCountry({});
                setNote("");
                setShowChanges(false);
                setNotice([liveNames.length || countryChanged.length ? `Live now${liveNames.length ? `: ${liveNames.join(", ")}` : ` in ${market.name}`}.` : "", waitNames.length ? `Waiting for a second admin: ${waitNames.join(", ")}.` : ""].filter(Boolean).join(" "));
              }}>{trn("{0} Publish now", <Send size={13} aria-hidden="true" />)}</CommandButton>
            </div>
          ) : null}
          {showChanges && (changes.length || countryChanged.length) ? (
            <div className="dx-changes">
              <ul aria-label={tr("Changes not live yet")}>
                {changes.map((change) => (
                  <li key={change.zoneId}>
                    <b>{zoneById(change.zoneId)?.name ?? change.zoneId}</b>{change.big && !liveSession ? <span className="dx-dot waiting">{tr("Needs a second admin")}</span> : null}
                    <ul>{change.lines.map((line) => <li key={line}>{line}</li>)}</ul>
                  </li>
                ))}
                {countryChanged.length ? <li><b>{trx(market.name)}</b><ul>{countryChanged.map((line) => <li key={line}>{line}</li>)}</ul></li> : null}
              </ul>
              <label className="field">{trn("Note for the history (optional){0}", <input aria-label={tr("Publish note")} maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr("For example More drivers on the radar for Friday nights")} />)}</label>
            </div>
          ) : null}
          {published.error && (changes.length || countryChanged.length) ? <p className="dx-publish-error" role="alert"><AlertTriangle size={13} aria-hidden="true" /> {trSentences(published.error)}</p> : null}
        </section>
      ) : null}

      {notice || slice.message ? <p className="pricing-notice" role="status">{trSentences(notice)} {trSentences(slice.message)}</p> : null}
      {slice.loading ? <p className="state-line">{tr("Loading dispatch rules.")}</p> : null}

      {!slice.loading && view === "rules" ? (
        <>
        {liveSession && zoneId ? <StandardBar doc="dispatch" docs={["dispatch", "driver_app_config", "rider_app_config"]} zoneId={zoneId} zoneName={ruleZones.find((zone) => zone.id === zoneId)?.name ?? zoneId} country={country} countryName={market.name} canEdit={canEdit(zoneId) || (zoneId.startsWith("standard-") && canEditRole)} /> : null}
        <RulesView
          book={book}
          market={market}
          zones={ruleZones}
          zoneId={zoneId}
          onZone={(id) => go({ zone: id })}
          tab={tab}
          tabs={tabs}
          onTab={(next) => {
            // A tab of the other section (Rider cancel fees from Reservations, and back): open it there, same zone.
            if (!tabs.some((item) => item.id === next)) {
              if (next === "radar" || next === "exclusive" || next === "reservations") navigate(offersLink(next, zoneId || undefined));
              else navigate(dispatchHref(`/dispatch?${new URLSearchParams({ ...(zoneId ? { zone: zoneId } : {}), tab: next })}`));
              return;
            }
            go({ tab: next === defaultTab ? null : next });
          }}
          below={offers ? (id, open) => (open === "radar" ? (
            <div className="dx-cards dx-radar-extra">
              <RadarZonesCard book={book} market={market} zone={zones.find((zone) => zone.id === id) ?? zones[0]} drivers={countryLive} canEdit={canEdit(id)} onNotice={say} />
              <RadarZoneRulesCard book={book} market={market} canEdit={canEditRole} onNotice={say} />
              <DriverGroupsCard book={book} market={market} drivers={countryLive.map((driver) => ({ id: driver.id, name: driver.name, zoneName: driver.zoneName }))} canEdit={canEditRole} onNotice={say} />
            </div>
          ) : null) : undefined}
          rulesOf={rulesOf}
          onRules={(id, next) => setWorking((current) => ({ ...current, [id]: next }))}
          country={countryRules}
          onCountry={(next) => setWorkingCountry((current) => ({ ...current, [country]: next }))}
          changed={changed}
          canEdit={canEdit}
          busyOf={busyOf}
          hhmm={hhmm}
          money={money}
          symbol={symbol}
          agentId={agent?.id ?? ""}
          onNotice={say}
          commissionOf={commissionOf}
          sampleFareOf={sampleFareOf}
          waitBasesOf={waitBasesOf}
          feeCategoriesOf={feeCategoriesOf}
        />
        </>
      ) : null}
      {!slice.loading && view === "live" ? <LiveView book={book} market={market} zones={zones} drivers={live.filter((driver) => zones.some((zone) => zone.id === driver.zoneId))} requests={requests} candidatesOf={candidatesOf} rulesOf={liveOf} busyOf={busyOf} hhmm={hhmm} canControl={canControl} agentId={agent?.id ?? ""} withScope={(path) => path} onNotice={say} sharedAlerts={ownAlerts ? undefined : <DispatchAlerts zoneIds={zones.map((zone) => zone.id)} />} rideChecks={mapRideChecks} /> : null}
      {!slice.loading && view === "test" && isLiveData() ? <NotConnected block /> : null}
      {!slice.loading && view === "test" && !isLiveData() ? <TestView market={market} zones={zones} zoneId={zoneId || zones[0]?.id || ""} onZone={(id) => go({ zone: id })} draftOf={rulesOf} liveOf={liveOf} countryDraft={countryRules} countryLive={liveCountry(book, country)} controlOf={(id) => book.control[id]} factsFor={factsFor} busyOf={busyOf} hhmm={hhmm} hasChanges={changes.length > 0 || countryChanged.length > 0} events={book.events.filter((event) => event.country === country)} /> : null}
      {!slice.loading && view === "events" ? <EventsView book={book} market={market} canEdit={canEditRole} canBonus={Boolean(agent && can(agent.role, "drivers.bonuses"))} onNotice={say} /> : null}
      {!slice.loading && view === "reasons" ? <CancelReasonsView market={market} country={countryRules} onCountry={(next) => setWorkingCountry((current) => ({ ...current, [country]: next }))} canEdit={canEditRole} /> : null}
      {!slice.loading && view === "cancels" ? <CancelView book={book} market={market} records={records} categories={activeCategories(pricing)} rulesOf={liveOf} canDecide={canControl} agentId={agent?.id ?? ""} money={money} onNotice={say} /> : null}
      {view === "activity" ? <ActivityView timeZone={market.timeZone} /> : null}
      {view === "features" ? <AllFeaturesView zoneId={zoneId || zones[0]?.id || ""} /> : null}
      {!slice.loading && view === "history" ? <HistoryView book={book} market={market} agentId={agent?.id ?? ""} canEdit={canEditRole} canApprove={canApprove} rulesOf={liveOf} onNotice={say} /> : null}
    </div>
  );
}
