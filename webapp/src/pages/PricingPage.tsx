import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  BadgePercent,
  Calculator,
  CircleDollarSign,
  Copy,
  HandCoins,
  HandHeart,
  History,
  Plane,
  Receipt,
  Route,
  Save,
  Square,
  Tags,
  Undo2,
  Zap,
} from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { can, canUseZone } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { supplyDemand } from "../dashboard/insights";
import { liveDrivers } from "../dashboard/live";
import { rideRequests } from "../dashboard/riders";
import { CATEGORIES } from "../domain/contract";
import { zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { CategoryManager } from "../pricing/CategoryManager";
import { CommissionPanel } from "../pricing/CommissionPanel";
import { CopyZones } from "../pricing/CopyZones";
import { CountryExtrasPanel } from "../pricing/CountryExtrasPanel";
import { FeesPanel, FixedRoutes } from "../pricing/FeesPanel";
import { HistoryPanel } from "../pricing/HistoryPanel";
import { PickupPayPanel } from "../pricing/PickupPayPanel";
import { PriceTable } from "../pricing/PriceTable";
import { alertsFor, surgeRows } from "../pricing/rows";
import { LEVEL_COLOR } from "../pricing/surge";
import { SurgePanel } from "../pricing/SurgePanel";
import { TestRide } from "../pricing/TestRide";
import { useSurgePref } from "../pricing/useSurgePref";
import {
  SLICE_KEY,
  activeCategories,
  copyInto,
  currencyOf,
  emptyPricingStore,
  largePriceChanges,
  normalizeStore,
  publishZones,
  stopManualSurges,
  undoLastPublish,
  largeStoreChanges,
  validateZoneBook,
  zoneBook,
  zoneLive,
  type CategoryPrice,
  type CategoryUsage,
  type CopyPart,
  type ZoneBook,
} from "../pricing/zonePricing";
import { CommandButton } from "../ui/CommandButton";
import { FieldErrorScope, useFieldErrors } from "../ui/fieldErrors";
import { Flag } from "../ui/Flag";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

const TABS = [
  { id: "prices", get label() { return tr("Prices"); }, icon: CircleDollarSign },
  { id: "fees", get label() { return tr("Fees"); }, icon: Receipt },
  { id: "surge", get label() { return tr("Surge"); }, icon: Zap },
  { id: "commission", get label() { return tr("Commission"); }, icon: BadgePercent },
  { id: "pickup", get label() { return tr("Pickup pay"); }, icon: HandCoins },
  { id: "extras", get label() { return tr("Tips & limits"); }, icon: HandHeart },
  { id: "history", get label() { return tr("History"); }, icon: History },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ACTIVE_TRIP = new Set(["requested", "searching", "offered", "accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"]);
const OPEN_RESERVATION = new Set(["waiting", "booked", "assigned"]);

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(timer);
  }, [stepMs]);
  return now;
}

