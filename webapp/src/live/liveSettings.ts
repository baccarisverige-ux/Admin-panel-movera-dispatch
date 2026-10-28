/**
 * The demo's Pricing, Dispatch, Settings and Tips & limits against the Movera server (contract v0.8.0 settings flow).
 * Reading a slice loads the server's drafts of every zone and of each country's Standard into the demo store;
 * publishing a page saves and publishes the server documents it owns at once (no second admin, owner 2026-10-27).
 */
import { MARKETS, standardZoneId, type MarketId } from "../markets/markets.ts";
import { normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY, type PricingStore } from "../pricing/zonePricing.ts";
import { catalogChanges, readPricingExtras, scheduleOf, sendCatalog, surgeChanges, type HistoryIndex } from "./livePricingOps.ts";
import { DISPATCH_KEY, normalizeDispatchBook, liveRules, type DispatchBook } from "../dispatch/rules.ts";
import { COUNTRY_SETTINGS_KEY, countrySettingsOf, driverBonusHardMax, type CountrySettingsBook } from "../config/countrySettings.ts";
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import {
  OWNED,
  SettingsChanged,
  bookOfPricing,
  countryRulesOf,
  dispatchDocumentOf,
  pricingDocumentOf,
  readDraft,
  rulesOfDispatch,
  savePublish,
  standardKey,
  goBackToStandard,
  withOwned,
  zoneFacts,
  type ConfigDocName,
  type ConfigHttp,
  type Doc,
  type Draft,
} from "./configDocs.ts";

/** Every zone of the admin's markets and each country's Standard. */
export function settingsScopes(): string[] {
  return MARKETS.flatMap((market) => [standardZoneId(market.id), ...market.zones.map((zone) => zone.id)]);
}

type Listener = () => void;

const CONFIG_KEY = "config";

