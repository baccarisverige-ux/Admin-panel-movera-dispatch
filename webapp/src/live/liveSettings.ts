/**
 * The demo's Pricing, Dispatch, Settings and Tips & limits against the Movera server (contract v0.8.0 settings flow).
 * Reading a slice loads the server's drafts of every zone and of each country's Standard into the demo store;
 * publishing a page saves and publishes the server documents it owns at once (no second admin, owner 2026-10-27).
 */
import { MARKETS, marketOfZone, standardZoneId, zoneById, type MarketId } from "../markets/markets.ts";
import { normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY, type PricingStore } from "../pricing/zonePricing.ts";
import { catalogChanges, readPricingExtras, scheduleOf, sendCatalog, surgeChanges, type HistoryIndex } from "./livePricingOps.ts";
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
  savePublishLive,
  liveDocumentOf,
  unpublishedKeys,
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
import { ONBOARDING_SETTINGS_KEY, OPEN, normalizeSettingsBook, wireDocument, type SettingsBook, type SettingsDoc } from "../drivers/onboardingSettings.ts";
import { registerCountryTypes } from "./format.ts";
import { tr } from "../i18n/core.ts";
import { ApiError } from "../api/httpClient.ts";
import { readDispatchTools, sendToolCalls, toolCalls, toolRefusal, toolsOf, type DispatchTools } from "./dispatchTools.ts";

/** Every zone of the admin's markets and each country's Standard. */
export function settingsScopes(): string[] {
  return MARKETS.flatMap((market) => [standardZoneId(market.id), ...market.zones.map((zone) => zone.id)]);
}

/**
 * The scopes the live panel reads: the open countries only. A closed country (TN, OPEN false) has nothing on the
 * server, so asking for it only gave 404s on every page load (owner G2c, 2026-10-30).
 */
export function readScopes(): string[] {
  return MARKETS.filter((market) => OPEN[market.id]).flatMap((market) => [standardZoneId(market.id), ...market.zones.map((zone) => zone.id)]);
}

type Listener = () => void;

/** G3-D8: the zones "Copy to all zones" changes: every open zone of the source's country except the source. */
export function copyTargets(sourceId: string): string[] {
  const country = countryOfStandard(sourceId) ?? marketOfZone(sourceId)?.id;
  return readScopes().filter((id) => id !== sourceId && !countryOfStandard(id) && marketOfZone(id)?.id === country);
}

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

/**
 * G3: the parts of a zone's rider/driver app document that are saved on the server but not live (keys only).
 * [] = nothing waiting; undefined = not known (a Standard, the demo, or not read yet).
 */
