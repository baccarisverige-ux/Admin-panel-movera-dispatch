/**
 * Pickup pay: what Movera pays a driver for the drive to the pickup.
 * It is worked out from the driver's live location each time an offer shows,
 * is paid out of Movera's commission, and never changes the rider's price.
 */

/**
 * One pickup-distance range. The whole pickup leg is paid at the rate of the range its km falls into.
 * A range covers km above `fromKm` up to and including `toKm` (the first one also includes 0),
 * so exactly 10 km is in 0–10, not in >10–20. `toKm: null` means "and above".
 */
export type PickupRange = {
  fromKm: number;
  toKm: number | null;
  krPerKm: number;
  krPerMinute: number;
};

export type PickupRate = {
  /** Pickup pay on or off for the whole category. */
  enabled: boolean;
  perKm: number;
  perMin: number;
  /** "First X km not paid", with its own switch. */
  freeKmOn: boolean;
  freeKm: number;
  /** "First X min not paid", with its own switch. */
  freeMinOn: boolean;
  freeMin: number;
  /** Pay by pickup distance. Empty or missing: the single per km / per min rate above is used. */
  ranges?: PickupRange[];
};

export type PickupOfferKind = "radar" | "exclusive" | "exclusiveReservation" | "assigned" | "nextTrip";

/** Offers that can never get pickup pay. */
export type UnpaidOfferKind = "scheduled";

export type PickupDisplay = "total" | "breakdown";

export type PickupPay = {
  rates: Record<string, PickupRate>;
  offers: Record<PickupOfferKind, boolean>;
  /** What the driver's offer card shows: only the total, or the fare with a pickup line. */
  display: PickupDisplay;
};

export const PICKUP_OFFERS: { kind: PickupOfferKind; label: string; hint: string }[] = [
  { kind: "radar", label: "Radar trips", hint: "Each driver who sees the card gets their own amount, from where they are." },
  { kind: "exclusive", label: "Exclusive offers", hint: "For the one driver who gets the offer." },
  { kind: "exclusiveReservation", label: "Exclusive reservations", hint: "Reservations offered as Exclusive, or in Radar near pickup time." },
  { kind: "assigned", label: "Assigned by Movera", hint: "Rides an admin gives to a driver." },
  { kind: "nextTrip", label: "Next trip while driving", hint: "Worked out from the current drop-off to the next pickup." },
];