/** "Uses standard" marks per document and zone, read from the server's drafts (usesStandard). */
export const standardMarks = (() => {
  const marks = new Map<string, boolean>();
  const listeners = new Set<Listener>();
  return {
    set(doc: ConfigDocName, zoneId: string, value: boolean) {
      marks.set(`${doc}:${zoneId}`, value);
      listeners.forEach((listener) => listener());
    },
    /** true: uses its country's Standard; false: has its own; undefined: not known (demo, or nothing on the server). */
    get(doc: ConfigDocName, zoneId: string): boolean | undefined {
      return marks.get(`${doc}:${zoneId}`);
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();

export type LiveSettings = {
  readSlice: (key: string, fallback: unknown) => Promise<unknown> | null;
  command: (action: string, input: { targetId: string; value?: unknown; scope?: string }) => Promise<string> | null;
};

const notFound = (error: unknown) => (error as { status?: number } | null)?.status === 404;

export function createLiveSettings(http: ConfigHttp, now: () => string = () => new Date().toISOString()): LiveSettings {
  const drafts = new Map<string, Draft | null>();
  const slices = new Map<string, unknown>();
  const key = (doc: ConfigDocName, id: string) => `${doc}:${id}`;

  const unknownZones = new Set<string>();
  const readAt = new Map<string, number>();
  async function draft(doc: ConfigDocName, id: string, fresh = false): Promise<Draft | null> {
    // A zone the server does not have is not asked again in this session; a fresh read is reused for 10 s.
    if (unknownZones.has(id)) return null;
    const recent = Date.now() - (readAt.get(key(doc, id)) ?? 0) < 10_000;
    if ((!fresh || recent) && drafts.has(key(doc, id))) return drafts.get(key(doc, id)) ?? null;
    let found: Draft | null = null;
    try {
      found = await readDraft(http, doc, id);
    } catch (error) {
      // A zone the server does not have (zone_not_found) keeps the demo's values.
      if (!notFound(error) && (error as { status?: number } | null)?.status !== 400) throw error;
      if (notFound(error)) unknownZones.add(id);
    }
    drafts.set(key(doc, id), found);
    readAt.set(key(doc, id), Date.now());
    if (found && doc !== "country_rules") standardMarks.set(doc, id, found.usesStandard === true);
    return found;
  }

  let historyIndex: HistoryIndex = new Map();
  let surgeVersions: Record<string, number> = {};

  async function readPricing(fallback: unknown): Promise<PricingStore> {
    const store = normalizeStore(fallback);
    const zones = { ...store.zones };
    await Promise.all(settingsScopes().map(async (id) => {
      const found = await draft("pricing", id, true);
      if (found) zones[id] = bookOfPricing(found.document, zoneBook(store, id));
    }));
    // v0.7.1: the car type catalog, the running manual surges and the pricing history come from the server too.
    const known = settingsScopes().filter((id) => !unknownZones.has(id) && drafts.get(key("pricing", id)));
    const extras = await readPricingExtras(http, normalizeStore({ ...store, zones }), known);
    historyIndex = extras.index;
    surgeVersions = extras.surgeVersions;
    const next = extras.store;
    slices.set(PRICING_KEY, next);
    return next;
  }

  const pricingSlice = () => normalizeStore(slices.get(PRICING_KEY) ?? null);

  /** Manage categories: the catalog changes the page asks for, sent to the server's one catalog. */
  async function saveCatalog(value: PricingStore, done: string): Promise<string> {
    await sendCatalog(http, catalogChanges(pricingSlice().categories, value.categories));
    await readPricing(value);
    return done;
  }

  /** Manual surge Start / Stop per zone (PUT …/surge, POST …/surge/end); the slider's value is the maximum. */
  async function sendSurges(value: PricingStore): Promise<string> {
    for (const change of surgeChanges(pricingSlice(), value)) {
      const path = `/admin/zones/${encodeURIComponent(change.zoneId)}/surge`;
      const version = surgeVersions[change.zoneId] ?? 0;
      if (change.manual) {
        const started = await http.put<{ version: number }>(path, scheduleOf(change.manual, version));
        surgeVersions[change.zoneId] = started.version;
      } else if (version > 0) {
        await http.post(`${path}/end`, { expectedVersion: version });
        surgeVersions[change.zoneId] = 0;
      }
    }
    slices.set(PRICING_KEY, value);
    return "Saved.";
  }

  /** Restore a history row, or Undo last publish: the server publishes that version again. */
  async function restore(rev: number | null): Promise<string> {
    const row = rev === null ? null : historyIndex.get(rev);
    if (!row) throw new Error("That revision is not on the server.");
    await http.post("/admin/config/pricing/restore", { zoneId: row.zoneId, version: row.version, expectedVersion: row.liveVersion });
    drafts.delete(key("pricing", row.zoneId));
    await readPricing(pricingSlice());
    return "Restored.";
  }

  async function undoLast(): Promise<string> {
    const store = pricingSlice();
    const latest = store.history[0];
    const row = latest ? historyIndex.get(latest.rev) : undefined;
    if (!row) throw new Error("Nothing to undo yet.");
    const before = [...historyIndex.entries()].filter(([, item]) => item.zoneId === row.zoneId && item.version < row.version).sort((a, b) => b[1].version - a[1].version)[0];
    if (!before) throw new Error("Nothing to undo yet.");
    return restore(before[0]);
  }

  async function readDispatch(fallback: unknown): Promise<DispatchBook> {
    const book = normalizeDispatchBook(fallback);
    const live = { ...book.live };
    await Promise.all(settingsScopes().map(async (id) => {
      // One read first tells whether the server knows the zone at all.
      const rules = await draft("dispatch", id, true);
      const driver = unknownZones.has(id) ? null : await draft("driver_app_config", id, true);
      if (rules || driver) live[id] = rulesOfDispatch(rules?.document ?? null, driver?.document ?? null, liveRules(book, id));
    }));
    const next = { ...book, live };
    slices.set(DISPATCH_KEY, next);
    return next;
  }

  async function readCountries(fallback: unknown): Promise<CountrySettingsBook> {
    const book = fallback as CountrySettingsBook;
    const countries = { ...book.countries };
    await Promise.all(MARKETS.map(async (market) => {
      const found = await draft("country_rules", standardKey(market.id), true);
      if (!found) return;
      const doc = found.document as { tips?: Array<{ amount: { amountMinor: number }; enabled: boolean }>; raiseSteps?: Array<{ amount: { amountMinor: number }; enabled: boolean }>; driverBonus?: { defaultLimit?: { amountMinor: number } } };
      const own = countrySettingsOf(book, market.id);
      const options = (list: typeof doc.tips, prefix: string) => (list ?? []).map((item, index) => ({ id: `${prefix}${index + 1}`, amount: item.amount.amountMinor / market.minorUnits, enabled: item.enabled }));
      countries[market.id] = {
        ...own,
        ...(doc.tips ? { tips: options(doc.tips, "t") } : {}),
        ...(doc.raiseSteps ? { raiseSteps: options(doc.raiseSteps, "r") } : {}),
        ...(doc.driverBonus?.defaultLimit ? { driverBonusLimit: doc.driverBonus.defaultLimit.amountMinor / market.minorUnits } : {}),
      };
    }));
    const next = { ...book, countries };
    slices.set(COUNTRY_SETTINGS_KEY, next);
    return next;
  }

  /** The rider and driver documents a page owns parts of, built by the admin's exporters, over the server's. */
  async function publishAppParts(id: string, owned: { rider: string[]; driver: string[] }, state: ReturnType<typeof appConfigState>): Promise<void> {
    for (const [doc, keys, build] of [["rider_app_config", owned.rider, riderAppConfig], ["driver_app_config", owned.driver, driverAppConfig]] as const) {
      if (!keys.length) continue;
      const current = await draft(doc, id, true);
      if (!current) continue; // Nothing on the server for this scope yet: the admin publishes the first document in Settings.
      const built = build(id, state) as unknown as Doc;
      await savePublish(http, doc, id, current, withOwned(current.document, built, keys));
    }
  }

  const stateWith = (patch: Record<string, unknown>) => appConfigState({ pricing: slices.get(PRICING_KEY), dispatch: slices.get(DISPATCH_KEY), countrySettings: slices.get(COUNTRY_SETTINGS_KEY), ...patch, now: now() });

  async function publishPricing(store: PricingStore): Promise<string> {
    const zoneIds = store.history[0]?.rev === store.draftRev ? store.history[0].zoneIds : [];
    for (const id of zoneIds) {
      const current = await draft("pricing", id, true);
      await savePublish(http, "pricing", id, current, pricingDocumentOf(zoneBook(store, id), id, current?.document ?? null));
    }
    slices.set(PRICING_KEY, store);
    return "Published.";
  }

  async function publishDispatch(book: DispatchBook): Promise<string> {
    const version = book.versions[0];
    const zoneIds = version && version.rev === book.draftRev ? version.zoneIds : [];
    slices.set(DISPATCH_KEY, book);
    const state = stateWith({ dispatch: book });
    for (const id of zoneIds) {
      const current = await draft("dispatch", id, true);
      await savePublish(http, "dispatch", id, current, dispatchDocumentOf(liveRules(book, id), id, current?.document ?? null));
      await publishAppParts(id, OWNED.dispatch, state);
    }
    return "Published.";
  }

  /**
   * Owner 2026-10-27: only the zones chosen at the top get the change (the Standard when chosen). A chosen
   * zone that uses the Standard gets settings of its own; no other zone is touched.
   */
  async function publishSettings(value: unknown, targets: readonly string[]): Promise<string> {
    if (!targets.length) throw new Error("Choose the zones at the top first.");
    const state = stateWith({ config: value });
    for (const id of targets) await publishAppParts(id, OWNED.settings, state);
    return "Published.";
  }

  async function saveCountries(book: CountrySettingsBook): Promise<string> {
    const before = slices.get(COUNTRY_SETTINGS_KEY) as CountrySettingsBook | undefined;
    for (const market of MARKETS) {
      const next = countrySettingsOf(book, market.id as MarketId);
      if (before && JSON.stringify(countrySettingsOf(before, market.id as MarketId)) === JSON.stringify(next)) continue;
      const id = standardKey(market.id);
      const current = await draft("country_rules", id, true);
      const facts = zoneFacts(id);
      const hardMax = driverBonusHardMax(market.id as MarketId);
      const doc = countryRulesOf(market.id, facts.currency, { tips: next.tips.filter((t) => t.enabled).map((t) => t.amount), raiseSteps: next.raiseSteps.filter((r) => r.enabled).map((r) => r.amount), driverBonus: { defaultLimit: next.driverBonusLimit, hardMax } }, current?.document ?? null);
      await savePublish(http, "country_rules", id, current, doc);
    }
    slices.set(COUNTRY_SETTINGS_KEY, book);
    return "Saved for every zone of the country.";
  }

  async function backToStandard(zoneId: string, docs: readonly Exclude<ConfigDocName, "country_rules">[]): Promise<string> {
    for (const doc of docs) {
      const current = await draft(doc, zoneId, true);
      if (!current || current.usesStandard) continue;
      await goBackToStandard(http, doc, zoneId, current);
      standardMarks.set(doc, zoneId, true);
    }
    return "The zone uses the Standard again. Its own settings are kept in History.";
  }

  return {
    readSlice(sliceKey, fallback) {
      if (sliceKey === PRICING_KEY) return readPricing(fallback);
      if (sliceKey === DISPATCH_KEY) return readDispatch(fallback);
      if (sliceKey === COUNTRY_SETTINGS_KEY) return readCountries(fallback);
      // Settings' draft lives in this session until it is published (the server keeps the published documents).
      if (sliceKey === CONFIG_KEY) return Promise.resolve(slices.get(CONFIG_KEY) ?? fallback);
      return null;
    },
    command(action, input) {
      if (action === "admin.pricing.publish") return publishPricing(normalizeStore(input.value));
      // v0.7.1: Manage categories, manual surge, History (v0.7.2: no Tell drivers, contract.json#surgeNoticeRemoved).
      if (action === "admin.pricing.createCategory") return saveCatalog(normalizeStore(input.value), "Added.");
      if (action === "admin.pricing.editCategory") return saveCatalog(normalizeStore(input.value), "Saved.");
      if (action === "admin.pricing.archiveCategory") return saveCatalog(normalizeStore(input.value), "Deleted. It can be restored for 30 days.");
      if (action === "admin.pricing.restoreCategory") return saveCatalog(normalizeStore(input.value), "Restored, switched off in every zone.");
      if (action === "admin.pricing.startSurge" || action === "admin.pricing.stopSurge" || action === "admin.pricing.stopAllSurges") return sendSurges(normalizeStore(input.value));
      if (action === "admin.pricing.restore") return restore(Number(/(\d+)$/.exec(input.targetId)?.[1] ?? NaN));
      if (action === "admin.pricing.undo") return undoLast();
      if (action === "admin.dispatch.publish") return publishDispatch(normalizeDispatchBook(input.value));
      if (action === "admin.config.save") {
        slices.set(CONFIG_KEY, input.value);
        return Promise.resolve("Draft saved in this session. Publish sends it to the chosen zones.");
      }
      if (action === "admin.config.publish") {
        slices.set(CONFIG_KEY, input.value);
        return publishSettings(input.value, (input.scope ?? "").split(",").filter((id) => settingsScopes().includes(id)));
      }
      if (action === "admin.pricing.saveCountry") return saveCountries(input.value as CountrySettingsBook);
      if (action === "admin.config.useStandard") return backToStandard(input.targetId, ((input.value as { docs?: string[] } | undefined)?.docs ?? ["pricing"]) as Exclude<ConfigDocName, "country_rules">[]);
      return null;
    },
  };
}

export { SettingsChanged };
