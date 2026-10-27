import { MARKETS, market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import { fromMajor, type CurrencyCode } from "../domain/money.ts";
import {
  BUILT_IN_CATEGORIES,
  currencyOf,
  defaultCategoryPrice,
  defaultZoneBook,
  normalizeStore,
  roundTo,
  validateZoneBook,
  zoneBook,
  zoneLive,
  type CategoryDef,
  type CategoryPrice,
  type FixedRoute,
  type ManualSurge,
  type PricingStore,
  type Revision,
  type ScheduledSurge,
  type SmartSurge,
  type ZoneBook,
  type ZoneLive,
} from "../pricing/zonePricing.ts";
import { completePickupPay, type PickupPay, type PickupRate } from "../pricing/pickupPay.ts";
import { tr } from "../i18n/core.ts";
import { countrySettingsIssues, countrySettingsOf, defaultCountrySettings, PRICING_FIELDS, type AmountOption, type CountrySettings, type CountrySettingsBook } from "../config/countrySettings.ts";

/**
 * Live Pricing: the demo Pricing store (zonePricing.ts PricingStore) built from the Movera server's documents, and
 * every change the demo screen makes turned back into contract calls (CONTRACT.md §3.4, §6.2, §6.1):
 *
 * - a zone's price set ↔ its server-only `pricing` document (GET/PUT /admin/config/pricing, POST …/publish);
 * - driver pickup pay ↔ the zone's `driver_app_config.pickupPay` (the rider pickup fee, waiting and no-show fee are
 *   in the pricing document; publishing pricing keeps the app documents in step, contract v0.6.0 publishPricing);
 * - categories ↔ `catalog.categories[]` of the zone's rider and driver documents (+ a disabled price entry);
 * - a manual surge ↔ the zone's surge schedule (PUT /admin/zones/{zoneId}/surge, POST …/surge/end);
 * - Tips & limits (one per country) ↔ the rider document's tips, raiseSteps, promoCap and the driver document's
 *   driverBonus.defaultLimit, in every zone of the country.
 *
 * Anything the contract has no place for is refused with a message naming it, before any call is made.
 * Pure functions: the screen (LivePricingPage) runs the planned calls.
 */

export type Money = { amountMinor: number; currency: string };
export type ConfigDocName = "pricing" | "rider_app_config" | "driver_app_config";
export type ConfigDraft<T = Record<string, unknown>> = { doc: string; zoneId: string; version: number; liveVersion: number; document: T; updatedAt: string; updatedBy?: string };

export type WireCategory = {
  enabled: boolean;
  base: Money;
  perKm: Money;
  perMin: Money;
  minimum: Money;
  maximum: Money | null;
  appFeePct: number;
  commissionPct: number;
  extraStopFee: Money;
  stopWaitPerMin: Money;
  babySeatFee?: Money;
  childSeatFee?: Money;
  waiting: { freeWaitMin: number; perMin: Money; noShowAfterMin: number; noShowFee: Money };
  riderPickupFee: { live: Money | null; reservation: Money | null };
  [other: string]: unknown;
};

export type PricingDocument = {
  version: number;
  publishedAt: string;
  zoneId: string;
  currency: string;
  country: string;
  timeZone?: string;
  priceStep: Money;
  categories: Record<string, WireCategory>;
  fees: { airportPickup: Money; airportDropoff: Money; reservationFee: Money; cleaningFee: Money; tollsPassThrough: boolean; [other: string]: unknown };
  stopFreeWaitMin: number;
  fixedRoutes: { id: string; from: string; to: string; categoryId: string; price: Money }[];
  surge: { maxMultiplier: number; smart: Partial<SmartSurge> & { enabled: boolean; profiles: SmartSurge["profiles"] }; scheduled: (Omit<ScheduledSurge, "name"> & { name?: string })[] };
  fleetCommissionPct: number;
  [other: string]: unknown;
};

type WireRange = { fromKm: number; toKm: number | null; perKm: Money; perMin: Money };
type WirePickupRate = { enabled: boolean; maxPerRide: Money | null; ranges: WireRange[]; riderFee: { live: Money | null; reservation: Money | null } };
type CatalogEntry = { id: string; label: string; seats: number; sort: number; line?: string };
export type AppDocument = {
  zoneId: string;
  catalog?: { categories: CatalogEntry[] };
  pickupPay?: { offers?: Record<string, boolean>; byCategory?: Record<string, WirePickupRate>; [other: string]: unknown };
  tips?: { amount: Money; enabled: boolean }[];
  raiseSteps?: { amount: Money; enabled: boolean }[];
  promoCap?: Money | null;
  driverBonus?: { defaultLimit: Money; hardMax: Money };
  [other: string]: unknown;
};

/** contract SurgeSchedule (GET /admin/zones/{zoneId}/surge). */
export type SurgeSchedule = {
  scheduleId: string;
  zoneId: string;
  categoryIds: string[];
  startAt: string;
  endAt: string;
  stepMinutes: number;
  cap: number;
  points: { atMin: number; multiplier: number }[];
  status: "scheduled" | "active" | "ended" | "cancelled";
  version: number;
  createdBy?: string;
  createdAt?: string;
};

/** What the server holds for one zone. null = the zone has none yet (404 config_not_found, 204 no surge). */
export type ZoneServer = {
  zoneId: string;
  pricing: ConfigDraft<PricingDocument> | null;
  rider: ConfigDraft<AppDocument> | null;
  driver: ConfigDraft<AppDocument> | null;
  surge: SurgeSchedule | null;
};

/** One planned call. Config steps are a PUT of the draft and a publish; `expectedVersion` null = read the draft again first. */
export type Step =
  | { kind: "config"; doc: ConfigDocName; zoneId: string; expectedVersion: number | null; patch: (document: Record<string, unknown> | null) => Record<string, unknown>; label: string }
  | { kind: "surge"; zoneId: string; body: { expectedVersion: number; categoryIds: string[]; startAt: string; endAt: string; stepMinutes: number; points: { atMin: number; multiplier: number }[]; note?: string }; label: string }
  | { kind: "surgeEnd"; zoneId: string; body: { expectedVersion: number; zoneId: string; note?: string }; label: string };

export type Plan = { steps: Step[]; refused: string[] };

const SEED = BUILT_IN_CATEGORIES.map((category) => category.id);
/** contract §3.4: the schedule's step. */
const SURGE_STEP_MIN = 5;
/** contract.json#configDefaults.pricing: the zone's surge maximum when a zone has no pricing document yet. */
const DEFAULT_MAX_MULTIPLIER = 3;

const currencyCode = (zoneId: string): CurrencyCode => market(currencyOf(zoneId)).currency;
const minorUnits = (zoneId: string) => market(currencyOf(zoneId)).minorUnits;
const major = (value: Money | null | undefined, zoneId: string) => (value ? value.amountMinor / minorUnits(zoneId) : 0);
const wire = (value: number, zoneId: string): Money => fromMajor(value, currencyCode(zoneId));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- server → store ---------- */

function categoryPriceOf(c: WireCategory, zoneId: string): CategoryPrice {
  return {
    enabled: c.enabled,
    base: major(c.base, zoneId),
    perKm: major(c.perKm, zoneId),
    perMin: major(c.perMin, zoneId),
    freeWaitMin: c.waiting.freeWaitMin,
    waitPerMin: major(c.waiting.perMin, zoneId),
    stopWaitPerMin: major(c.stopWaitPerMin, zoneId),
    noShowFee: major(c.waiting.noShowFee, zoneId),
    extraStopFee: major(c.extraStopFee, zoneId),
    // v0.6.0: seat fees exist only where the document has them (Child Seat); a missing fee is 0.
    babySeatFee: major(c.babySeatFee, zoneId),
    childSeatFee: major(c.childSeatFee, zoneId),
    minimum: major(c.minimum, zoneId),
    // contract: null = no maximum, the admin's 0.
    maximum: major(c.maximum, zoneId),
    appFeePct: c.appFeePct,
  };
}

function pickupPayOf(zone: ZoneServer, categoryIds: readonly string[]): PickupPay {
  const fallback = completePickupPay(undefined, categoryIds, factorOf(zone.zoneId));
  const driver = zone.driver?.document.pickupPay;
  const prices = zone.pricing?.document.categories ?? {};
  const rates: Record<string, PickupRate> = {};
  for (const id of categoryIds) {
    const base = fallback.rates[id]!;
    const own = driver?.byCategory?.[id];
    const fee = prices[id]?.riderPickupFee ?? own?.riderFee;
    const riderFee = (value: Money | null | undefined, kept: { on: boolean; amount: number }) => (value ? { on: true, amount: major(value, zone.zoneId) } : { on: false, amount: kept.amount });
    rates[id] = {
      enabled: own ? own.enabled : base.enabled,
      maxPerRide: own ? (own.maxPerRide ? major(own.maxPerRide, zone.zoneId) : null) : base.maxPerRide,
      ranges: own?.ranges?.length ? own.ranges.map((range) => ({ fromKm: range.fromKm, toKm: range.toKm, krPerKm: major(range.perKm, zone.zoneId), krPerMinute: major(range.perMin, zone.zoneId) })) : base.ranges,
      riderFee: fee ? { live: riderFee(fee.live, base.riderFee.live), reservation: riderFee(fee.reservation, base.riderFee.reservation) } : base.riderFee,
    };
  }
  return { rates, offers: { ...fallback.offers, ...(driver?.offers ?? {}) } as PickupPay["offers"] };
}

/** The demo's money factor of a market (1 kr in local money), for defaults only. */
function factorOf(zoneId: string): number {
  return { SE: 1, FR: 0.095, TN: 0.3 }[currencyOf(zoneId)];
}

export function bookOf(zone: ZoneServer, categories: readonly CategoryDef[]): ZoneBook | null {
  const draft = zone.pricing;
  if (!draft) return null;
  const doc = draft.document;
  const zoneId = zone.zoneId;
  const fallback = defaultZoneBook(zoneId, categories);
  const ids = categories.map((category) => category.id);
  const airport = zoneById(zoneId)?.kind === "airport";
  const prices: Record<string, CategoryPrice> = {};
  const commission: Record<string, number> = {};
  for (const id of ids) {
    const own = doc.categories[id];
    // A category the zone's document does not have is not sold there.
    prices[id] = own ? categoryPriceOf(own, zoneId) : { ...defaultCategoryPrice(id, currencyOf(zoneId), airport), enabled: false };
    commission[id] = own ? own.commissionPct : fallback.commission[id] ?? 20;
  }
  const routes: FixedRoute[] = doc.fixedRoutes.map((route) => ({ id: route.id, from: route.from, to: route.to, categoryId: route.categoryId, price: major(route.price, zoneId) }));
  const smart: SmartSurge = { ...fallback.smart, ...doc.surge.smart, profiles: doc.surge.smart.profiles };
  return {
    zoneId,
    version: Math.max(1, draft.liveVersion),
    prices,
    fees: {
      airportPickup: major(doc.fees.airportPickup, zoneId),
      airportDropoff: major(doc.fees.airportDropoff, zoneId),
      reservationFee: major(doc.fees.reservationFee, zoneId),
      cleaningFee: major(doc.fees.cleaningFee, zoneId),
      tollsPassThrough: doc.fees.tollsPassThrough,
      // Tips are one list per country (Tips & limits); the zone's old presets are not on the wire.
      tips: fallback.fees.tips,
      rounding: major(doc.priceStep, zoneId),
    },
    routes,
    smart,
    scheduled: doc.surge.scheduled.map((item) => ({ id: item.id, name: item.name ?? "", multiplier: item.multiplier, startsAt: item.startsAt, endsAt: item.endsAt })),
    commission,
    fleetCommissionPct: doc.fleetCommissionPct,
    pickupPay: pickupPayOf(zone, ids),
  };
}

/** The running manual surge of a zone from its surge schedule (a flat surge is two equal points). */
export function manualOf(surge: SurgeSchedule | null, now: number): ManualSurge | null {
  if (!surge || (surge.status !== "active" && surge.status !== "scheduled") || Date.parse(surge.endAt) <= now) return null;
  const peak = Math.max(...surge.points.map((point) => point.multiplier));
  const flat = surge.points.every((point) => point.multiplier === surge.points[0]!.multiplier);
  return {
    multiplier: roundTo(peak, 0.1),
    startedAt: surge.startAt,
    endsAt: surge.endAt,
    by: surge.createdBy ?? "",
    reason: "",
    ...(flat ? {} : { curve: { startAt: surge.startAt, endAt: surge.endAt, points: surge.points.map((point) => ({ atMin: point.atMin, multiplier: point.multiplier })) } }),
  };
}

function catalogEntry(zones: readonly ZoneServer[], id: string): CatalogEntry | undefined {
  for (const zone of zones) {
    const found = zone.rider?.document.catalog?.categories.find((item) => item.id === id) ?? zone.driver?.document.catalog?.categories.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * The category list: the seed (Movera … Child Seat) and every category a zone's pricing document has, labels and
 * seats from the apps' catalog. A category that no app catalog lists and that is off in every zone is deleted
 * (archived); it can be put back (restored).
 */
export function categoriesOf(zones: readonly ZoneServer[]): CategoryDef[] {
  const ids = [...SEED];
  for (const zone of zones) for (const id of Object.keys(zone.pricing?.document.categories ?? {})) if (!ids.includes(id)) ids.push(id);
  const catalogs = zones.flatMap((zone) => [zone.rider, zone.driver]).filter((doc): doc is ConfigDraft<AppDocument> => Boolean(doc?.document.catalog));
  return ids.map((id) => {
    const built = BUILT_IN_CATEGORIES.find((item) => item.id === id);
    const entry = catalogEntry(zones, id);
    const priced = zones.map((zone) => zone.pricing?.document.categories[id]).filter((item): item is WireCategory => Boolean(item));
    const listed = catalogs.some((doc) => doc.document.catalog!.categories.some((item) => item.id === id));
    const archived = catalogs.length > 0 && !listed && priced.length > 0 && priced.every((item) => !item.enabled);
    const changedAt = zones.map((zone) => zone.pricing?.updatedAt ?? "").sort().at(-1) ?? new Date(0).toISOString();
    return {
      id,
      label: built?.label ?? entry?.label ?? id,
      line: entry?.line ?? built?.line ?? "",
      seats: entry?.seats ?? built?.seats ?? 4,
      builtIn: Boolean(built),
      archived: archived ? { at: changedAt, by: "", reason: "" } : null,
    };
  });
}

/** The demo store for the given zones. `history` holds the publishes made from this screen (the contract has no history read). */
export function storeOf(zones: readonly ZoneServer[], history: readonly Revision[], now: number): PricingStore {
  const categories = categoriesOf(zones);
  const books: Record<string, ZoneBook> = {};
  const live: Record<string, ZoneLive> = {};
  for (const zone of zones) {
    const book = bookOf(zone, categories);
    if (book) books[zone.zoneId] = book;
    live[zone.zoneId] = { manual: manualOf(zone.surge, now), notifyDrivers: true, lastNotifiedAt: null };
  }
  const draftRev = Math.max(1, ...zones.map((zone) => zone.pricing?.liveVersion ?? 0), ...history.map((item) => item.rev));
  return normalizeStore({ version: 2, draftRev, categories, zones: books, live, history: [...history], surgeLog: [] });
}

/* ---------- store → server ---------- */

function wireCategory(price: CategoryPrice, commissionPct: number, rate: PickupRate | undefined, own: WireCategory | undefined, id: string, zoneId: string): WireCategory {
  const fee = (value: { on: boolean; amount: number } | undefined) => (value?.on ? wire(value.amount, zoneId) : null);
  const next: WireCategory = {
    ...(own ?? {}),
    enabled: price.enabled,
    base: wire(price.base, zoneId),
    perKm: wire(price.perKm, zoneId),
    perMin: wire(price.perMin, zoneId),
    minimum: wire(price.minimum, zoneId),
    // "maximum 0 = no maximum" is null on the wire.
    maximum: price.maximum > 0 ? wire(price.maximum, zoneId) : null,
    appFeePct: price.appFeePct,
    commissionPct,
    extraStopFee: wire(price.extraStopFee, zoneId),
    stopWaitPerMin: wire(price.stopWaitPerMin, zoneId),
    // Owner Q41: the no-show button appears when the free wait ends, so noShowAfterMin follows freeWaitMin.
    waiting: { ...(own?.waiting ?? {}), freeWaitMin: price.freeWaitMin, perMin: wire(price.waitPerMin, zoneId), noShowAfterMin: price.freeWaitMin, noShowFee: wire(price.noShowFee, zoneId) },
    riderPickupFee: { live: fee(rate?.riderFee.live), reservation: fee(rate?.riderFee.reservation) },
  };
  // v0.6.0: seat fees are optional; a category sends one when it has it (Child Seat), or when the admin set one.
  delete next.babySeatFee;
  delete next.childSeatFee;
  if (price.babySeatFee > 0 || own?.babySeatFee || id === "child_seat") next.babySeatFee = wire(price.babySeatFee, zoneId);
  if (price.childSeatFee > 0 || own?.childSeatFee || id === "child_seat") next.childSeatFee = wire(price.childSeatFee, zoneId);
  return next;
}

/** A zone's pricing document from its book; every field the screen does not show is kept as the server sent it. */
export function pricingDocumentOf(book: ZoneBook, categories: readonly CategoryDef[], own: PricingDocument | null, at: string): PricingDocument {
  const zoneId = book.zoneId;
  const info = marketOfZone(zoneId) ?? MARKETS[0]!;
  const ids = categories.filter((category) => !category.archived || own?.categories[category.id]).map((category) => category.id);
  const wired: Record<string, WireCategory> = {};
  for (const id of ids) {
    const price = book.prices[id];
    if (!price) continue;
    // A category the zone never had stays out until it is turned on there.
    if (!own?.categories[id] && !price.enabled) continue;
    wired[id] = wireCategory(price, book.commission[id] ?? 20, book.pickupPay.rates[id], own?.categories[id], id, zoneId);
  }
  for (const [id, kept] of Object.entries(own?.categories ?? {})) if (!(id in wired)) wired[id] = kept;
  return {
    ...(own ?? {}),
    version: own?.version ?? 1,
    publishedAt: own?.publishedAt ?? at,
    zoneId,
    currency: own?.currency ?? info.currency,
    country: own?.country ?? info.id,
    timeZone: own?.timeZone ?? info.timeZone,
    priceStep: wire(book.fees.rounding, zoneId),
    categories: wired,
    fees: {
      ...(own?.fees ?? {}),
      airportPickup: wire(book.fees.airportPickup, zoneId),
      airportDropoff: wire(book.fees.airportDropoff, zoneId),
      reservationFee: wire(book.fees.reservationFee, zoneId),
      cleaningFee: wire(book.fees.cleaningFee, zoneId),
      tollsPassThrough: book.fees.tollsPassThrough,
    },
    stopFreeWaitMin: own?.stopFreeWaitMin ?? 3,
    fixedRoutes: book.routes.map((route) => ({ id: route.id, from: route.from, to: route.to, categoryId: route.categoryId, price: wire(route.price, zoneId) })),
    surge: {
      ...(own?.surge ?? {}),
      // The zone's surge maximum (1–6) has no control in the demo screen: kept as the server has it (see the report).
      maxMultiplier: own?.surge.maxMultiplier ?? DEFAULT_MAX_MULTIPLIER,
      smart: { ...book.smart },
      scheduled: book.scheduled.map((item) => ({ id: item.id, name: item.name, multiplier: item.multiplier, startsAt: item.startsAt, endsAt: item.endsAt })),
    },
    fleetCommissionPct: book.fleetCommissionPct,
  };
}

function wirePickupRate(rate: PickupRate, zoneId: string): WirePickupRate {
  const fee = (value: { on: boolean; amount: number }) => (value.on ? wire(value.amount, zoneId) : null);
  return {
    enabled: rate.enabled,
    maxPerRide: rate.maxPerRide !== null ? wire(rate.maxPerRide, zoneId) : null,
    ranges: rate.ranges.map((range) => ({ fromKm: range.fromKm, toKm: range.toKm, perKm: wire(range.krPerKm, zoneId), perMin: wire(range.krPerMinute, zoneId) })),
    riderFee: { live: fee(rate.riderFee.live), reservation: fee(rate.riderFee.reservation) },
  };
}

/** The driver document's pickupPay from the book; the v0.4 top-level keys follow the headline category (economy). */
export function driverPickupPayOf(book: ZoneBook, own: AppDocument["pickupPay"]): NonNullable<AppDocument["pickupPay"]> {
  const zoneId = book.zoneId;
  const byCategory = Object.fromEntries(Object.entries(book.pickupPay.rates).map(([id, rate]) => [id, wirePickupRate(rate, zoneId)]));
  const head = book.pickupPay.rates.economy ?? Object.values(book.pickupPay.rates)[0];
  const ranges = head?.ranges ?? [];
  const paid = ranges.find((range) => range.krPerKm > 0 || range.krPerMinute > 0);
  const leadingFree = ranges[0] && ranges[0].krPerKm === 0 && ranges[0].krPerMinute === 0 && ranges[0].toKm !== null ? ranges[0].toKm : 0;
  return {
    ...(own ?? {}),
    perKm: wire(paid?.krPerKm ?? 0, zoneId),
    perMin: wire(paid?.krPerMinute ?? 0, zoneId),
    freeKm: leadingFree,
    freeMin: 0,
    ranges: head ? wirePickupRate(head, zoneId).ranges : [],
    maxPerRide: head && head.maxPerRide !== null ? wire(head.maxPerRide, zoneId) : null,
    display: (own?.["display"] as string | undefined) ?? "total",
    offers: { ...book.pickupPay.offers },
    byCategory,
  };
}

const driverSide = (pay: PickupPay) => ({ offers: pay.offers, rates: Object.fromEntries(Object.entries(pay.rates).map(([id, rate]) => [id, { enabled: rate.enabled, maxPerRide: rate.maxPerRide, ranges: rate.ranges }])) });

function catalogWith(list: readonly CatalogEntry[], category: CategoryDef): CatalogEntry[] {
  const entry = { id: category.id, label: category.label, seats: category.seats, line: category.line };
  if (list.some((item) => item.id === category.id)) return list.map((item) => (item.id === category.id ? { ...item, ...entry } : item));
  return [...list, { ...entry, sort: Math.max(0, ...list.map((item) => item.sort)) + 1 }];
}

/**
 * The calls that turn `prev` into `next`. A change the contract cannot carry is refused as a whole, so nothing
 * half-applies: the caller shows `refused` and makes no call.
 */
export function planPricingWrite(prev: PricingStore, next: PricingStore, zones: readonly ZoneServer[], reason: string, now: number): Plan {
  const steps: Step[] = [];
  const refused: string[] = [];
  const at = new Date(now).toISOString();
  const byId = new Map(zones.map((zone) => [zone.zoneId, zone]));
  const note = reason.slice(0, 1000);

  // Categories: the apps' catalog (rider and driver documents) and a price entry per zone.
  const catalogChanges: { category: CategoryDef; change: "add" | "edit" | "archive" | "restore" }[] = [];
  for (const category of next.categories) {
    const before = prev.categories.find((item) => item.id === category.id);
    if (!before) catalogChanges.push({ category, change: "add" });
    else if (!before.archived && category.archived) catalogChanges.push({ category, change: "archive" });
    else if (before.archived && !category.archived) catalogChanges.push({ category, change: "restore" });
    else if (before.label !== category.label || before.seats !== category.seats || before.line !== category.line) catalogChanges.push({ category, change: "edit" });
  }
  for (const before of prev.categories) if (!next.categories.some((item) => item.id === before.id)) refused.push(tr("{0}: a category is deleted with Delete safely, never removed outright.", [before.label]));
  if (catalogChanges.length) {
    const withApps = zones.filter((zone) => zone.rider || zone.driver);
    if (!withApps.length) refused.push(tr("Categories are listed in the rider and driver app settings, and no zone has them on the server yet. Publish the app settings of a zone first."));
    for (const zone of withApps) {
      for (const doc of ["rider_app_config", "driver_app_config"] as const) {
        const draft = doc === "rider_app_config" ? zone.rider : zone.driver;
        if (!draft) continue;
        steps.push({
          kind: "config", doc, zoneId: zone.zoneId, expectedVersion: null, label: doc === "rider_app_config" ? tr("{0} rider app categories", [zoneById(zone.zoneId)?.name ?? zone.zoneId]) : tr("{0} driver app categories", [zoneById(zone.zoneId)?.name ?? zone.zoneId]),
          patch: (document) => {
            const own = (document ?? draft.document) as AppDocument;
            let list = own.catalog?.categories ?? [];
            for (const { category, change } of catalogChanges) {
              if (change === "archive") list = list.filter((item) => item.id !== category.id);
              else list = catalogWith(list, category);
            }
            return { ...own, catalog: { ...(own.catalog ?? {}), categories: list } };
          },
        });
      }
    }
  }

  // Zones: the pricing document, and the driver document when the driver side of pickup pay changed.
  for (const zoneId of new Set([...Object.keys(prev.zones), ...Object.keys(next.zones)])) {
    const zone = byId.get(zoneId);
    const before = zoneBook(prev, zoneId);
    const after = zoneBook(next, zoneId);
    const archiving = catalogChanges.filter((item) => item.change === "archive").map((item) => item.category.id);
    const adding = catalogChanges.filter((item) => item.change === "add").map((item) => item.category.id);
    const priceChanged = !same({ ...before, version: 0 }, { ...after, version: 0 });
    if (!priceChanged && !archiving.length && !adding.length) continue;
    if (!zone) {
      refused.push(tr("{0} is outside your zones.", [zoneById(zoneId)?.name ?? zoneId]));
      continue;
    }
    if (priceChanged) {
      const problems = validateZoneBook(after, next.categories);
      if (problems.length) {
        refused.push(`${zoneById(zoneId)?.name ?? zoneId}: ${problems[0]!.message}`);
        continue;
      }
    }
    if (!priceChanged && !zone.pricing) continue;
    steps.push({
      kind: "config", doc: "pricing", zoneId, expectedVersion: zone.pricing?.version ?? 1, label: tr("{0} prices", [zoneById(zoneId)?.name ?? zoneId]),
      patch: () => {
        const doc = pricingDocumentOf(after, next.categories, zone.pricing?.document ?? null, at);
        // Deleting a category turns it off in every zone; its prices stay so it can be restored.
        for (const id of archiving) if (doc.categories[id]) doc.categories[id] = { ...doc.categories[id]!, enabled: false };
        // A new category gets a price entry, off until the admin turns it on in the zone.
        for (const id of adding) {
          if (doc.categories[id]) continue;
          const price = { ...defaultCategoryPrice(id, currencyOf(zoneId), zoneById(zoneId)?.kind === "airport"), enabled: false };
          doc.categories[id] = wireCategory(price, after.commission[id] ?? 20, after.pickupPay.rates[id], undefined, id, zoneId);
        }
        return doc;
      },
    });
    if (!same(driverSide(before.pickupPay), driverSide(after.pickupPay))) {
      if (!zone.driver) refused.push(tr("{0}: driver pickup pay is in the driver app settings, and this zone has none on the server yet.", [zoneById(zoneId)?.name ?? zoneId]));
      else steps.push({
        kind: "config", doc: "driver_app_config", zoneId, expectedVersion: null, label: tr("{0} driver pickup pay", [zoneById(zoneId)?.name ?? zoneId]),
        patch: (document) => {
          const own = (document ?? zone.driver!.document) as AppDocument;
          return { ...own, pickupPay: driverPickupPayOf(after, own.pickupPay) };
        },
      });
    }
  }

  // Manual surge: the zone's surge schedule.
  for (const zoneId of new Set([...Object.keys(prev.live), ...Object.keys(next.live)])) {
    const before = zoneLive(prev, zoneId);
    const after = zoneLive(next, zoneId);
    const zone = byId.get(zoneId);
    const name = zoneById(zoneId)?.name ?? zoneId;
    if (before.notifyDrivers !== after.notifyDrivers || before.lastNotifiedAt !== after.lastNotifiedAt) refused.push(tr("{0}: telling drivers about a surge has no call in the contract yet.", [name]));
    if (same(before.manual, after.manual)) continue;
    if (!zone) {
      refused.push(tr("{0} is outside your zones.", [name]));
      continue;
    }
    const version = zone.surge?.version ?? 0;
    if (after.manual) {
      const manual = after.manual;
      const minutes = Math.round((Date.parse(manual.endsAt) - Date.parse(manual.startedAt)) / 60_000);
      const points = manual.curve?.points.length ? manual.curve.points.map((point) => ({ atMin: point.atMin, multiplier: point.multiplier })) : [{ atMin: 0, multiplier: manual.multiplier }, { atMin: minutes, multiplier: manual.multiplier }];
      steps.push({ kind: "surge", zoneId, label: tr("{0} surge", [name]), body: { expectedVersion: version, categoryIds: [], startAt: manual.startedAt, endAt: manual.endsAt, stepMinutes: SURGE_STEP_MIN, points, ...(note ? { note } : {}) } });
    } else {
      steps.push({ kind: "surgeEnd", zoneId, label: tr("{0} surge", [name]), body: { expectedVersion: version, zoneId, ...(note ? { note } : {}) } });
    }
  }
  return { steps, refused };
}

/* ---------- Tips & limits (per country) ---------- */

const amountsOf = (list: { amount: Money; enabled: boolean }[] | undefined, prefix: string, zoneId: string): AmountOption[] | undefined =>
  list?.map((item, index) => ({ id: `${prefix}-${index + 1}`, amount: major(item.amount, zoneId), enabled: item.enabled }));

/** Each country's Tips & limits from the first of its zones that has app settings on the server; otherwise the defaults. */
export function countryBookOf(zones: readonly ZoneServer[]): CountrySettingsBook {
  const countries = {} as Record<MarketId, CountrySettings>;
  for (const item of MARKETS) {
    const base = defaultCountrySettings(item.id);
    const rider = zones.find((zone) => currencyOf(zone.zoneId) === item.id && zone.rider)?.rider;
    const driver = zones.find((zone) => currencyOf(zone.zoneId) === item.id && zone.driver)?.driver;
    countries[item.id] = {
      ...base,
      tips: (rider && amountsOf(rider.document.tips, "tip", rider.zoneId)) ?? base.tips,
      raiseSteps: (rider && amountsOf(rider.document.raiseSteps, "raise", rider.zoneId)) ?? base.raiseSteps,
      promoCap: rider && rider.document.promoCap !== undefined ? (rider.document.promoCap ? major(rider.document.promoCap, rider.zoneId) : null) : base.promoCap,
      driverBonusLimit: driver?.document.driverBonus ? major(driver.document.driverBonus.defaultLimit, driver.zoneId) : base.driverBonusLimit,
    };
  }
  return { draftRev: 1, countries };
}

export function planCountryWrite(prev: CountrySettingsBook, next: CountrySettingsBook, zones: readonly ZoneServer[]): Plan {
  const steps: Step[] = [];
  const refused: string[] = [];
  for (const item of MARKETS) {
    const before = countrySettingsOf(prev, item.id);
    const after = countrySettingsOf(next, item.id);
    if (PRICING_FIELDS.every((field) => same(before[field], after[field]))) continue;
    const issues = countrySettingsIssues(item.id, after);
    if (issues.length) {
      refused.push(issues[0]!);
      continue;
    }
    const inCountry = zones.filter((zone) => currencyOf(zone.zoneId) === item.id);
    const riderChanged = !same([before.tips, before.raiseSteps, before.promoCap], [after.tips, after.raiseSteps, after.promoCap]);
    const driverChanged = before.driverBonusLimit !== after.driverBonusLimit;
    const riders = inCountry.filter((zone) => zone.rider);
    const drivers = inCountry.filter((zone) => zone.driver);
    if ((riderChanged && !riders.length) || (driverChanged && !drivers.length)) refused.push(tr("{0}: Tips & limits go into the rider and driver app settings, and no zone of {0} has them on the server yet.", [item.name]));
    const amounts = (list: AmountOption[], zoneId: string) => list.map((option) => ({ amount: wire(option.amount, zoneId), enabled: option.enabled }));
    if (riderChanged) for (const zone of riders) steps.push({
      kind: "config", doc: "rider_app_config", zoneId: zone.zoneId, expectedVersion: null, label: tr("{0} rider tips & limits", [zoneById(zone.zoneId)?.name ?? zone.zoneId]),
      patch: (document) => ({ ...(document ?? zone.rider!.document), tips: amounts(after.tips, zone.zoneId), raiseSteps: amounts(after.raiseSteps, zone.zoneId), promoCap: after.promoCap === null ? null : wire(after.promoCap, zone.zoneId) }),
    });
    if (driverChanged) for (const zone of drivers) steps.push({
      kind: "config", doc: "driver_app_config", zoneId: zone.zoneId, expectedVersion: null, label: tr("{0} driver bonus limit", [zoneById(zone.zoneId)?.name ?? zone.zoneId]),
      patch: (document) => {
        const own = (document ?? zone.driver!.document) as AppDocument;
        const hardMax = own.driverBonus?.hardMax ?? wire(after.driverBonusLimit, zone.zoneId);
        return { ...own, driverBonus: { ...(own.driverBonus ?? {}), defaultLimit: wire(after.driverBonusLimit, zone.zoneId), hardMax } };
      },
    });
  }
  return { steps, refused };
}