export const unpublishedMarks = (() => {
  const marks = new Map<string, string[]>();
  const listeners = new Set<Listener>();
  return {
    set(doc: ConfigDocName, zoneId: string, keys: string[] | undefined) {
      if (keys === undefined) marks.delete(`${doc}:${zoneId}`);
      else marks.set(`${doc}:${zoneId}`, keys);
      listeners.forEach((listener) => listener());
    },
    get(doc: ConfigDocName, zoneId: string): string[] | undefined {
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

  let historyIndex: HistoryIndex = new Map();
  let surgeVersions: Record<string, number> = {};

  async function readPricing(fallback: unknown): Promise<PricingStore> {
    const store = normalizeStore(fallback);
    const zones = { ...store.zones };
    await Promise.all(readScopes().map(async (id) => {
      const found = await draft("pricing", id, true);
      if (found) zones[id] = bookOfPricing(found.document, zoneBook(store, id));
    }));
    // v0.7.1: the car type catalog, the running manual surges and the pricing history come from the server too.
    const known = readScopes().filter((id) => !unknownZones.has(id) && drafts.get(key("pricing", id)));
    const extras = await readPricingExtras(http, normalizeStore({ ...store, zones }), known);
    historyIndex = extras.index;
    surgeVersions = extras.surgeVersions;
    const next = extras.store;
    slices.set(PRICING_KEY, next);
    return next;
  }

  /** History rows of the Dispatch page (rev) → the zone, its server version and the version before it there. */
  const dispatchVersions = new Map<number, { zoneId: string; version: number; previous: number | null; liveVersion: number }>();

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
    const drivers = new Map<string, Doc | null>();
    await Promise.all(readScopes().map(async (id) => {
      // One read first tells whether the server knows the zone at all.
      const rules = await draft("dispatch", id, true);
      const driver = unknownZones.has(id) ? null : await draft("driver_app_config", id, true);
      drivers.set(id, driver?.document ?? null);
      // G3: what of the zone's app documents is saved but not live (shown above the editor).
      if (driver && !countryOfStandard(id)) await markUnpublished("driver_app_config", id, driver).catch(() => undefined);
      if (rules || driver) live[id] = rulesOfDispatch(rules?.document ?? null, driver?.document ?? null, liveRules(book, id));
    }));
    // Owner 2026-10-28: History shows the server's published versions, so "Ångra" can put the one before back.
    const rows: Array<HistoryEntry & { zoneId: string }> = [];
    await Promise.all(Object.keys(live).filter((id) => !countryOfStandard(id) && readScopes().includes(id)).map(async (id) => {
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
    // v0.18.6 (owner G4-F2..F4, F6): saved presets, driver groups, radar zones and their rules, and events are the
    // server's (contract.json#dispatchTools), never the demo's samples. Dispatch changes never wait for a second admin
    // (G4-F1) and cancel checks are built with group 5 (G4-F5), so neither has anything on live.
    const tools = await readTools();
    const next = { ...book, live, ...tools, approvals: [], cancelChecks: {}, ...(versions.length ? { versions } : {}) };
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
    await Promise.all(MARKETS.filter((market) => OPEN[market.id]).map(async (market) => {
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
    await Promise.all(readScopes().map(async (id) => {
      const market = marketOfZone(id);
      if (!market) return;
      // A zone the server cannot answer for keeps its country's values (the tab still opens).
      const found = await draft("country_rules", id, true).catch(() => null);
      if (found) zones[id] = settingsOfRules(countrySettingsOf(book, market.id), market, found.document);
    }));
    return zones;
  }

  /** G3: compares a zone's app draft with its live document and remembers what is not published (keys only). */
  async function markUnpublished(doc: ConfigDocName, id: string, current: Draft | null): Promise<Doc | null | undefined> {
    const live = await liveDocumentOf(http, doc, id);
    unpublishedMarks.set(doc, id, current && live && !current.usesStandard ? unpublishedKeys(current.document, live) : live === null && current && !current.usesStandard ? Object.keys(current.document).filter((k) => k !== "version" && k !== "publishedAt") : undefined);
    return live;
  }

  /**
   * The rider and driver documents a page owns parts of, built by the admin's exporters, over the server's.
   * G3 (owner: every admin setting must work on live): compared with what is LIVE, not with the draft, so a draft
   * that already holds the change is published too; a scope with nothing on the server gets the admin's full
   * document (it was skipped before, so the change never reached the apps). `source` builds the parts from another
   * scope (a zone that follows its country's Standard rules gets the Standard's parts).
   */
  async function publishAppParts(id: string, owned: { rider: string[]; driver: string[] }, state: ReturnType<typeof appConfigState>, source = id): Promise<void> {
    for (const [doc, keys, build] of [["rider_app_config", owned.rider, riderAppConfig], ["driver_app_config", owned.driver, driverAppConfig]] as const) {
      if (!keys.length) continue;
      const current = await draft(doc, id, true);
      const built = build(source, state) as unknown as Doc;
      const document = current ? withOwned(current.document, built, keys) : { ...built, ...("zoneId" in built && !countryOfStandard(id) ? { zoneId: id } : {}) };
      const live = current ? await liveDocumentOf(http, doc, id) : null;
      await savePublishLive(http, doc, id, current, document, live);
      drafts.delete(key(doc, id));
      unpublishedMarks.set(doc, id, countryOfStandard(id) ? undefined : []);
      if (current?.usesStandard) standardMarks.set(doc, id, false);
    }
  }

  /**
   * G3: a zone with its own app document never sees its country's Standard (the server serves the zone's row). When
   * the Standard's Dispatch rules are published, the zones whose Dispatch rules follow the Standard but whose app
   * documents are their own get the Standard's parts too, so their drivers really get the change.
   */
  async function followers(standardId: string, rulesDoc: ConfigDocName): Promise<string[]> {
    const country = countryOfStandard(standardId);
    if (!country) return [];
    const zones = readScopes().filter((id) => marketOfZone(id)?.id === country && !countryOfStandard(id) && !unknownZones.has(id));
    const out: string[] = [];
    for (const id of zones) {
      const rules = await draft(rulesDoc, id).catch(() => null);
      if (rules?.usesStandard !== true) continue;
      const app = await draft("driver_app_config", id).catch(() => null);
      if (app && app.usesStandard !== true) out.push(id);
    }
    return out;
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

  const toolsHttp = { json: http.json, post: http.post, put: http.put, del: (path: string) => (http.del ? http.del(path) : Promise.reject(new Error("DELETE is not available."))) };

  /** The server's dispatch tools; what the last read saw is what the next save is compared with. */
  let lastTools: DispatchTools = { presets: [], groups: [], radarZones: [], radarZoneRules: [], events: [] };
  async function readTools(): Promise<DispatchTools> {
    lastTools = await readDispatchTools(toolsHttp);
    return lastTools;
  }

  /**
   * v0.18.6 (G4-F2..F4, F6): a save from Presets, Driver groups, Radar zones, Radar zone rules or Events. The page
   * hands the whole book; each item that differs from what the server had becomes one POST / PUT / DELETE with its
   * version. Afterwards the server's items are read again (new ids and versions).
   */
  async function saveTools(book: DispatchBook, done: string): Promise<string> {
    const calls = toolCalls(lastTools, toolsOf(book));
    try {
      await sendToolCalls(toolsHttp, calls);
    } catch (error) {
      const text = toolRefusal(error);
      await readTools().catch(() => undefined);
      if (text && error instanceof ApiError) throw new ApiError(error.status, text, { code: error.code, reason: error.reason ?? undefined, retryable: false });
      throw error;
    }
    const fresh = await readTools();
    slices.set(DISPATCH_KEY, { ...normalizeDispatchBook(book), ...fresh });
    return calls.length ? done : "Nothing changed.";
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
      for (const zone of await followers(id, "dispatch")) await publishAppParts(zone, OWNED.dispatch, state, id);
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
    // G3: say which zones of a chosen Standard keep their own app settings (their drivers do not get this change).
    const own: string[] = [];
    for (const standard of targets.filter((id) => countryOfStandard(id))) {
      for (const id of readScopes().filter((zone) => marketOfZone(zone)?.id === countryOfStandard(standard) && !countryOfStandard(zone) && !targets.includes(zone) && !unknownZones.has(zone))) {
        const app = await draft("driver_app_config", id).catch(() => null);
        if (app && app.usesStandard !== true) own.push(zoneById(id)?.name ?? id);
      }
    }
    if (own.length) return tr("Published. These zones have their own driver app settings and did not get it: {0}. Choose them at the top and publish again, or set them back to the Standard.", [own.join(", ")]);
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

  /**
   * Contract v0.17.0 §25: the onboarding settings of each country (GET /admin/config/onboarding?country). A country
   * with nothing published answers the contract defaults (liveVersion 0); one the server cannot answer keeps them.
   */
  async function readOnboarding(fallback: unknown): Promise<SettingsBook> {
    const book = normalizeSettingsBook(fallback);
    const countries = { ...book.countries };
    // A closed country (TN) has nothing published and asks for no documents: it keeps its defaults, no call (owner G2 R10).
    await Promise.all(MARKETS.filter((market) => OPEN[market.id]).map(async (market) => {
      // Read directly: a country whose zone documents are missing still has onboarding settings (defaults at least).
      const found = await readDraft(http, "onboarding", standardKey(market.id)).catch(() => null);
      if (!found) return;
      const document = found.document as unknown as SettingsDoc;
      countries[market.id] = { draftVersion: found.version, liveVersion: found.liveVersion, document };
      registerCountryTypes(market.id, document);
    }));
    const next = normalizeSettingsBook({ ...book, countries });
    slices.set(ONBOARDING_SETTINGS_KEY, next);
    return next;
  }

  /** Publish one country's onboarding settings: PUT the draft (the server gives new types their id), then publish it. */
  async function publishOnboarding(value: unknown, country: string): Promise<string> {
    const market = MARKETS.find((item) => item.id === country);
    if (!market) throw new Error("Choose a country first.");
    // The page's own document as it is: a new type keeps its draftKey so the server makes its id.
    const staged = (value as SettingsBook | null)?.countries?.[market.id]?.document;
    if (!staged) throw new Error("Nothing to publish.");
    const id = standardKey(market.id);
    const current = await readDraft(http, "onboarding", id);
    await savePublish(http, "onboarding", id, current, { ...wireDocument(staged), version: current?.document?.["version"] ?? staged.version, country: market.id } as unknown as Doc);
    await readOnboarding(value);
    return "Published.";
  }

  /** G3: publishes what the server already holds as the zone's driver app draft (owner decides; nothing else changes). */
  async function publishAppDraft(zoneId: string): Promise<string> {
    if (countryOfStandard(zoneId) || !settingsScopes().includes(zoneId)) throw new Error("Choose a zone first.");
    const current = await readDraft(http, "driver_app_config", zoneId);
    if (!current || current.usesStandard) throw new Error("Nothing to publish.");
    try {
      await http.post("/admin/config/driver_app_config/publish", { expectedVersion: current.version, zoneId });
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 409) throw new SettingsChanged();
      throw error;
    }
    drafts.delete(key("driver_app_config", zoneId));
    unpublishedMarks.set("driver_app_config", zoneId, []);
    return "Published. The drivers get it now.";
  }

  /**
   * G3-D8 (owner: "Keep each zone own setting and add copy all zone botton"): the driver app settings of the zone or
   * Standard being viewed are copied to every other zone of its country and published to their drivers. Each zone
   * keeps a document of its own (never set back to the Standard); the waiting money stays each zone's (pricing).
   */
  async function copyAppToZones(sourceId: string): Promise<string> {
    const country = countryOfStandard(sourceId) ?? marketOfZone(sourceId)?.id;
    if (!country) throw new Error("Choose a zone first.");
    const source = await readDraft(http, "driver_app_config", sourceId);
    if (!source) throw new Error("Nothing to copy.");
    const keys = [...new Set([...OWNED.dispatch.driver, ...OWNED.settings.driver, ...OWNED.content.driver])];
    const zones = copyTargets(sourceId).filter((id) => !unknownZones.has(id));
    for (const id of zones) {
      const current = await draft("driver_app_config", id, true);
      const document = current ? withOwned(current.document, source.document, keys) : { ...source.document, zoneId: id };
      await savePublishLive(http, "driver_app_config", id, current ? { ...current, usesStandard: false } : null, document, current ? await liveDocumentOf(http, "driver_app_config", id) : null);
      drafts.delete(key("driver_app_config", id));
      unpublishedMarks.set("driver_app_config", id, []);
      standardMarks.set("driver_app_config", id, false);
    }
    return "Copied to every zone and published to their drivers.";
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
      if (sliceKey === ONBOARDING_SETTINGS_KEY) return readOnboarding(fallback);
      // Settings' draft lives in this session until it is published (the server keeps the published documents).
      if (sliceKey === CONFIG_KEY) {
        // G3-D9: which zones have driver app settings of their own, for the "Are you sure?" of a Standard publish.
        void Promise.all(readScopes().filter((id) => !countryOfStandard(id)).map((id) => draft("driver_app_config", id).catch(() => null)));
        return Promise.resolve(slices.get(CONFIG_KEY) ?? fallback);
      }
      return null;
    },
    command(action, input) {
      if (action === "admin.onboarding.publishSettings") return publishOnboarding(input.value, input.targetId);
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
      if (action === "admin.dispatch.saveDraft") return saveDispatchDraft(normalizeDispatchBook(input.value), input.scope);
      if (action === "admin.dispatch.undo") return undoDispatch(input.targetId);
      // v0.18.6 (G4-F2..F4, F6): the dispatch tools are the server's.
      if (action === "admin.dispatch.preset") return saveTools(normalizeDispatchBook(input.value), "Preset saved.");
      if (action === "admin.dispatch.group") return saveTools(normalizeDispatchBook(input.value), "Group saved.");
      if (action === "admin.dispatch.radarZone") return saveTools(normalizeDispatchBook(input.value), "Radar zone saved.");
      if (action === "admin.dispatch.radarRule") return saveTools(normalizeDispatchBook(input.value), "Rule saved.");
      if (action === "admin.dispatch.event") return saveTools(normalizeDispatchBook(input.value), "Event saved.");
      if (action === "admin.config.save") {
        slices.set(CONFIG_KEY, input.value);
        return Promise.resolve("Draft saved in this session. Publish sends it to the chosen zones.");
      }
      if (action === "admin.config.publish") {
        slices.set(CONFIG_KEY, input.value);
        return publishSettings(input.value, (input.scope ?? "").split(",").filter((id) => settingsScopes().includes(id)));
      }
      if (action === "admin.pricing.saveCountry") return saveCountries(input.value as CountrySettingsBook, (input.scope ?? "").split(",").filter((id) => settingsScopes().includes(id)));
      if (action === "admin.config.copyAppToZones") return copyAppToZones(input.targetId);
      if (action === "admin.config.publishAppDraft") return publishAppDraft(input.targetId);
      if (action === "admin.config.useStandard") return backToStandard(input.targetId, ((input.value as { docs?: string[] } | undefined)?.docs ?? ["pricing"]) as ConfigDocName[]);
      return null;
    },
  };
}

export { SettingsChanged };
