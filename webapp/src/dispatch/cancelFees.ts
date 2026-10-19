import { market, type MarketId } from "../markets/markets.ts";
import { BUILT_IN_CATEGORIES, fromSek } from "../pricing/zonePricing.ts";

/**
 * Rider cancel fees, per zone and per car type, with two rule sets:
 * live trips (Radar and live Exclusive) are free for some minutes after the driver accepts,
 * reservations (booked rides, Exclusive reservations too) are free until some minutes before pickup.
 */

export type CancelFeeKind = "live" | "reservation";
export type CancelFeeType = "fixed" | "percent";
/**
 * One car type's rule. freeMin: minutes after accept (live) or before pickup (reservation).
 * value: major units of the zone's money when fixed, % of the trip price when percent.
 * min and max (major units, null = none) only count for a % fee.
 */
export type CancelFeeRow = { freeMin: number; type: CancelFeeType; value: number; min: number | null; max: number | null };
/**
 * Rows by car type id (Pricing's category ids). A car type without a row uses the table's Economy row (or its first row)
 * until the admin changes it; rows of car types that were deleted in Pricing stay stored but are never shown or used.
 */
export type CancelFeeTable = Record<string, CancelFeeRow>;
/** A car type as Pricing lists it. */
export type FeeCategory = { id: string; label: string };

/** Pricing's built-in car types, for places that do not read the Pricing list (rules checks, the rules file). */
export const DEFAULT_FEE_CATEGORIES: FeeCategory[] = BUILT_IN_CATEGORIES.filter((item) => !item.archived).map(({ id, label }) => ({ id, label }));
/** The car types with their own starting rule; any other car type starts as a copy of Economy. */
const SEEDED = ["economy", "comfort", "premium", "xl"] as const;
/** Longest free-cancel window the rider app accepts for a reservation: one week. */
export const RESERVATION_FREE_MAX_MIN = 7 * 24 * 60;
export const CANCEL_FEE_LIMITS = {
  liveFreeMax: 15,
  reservationFreeMax: RESERVATION_FREE_MAX_MIN,
  fixedMax: 1000,
  pctMax: 100,
} as const;

/** The starting rules in Sweden; other countries get the same amounts in their own money. */
const SEK_DEFAULTS: Record<CancelFeeKind, Record<(typeof SEEDED)[number], CancelFeeRow>> = {
  live: {
    economy: { freeMin: 2, type: "fixed", value: 35, min: null, max: null },
    comfort: { freeMin: 2, type: "fixed", value: 45, min: null, max: null },
    premium: { freeMin: 3, type: "percent", value: 15, min: 50, max: 150 },
    xl: { freeMin: 3, type: "percent", value: 15, min: 50, max: 150 },
  },
  reservation: {
    economy: { freeMin: 60, type: "fixed", value: 50, min: null, max: null },
    comfort: { freeMin: 60, type: "fixed", value: 60, min: null, max: null },
    premium: { freeMin: 120, type: "percent", value: 25, min: 80, max: 300 },
    xl: { freeMin: 120, type: "percent", value: 25, min: 80, max: 300 },
  },
};

export function cancelFeeDefaults(kind: CancelFeeKind, country: MarketId = "SE"): CancelFeeTable {
  const money = (value: number | null) => (value === null ? null : fromSek(value, country));
  return Object.fromEntries(SEEDED.map((id) => {
    const row = SEK_DEFAULTS[kind][id];
    return [id, { ...row, value: row.type === "fixed" ? fromSek(row.value, country) : row.value, min: money(row.min), max: money(row.max) }];
  })) as CancelFeeTable;
}

/** Older saves had one free time and one fixed fee for every car type: each row gets them. */
export function legacyCancelFees(freeMin: number, fee: number): CancelFeeTable {
  return Object.fromEntries(SEEDED.map((id) => [id, { freeMin, type: "fixed", value: fee, min: null, max: null }])) as CancelFeeTable;
}

const FREE_ROW: CancelFeeRow = { freeMin: 0, type: "fixed", value: 0, min: null, max: null };

/** The rule for one car type: its own row, else a copy of the table's Economy row, else its first row. */
export function feeRow(table: CancelFeeTable, categoryId: string): CancelFeeRow {
  const own = Object.prototype.hasOwnProperty.call(table, categoryId) ? table[categoryId] : undefined;
  return { ...(own ?? table.economy ?? Object.values(table)[0] ?? FREE_ROW) };
}

/** One row per listed car type, each filled with feeRow. */
export function feeRows(table: CancelFeeTable, categories: readonly FeeCategory[]): CancelFeeTable {
  return Object.fromEntries(categories.map(({ id }) => [id, feeRow(table, id)]));
}

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function completeRow(stored: unknown, base: CancelFeeRow): CancelFeeRow {
  const own = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const optional = (value: unknown, otherwise: number | null) => (value === null ? null : isNum(value) ? value : otherwise);
  return {
    freeMin: isNum(own.freeMin) ? own.freeMin : base.freeMin,
    type: own.type === "fixed" || own.type === "percent" ? own.type : base.type,
    value: isNum(own.value) ? own.value : base.value,
    min: optional(own.min, base.min),
    max: optional(own.max, base.max),
  };
}

/**
 * A table from a save: missing or broken values come from the fallback, row by row. Rows of any car type are kept;
 * one the fallback does not know is completed from the (stored) Economy row.
 */
