import { MARKETS, market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import { completePickupPay, convertPickupPay, defaultPickupPay, diffPickupPay, validatePickupPay, type PickupPay } from "./pickupPay.ts";

/**
 * Prices, fees, surge settings, commission and driver pickup pay, one full set per zone.
 * Amounts are in the zone's own currency, as major units (kr, €, DT), VAT included.
 * Edits stay in a local draft until an admin publishes them as a new revision.
 */

export type CategoryDef = {
  id: string;
  label: string;
  /** Short line riders see under the name in the app. */
  line: string;
  seats: number;
  builtIn: boolean;
  archived: { at: string; by: string; reason: string } | null;
};

export type CategoryPrice = {
  enabled: boolean;
  base: number;
  perKm: number;
  perMin: number;
  freeWaitMin: number;
  waitPerMin: number;
  stopWaitPerMin: number;
  cancelFee: number;
  freeCancelMin: number;
  noShowFee: number;
  extraStopFee: number;
  babySeatFee: number;
  childSeatFee: number;
  minimum: number;
  maximum: number;
  appFeePct: number;
};

export type PriceField = Exclude<keyof CategoryPrice, "enabled">;

export type ZoneFees = {
  airportPickup: number;
  airportDropoff: number;
  reservationFee: number;
  cleaningFee: number;
  tollsPassThrough: boolean;
  tips: number[];
  rounding: number;
};

export type FixedRoute = { id: string; from: string; to: string; categoryId: string; price: number };

export type SurgeStep = { ratio: number; multiplier: number };

export type TimeWindow = { from: string; to: string };

export type SurgeProfile = {
  id: string;
  name: string;
  /** 0 = Monday … 6 = Sunday. */
  days: number[];
  windows: TimeWindow[];
  steps: SurgeStep[];
  cap: number;
  /** The fallback profile used when no other profile matches. */
  isDefault: boolean;
};

export type SmartSurge = {
  enabled: boolean;
  activeFrom: string;
  activeTo: string;
  checkEveryMin: number;
  holdMin: number;
  stopAfterMin: number;
  cooldownMin: number;
  profiles: SurgeProfile[];
};

export type ScheduledSurge = { id: string; name: string; multiplier: number; startsAt: string; endsAt: string };

export type ZoneBook = {
  zoneId: string;
  version: number;
  prices: Record<string, CategoryPrice>;
  fees: ZoneFees;
  routes: FixedRoute[];
  smart: SmartSurge;
  scheduled: ScheduledSurge[];
  commission: Record<string, number>;
  fleetCommissionPct: number;
  /** Driver pickup pay, paid by Movera from its commission. */
  pickupPay: PickupPay;
};

export type ManualSurge = { multiplier: number; startedAt: string; endsAt: string; by: string; reason: string };

export type ZoneLive = { manual: ManualSurge | null; notifyDrivers: boolean; lastNotifiedAt: string | null };

export type SurgeEvent = {
  id: string;
  zoneId: string;
  kind: "manual-start" | "manual-stop" | "notify";
  multiplier: number;
  at: string;
  by: string;
  reason: string;
};

export type Revision = {
  rev: number;
  at: string;
  actorId: string;
  reason: string;
  zoneIds: string[];
  changes: string[];
  books: Record<string, ZoneBook>;
};

export type PricingStore = {
  version: 2;
  draftRev: number;
  categories: CategoryDef[];
  zones: Record<string, ZoneBook>;
  live: Record<string, ZoneLive>;
  history: Revision[];
  surgeLog: SurgeEvent[];
};

export const SLICE_KEY = "zonePricing";
export const SLIDER_MIN = 1;
export const SLIDER_MAX = 6;
export const HIGH_SURGE = 3;
const HISTORY_LIMIT = 40;
const LOG_LIMIT = 200;
const RESTORE_DAYS = 30;

export const BUILT_IN_CATEGORIES: CategoryDef[] = [
  { id: "economy", label: "Movera", line: "Everyday ride", seats: 4, builtIn: true, archived: null },
  { id: "comfort", label: "Comfort", line: "Newer cars, more room", seats: 4, builtIn: true, archived: null },
  { id: "premium", label: "Premium", line: "High-end cars, top drivers", seats: 4, builtIn: true, archived: null },
  { id: "priority", label: "Priority", line: "Faster pickup", seats: 4, builtIn: true, archived: null },
  { id: "xl", label: "XL", line: "Up to 6 seats", seats: 6, builtIn: true, archived: null },
  { id: "electric", label: "Electric", line: "Fully electric car", seats: 4, builtIn: true, archived: null },
  { id: "pet", label: "Pet", line: "Your pet rides with you", seats: 4, builtIn: true, archived: null },
  { id: "child_seat", label: "Child Seat", line: "Car with a baby or child seat", seats: 4, builtIn: true, archived: null },
];

/** Rows of the price table, in the order the admin reads them. */
export const PRICE_ROWS: { field: PriceField; label: string; unit: "money" | "min" | "pct"; group: string; hint?: string }[] = [
  { field: "base", label: "Base fare", unit: "money", group: "Trip", hint: "Start price of every ride" },
  { field: "perKm", label: "Price per km", unit: "money", group: "Trip" },
  { field: "perMin", label: "Price per min", unit: "money", group: "Trip" },
  { field: "freeWaitMin", label: "Free waiting at pickup", unit: "min", group: "Waiting" },
  { field: "waitPerMin", label: "Waiting after free time, per min", unit: "money", group: "Waiting" },
  { field: "stopWaitPerMin", label: "Waiting at a stop, per min", unit: "money", group: "Waiting" },
  { field: "freeCancelMin", label: "Rider free cancellation window", unit: "min", group: "Cancellation" },
  { field: "cancelFee", label: "Cancellation fee (after the window)", unit: "money", group: "Cancellation" },
  { field: "noShowFee", label: "No-show fee", unit: "money", group: "Cancellation" },
  { field: "extraStopFee", label: "Extra stop fee", unit: "money", group: "Extras" },
  { field: "babySeatFee", label: "Baby seat fee", unit: "money", group: "Extras" },
  { field: "childSeatFee", label: "Child seat fee", unit: "money", group: "Extras" },
  { field: "minimum", label: "Minimum fare", unit: "money", group: "Limits" },
  { field: "maximum", label: "Maximum fare", unit: "money", group: "Limits" },
  { field: "appFeePct", label: "App fee", unit: "pct", group: "Limits", hint: "Added to the rider's price" },
];

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How much one Swedish krona of price is worth in each market, and the natural rounding step. */
const CURRENCY: Record<MarketId, { factor: number; step: number; roundings: number[]; tips: number[] }> = {
  SE: { factor: 1, step: 1, roundings: [0.01, 1, 5, 10], tips: [10, 20, 30] },
  FR: { factor: 0.095, step: 0.05, roundings: [0.01, 0.05, 0.1, 0.5, 1], tips: [1, 2, 5] },
  TN: { factor: 0.3, step: 0.1, roundings: [0.001, 0.1, 0.5, 1], tips: [1, 2, 3] },
};

export function currencyOf(zoneId: string): MarketId {
  return marketOfZone(zoneId)?.id ?? "SE";
}

export function roundingOptions(id: MarketId): number[] {
  return CURRENCY[id].roundings;
}

export function inputStep(id: MarketId): number {
  return market(id).minorUnits === 1000 ? 0.001 : 0.01;
}

export function roundTo(value: number, step: number): number {
  if (!step) return value;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** Format a major-unit amount in the zone's currency. */
export function money(value: number, id: MarketId): string {
  const item = market(id);
  const digits = item.minorUnits === 1000 ? 3 : 2;
  return new Intl.NumberFormat(item.locale, { style: "currency", currency: item.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** An amount in Swedish kronor in a market's own money, with the same rate and rounding the default prices use. */
export function fromSek(amountSek: number, id: MarketId): number {
  const { factor, step } = CURRENCY[id];
  return roundTo(amountSek * factor, step);
}

/** A major-unit amount rounded to the market's natural money step (1 kr, 0.05 €, 0.1 DT), like the default prices. */
export function roundMoney(value: number, id: MarketId): number {
  return roundTo(value, CURRENCY[id].step);
}

export function currencySymbol(id: MarketId): string {
  return { SE: "kr", FR: "€", TN: "DT" }[id];
}

const SEK_BASE: Omit<CategoryPrice, "enabled"> = {
  base: 29, perKm: 12, perMin: 4, freeWaitMin: 2, waitPerMin: 5, stopWaitPerMin: 5,
  cancelFee: 40, freeCancelMin: 2, noShowFee: 50, extraStopFee: 15,
  babySeatFee: 30, childSeatFee: 30, minimum: 49, maximum: 1500, appFeePct: 10,
};

/** Waiting at pickup in kronor: per minute after the free wait, and the no-show fee. Other countries get the same value in local money. */
const WAIT_PER_MIN_SEK = 12.26;
const WAIT_PER_MIN_PREMIUM_SEK = 16.9;
const NO_SHOW_FEE_SEK = 65;

const CATEGORY_LIFT: Record<string, number> = { economy: 1, comfort: 1.25, premium: 1.8, priority: 1.35, xl: 1.5, electric: 1.1, pet: 1.15, child_seat: 1.2 };

const MONEY_FIELDS: PriceField[] = ["base", "perKm", "perMin", "waitPerMin", "stopWaitPerMin", "cancelFee", "noShowFee", "extraStopFee", "babySeatFee", "childSeatFee", "minimum", "maximum"];

export function defaultCategoryPrice(categoryId: string, id: MarketId, airport = false): CategoryPrice {
  const lift = CATEGORY_LIFT[categoryId] ?? 1;
  const { factor, step } = CURRENCY[id];
  const price = { enabled: categoryId in CATEGORY_LIFT, ...SEK_BASE } as CategoryPrice;
  for (const field of MONEY_FIELDS) {
    const lifted = field === "babySeatFee" || field === "childSeatFee" ? SEK_BASE[field] * (categoryId === "child_seat" ? 0.5 : 1) : SEK_BASE[field] * lift;
    price[field] = roundTo(lifted * factor * (airport && (field === "base" || field === "minimum") ? 1.3 : 1), step);
  }
  price.freeWaitMin = categoryId === "premium" ? 5 : airport ? 5 : categoryId === "xl" ? 3 : 2;
  // Waiting at pickup is the same in every category (Premium waits longer and costs more), and matches the driver app's waiting rules.
  const waitSek = categoryId === "premium" ? WAIT_PER_MIN_PREMIUM_SEK : WAIT_PER_MIN_SEK;
  price.waitPerMin = id === "SE" ? waitSek : roundTo(waitSek * factor, step);
  price.noShowFee = id === "SE" ? NO_SHOW_FEE_SEK : roundTo(NO_SHOW_FEE_SEK * factor, step);
  price.freeCancelMin = categoryId === "premium" ? 3 : 2;
  price.appFeePct = categoryId === "premium" ? 12 : 10;
  return price;
}

function defaultProfiles(): SurgeProfile[] {
  return [
    { id: "weekend-night", name: "Weekend night", days: [4, 5], windows: [{ from: "22:00", to: "05:00" }], steps: [{ ratio: 1.5, multiplier: 1.3 }, { ratio: 2, multiplier: 1.7 }, { ratio: 3, multiplier: 2.2 }], cap: 3, isDefault: false },
    { id: "rush", name: "Rush hour", days: [0, 1, 2, 3, 4], windows: [{ from: "07:00", to: "09:00" }, { from: "16:00", to: "18:00" }], steps: [{ ratio: 1.5, multiplier: 1.3 }, { ratio: 2, multiplier: 1.6 }, { ratio: 3, multiplier: 2.2 }], cap: 2.5, isDefault: false },
    { id: "night", name: "Night", days: [0, 1, 2, 3, 4, 5, 6], windows: [{ from: "22:00", to: "04:00" }], steps: [{ ratio: 1.5, multiplier: 1.2 }, { ratio: 2, multiplier: 1.5 }, { ratio: 3, multiplier: 1.8 }], cap: 2, isDefault: false },
    { id: "normal", name: "Normal", days: [0, 1, 2, 3, 4, 5, 6], windows: [{ from: "00:00", to: "00:00" }], steps: [{ ratio: 1.5, multiplier: 1.2 }, { ratio: 2, multiplier: 1.5 }, { ratio: 3, multiplier: 2 }], cap: 2.5, isDefault: true },
  ];
}

export function defaultSmartSurge(): SmartSurge {
  return { enabled: true, activeFrom: "00:00", activeTo: "00:00", checkEveryMin: 1, holdMin: 3, stopAfterMin: 5, cooldownMin: 2, profiles: defaultProfiles() };
}

export function defaultZoneBook(zoneId: string, categories: readonly CategoryDef[] = BUILT_IN_CATEGORIES): ZoneBook {
  const id = currencyOf(zoneId);
  const airport = zoneById(zoneId)?.kind === "airport";
  const { factor, step, tips } = CURRENCY[id];
  return {
    zoneId,
    version: 1,
    prices: Object.fromEntries(categories.map((category) => [category.id, defaultCategoryPrice(category.id, id, airport)])),
    fees: {
      airportPickup: roundTo((airport ? 65 : 0) * factor, step),
      airportDropoff: roundTo((airport ? 30 : 0) * factor, step),
      reservationFee: roundTo(25 * factor, step),
      cleaningFee: roundTo(300 * factor, step),
      tollsPassThrough: id === "SE",
      tips: [...tips],
      rounding: step,
    },
    routes: [],
    smart: defaultSmartSurge(),
    scheduled: [],
    commission: Object.fromEntries(categories.map((category) => [category.id, category.id === "premium" ? 22 : 20])),
    fleetCommissionPct: 5,
    pickupPay: defaultPickupPay(categories.map((category) => category.id), factor),
  };
}

export function emptyPricingStore(): PricingStore {
  return { version: 2, draftRev: 1, categories: structuredClone(BUILT_IN_CATEGORIES), zones: {}, live: {}, history: [], surgeLog: [] };
}

/** Accept whatever is stored and fill the gaps, so older or partial data still opens. */
export function normalizeStore(value: unknown): PricingStore {
  const fallback = emptyPricingStore();
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 2) return fallback;
  const raw = value as Partial<PricingStore>;
  const categories = Array.isArray(raw.categories) && raw.categories.length ? raw.categories : fallback.categories;
  for (const builtIn of BUILT_IN_CATEGORIES) if (!categories.some((item) => item.id === builtIn.id)) categories.push(structuredClone(builtIn));
  return {
    version: 2,
    draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1,
    categories,
    zones: raw.zones && typeof raw.zones === "object" ? raw.zones : {},
    live: raw.live && typeof raw.live === "object" ? raw.live : {},
    history: Array.isArray(raw.history) ? raw.history : [],
    surgeLog: Array.isArray(raw.surgeLog) ? raw.surgeLog : [],
  };
}

/** A zone's published book, with defaults for anything missing (new categories, older data). */
export function zoneBook(store: PricingStore, zoneId: string): ZoneBook {
  return completeBook(store.zones[zoneId] ?? defaultZoneBook(zoneId, store.categories), store.categories);
}

function completeBook(book: ZoneBook, categories: readonly CategoryDef[]): ZoneBook {
  const id = currencyOf(book.zoneId);
  const airport = zoneById(book.zoneId)?.kind === "airport";
  const fallback = defaultZoneBook(book.zoneId, categories);
  return {
    ...fallback,
    ...book,
    prices: Object.fromEntries(categories.map((category) => [category.id, withoutRetiredFields({ ...defaultCategoryPrice(category.id, id, airport), ...(book.prices?.[category.id] ?? {}) })])),
    commission: Object.fromEntries(categories.map((category) => [category.id, book.commission?.[category.id] ?? fallback.commission[category.id] ?? 20])),
    fees: { ...fallback.fees, ...(book.fees ?? {}) },
    smart: { ...fallback.smart, ...(book.smart ?? {}), profiles: book.smart?.profiles?.length ? book.smart.profiles : fallback.smart.profiles },
    routes: book.routes ?? [],
    scheduled: book.scheduled ?? [],
    pickupPay: completePickupPay(book.pickupPay, categories.map((category) => category.id), CURRENCY[id].factor),
  };
}

/** Fields older data may still carry. The rider "Long pickup fee" is gone: drivers get pickup pay from Movera instead. */
const RETIRED_PRICE_FIELDS = ["longPickupFee"];

function withoutRetiredFields(price: CategoryPrice): CategoryPrice {
  const copy: Record<string, unknown> = { ...price };
  for (const field of RETIRED_PRICE_FIELDS) delete copy[field];
  return copy as CategoryPrice;
}

export function zoneLive(store: PricingStore, zoneId: string): ZoneLive {
  return store.live[zoneId] ?? { manual: null, notifyDrivers: true, lastNotifiedAt: null };
}

export function activeCategories(store: PricingStore): CategoryDef[] {
  return store.categories.filter((category) => !category.archived);
}

export type Problem = { path: string; message: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Everything that would stop a zone from being published, with where it is. */
export function validateZoneBook(book: ZoneBook, categories: readonly CategoryDef[]): Problem[] {
  const problems: Problem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });
  for (const category of categories.filter((item) => !item.archived)) {
    const price = book.prices[category.id];
    if (!price) continue;
    for (const row of PRICE_ROWS) {
      const value = price[row.field];
      if (!Number.isFinite(value) || value < 0) add(`prices.${category.id}.${row.field}`, `${category.label}: ${row.label} must be 0 or more.`);
    }
    if (price.maximum && price.minimum > price.maximum) add(`prices.${category.id}.minimum`, `${category.label}: minimum fare is higher than the maximum fare.`);
    if (price.appFeePct > 50) add(`prices.${category.id}.appFeePct`, `${category.label}: app fee can be at most 50%.`);
    if (price.freeWaitMin > 30) add(`prices.${category.id}.freeWaitMin`, `${category.label}: free waiting can be at most 30 min.`);
    if (price.freeCancelMin > 30) add(`prices.${category.id}.freeCancelMin`, `${category.label}: free cancellation window can be at most 30 min.`);
    const commission = book.commission[category.id];
    if (!Number.isFinite(commission) || commission < 0 || commission > 60) add(`commission.${category.id}`, `${category.label}: commission must be between 0 and 60%.`);
  }
  problems.push(...validatePickupPay(book.pickupPay, categories));
  if (book.fleetCommissionPct < 0 || book.fleetCommissionPct > 30) add("commission.fleet", "Fleet owner share must be between 0 and 30%.");
  for (const [key, value] of Object.entries(book.fees)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) add(`fees.${key}`, "Fees must be 0 or more.");
  }
  if (!book.fees.tips.length || book.fees.tips.some((tip) => !Number.isFinite(tip) || tip <= 0)) add("fees.tips", "Tip presets need at least one amount above 0.");
  for (const route of book.routes) {
    if (!route.from.trim() || !route.to.trim()) add(`routes.${route.id}`, "A fixed route needs a from and a to place.");
    if (!(route.price > 0)) add(`routes.${route.id}`, `Fixed route ${route.from} → ${route.to} needs a price above 0.`);
  }
  const smart = book.smart;
  if (!TIME.test(smart.activeFrom) || !TIME.test(smart.activeTo)) add("smart.active", "Active hours must be like 06:00.");
  for (const [key, max] of [["checkEveryMin", 15], ["holdMin", 30], ["stopAfterMin", 60], ["cooldownMin", 30]] as const) {
    if (!(smart[key] >= 1 && smart[key] <= max)) add(`smart.${key}`, `Smart surge timing must be between 1 and ${max} min.`);
  }
  if (smart.profiles.filter((profile) => profile.isDefault).length !== 1) add("smart.profiles", "Smart surge needs exactly one Normal (fallback) profile.");
  for (const profile of smart.profiles) {
    if (!profile.name.trim()) add(`smart.${profile.id}`, "Every time profile needs a name.");
    if (!profile.isDefault && !profile.days.length) add(`smart.${profile.id}`, `${profile.name}: pick at least one day.`);
    if (profile.windows.some((window) => !TIME.test(window.from) || !TIME.test(window.to))) add(`smart.${profile.id}`, `${profile.name}: times must be like 07:00.`);
    if (profile.cap < SLIDER_MIN || profile.cap > SLIDER_MAX) add(`smart.${profile.id}.cap`, `${profile.name}: cap must be between ×${SLIDER_MIN} and ×${SLIDER_MAX}.`);
    profile.steps.forEach((step, index) => {
      const before = profile.steps[index - 1];
      if (step.multiplier < SLIDER_MIN || step.multiplier > SLIDER_MAX) add(`smart.${profile.id}.steps`, `${profile.name}: surge must be between ×${SLIDER_MIN} and ×${SLIDER_MAX}.`);
      if (!(step.ratio > 0)) add(`smart.${profile.id}.steps`, `${profile.name}: each step needs a requests per driver level above 0.`);
      if (before && (step.ratio <= before.ratio || step.multiplier < before.multiplier)) add(`smart.${profile.id}.steps`, `${profile.name}: each step must have a higher level and at least the same surge as the one before.`);
      if (step.multiplier > profile.cap) add(`smart.${profile.id}.steps`, `${profile.name}: a step is above the cap ×${profile.cap}.`);
    });
  }
  for (const item of book.scheduled) {
    if (!item.startsAt || !item.endsAt || Date.parse(item.endsAt) <= Date.parse(item.startsAt)) add(`scheduled.${item.id}`, `Scheduled surge "${item.name || "untitled"}" must end after it starts.`);
    if (item.multiplier < SLIDER_MIN || item.multiplier > SLIDER_MAX) add(`scheduled.${item.id}`, "Scheduled surge must be between ×1 and ×6.");
  }
  return problems;
}

function short(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Plain-language list of what changed between two versions of a zone. */
export function diffBooks(before: ZoneBook, after: ZoneBook, categories: readonly CategoryDef[]): string[] {
  const lines: string[] = [];
  for (const category of categories) {
    const a = before.prices[category.id];
    const b = after.prices[category.id];
    if (!a || !b) continue;
    if (a.enabled !== b.enabled) lines.push(`${category.label} turned ${b.enabled ? "on" : "off"}`);
    for (const row of PRICE_ROWS) if (a[row.field] !== b[row.field]) lines.push(`${category.label} · ${row.label} ${short(a[row.field])} → ${short(b[row.field])}`);
    if (before.commission[category.id] !== after.commission[category.id]) lines.push(`${category.label} · commission ${before.commission[category.id]}% → ${after.commission[category.id]}%`);
  }
  if (before.fleetCommissionPct !== after.fleetCommissionPct) lines.push(`Fleet owner share ${before.fleetCommissionPct}% → ${after.fleetCommissionPct}%`);
  const feeLabels: Record<string, string> = { airportPickup: "Airport pickup fee", airportDropoff: "Airport drop-off fee", reservationFee: "Reservation fee", cleaningFee: "Cleaning fee", tollsPassThrough: "Tolls added to fare", rounding: "Rounding" };
  for (const key of Object.keys(feeLabels) as (keyof ZoneFees)[]) {
    if (before.fees[key] !== after.fees[key]) lines.push(`${feeLabels[key]} ${String(before.fees[key])} → ${String(after.fees[key])}`);
  }
  if (before.fees.tips.join(",") !== after.fees.tips.join(",")) lines.push(`Tip presets ${before.fees.tips.join(", ")} → ${after.fees.tips.join(", ")}`);
  if (JSON.stringify(before.routes) !== JSON.stringify(after.routes)) lines.push(`Fixed routes: ${after.routes.length} route${after.routes.length === 1 ? "" : "s"}`);
  if (JSON.stringify(before.smart) !== JSON.stringify(after.smart)) lines.push(before.smart.enabled !== after.smart.enabled ? `Smart surge turned ${after.smart.enabled ? "on" : "off"}` : "Smart surge settings changed");
  if (JSON.stringify(before.scheduled) !== JSON.stringify(after.scheduled)) lines.push(`Scheduled surges: ${after.scheduled.length}`);
  lines.push(...diffPickupPay(before.pickupPay, after.pickupPay, categories));
  return lines;
}

function zoneName(zoneId: string): string {
  return zoneById(zoneId)?.name ?? zoneId;
}

/** Publish every changed zone draft as one new revision. */
export function publishZones(store: PricingStore, drafts: Record<string, ZoneBook>, actorId: string, reason: string, at: string): { store: PricingStore; error?: string; changes: string[] } {
  const changed = Object.values(drafts).filter((draft) => JSON.stringify(draft) !== JSON.stringify(zoneBook(store, draft.zoneId)));
  if (!changed.length) return { store, error: "Nothing to publish.", changes: [] };
  for (const draft of changed) {
    const problems = validateZoneBook(draft, store.categories);
    if (problems.length) return { store, error: `${zoneName(draft.zoneId)}: ${problems[0].message}`, changes: [] };
  }
  const rev = store.draftRev + 1;
  const zones = { ...store.zones };
  const books: Record<string, ZoneBook> = {};
  const changes: string[] = [];
  for (const draft of changed) {
    const before = zoneBook(store, draft.zoneId);
    const next = { ...structuredClone(draft), version: before.version + 1 };
    zones[draft.zoneId] = next;
    books[draft.zoneId] = next;
    changes.push(...diffBooks(before, next, store.categories).map((line) => `${zoneName(draft.zoneId)} · ${line}`));
  }
  const revision: Revision = { rev, at, actorId, reason, zoneIds: changed.map((draft) => draft.zoneId), changes, books };
  return { store: { ...store, draftRev: rev, zones, history: [revision, ...store.history].slice(0, HISTORY_LIMIT) }, changes };
}

/** The book a zone had right after a given revision. */
export function bookAtRevision(store: PricingStore, zoneId: string, rev: number): ZoneBook {
  const found = store.history.filter((item) => item.rev <= rev && item.books[zoneId]).sort((a, b) => b.rev - a.rev)[0];
  return completeBook(found?.books[zoneId] ?? defaultZoneBook(zoneId, store.categories), store.categories);
}

/** Put the zones of an older revision back, as a new revision. History is never rewritten. */
export function restoreRevision(store: PricingStore, rev: number, actorId: string, at: string): { store: PricingStore; error?: string } {
  const target = store.history.find((item) => item.rev === rev);
  if (!target) return { store, error: `Revision ${rev} is not in the history.` };
  const drafts = Object.fromEntries(target.zoneIds.map((zoneId) => [zoneId, { ...bookAtRevision(store, zoneId, rev), version: zoneBook(store, zoneId).version }]));
  const result = publishZones(store, drafts, actorId, `Restore revision ${rev}`, at);
  if (result.error) return { store, error: result.error === "Nothing to publish." ? "That revision is already live." : result.error };
  return { store: result.store };
}

export function undoLastPublish(store: PricingStore, actorId: string, at: string): { store: PricingStore; error?: string } {
  const [latest] = store.history;
  if (!latest) return { store, error: "Nothing to undo yet." };
  const drafts = Object.fromEntries(latest.zoneIds.map((zoneId) => [zoneId, { ...bookAtRevision(store, zoneId, latest.rev - 1), version: zoneBook(store, zoneId).version }]));
  const result = publishZones(store, drafts, actorId, `Undo revision ${latest.rev}`, at);
  return result.error ? { store, error: result.error } : { store: result.store };
}

export type CopyPart = "prices" | "fees" | "surge" | "commission" | "pickup";

/** Copy parts of one zone into another. Amounts are converted when the countries differ. */
export function copyInto(source: ZoneBook, target: ZoneBook, parts: readonly CopyPart[]): ZoneBook {
  const from = currencyOf(source.zoneId);
  const to = currencyOf(target.zoneId);
  const rate = CURRENCY[to].factor / CURRENCY[from].factor;
  const step = CURRENCY[to].step;
  const convert = (value: number) => (from === to ? value : roundTo(value * rate, step));
  const next = structuredClone(target);
  if (parts.includes("prices")) {
    next.prices = Object.fromEntries(Object.entries(source.prices).map(([id, price]) => {
      const copy = { ...price };
      for (const field of MONEY_FIELDS) copy[field] = convert(price[field]);
      return [id, copy];
    }));
    next.routes = from === to ? structuredClone(source.routes) : next.routes;
  }
  if (parts.includes("fees")) {
    next.fees = { ...source.fees, airportPickup: convert(source.fees.airportPickup), airportDropoff: convert(source.fees.airportDropoff), reservationFee: convert(source.fees.reservationFee), cleaningFee: convert(source.fees.cleaningFee), tips: source.fees.tips.map(convert), rounding: from === to ? source.fees.rounding : step };
  }
  if (parts.includes("surge")) {
    next.smart = structuredClone(source.smart);
    next.scheduled = structuredClone(source.scheduled).map((item) => ({ ...item, id: `${target.zoneId}-${item.id}` }));
  }
  if (parts.includes("commission")) {
    next.commission = { ...source.commission };
    next.fleetCommissionPct = source.fleetCommissionPct;
  }
  if (parts.includes("pickup")) {
    next.pickupPay = convertPickupPay(source.pickupPay, (value) => (from === to ? value : roundTo(value * rate, 0.01)));
  }
  return next;
}

function slug(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "category";
}

export function validateCategory(store: PricingStore, input: { id?: string; label: string; line: string; seats: number }): string | null {
  const label = input.label.trim();
  if (label.length < 2) return "The name needs at least 2 letters.";
  if (label.length > 24) return "Keep the name to 24 letters or fewer.";
  if (!input.line.trim()) return "Add the short line riders see under the name.";
  if (!(input.seats >= 1 && input.seats <= 8)) return "Seats must be between 1 and 8.";
  if (store.categories.some((item) => item.id !== input.id && !item.archived && item.label.toLowerCase() === label.toLowerCase())) return `A category called ${label} already exists.`;
  return null;
}

export function addCategory(store: PricingStore, input: { label: string; line: string; seats: number }): { store: PricingStore; id: string; error?: string } {
  const error = validateCategory(store, input);
  if (error) return { store, id: "", error };
  let id = slug(input.label);
  while (store.categories.some((item) => item.id === id)) id = `${id}_2`;
  const category: CategoryDef = { id, label: input.label.trim(), line: input.line.trim(), seats: input.seats, builtIn: false, archived: null };
  return { store: { ...store, draftRev: store.draftRev + 1, categories: [...store.categories, category] }, id };
}

export function editCategory(store: PricingStore, id: string, input: { label: string; line: string; seats: number }): { store: PricingStore; error?: string } {
  if (!store.categories.some((item) => item.id === id)) return { store, error: "Category not found." };
  const error = validateCategory(store, { ...input, id });
  if (error) return { store, error };
  return { store: { ...store, draftRev: store.draftRev + 1, categories: store.categories.map((item) => (item.id === id ? { ...item, label: input.label.trim(), line: input.line.trim(), seats: input.seats } : item)) } };
}

export type CategoryUsage = { activeRides: number; reservations: number; vehicles: number };

export function usageBlocks(usage: CategoryUsage): string[] {
  const reasons: string[] = [];
  if (usage.activeRides) reasons.push(`${usage.activeRides} ride${usage.activeRides === 1 ? "" : "s"} in progress`);
  if (usage.reservations) reasons.push(`${usage.reservations} upcoming reservation${usage.reservations === 1 ? "" : "s"}`);
  if (usage.vehicles) reasons.push(`${usage.vehicles} vehicle${usage.vehicles === 1 ? "" : "s"} registered in it`);
  return reasons;
}

/** Deleting archives first; it is blocked while anything still uses the category. */
export function archiveCategory(store: PricingStore, id: string, usage: CategoryUsage, actorId: string, reason: string, at: string): { store: PricingStore; error?: string } {
  const category = store.categories.find((item) => item.id === id);
  if (!category) return { store, error: "Category not found." };
  if (category.archived) return { store, error: `${category.label} is already deleted.` };
  const blocks = usageBlocks(usage);
  if (blocks.length) return { store, error: `${category.label} is still in use: ${blocks.join(", ")}.` };
  if (activeCategories(store).length <= 1) return { store, error: "Keep at least one category." };
  return { store: { ...store, draftRev: store.draftRev + 1, categories: store.categories.map((item) => (item.id === id ? { ...item, archived: { at, by: actorId, reason } } : item)) } };
}

export function restoreDeadline(category: CategoryDef): number | null {
  return category.archived ? Date.parse(category.archived.at) + RESTORE_DAYS * 86_400_000 : null;
}

export function restoreCategory(store: PricingStore, id: string, now: number): { store: PricingStore; error?: string } {
  const category = store.categories.find((item) => item.id === id);
  if (!category?.archived) return { store, error: "Category is not deleted." };
  if ((restoreDeadline(category) ?? 0) < now) return { store, error: `${category.label} was deleted more than ${RESTORE_DAYS} days ago and cannot be restored.` };
  return { store: { ...store, draftRev: store.draftRev + 1, categories: store.categories.map((item) => (item.id === id ? { ...item, archived: null } : item)) } };
}

export function startManualSurge(store: PricingStore, zoneId: string, multiplier: number, minutes: number, actorId: string, reason: string, at: string): { store: PricingStore; error?: string } {
  if (!(multiplier >= SLIDER_MIN && multiplier <= SLIDER_MAX)) return { store, error: `Surge must be between ×${SLIDER_MIN} and ×${SLIDER_MAX}.` };
  if (!(minutes >= 5 && minutes <= 720)) return { store, error: "A manual surge lasts between 5 min and 12 h." };
  const live = zoneLive(store, zoneId);
  const manual: ManualSurge = { multiplier: roundTo(multiplier, 0.1), startedAt: at, endsAt: new Date(Date.parse(at) + minutes * 60_000).toISOString(), by: actorId, reason };
  const event: SurgeEvent = { id: `${zoneId}-${at}-start`, zoneId, kind: "manual-start", multiplier: manual.multiplier, at, by: actorId, reason };
  const notify: SurgeEvent[] = live.notifyDrivers ? [{ id: `${zoneId}-${at}-notify`, zoneId, kind: "notify", multiplier: manual.multiplier, at, by: actorId, reason: "Drivers told about the surge" }] : [];
  return {
    store: {
      ...store,
      draftRev: store.draftRev + 1,
      live: { ...store.live, [zoneId]: { ...live, manual, lastNotifiedAt: live.notifyDrivers ? at : live.lastNotifiedAt } },
      surgeLog: [...notify, event, ...store.surgeLog].slice(0, LOG_LIMIT),
    },
  };
}

export function stopManualSurges(store: PricingStore, zoneIds: readonly string[], actorId: string, reason: string, at: string): { store: PricingStore; error?: string; stopped: string[] } {
  const stopped = zoneIds.filter((zoneId) => zoneLive(store, zoneId).manual && Date.parse(zoneLive(store, zoneId).manual!.endsAt) > Date.parse(at));
  if (!stopped.length) return { store, error: "No manual surge is running.", stopped };
  const live = { ...store.live };
  const events: SurgeEvent[] = [];
  for (const zoneId of stopped) {
    const current = zoneLive(store, zoneId);
    events.push({ id: `${zoneId}-${at}-stop`, zoneId, kind: "manual-stop", multiplier: current.manual!.multiplier, at, by: actorId, reason });
    live[zoneId] = { ...current, manual: null };
  }
  return { store: { ...store, draftRev: store.draftRev + 1, live, surgeLog: [...events, ...store.surgeLog].slice(0, LOG_LIMIT) }, stopped };
}

export function setNotifyDrivers(store: PricingStore, zoneId: string, enabled: boolean): PricingStore {
  return { ...store, draftRev: store.draftRev + 1, live: { ...store.live, [zoneId]: { ...zoneLive(store, zoneId), notifyDrivers: enabled } } };
}

export function notifyDriversNow(store: PricingStore, zoneId: string, multiplier: number, actorId: string, at: string): PricingStore {
  const event: SurgeEvent = { id: `${zoneId}-${at}-notify`, zoneId, kind: "notify", multiplier, at, by: actorId, reason: "Drivers told about the surge" };
  return { ...store, draftRev: store.draftRev + 1, live: { ...store.live, [zoneId]: { ...zoneLive(store, zoneId), lastNotifiedAt: at } }, surgeLog: [event, ...store.surgeLog].slice(0, LOG_LIMIT) };
}

export type QuoteInput = {
  categoryId: string;
  km: number;
  minutes: number;
  waitMin: number;
  stops: number;
  stopWaitMin: number;
  babySeats: number;
  childSeats: number;
  airportPickup: boolean;
  airportDropoff: boolean;
  reservation: boolean;
  surge: number;
  fixedRouteId?: string | null;
};

export type QuoteLine = { label: string; amount: number; kind: "trip" | "surge" | "limit" | "extra" | "fee" };

export type Quote = { lines: QuoteLine[]; total: number; appFee: number; driverGets: number; moveraGets: number; error?: string };

/** What the rider pays for one ride, line by line, and how it splits between driver and Movera. */
export function quoteRide(book: ZoneBook, input: QuoteInput): Quote {
  const price = book.prices[input.categoryId];
  if (!price) return { lines: [], total: 0, appFee: 0, driverGets: 0, moveraGets: 0, error: "Unknown category." };
  if (!price.enabled) return { lines: [], total: 0, appFee: 0, driverGets: 0, moveraGets: 0, error: "This category is off in this zone." };
  const lines: QuoteLine[] = [];
  const route = input.fixedRouteId ? book.routes.find((item) => item.id === input.fixedRouteId && item.categoryId === input.categoryId) : null;
  let ride: number;
  if (route) {
    ride = route.price;
    lines.push({ label: `Fixed price ${route.from} → ${route.to}`, amount: route.price, kind: "trip" });
  } else {
    const distance = price.perKm * input.km;
    const time = price.perMin * input.minutes;
    lines.push({ label: "Base fare", amount: price.base, kind: "trip" });
    lines.push({ label: `${input.km} km × ${short(price.perKm)}`, amount: distance, kind: "trip" });
    lines.push({ label: `${input.minutes} min × ${short(price.perMin)}`, amount: time, kind: "trip" });
    ride = price.base + distance + time;
    const surge = Math.min(Math.max(input.surge, 1), SLIDER_MAX);
    if (surge > 1) {
      const extra = ride * (surge - 1);
      lines.push({ label: `Surge ×${surge.toFixed(1)}`, amount: extra, kind: "surge" });
      ride += extra;
    }
    if (ride < price.minimum) {
      lines.push({ label: "Raised to minimum fare", amount: price.minimum - ride, kind: "limit" });
      ride = price.minimum;
    }
    if (price.maximum > 0 && ride > price.maximum) {
      lines.push({ label: "Capped at maximum fare", amount: price.maximum - ride, kind: "limit" });
      ride = price.maximum;
    }
  }
  let extras = 0;
  const extra = (label: string, amount: number, kind: QuoteLine["kind"] = "extra") => {
    if (amount <= 0) return;
    lines.push({ label, amount, kind });
    extras += amount;
  };
  const paidWait = Math.max(0, input.waitMin - price.freeWaitMin);
  extra(`Waiting ${paidWait} min after ${price.freeWaitMin} free`, paidWait * price.waitPerMin);
  extra(`${input.stops} extra stop${input.stops === 1 ? "" : "s"}`, input.stops * price.extraStopFee);
  extra(`Waiting at stops ${input.stopWaitMin} min`, input.stopWaitMin * price.stopWaitPerMin);
  extra(`${input.babySeats} baby seat${input.babySeats === 1 ? "" : "s"}`, input.babySeats * price.babySeatFee);
  extra(`${input.childSeats} child seat${input.childSeats === 1 ? "" : "s"}`, input.childSeats * price.childSeatFee);
  if (input.airportPickup) extra("Airport pickup", book.fees.airportPickup, "fee");
  if (input.airportDropoff) extra("Airport drop-off", book.fees.airportDropoff, "fee");
  if (input.reservation) extra("Reservation", book.fees.reservationFee, "fee");
  const beforeFee = ride + extras;
  const appFee = beforeFee * (price.appFeePct / 100);
  if (appFee > 0) lines.push({ label: `App fee ${short(price.appFeePct)}%`, amount: appFee, kind: "fee" });
  const total = roundTo(beforeFee + appFee, book.fees.rounding);
  const commission = (book.commission[input.categoryId] ?? 0) / 100;
  const driverGets = roundTo(beforeFee * (1 - commission), 0.01);
  return { lines: lines.map((line) => ({ ...line, amount: roundTo(line.amount, 0.001) })), total, appFee: roundTo(appFee, 0.01), driverGets, moveraGets: roundTo(total - driverGets, 0.01) };
}

export function marketZoneIdsFor(id: MarketId): string[] {
  return MARKETS.find((item) => item.id === id)?.zones.map((zone) => zone.id) ?? [];
}
