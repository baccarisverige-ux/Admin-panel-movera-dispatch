/**
 * The demo's Pricing, Dispatch, Settings and Tips & limits against the Movera server (contract v0.8.0 settings flow).
 * Reading a slice loads the server's drafts of every zone and of each country's Standard into the demo store;
 * publishing a page saves and publishes the server documents it owns at once (no second admin, owner 2026-10-27).
 */
import { MARKETS, marketOfZone, standardZoneId, zoneById, type MarketId } from "../markets/markets.ts";
import { normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY, type PricingStore } from "../pricing/zonePricing.ts";
import { DISPATCH_KEY, draftRules, normalizeDispatchBook, liveRules, type DispatchBook } from "../dispatch/rules.ts";
import { COUNTRY_SETTINGS_KEY, ZONE_RULES_KEY, countrySettingsOf, driverBonusHardMax, zoneSettingsOf, type CountrySettings, type CountrySettingsBook } from "../config/countrySettings.ts";
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
  restoreVersion,
  saveDraftOnly,
  savePublish,
  type HistoryEntry,
  countryOfStandard,
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
    if (found) standardMarks.set(doc, id, found.usesStandard === true);
    return found;
  }

  async function readPricing(fallback: unknown): Promise<PricingStore> {
    const store = normalizeStore(fallback);
    const zones = { ...store.zones };
    await Promise.all(settingsScopes().map(async (id) => {
      const found = await draft("pricing", id, true);
      if (found) zones[id] = bookOfPricing(found.document, zoneBook(store, id));
    }));
    const next = { ...store, zones };
    slices.set(PRICING_KEY, next);
    return next;
  }

  /** History rows of the Dispatch page (rev) → the zone, its server version and the version before it there. */
  const dispatchVersions = new Map<number, { zoneId: string; version: number; previous: number | null; liveVersion: number }>();

  async function readDispatch(fallback: unknown): Promise<DispatchBook> {
    const book = normalizeDispatchBook(fallback);
    const live = { ...book.live };
    const drivers = new Map<string, Doc | null>();
    await Promise.all(settingsScopes().map(async (id) => {
      // One read first tells whether the server knows the zone at all.
      const rules = await draft("dispatch", id, true);
      const driver = unknownZones.has(id) ? null : await draft("driver_app_config", id, true);
      drivers.set(id, driver?.document ?? null);
      if (rules || driver) live[id] = rulesOfDispatch(rules?.document ?? null, driver?.document ?? null, liveRules(book, id));
    }));
    // Owner 2026-10-28: History shows the server's published versions, so "Ångra" can put the one before back.
    const rows: Array<HistoryEntry & { zoneId: string }> = [];
    await Promise.all(Object.keys(live).filter((id) => !countryOfStandard(id)).map(async (id) => {
      const page = await http.json<{ items?: HistoryEntry[] }>(`/admin/config/dispatch/history?zoneId=${encodeURIComponent(id)}&limit=10`).catch(() => null);
      for (const item of page?.items ?? []) rows.push({ ...item, zoneId: id });
    }));
    rows.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.version - a.version);
    dispatchVersions.clear();
    const versions: DispatchBook["versions"] = rows.map((row, i) => {
      const rev = rows.length - i;
      const older = rows.filter((other) => other.zoneId === row.zoneId && other.version < row.version).sort((a, b) => b.version - a.version)[0];
      const liveVersion = Math.max(...rows.filter((other) => other.zoneId === row.zoneId).map((other) => other.version));
      dispatchVersions.set(rev, { zoneId: row.zoneId, version: row.version, previous: older?.version ?? null, liveVersion });
      const name = zoneById(row.zoneId)?.name ?? row.zoneId;
      return {
        rev,
        at: row.publishedAt,
        actorId: row.publishedBy ?? "",
        note: row.action === "restore" ? `Undo: version ${row.restoredFrom ?? "?"} again` : row.note ?? "",
        zoneIds: [row.zoneId],
        lines: [`${name} · version ${row.version}`],
        live: { ...live, [row.zoneId]: rulesOfDispatch(row.document, drivers.get(row.zoneId) ?? null, liveRules(book, row.zoneId)) },
        liveCountries: book.liveCountries,
      };
    });
    const next = { ...book, live, ...(versions.length ? { versions } : {}) };
    slices.set(DISPATCH_KEY, next);
    return next;
  }

  /** A country_rules document as the panel's Tips & limits, over the country's other settings. */
  function settingsOfRules(base: CountrySettings, market: (typeof MARKETS)[number], document: unknown): CountrySettings {
    const doc = document as { tips?: Array<{ amount: { amountMinor: number }; enabled: boolean }>; raiseSteps?: Array<{ amount: { amountMinor: number }; enabled: boolean }>; driverBonus?: { defaultLimit?: { amountMinor: number } } };
    const options = (list: typeof doc.tips, prefix: string) => (list ?? []).map((item, index) => ({ id: `${prefix}${index + 1}`, amount: item.amount.amountMinor / market.minorUnits, enabled: item.enabled }));
    return {
      ...base,
      ...(doc.tips ? { tips: options(doc.tips, "t") } : {}),
      ...(doc.raiseSteps ? { raiseSteps: options(doc.raiseSteps, "r") } : {}),
      ...(doc.driverBonus?.defaultLimit ? { driverBonusLimit: doc.driverBonus.defaultLimit.amountMinor / market.minorUnits } : {}),
    };
  }

  async function readCountries(fallback: unknown): Promise<CountrySettingsBook> {
    const book = fallback as CountrySettingsBook;
    const countries = { ...book.countries };
    await Promise.all(MARKETS.map(async (market) => {
      const found = await draft("country_rules", standardKey(market.id), true);
      if (found) countries[market.id] = settingsOfRules(countrySettingsOf(book, market.id), market, found.document);
    }));
    const next = { ...book, countries };
    slices.set(COUNTRY_SETTINGS_KEY, next);
    return next;
  }

  /**
   * v0.8.1 (owner 2026-10-28): Tips & limits of every zone and Standard as the server has them ("Uses standard"
   * marked). Read only when the Tips & limits tab opens, so the rest of the panel does not wait for it.
   */
  async function readZoneRules(): Promise<Record<string, CountrySettings>> {
    const book = (slices.get(COUNTRY_SETTINGS_KEY) as CountrySettingsBook | undefined) ?? { draftRev: 0, countries: {} as CountrySettingsBook["countries"] };
    const zones: Record<string, CountrySettings> = {};
    await Promise.all(settingsScopes().map(async (id) => {
      const market = marketOfZone(id);
      if (!market) return;
      // A zone the server cannot answer for keeps its country's values (the tab still opens).
      const found = await draft("country_rules", id, true).catch(() => null);
      if (found) zones[id] = settingsOfRules(countrySettingsOf(book, market.id), market, found.document);
    }));
    return zones;
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

  /** Owner 2026-10-28: "Spara utkast" keeps the changed zones' rules on the server as a draft, not live. */
  async function saveDispatchDraft(book: DispatchBook, scope: string | undefined): Promise<string> {
    const chosen = (scope ?? "").split(",").filter((id) => settingsScopes().includes(id));
    const zoneIds = Object.keys(book.draft).filter((id) => settingsScopes().includes(id) && (!chosen.length || chosen.includes(id)));
    if (!zoneIds.length) throw new Error("Nothing to save. Change a rule first.");
    for (const id of zoneIds) {
      const current = await draft("dispatch", id, true);
      await saveDraftOnly(http, "dispatch", id, current, dispatchDocumentOf(draftRules(book, id), id, current?.document ?? null));
      drafts.delete(key("dispatch", id));
    }
    slices.set(DISPATCH_KEY, book);
    return "Draft saved on the server. It is not live until you publish.";
  }

  /** Owner 2026-10-28: "Ångra" puts back the zone's version before the chosen one (a new version, in the Audit). */
  async function undoDispatch(targetId: string): Promise<string> {
    const rev = Number(/(\d+)$/.exec(targetId)?.[1]);
    const row = dispatchVersions.get(rev);
    if (!row) throw new Error("That version was not found. Open History again.");
    if (row.previous === null) throw new Error("There is no earlier version of this zone to go back to.");
    await restoreVersion(http, "dispatch", row.zoneId, row.previous, row.liveVersion);
    drafts.delete(key("dispatch", row.zoneId));
    return "Undone. The version before is live again.";
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

  /**
   * v0.8.1 (owner 2026-10-28): Tips & limits go only to the zones chosen at the top (the Standard when chosen); a
   * chosen zone that used the Standard gets its own. "All zones" at the top is every zone of the country.
   */
  async function saveCountries(book: CountrySettingsBook, targets: readonly string[]): Promise<string> {
    if (!targets.length) throw new Error("Choose the zones at the top first.");
    for (const id of targets) {
      const market = marketOfZone(id);
      if (!market) continue;
      const next = zoneSettingsOf(book, market.id as MarketId, id);
      const current = await draft("country_rules", id, true);
      const facts = zoneFacts(id);
      const hardMax = driverBonusHardMax(market.id as MarketId);
      const doc = countryRulesOf(market.id, facts.currency, { tips: next.tips.filter((t) => t.enabled).map((t) => t.amount), raiseSteps: next.raiseSteps.filter((r) => r.enabled).map((r) => r.amount), driverBonus: { defaultLimit: next.driverBonusLimit, hardMax } }, current?.document ?? null);
      await savePublish(http, "country_rules", id, current, doc);
      standardMarks.set("country_rules", id, false);
    }
    slices.set(COUNTRY_SETTINGS_KEY, book);
    return "Saved for the chosen zones.";
  }

  async function backToStandard(zoneId: string, docs: readonly ConfigDocName[]): Promise<string> {
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
      if (sliceKey === ZONE_RULES_KEY) return readZoneRules();
      // Settings' draft lives in this session until it is published (the server keeps the published documents).
      if (sliceKey === CONFIG_KEY) return Promise.resolve(slices.get(CONFIG_KEY) ?? fallback);
      return null;
    },
    command(action, input) {
      if (action === "admin.pricing.publish") return publishPricing(normalizeStore(input.value));
      if (action === "admin.dispatch.publish") return publishDispatch(normalizeDispatchBook(input.value));
      if (action === "admin.dispatch.saveDraft") return saveDispatchDraft(normalizeDispatchBook(input.value), input.scope);
      if (action === "admin.dispatch.undo") return undoDispatch(input.targetId);
      if (action === "admin.config.save") {
        slices.set(CONFIG_KEY, input.value);
        return Promise.resolve("Draft saved in this session. Publish sends it to the chosen zones.");
      }
      if (action === "admin.config.publish") {
        slices.set(CONFIG_KEY, input.value);
        return publishSettings(input.value, (input.scope ?? "").split(",").filter((id) => settingsScopes().includes(id)));
      }
      if (action === "admin.pricing.saveCountry") return saveCountries(input.value as CountrySettingsBook, (input.scope ?? "").split(",").filter((id) => settingsScopes().includes(id)));
      if (action === "admin.config.useStandard") return backToStandard(input.targetId, ((input.value as { docs?: string[] } | undefined)?.docs ?? ["pricing"]) as ConfigDocName[]);
      return null;
    },
  };
}

export { SettingsChanged };