export function completeCancelFees(stored: unknown, fallback: CancelFeeTable): CancelFeeTable {
  const raw = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
  const isRow = (id: string) => Boolean(raw[id]) && typeof raw[id] === "object" && !Array.isArray(raw[id]);
  const ids = [...Object.keys(fallback), ...Object.keys(raw).filter((id) => !(id in fallback) && isRow(id))];
  const economy = completeRow(raw.economy, feeRow(fallback, "economy"));
  return Object.fromEntries(ids.map((id) => [id, completeRow(raw[id], fallback[id] ?? economy)]));
}

/**
 * The fee for one trip: fixed, or % of the trip price kept between min and max. Like the apps (contracts/fixtures/cancel_fees.json),
 * a % fee is rounded half-up to a whole minor unit (öre, cent, millime) before the clamp, not to the display step.
 */
export function cancelFeeAmount(row: CancelFeeRow, fare: number, country: MarketId): number {
  if (row.type === "fixed") return Math.max(0, row.value);
  const minor = market(country).minorUnits;
  let amount = Math.round((Math.round(Math.max(0, fare) * minor) * row.value) / 100) / minor;
  if (row.min !== null) amount = Math.max(amount, row.min);
  if (row.max !== null) amount = Math.min(amount, row.max);
  return Math.max(0, amount);
}

/** Every listed car type gets the same rule as one of them ("Same for all car types"). Other stored rows stay. */
export function sameForAll(table: CancelFeeTable, from: string, categories: readonly FeeCategory[]): CancelFeeTable {
  const row = feeRow(table, from);
  return { ...table, ...Object.fromEntries(categories.map(({ id }) => [id, { ...row }])) };
}

/** Problems that stop a save, one line per car type and problem. */
export function cancelFeeIssues(table: CancelFeeTable, kind: CancelFeeKind, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES): string[] {
  const issues: string[] = [];
  const prefix = kind === "live" ? "Rider cancels" : "Reservations";
  const freeMax = kind === "live" ? CANCEL_FEE_LIMITS.liveFreeMax : CANCEL_FEE_LIMITS.reservationFreeMax;
  // A car type without its own row uses Economy's, so its problems show once, under Economy (or the first such car type).
  const own = (id: string) => Object.prototype.hasOwnProperty.call(table, id);
  const fallbackShown = categories.some(({ id }) => id === "economy" && own(id));
  const firstCopy = categories.find(({ id }) => !own(id));
  for (const { id, label } of categories.filter((item) => own(item.id) || (!fallbackShown && item.id === firstCopy?.id))) {
    const row = feeRow(table, id);
    const where = `${prefix}, ${label}`;
    if (kind === "live" && (!isNum(row.freeMin) || row.freeMin < 0 || row.freeMin > freeMax)) issues.push(`${where}: free cancel must be 0 to ${freeMax} minutes after the driver accepts.`);
    if (kind === "reservation" && (!Number.isInteger(row.freeMin) || row.freeMin < 0 || row.freeMin > freeMax)) issues.push(`${where}: free cancel must end 0 to ${freeMax} minutes (7 days) before pickup, in whole minutes.`);
    if (row.type === "fixed" && (!isNum(row.value) || row.value < 0 || row.value > CANCEL_FEE_LIMITS.fixedMax)) issues.push(`${where}: the fixed fee must be 0 to ${CANCEL_FEE_LIMITS.fixedMax}.`);
    if (row.type === "percent") {
      if (!isNum(row.value) || row.value < 0 || row.value > CANCEL_FEE_LIMITS.pctMax) issues.push(`${where}: the fee must be 0 to 100% of the price.`);
      if ([row.min, row.max].some((value) => value !== null && (!isNum(value) || value < 0 || value > CANCEL_FEE_LIMITS.fixedMax))) issues.push(`${where}: the lowest and highest fee must be 0 to ${CANCEL_FEE_LIMITS.fixedMax}.`);
      else if (row.min !== null && row.max !== null && row.min > row.max) issues.push(`${where}: the lowest fee must not be more than the highest.`);
    }
  }
  return issues;
}

function clockText(totalMin: number): string {
  const value = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/**
 * What the rider sees, in words: "Free cancel for 2 min after the driver accepts · then 45 kr", or for a booked ride
 * picked up at pickupMin (minutes after midnight) "Free cancel until 12:00 · then 105 kr" with the % rule as detail.
 */
export function riderSeesLine(kind: CancelFeeKind, row: CancelFeeRow, fare: number, country: MarketId, money: (value: number) => string, pickupMin = 14 * 60): { line: string; detail: string } {
  const amount = cancelFeeAmount(row, fare, country);
  let free: string;
  if (kind === "live") free = row.freeMin > 0 ? `Free cancel for ${row.freeMin} min after the driver accepts` : "No free cancel after the driver accepts";
  else {
    const until = pickupMin - row.freeMin;
    const daysBefore = Math.ceil(-until / 1440);
    free = `Free cancel until ${clockText(until)}${daysBefore > 0 ? `, ${daysBefore === 1 ? "the day" : `${daysBefore} days`} before` : ""}`;
  }
  const line = amount > 0 ? `${free} · then ${money(amount)}` : `${free} · no fee after`;
  if (row.type === "fixed") return { line, detail: "" };
  const limits = row.min !== null && row.max !== null ? `between ${money(row.min)} and ${money(row.max)}`
    : row.min !== null ? `at least ${money(row.min)}`
    : row.max !== null ? `at most ${money(row.max)}` : `of ${money(fare)}`;
  return { line, detail: `(${row.value}%${row.min !== null || row.max !== null ? ", " : " "}${limits})` };
}