export const PICKUP_DISPLAYS: { id: PickupDisplay; label: string }[] = [
  { id: "total", label: "Total only" },
  { id: "breakdown", label: "Fare + pickup line" },
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

export type PickupBreakdown = {
  /** Km and minutes that are paid, after the free part. */
  paidKm: number;
  paidMin: number;
  /** Free part actually taken off (0 when its switch is off). */
  freeKm: number;
  freeMin: number;
  kmPay: number;
  minPay: number;
  total: number;
  /** Rates actually used: the matching range's, or the single rate. */
  perKm: number;
  perMin: number;
  /** Index of the range used, or null when the category has no ranges. */
  rangeIndex: number | null;
};

/**
 * Which range a pickup of `km` falls into. A range holds km above its start up to and including its end;
 * the first range also holds 0. Longer than the last closed range uses the last range.
 * Returns -1 when there are no ranges.
 */
export function pickupRangeIndex(ranges: readonly PickupRange[] | undefined, km: number): number {
  if (!ranges?.length) return -1;
  const distance = safe(km);
  const index = ranges.findIndex((range) => range.toKm === null || distance <= range.toKm);
  return index === -1 ? ranges.length - 1 : index;
}

/** The range a pickup of `km` falls into, or undefined when there are no ranges. */
export function pickupRangeFor(ranges: readonly PickupRange[] | undefined, km: number): PickupRange | undefined {
  const index = pickupRangeIndex(ranges, km);
  return index === -1 ? undefined : ranges?.[index];
}

/** "0–10 km", ">10–20 km", ">40 km and above". */
export function rangeLabel(range: PickupRange): string {
  const from = range.fromKm > 0 ? `>${range.fromKm}` : "0";
  return range.toKm === null ? `${from} km and above` : `${from}–${range.toKm} km`;
}

/** Make every range start where the one before it ends (the first starts at 0). */
export function chainRanges(ranges: readonly PickupRange[]): PickupRange[] {
  return ranges.map((range, index) => ({ ...range, fromKm: index === 0 ? 0 : (ranges[index - 1].toKm ?? range.fromKm) }));
}

const NEW_RANGE_KM = 10;

/**
 * Add a range at the end. The first one is 0–10 km at the category's single rate.
 * After that the new range starts where the last ends and is "and above"; an open last range is closed 10 km on.
 */
export function addPickupRange(rate: PickupRate): PickupRange[] {
  const ranges = rate.ranges ?? [];
  if (!ranges.length) return [{ fromKm: 0, toKm: NEW_RANGE_KM, krPerKm: rate.perKm, krPerMinute: rate.perMin }];
  const last = ranges[ranges.length - 1];
  const end = last.toKm ?? last.fromKm + NEW_RANGE_KM;
  return [...ranges.slice(0, -1), { ...last, toKm: end }, { fromKm: end, toKm: null, krPerKm: last.krPerKm, krPerMinute: last.krPerMinute }];
}

/** Remove one range; the ranges after it move down to keep the list without gaps. */
export function removePickupRange(ranges: readonly PickupRange[], index: number): PickupRange[] {
  return chainRanges(ranges.filter((_, i) => i !== index));
}

/** Change one range; the next range's start follows its end. */
export function updatePickupRange(ranges: readonly PickupRange[], index: number, patch: Partial<PickupRange>): PickupRange[] {
  return chainRanges(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));
}

/**
 * Problems in a category's range list: it must start at 0, go up with no gaps or overlaps,
 * every range must end after it starts, only the last may be "and above", and rates are 0 or more.
 */
export function validatePickupRanges(ranges: readonly PickupRange[] | undefined, pathPrefix: string, label: string): PickupProblem[] {
  const problems: PickupProblem[] = [];
  if (!ranges?.length) return problems;
  ranges.forEach((range, index) => {
    const at = `${pathPrefix}.ranges.${index}`;
    const name = `${label}: pickup range ${index + 1}`;
    const expectedFrom = index === 0 ? 0 : ranges[index - 1].toKm;
    if (index === 0 && range.fromKm !== 0) problems.push({ path: `${at}.fromKm`, message: `${name} must start at 0 km.` });
    else if (index > 0 && expectedFrom !== null && range.fromKm !== expectedFrom) {
      problems.push({ path: `${at}.fromKm`, message: `${name} must start at ${expectedFrom} km, where the range before ends (${range.fromKm < expectedFrom ? "overlap" : "gap"}).` });
    }
    if (range.toKm === null) {
      if (index < ranges.length - 1) problems.push({ path: `${at}.toKm`, message: `${name}: only the last range can be "and above".` });
    } else if (!Number.isFinite(range.toKm) || range.toKm <= range.fromKm) {
      problems.push({ path: `${at}.toKm`, message: `${name} must end above ${range.fromKm} km.` });
    }
    for (const [field, what] of [["krPerKm", "per km"], ["krPerMinute", "per minute"]] as const) {
      const value = range[field];
      if (!Number.isFinite(value) || value < 0) problems.push({ path: `${at}.${field}`, message: `${name}: ${what} must be 0 or more.` });
    }
  });
  return problems;
}

/**
 * Pickup pay for one offer:
 * (km − free km, if on) × per km + (min − free min, if on) × per min.
 * With ranges, per km and per min come from the range the full pickup km falls into.
 * Each part is never below 0, there is no cap, and an off category pays 0.
 */