export function PricingPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { market, country, zones: scopedZones } = useMarketScope();
  const role = agent?.role ?? "viewer";
  const canPublish = can(role, "settings.publish");
  const slice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  const store = useMemo(() => normalizeStore(slice.value), [slice.value]);
  const [drafts, setDrafts] = useState<Record<string, ZoneBook>>({});
  const [notice, setNotice] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState<false | CopyPart[]>(false);
  const [catsOpen, setCatsOpen] = useState(false);
  // Discard remounts the editors, so text still marked invalid in a box goes back to the published value too.
  const [editorKey, setEditorKey] = useState(0);
  // Tips & limits (one per country) save on their own; leaving with unsaved ones asks too.
  const [extrasDirty, setExtrasDirty] = useState(false);
  const surgeMap = useSurgePref("pricing", { shown: true, style: "zones" });
  const now = useNow(15_000);
  const minute = Math.floor(now / 60_000) * 60_000;

  const zones = market.zones.filter((zone) => !agent || canUseZone(agent, zone.id));
  const requested = params.get("zone");
  const zoneId = zones.find((zone) => zone.id === requested)?.id ?? (scopedZones.length === 1 && zones.some((zone) => zone.id === scopedZones[0]) ? scopedZones[0] : zones[0]?.id ?? "Z001");
  const zone = market.zones.find((item) => item.id === zoneId);
  const tab: Tab = TABS.find((item) => item.id === params.get("tab"))?.id ?? "prices";
  const currency = currencyOf(zoneId);

  function go(next: { zone?: string; tab?: Tab }) {
    const search = new URLSearchParams(params);
    if (next.zone) search.set("zone", next.zone);
    if (next.tab) search.set("tab", next.tab);
    setParams(search, { replace: !next.tab });
  }

  const categories = activeCategories(store);
  const published = zoneBook(store, zoneId);
  const book = drafts[zoneId] ?? published;
  const problems = validateZoneBook(book, store.categories);
  const dirty = Object.values(drafts).filter((draft) => JSON.stringify(draft) !== JSON.stringify(zoneBook(store, draft.zoneId)));
  const dirtyProblems = dirty.flatMap((draft) => validateZoneBook(draft, store.categories).map((problem) => ({ ...problem, zoneId: draft.zoneId })));
  // A price moving more than 50 % from its published value asks "Are you sure?" in the publish dialog (A-O3).
  const largeChanges = dirty.flatMap((draft) => largePriceChanges(zoneBook(store, draft.zoneId), draft, store.categories, zoneById(draft.zoneId)?.name ?? draft.zoneId));
  // Typed values that are not numbers or are over a field's maximum stay in their box until fixed (UI-05, UI-10).
  const fieldErrors = useFieldErrors();
  // Leaving Pricing with unpublished changes asks first, like Content, Messages and Team (UI-09).
  useDirtyWarning(dirty.length > 0 || extrasDirty);
  const at = new Date(now).toISOString();
  const publish = agent ? publishZones(store, drafts, agent.id, "Pricing update", at) : { store, error: "Sign in again.", changes: [] };
  const undo = agent ? undoLastPublish(store, agent.id, at) : { store, error: "Sign in again." };
  const countryZoneIds = zones.map((item) => item.id);
  const stopAll = agent ? stopManualSurges(store, countryZoneIds, agent.id, "Stop all surges", at) : { store, error: "Sign in again.", stopped: [] };
  const lastRevision = store.history.find((item) => item.zoneIds.includes(zoneId));

  function update(change: (draft: ZoneBook) => void) {
    if (!canPublish) return;
    setDrafts((current) => {
      const next = structuredClone(current[zoneId] ?? published);
      change(next);
      return { ...current, [zoneId]: next };
    });
  }

  // Live counts feed the surge view: riders waiting and free drivers per zone.
  const drivers = useRecords("drivers", undefined, { refetchMs: 30_000 });
  const trips = useRecords("trips", undefined, { refetchMs: 30_000 });
  const riders = useRecords("riders");
  const vehicles = useRecords("vehicles");
  const incidents = useRecords("incidents", undefined, { refetchMs: 30_000 });
  const reservations = useRecords("reservations");
  const live = useMemo(() => liveDrivers(drivers.data ?? [], vehicles.data ?? [], trips.data ?? [], incidents.data ?? [], 0), [drivers.data, vehicles.data, trips.data, incidents.data]);
  const online = useMemo(() => new Set(live.map((driver) => driver.id)), [live]);
  const requests = useMemo(() => rideRequests(trips.data ?? [], riders.data ?? [], (id) => online.has(id)), [trips.data, riders.data, online]);
  const counts = useMemo(() => new Map(supplyDemand(country, [], requests, live).map((row) => [row.zoneId, { waiting: row.waiting, free: row.free }])), [country, requests, live]);
  const zoneKey = countryZoneIds.join(",");
  const rows = useMemo(() => surgeRows(store, zoneKey.split(","), counts, minute), [store, zoneKey, counts, minute]);
  const alerts = alertsFor(rows, minute);
  const surgeOf = (id: string) => rows.find((row) => row.surge.zoneId === id)?.surge;

  function usageOf(categoryId: string): CategoryUsage {
    const fallback = (id: string) => CATEGORIES[hash(id) % CATEGORIES.length].id;
    return {
      activeRides: (trips.data ?? []).filter((row) => ACTIVE_TRIP.has(row.status) && (row.category ?? fallback(row.id)) === categoryId).length,
      reservations: (reservations.data ?? []).filter((row) => OPEN_RESERVATION.has(row.status) && row.category === categoryId).length,
      vehicles: (vehicles.data ?? []).filter((row) => row.category === categoryId).length,
    };
  }

  if (slice.loading) return <p className="state-line">{tr("Loading pricing.")}</p>;

  const changedCount = dirty.length;
  const currentSurge = surgeOf(zoneId);

  return (
    <FieldErrorScope value={fieldErrors.report}>
    <div className="pricing">
      <header className="pricing-hero">
        <div className="pricing-title">
          <h2>{tr("Pricing")}</h2>
          <p>{trn("{0} {1} · prices in {2}, VAT included · revision {3}", <Flag id={country} />, trx(market.name), market.currency, store.draftRev)}</p>
        </div>
        <div className="pricing-zone-now">
          <span className="eyebrow">{tr("Editing zone")}</span>
          <strong>{zone?.kind === "airport" ? <Plane size={16} aria-hidden="true" /> : null}{zone?.name ?? zoneId}</strong>
          <small>{lastRevision ? tr("v{0} · published {1} by {2}", [published.version, new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: market.timeZone }).format(Date.parse(lastRevision.at)), lastRevision.actorId]) : tr("v1 · Movera default prices")}</small>
        </div>
        {currentSurge ? (
          <button data-command="admin.pricing.tab" type="button" className={`hero-surge lvl-${currentSurge.level}`} onClick={() => go({ tab: "surge" })}>
            <Zap size={15} aria-hidden="true" />
            <b>×{currentSurge.multiplier.toFixed(1)}</b>
            <span>{currentSurge.source === "off" ? tr("No surge") : tr("{0} surge", [currentSurge.source])}</span>
          </button>
        ) : null}
      </header>

      <nav className="zone-rail" aria-label={tr("Zones")}>
        {zones.map((item) => {
          const surge = surgeOf(item.id);
          const hasDraft = dirty.some((draft) => draft.zoneId === item.id);
          return (
            <button data-command="admin.pricing.zone" key={item.id} type="button" aria-pressed={item.id === zoneId} className={item.id === zoneId ? "zone-pill active" : "zone-pill"} onClick={() => go({ zone: item.id })}>
              {item.kind === "airport" ? <Plane size={13} aria-hidden="true" /> : <i style={{ background: LEVEL_COLOR[surge?.level ?? "none"] }} aria-hidden="true" />}
              <span>{item.name}</span>
              {surge && surge.multiplier > 1 ? <b>×{surge.multiplier.toFixed(1)}</b> : null}
              {hasDraft ? <em title={tr("Unpublished changes")}>{tr("edited")}</em> : null}
            </button>
          );
        })}
      </nav>

      <section className="pricing-actions" aria-label={tr("Quick actions")}>
        <button data-command="admin.pricing.startSurge" type="button" className="quick-tile surge" disabled={!canPublish} onClick={() => { go({ tab: "surge" }); window.setTimeout(() => document.getElementById("manual-title")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80); }}>
          <Zap size={18} aria-hidden="true" /><span><b>{tr("Start surge")}</b><small>{trn("Manual, in {0}", zone?.name)}</small></span>
        </button>
        <CommandButton command="admin.pricing.stopAllSurges" className="quick-tile stop" targetId={market.id} confirmTarget={false} scope="all" before={`${stopAll.stopped.length} manual surges`} after="none" expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={stopAll.store} disabled={!canPublish || Boolean(stopAll.error)} title={stopAll.error} onDone={() => setNotice(`Stopped ${stopAll.stopped.length} manual surge${stopAll.stopped.length === 1 ? "" : "s"} in ${market.name}.`)}>
          <Square size={18} aria-hidden="true" /><span><b>{tr("Stop all surges")}</b><small>{stopAll.stopped.length ? tr("{0} manual running", [stopAll.stopped.length]) : tr("None running")}</small></span>
        </CommandButton>
        <button data-command="admin.pricing.copyZones" type="button" className="quick-tile" disabled={!canPublish} onClick={() => setCopyOpen(["prices", "fees"])}>
          <Copy size={18} aria-hidden="true" /><span><b>{tr("Copy to zones")}</b><small>{tr("As drafts to review")}</small></span>
        </button>
        <button data-command="admin.pricing.testRide" type="button" className="quick-tile" onClick={() => setTestOpen((open) => !open)}>
          <Calculator size={18} aria-hidden="true" /><span><b>{tr("Test a ride")}</b><small>{tr("See the price")}</small></span>
        </button>
        <button data-command="admin.pricing.addCategory" type="button" className="quick-tile" onClick={() => setCatsOpen(true)}>
          <Tags size={18} aria-hidden="true" /><span><b>{tr("Categories")}</b><small>{trn("{0} active", categories.length)}</small></span>
        </button>
        <CommandButton command="admin.pricing.undo" className="quick-tile" targetId={`pricing-rev-${store.history[0]?.rev ?? 0}`} confirmTarget={false} scope="all" before={`pricing rev ${store.draftRev}`} after="undo last publish" expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={undo.store} disabled={!canPublish || Boolean(undo.error)} title={undo.error} largeChanges={undo.error ? undefined : largeStoreChanges(store, undo.store)} onDone={() => setNotice(`Revision ${store.history[0]?.rev} undone.`)}>
          <Undo2 size={18} aria-hidden="true" /><span><b>{tr("Undo last publish")}</b><small>{store.history[0] ? tr("Revision {0}", [store.history[0].rev]) : tr("Nothing yet")}</small></span>
        </CommandButton>
      </section>

      {alerts.length ? (
        <button data-command="admin.pricing.tab" type="button" className="pricing-alert-bar" onClick={() => go({ tab: "surge" })}>
          <AlertTriangle size={16} aria-hidden="true" />
          <b>{trn("{0} surge alert{1}", alerts.length, alerts.length === 1 ? "" : tr("s"))}</b>
          <span>{trx(alerts[0].title)}{alerts.length > 1 ? tr(" and {0} more", [alerts.length - 1]) : ""}</span>
        </button>
      ) : null}

      {notice || slice.message ? <p className="pricing-notice" role="status">{trSentences(notice)} {trSentences(slice.message)}</p> : null}
      {!canPublish ? <p className="pricing-notice readonly" role="note">{tr("Your role is read-only for pricing. You can look and test rides, not change prices.")}</p> : null}

      <div className="dash-tabs pricing-tabs" role="tablist" aria-label={tr("Pricing sections")}>
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button data-command="admin.pricing.tab" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => go({ tab: item.id })}>
              <Icon size={15} aria-hidden="true" />
              {trx(item.label)}
              {item.id === "surge" && alerts.length ? <span className="tab-count">{alerts.length}</span> : null}
            </button>
          );
        })}
      </div>

      <div className={testOpen ? "pricing-body with-test" : "pricing-body"}>
        <div className="pricing-main" key={editorKey}>
          {tab === "prices" ? (
            <>
              <section className="dash-card" aria-labelledby="prices-title">
                <div className="card-head">
                  <h3 id="prices-title">{trn("{0} Prices · {1}", <CircleDollarSign size={16} aria-hidden="true" />, zone?.name)}</h3>
                  <span className="card-head-tools">
                    <span className="legend-chip changed">{tr("Changed, not published")}</span>
                    <button data-command="admin.pricing.addCategory" type="button" className="link-action" onClick={() => setCatsOpen(true)}>{tr("Manage categories")}</button>
                  </span>
                </div>
                <PriceTable
                  zoneName={zone?.name ?? zoneId}
                  currency={currency}
                  categories={categories}
                  book={book}
                  published={published}
                  problems={problems}
                  canEdit={canPublish}
                  onChange={(categoryId, patch: Partial<CategoryPrice>) => update((draft) => { draft.prices[categoryId] = { ...draft.prices[categoryId], ...patch }; })}
                  onOpenCancelFees={can(role, "trips.read") ? () => {
                    if (dirty.length && !window.confirm("Your price changes are not published and will be lost. Open Rider cancel fees in Dispatch?")) return;
                    navigate(`/dispatch?zone=${encodeURIComponent(zoneId)}&tab=rides#dx-rider-cancel-fees`);
                  } : undefined}
                />
              </section>
              <section className="dash-card" aria-labelledby="routes-title">
                <div className="card-head">
                  <h3 id="routes-title">{trn("{0} Fixed-price routes", <Route size={16} aria-hidden="true" />)}</h3>
                  <span className="fine-print">{tr("A flat price instead of km and min")}</span>
                </div>
                <FixedRoutes currency={currency} categories={categories} routes={book.routes} problems={problems} canEdit={canPublish} zoneId={zoneId} onChange={(routes) => update((draft) => { draft.routes = routes; })} />
              </section>
            </>
          ) : null}

          {tab === "fees" ? (
            <section className="dash-card" aria-labelledby="fees-title">
              <div className="card-head">
                <h3 id="fees-title">{trn("{0} Fees · {1}", <Receipt size={16} aria-hidden="true" />, zone?.name)}</h3>
                <span className="fine-print">{tr("Same for every category")}</span>
              </div>
              <FeesPanel zoneName={zone?.name ?? zoneId} airport={zone?.kind === "airport"} currency={currency} book={book} published={published} problems={problems} canEdit={canPublish} onChange={(patch) => update((draft) => { draft.fees = { ...draft.fees, ...patch }; })} />
            </section>
          ) : null}

          {tab === "surge" ? (
            <SurgePanel
              market={market}
              zoneId={zoneId}
              zoneName={zone?.name ?? zoneId}
              rows={rows}
              alerts={alerts}
              book={book}
              live={zoneLive(store, zoneId)}
              store={store}
              problems={problems}
              agentId={agent?.id ?? null}
              canEdit={canPublish}
              now={minute}
              map={surgeMap}
              onSmart={(patch) => update((draft) => { draft.smart = { ...draft.smart, ...patch }; })}
              onScheduled={(list) => update((draft) => { draft.scheduled = list; })}
              onSelectZone={(id) => go({ zone: id })}
              onNotice={setNotice}
            />
          ) : null}

          {tab === "commission" ? (
            <section className="dash-card" aria-labelledby="commission-title">
              <div className="card-head">
                <h3 id="commission-title">{trn("{0} Commission · {1}", <BadgePercent size={16} aria-hidden="true" />, zone?.name)}</h3>
                <span className="fine-print">{tr("What Movera keeps from the trip price")}</span>
              </div>
              <CommissionPanel zoneName={zone?.name ?? zoneId} currency={currency} categories={categories} book={book} published={published} problems={problems} canEdit={canPublish} onCommission={(id, value) => update((draft) => { draft.commission[id] = value; })} onFleet={(value) => update((draft) => { draft.fleetCommissionPct = value; })} />
            </section>
          ) : null}

          {tab === "pickup" ? (
            <PickupPayPanel
              zoneName={zone?.name ?? zoneId}
              currency={currency}
              categories={categories}
              book={book}
              published={published}
              problems={problems}
              canEdit={canPublish}
              onChange={(pickupPay) => update((draft) => { draft.pickupPay = pickupPay; })}
              onCopy={() => setCopyOpen(["pickup"])}
              onUseInAllZones={() => {
                if (!canPublish) return;
                const targets = zones.filter((item) => item.id !== zoneId).map((item) => item.id);
                setDrafts((current) => {
                  const next = { ...current, [zoneId]: book };
                  for (const target of targets) next[target] = copyInto(book, current[target] ?? zoneBook(store, target), ["pickup"]);
                  return next;
                });
                setNotice(`Pickup pay from ${zone?.name} copied to all ${targets.length} other zones in ${market.name} as drafts. Review and publish.`);
              }}
            />
          ) : null}

          {tab === "extras" ? <CountryExtrasPanel key={country} country={country} canEdit={canPublish} section={params.get("section")} onDirty={setExtrasDirty} onNotice={setNotice} /> : null}

          {tab === "history" ? (
            <section className="dash-card" aria-labelledby="history-title">
              <div className="card-head">
                <h3 id="history-title">{trn("{0} History", <History size={16} aria-hidden="true" />)}</h3>
                <span className="fine-print">{tr("Every publish, newest first")}</span>
              </div>
              <HistoryPanel store={store} zoneId={zoneId} agentId={agent?.id ?? null} canEdit={canPublish} locale={market.locale} timeZone={market.timeZone} onRestored={(message) => { setDrafts({}); setNotice(message); }} />
            </section>
          ) : null}
        </div>
        {testOpen ? <TestRide zoneName={zone?.name ?? zoneId} currency={currency} categories={categories} book={book} liveSurge={currentSurge?.multiplier ?? 1} draft={dirty.some((draft) => draft.zoneId === zoneId)} onClose={() => setTestOpen(false)} /> : null}
      </div>

      {changedCount ? (
        <div className="draft-bar" role="region" aria-label={tr("Unpublished changes")}>
          <span className="draft-dot" aria-hidden="true" />
          <div className="draft-text">
            <strong>{trn("Unpublished changes in {0}", dirty.map((draft) => zoneById(draft.zoneId)?.name ?? draft.zoneId).join(", "))}</strong>
            <small>{fieldErrors.first ?? (dirtyProblems.length ? dirtyProblems[0].message : tr("{0} change{1} · riders see them after you publish", [publish.changes.length, publish.changes.length === 1 ? "" : "s"]))}</small>
          </div>
          <button data-command="admin.pricing.discard" type="button" className="dash-btn ghost" onClick={() => { setDrafts({}); setEditorKey((key) => key + 1); setNotice("Changes discarded."); }}>{tr("Discard")}</button>
          <CommandButton command="admin.pricing.publish" className="dash-btn publish" targetId={`pricing-rev-${store.draftRev + 1}`} confirmTarget={false} scope="all" before={`pricing rev ${store.draftRev}`} after={`pricing rev ${store.draftRev + 1}: ${publish.changes.slice(0, 3).join("; ")}`} expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={publish.store} disabled={!canPublish || Boolean(publish.error) || dirtyProblems.length > 0 || fieldErrors.count > 0} title={fieldErrors.first ?? publish.error ?? dirtyProblems[0]?.message} largeChanges={largeChanges} onDone={() => { setDrafts({}); setNotice(`Published as pricing revision ${publish.store.draftRev}.`); }}>{trn("{0} Publish changes", <Save size={15} aria-hidden="true" />)}</CommandButton>
        </div>
      ) : null}

      {copyOpen ? (
        <CopyZones
          fromZoneId={zoneId}
          fromName={zone?.name ?? zoneId}
          initialParts={copyOpen}
          allowed={(id) => !agent || canUseZone(agent, id)}
          onClose={() => setCopyOpen(false)}
          onCopy={(targets, parts) => {
            setDrafts((current) => {
              const next = { ...current };
              for (const target of targets) next[target] = copyInto(book, current[target] ?? zoneBook(store, target), parts);
              return next;
            });
            setCopyOpen(false);
            setNotice(`Copied ${zone?.name} to ${targets.length} zone${targets.length === 1 ? "" : "s"} as drafts. Review and publish.`);
          }}
        />
      ) : null}
      {catsOpen ? <CategoryManager store={store} usageOf={usageOf} agentId={agent?.id ?? null} canEdit={canPublish} locale={market.locale} onClose={() => setCatsOpen(false)} onNotice={setNotice} /> : null}
    </div>
    </FieldErrorScope>
  );
}