export function pickupPayFor(rate: PickupRate | undefined, km: number, minutes: number): PickupBreakdown {
  const zero: PickupBreakdown = { paidKm: 0, paidMin: 0, freeKm: 0, freeMin: 0, kmPay: 0, minPay: 0, total: 0, perKm: 0, perMin: 0, rangeIndex: null };
  if (!rate || !rate.enabled) return zero;
  const index = pickupRangeIndex(rate.ranges, km);
  const range = index === -1 ? undefined : rate.ranges?.[index];
  const perKm = safe(range ? range.krPerKm : rate.perKm);
  const perMin = safe(range ? range.krPerMinute : rate.perMin);
  const freeKm = rate.freeKmOn ? safe(rate.freeKm) : 0;
  const freeMin = rate.freeMinOn ? safe(rate.freeMin) : 0;
  const paidKm = Math.max(0, safe(km) - freeKm);
  const paidMin = Math.max(0, safe(minutes) - freeMin);
  const kmPay = round2(paidKm * perKm);
  const minPay = round2(paidMin * perMin);
  return { paidKm: round2(paidKm), paidMin: round2(paidMin), freeKm, freeMin, kmPay, minPay, total: round2(kmPay + minPay), perKm, perMin, rangeIndex: range ? index : null };
}

/** Whether an offer of this kind, in this category, gets pickup pay at all. Scheduled-list reservations never do. */
export function offerGetsPickupPay(pay: PickupPay, kind: PickupOfferKind | UnpaidOfferKind, categoryId: string): boolean {
  if (kind === "scheduled") return false;
  return Boolean(pay.offers[kind] && pay.rates[categoryId]?.enabled);
}

export type PickupSplit = {
  riderPays: number;
  driverFare: number;
  pickup: number;
  driverGets: number;
  /** Movera's commission before pickup pay. */
  commission: number;
  moveraKeeps: number;
};

/**
 * How one ride splits once pickup pay is added. The rider's price does not change;
 * the driver gets the fare share plus pickup pay, and Movera keeps its commission minus pickup pay.
 */
export function pickupSplit(riderPays: number, driverFare: number, pickup: number): PickupSplit {
  const commission = round2(riderPays - driverFare);
  return {
    riderPays: round2(riderPays),
    driverFare: round2(driverFare),
    pickup: round2(pickup),
    driverGets: round2(driverFare + pickup),
    commission,
    moveraKeeps: round2(commission - pickup),
  };
}

const SEK_RATES: Record<string, [number, number]> = {
  economy: [2.5, 0.8],
  comfort: [3, 1],
  premium: [4, 1.5],
  priority: [3.5, 1.2],
  xl: [3.5, 1.2],
  electric: [3, 1],
  pet: [3, 1],
  child_seat: [3, 1],
};

/** Default pickup pay in a zone. `factor` turns kronor into the zone's money. */
export function defaultPickupPay(categoryIds: readonly string[], factor = 1): PickupPay {
  const convert = (value: number) => round2(value * factor);
  return {
    rates: Object.fromEntries(categoryIds.map((id) => {
      const [perKm, perMin] = SEK_RATES[id] ?? [3, 1];
      return [id, { enabled: id in SEK_RATES, perKm: convert(perKm), perMin: convert(perMin), freeKmOn: true, freeKm: 1, freeMinOn: true, freeMin: 2 }];
    })),
    offers: { radar: true, exclusive: true, exclusiveReservation: true, assigned: true, nextTrip: true },
    display: "total",
  };
}

/** Fill gaps in stored pickup pay (new categories, older data). */
export function completePickupPay(stored: Partial<PickupPay> | undefined, categoryIds: readonly string[], factor = 1): PickupPay {
  const fallback = defaultPickupPay(categoryIds, factor);
  return {
    rates: Object.fromEntries(categoryIds.map((id) => [id, { ...fallback.rates[id], ...(stored?.rates?.[id] ?? {}) }])),
    offers: { ...fallback.offers, ...(stored?.offers ?? {}) },
    display: stored?.display === "breakdown" ? "breakdown" : "total",
  };
}

export type PickupProblem = { path: string; message: string };

export function validatePickupPay(pay: PickupPay, categories: readonly { id: string; label: string; archived?: unknown }[]): PickupProblem[] {
  const problems: PickupProblem[] = [];
  for (const category of categories.filter((item) => !item.archived)) {
    const rate = pay.rates[category.id];
    if (!rate) continue;
    for (const [field, label] of [["perKm", "pickup per km"], ["perMin", "pickup per min"], ["freeKm", "free pickup km"], ["freeMin", "free pickup minutes"]] as const) {
      const value = rate[field];
      if (!Number.isFinite(value) || value < 0) problems.push({ path: `pickup.${category.id}.${field}`, message: `${category.label}: ${label} must be 0 or more.` });
    }
    problems.push(...validatePickupRanges(rate.ranges, `pickup.${category.id}`, category.label));
  }
  return problems;
}

const OFFER_LABEL = Object.fromEntries(PICKUP_OFFERS.map((item) => [item.kind, item.label])) as Record<PickupOfferKind, string>;

/** Plain-language list of pickup pay changes, for the publish history. */
export function diffPickupPay(before: PickupPay, after: PickupPay, categories: readonly { id: string; label: string }[]): string[] {
  const lines: string[] = [];
  const onOff = (value: boolean) => (value ? "on" : "off");
  for (const category of categories) {
    const a = before.rates[category.id];
    const b = after.rates[category.id];
    if (!a || !b) continue;
    if (a.enabled !== b.enabled) lines.push(`${category.label} · pickup pay turned ${onOff(b.enabled)}`);
    if (a.perKm !== b.perKm) lines.push(`${category.label} · pickup per km ${a.perKm} → ${b.perKm}`);
    if (a.perMin !== b.perMin) lines.push(`${category.label} · pickup per min ${a.perMin} → ${b.perMin}`);
    if (a.freeKmOn !== b.freeKmOn) lines.push(`${category.label} · free pickup km turned ${onOff(b.freeKmOn)}`);
    if (a.freeKm !== b.freeKm) lines.push(`${category.label} · free pickup km ${a.freeKm} → ${b.freeKm}`);
    if (a.freeMinOn !== b.freeMinOn) lines.push(`${category.label} · free pickup minutes turned ${onOff(b.freeMinOn)}`);
    if (a.freeMin !== b.freeMin) lines.push(`${category.label} · free pickup minutes ${a.freeMin} → ${b.freeMin}`);
    const rangesText = (ranges: PickupRange[] | undefined) => (ranges?.length ? ranges.map((range) => `${rangeLabel(range)} ${range.krPerKm}/km ${range.krPerMinute}/min`).join(", ") : "one rate");
    if (rangesText(a.ranges) !== rangesText(b.ranges)) lines.push(`${category.label} · pickup ranges ${rangesText(a.ranges)} → ${rangesText(b.ranges)}`);
  }
  for (const item of PICKUP_OFFERS) {
    if (before.offers[item.kind] !== after.offers[item.kind]) lines.push(`Pickup pay for ${OFFER_LABEL[item.kind]} turned ${onOff(after.offers[item.kind])}`);
  }
  if (before.display !== after.display) lines.push(`Offer card shows ${PICKUP_DISPLAYS.find((item) => item.id === after.display)?.label}`);
  return lines;
}

/** Copy pickup pay to another zone, converting money with `convert`. */
export function convertPickupPay(pay: PickupPay, convert: (value: number) => number): PickupPay {
  return {
    ...structuredClone(pay),
    rates: Object.fromEntries(Object.entries(pay.rates).map(([id, rate]) => [id, {
      ...rate,
      perKm: convert(rate.perKm),
      perMin: convert(rate.perMin),
      ...(rate.ranges ? { ranges: rate.ranges.map((range) => ({ ...range, krPerKm: convert(range.krPerKm), krPerMinute: convert(range.krPerMinute) })) } : {}),
    }])),
  };
}
