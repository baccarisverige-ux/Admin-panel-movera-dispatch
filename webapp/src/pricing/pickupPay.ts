/**
 * Pickup pay, per zone and category. Two separate sides:
 *
 * - DRIVER side (paid by Movera out of its share): what the driver gets for the drive to the pickup, worked out from
 *   the driver's live location each time an offer shows. Set as distance ranges only; each km is paid at the rate of
 *   the range it falls in (tiered), the minutes are split across the ranges in proportion to the km in each, and one
 *   optional maximum per ride caps the total. The driver only ever sees the total amount.
 * - RIDER side: a fixed pickup fee (no ranges) the rider pays as a line in the price, one amount for live rides
 *   (Radar and Exclusive) and one for reservations, each with its own on/off. Movera keeps it.
 *
 * The rider's price never depends on which driver comes or how far away they are.
 */

/**
 * One pickup-distance range. The first starts at 0 km; every next one starts where the one before ends.
 * `toKm: null` means "and above" (only the last range). Rates of 0 make the range free.
 */
export type PickupRange = {
  fromKm: number;
  toKm: number | null;
  krPerKm: number;
  krPerMinute: number;
};

/** A fixed amount the rider pays, with its own switch. */
export type RiderFee = { on: boolean; amount: number };

export type PickupRate = {
  /** Driver pickup pay on or off for the whole category. */
  enabled: boolean;
  /** The driver never gets more than this for one pickup, whatever the ranges add up to. null = no maximum. */
  maxPerRide: number | null;
  /** Always at least one range. */
  ranges: PickupRange[];
  /** The rider's fixed pickup fee: live rides (Radar and Exclusive) and reservations. */
  riderFee: { live: RiderFee; reservation: RiderFee };
};

export type PickupOfferKind = "radar" | "exclusive" | "exclusiveReservation" | "assigned" | "nextTrip";

/** Offers that can never get pickup pay. */
export type UnpaidOfferKind = "scheduled";

export type PickupPay = {
  rates: Record<string, PickupRate>;
  offers: Record<PickupOfferKind, boolean>;
};

export const PICKUP_OFFERS: { kind: PickupOfferKind; label: string; hint: string }[] = [
  { kind: "radar", label: "Radar trips", hint: "Each driver who sees the card gets their own amount, from where they are." },
  { kind: "exclusive", label: "Exclusive offers", hint: "For the one driver who gets the offer." },
  { kind: "exclusiveReservation", label: "Exclusive reservations", hint: "Reservations offered as Exclusive, or in Radar near pickup time." },
  { kind: "assigned", label: "Assigned by Movera", hint: "Rides an admin gives to a driver." },
  { kind: "nextTrip", label: "Next trip while driving", hint: "Worked out from the current drop-off to the next pickup." },
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** One range's share of a pickup. */
export type PickupPart = {
  rangeIndex: number;
  km: number;
  minutes: number;
  kmPay: number;
  minPay: number;
  pay: number;
};

export type PickupBreakdown = {
  parts: PickupPart[];
  kmPay: number;
  minPay: number;
  /** What the ranges add up to, before the maximum. */
  beforeMax: number;
  /** What the driver gets: beforeMax, or the maximum when it is lower. */
  total: number;
  capped: boolean;
};

const ZERO: PickupBreakdown = { parts: [], kmPay: 0, minPay: 0, beforeMax: 0, total: 0, capped: false };

/**
 * Which range a pickup of `km` falls into. A range holds km above its start up to and including its end;
 * the first range also holds 0. Longer than the last closed range uses the last range. -1 when there are no ranges.
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

/** The one range every category starts with: everything, at one rate. */
export function singleRange(perKm = 0, perMin = 0): PickupRange[] {
  return [{ fromKm: 0, toKm: null, krPerKm: perKm, krPerMinute: perMin }];
}

/**
 * Add a range at the end. The new range starts where the last ends and is "and above";
 * an open last range is closed 10 km on, and the new one keeps its rates.
 */
export function addPickupRange(rate: PickupRate): PickupRange[] {
  const ranges = rate.ranges.length ? rate.ranges : singleRange();
  const last = ranges[ranges.length - 1];
  const end = last.toKm ?? last.fromKm + NEW_RANGE_KM;
  return [...ranges.slice(0, -1), { ...last, toKm: end }, { fromKm: end, toKm: null, krPerKm: last.krPerKm, krPerMinute: last.krPerMinute }];
}

/** Remove one range; the ranges after it move down to keep the list without gaps. The last range cannot be removed. */
export function removePickupRange(ranges: readonly PickupRange[], index: number): PickupRange[] {
  if (ranges.length <= 1) return [...ranges];
  return chainRanges(ranges.filter((_, i) => i !== index));
}

/** Change one range; the next range's start follows its end. */
export function updatePickupRange(ranges: readonly PickupRange[], index: number, patch: Partial<PickupRange>): PickupRange[] {
  return chainRanges(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));
}

export type PickupProblem = { path: string; message: string };

/**
 * Problems in a category's range list: there must be at least one, it must start at 0, go up with no gaps or
 * overlaps, every range must end after it starts, only the last may be "and above", and rates are 0 or more.
 */
export function validatePickupRanges(ranges: readonly PickupRange[] | undefined, pathPrefix: string, label: string): PickupProblem[] {
  const problems: PickupProblem[] = [];
  if (!ranges?.length) return [{ path: `${pathPrefix}.ranges.0.fromKm`, message: `${label} needs at least one pickup range.` }];
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

/** Index of each range that pays less per km than the one before it (allowed, but worth a note). */
export function cheaperFartherRanges(ranges: readonly PickupRange[]): number[] {
  return ranges.flatMap((range, index) => (index > 0 && range.krPerKm < ranges[index - 1].krPerKm ? [index] : []));
}

/**
 * Driver pickup pay for one offer, tiered:
 * every km is paid at the rate of the range it falls in; the minutes are split across the ranges in proportion to
 * the km driven in each (0 km: all minutes in the first range). Longer than a closed last range uses the last range.
 * The total is then capped at the maximum per ride, when one is set. An off category pays 0.
 */
export function pickupPayFor(rate: PickupRate | undefined, km: number, minutes: number): PickupBreakdown {
  if (!rate || !rate.enabled || !rate.ranges.length) return ZERO;
  const distance = safe(km);
  const time = safe(minutes);
  const ranges = rate.ranges;
  const parts: PickupPart[] = [];
  ranges.forEach((range, index) => {
    const last = index === ranges.length - 1;
    const end = range.toKm === null || last ? Number.POSITIVE_INFINITY : range.toKm;
    const inRange = Math.max(0, Math.min(distance, end) - range.fromKm);
    const share = distance > 0 ? inRange / distance : index === 0 ? 1 : 0;
    if (inRange <= 0 && share <= 0) return;
    const partMinutes = time * share;
    const kmPay = round2(inRange * safe(range.krPerKm));
    const minPay = round2(partMinutes * safe(range.krPerMinute));
    parts.push({ rangeIndex: index, km: round2(inRange), minutes: round2(partMinutes), kmPay, minPay, pay: round2(kmPay + minPay) });
  });
  const kmPay = round2(parts.reduce((sum, part) => sum + part.kmPay, 0));
  const minPay = round2(parts.reduce((sum, part) => sum + part.minPay, 0));
  const beforeMax = round2(kmPay + minPay);
  const max = rate.maxPerRide;
  const capped = max !== null && Number.isFinite(max) && max >= 0 && beforeMax > max;
  return { parts, kmPay, minPay, beforeMax, total: capped ? round2(max) : beforeMax, capped };
}

/**
 * From which km the maximum per ride applies, keeping the example's minutes per km. null when there is no
 * maximum or it is never reached within 300 km.
 */
export function maxReachedAtKm(rate: PickupRate | undefined, minutesPerKm: number): number | null {
  if (!rate?.enabled || rate.maxPerRide === null) return null;
  for (let km = 0; km <= 300; km = round2(km + 0.1)) {
    if (pickupPayFor(rate, km, km * safe(minutesPerKm)).capped) return km;
  }
  return null;
}

/** Whether an offer of this kind, in this category, gets driver pickup pay at all. Scheduled-list reservations never do. */
export function offerGetsPickupPay(pay: PickupPay, kind: PickupOfferKind | UnpaidOfferKind, categoryId: string): boolean {
  if (kind === "scheduled") return false;
  return Boolean(pay.offers[kind] && pay.rates[categoryId]?.enabled);
}

/** The fixed pickup fee the rider pays for this category: the live or the reservation amount, 0 when that one is off. */
export function riderPickupFee(pay: PickupPay | undefined, categoryId: string, reservation: boolean): number {
  const fee = pay?.rates[categoryId]?.riderFee;
  if (!fee) return 0;
  const own = reservation ? fee.reservation : fee.live;
  return own.on ? safe(own.amount) : 0;
}

export type PickupSplit = {
  riderPays: number;
  /** The fixed pickup fee inside riderPays (0 when off). */
  riderFee: number;
  driverFare: number;
  pickup: number;
  driverGets: number;
  /** Movera's share before pickup pay: the rider's price minus the driver's fare share. */
  commission: number;
  /** What Movera keeps once the driver's pickup pay is paid; below 0 Movera covers the difference. */
  moveraKeeps: number;
};

/**
 * How one ride splits once pickup pay is added. The rider pays the quoted price (its fixed pickup fee included);
 * the driver gets the fare share plus the pickup pay; Movera keeps the rest, and covers it when that is below 0.
 */
export function pickupSplit(riderPays: number, driverFare: number, pickup: number, riderFee = 0): PickupSplit {
  const commission = round2(riderPays - driverFare);
  return {
    riderPays: round2(riderPays),
    riderFee: round2(riderFee),
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

/** Default rider pickup fee in kronor: live rides and reservations. Off until an admin turns it on. */
const SEK_RIDER_FEE = { live: 15, reservation: 20 };

/** Default pickup pay in a zone: the first km free, then the category's rate. `factor` turns kronor into the zone's money. */
export function defaultPickupPay(categoryIds: readonly string[], factor = 1): PickupPay {
  const convert = (value: number) => round2(value * factor);
  return {
    rates: Object.fromEntries(categoryIds.map((id) => {
      const [perKm, perMin] = SEK_RATES[id] ?? [3, 1];
      const rate: PickupRate = {
        enabled: id in SEK_RATES,
        maxPerRide: null,
        ranges: [
          { fromKm: 0, toKm: 1, krPerKm: 0, krPerMinute: 0 },
          { fromKm: 1, toKm: null, krPerKm: convert(perKm), krPerMinute: convert(perMin) },
        ],
        riderFee: { live: { on: false, amount: convert(SEK_RIDER_FEE.live) }, reservation: { on: false, amount: convert(SEK_RIDER_FEE.reservation) } },
      };
      return [id, rate];
    })),
    offers: { radar: true, exclusive: true, exclusiveReservation: true, assigned: true, nextTrip: true },
  };
}

/** Older saved shape: one rate for every distance plus free first km / minutes, ranges on top. */
type LegacyRate = Partial<PickupRate> & {
  perKm?: number;
  perMin?: number;
  freeKmOn?: boolean;
  freeKm?: number;
  freeMinOn?: boolean;
  freeMin?: number;
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Ranges for stored data of any age. Saved ranges are kept; a saved free first km becomes a 0-rate first range
 * (the ranges after it move up to start where it ends). The old single rate becomes one "and above" range.
 * Free first minutes have no place in the new shape and are dropped.
 */
export function migrateRanges(stored: LegacyRate | undefined, fallback: PickupRange[]): PickupRange[] {
  if (!stored) return fallback;
  const freeKm = stored.freeKmOn && isNumber(stored.freeKm) && stored.freeKm > 0 ? stored.freeKm : 0;
  let ranges: PickupRange[];
  if (Array.isArray(stored.ranges) && stored.ranges.length) {
    ranges = stored.ranges.map((range) => ({ ...range }));
    if (freeKm > 0) {
      const kept = ranges.filter((range) => range.toKm === null || range.toKm > freeKm);
      ranges = chainRanges([{ fromKm: 0, toKm: freeKm, krPerKm: 0, krPerMinute: 0 }, ...kept]);
    }
  } else if (isNumber(stored.perKm) || isNumber(stored.perMin)) {
    const perKm = isNumber(stored.perKm) ? stored.perKm : 0;
    const perMin = isNumber(stored.perMin) ? stored.perMin : 0;
    ranges = freeKm > 0
      ? [{ fromKm: 0, toKm: freeKm, krPerKm: 0, krPerMinute: 0 }, { fromKm: freeKm, toKm: null, krPerKm: perKm, krPerMinute: perMin }]
      : singleRange(perKm, perMin);
  } else {
    return fallback;
  }
  return ranges;
}

function completeRiderFee(stored: Partial<PickupRate["riderFee"]> | undefined, fallback: PickupRate["riderFee"]): PickupRate["riderFee"] {
  const one = (own: Partial<RiderFee> | undefined, base: RiderFee): RiderFee => ({ on: typeof own?.on === "boolean" ? own.on : base.on, amount: isNumber(own?.amount) ? own.amount : base.amount });
  return { live: one(stored?.live, fallback.live), reservation: one(stored?.reservation, fallback.reservation) };
}

/** Fill gaps in stored pickup pay (new categories, older data), converting the old shape to ranges. */
export function completePickupPay(stored: Partial<PickupPay> | undefined, categoryIds: readonly string[], factor = 1): PickupPay {
  const fallback = defaultPickupPay(categoryIds, factor);
  return {
    rates: Object.fromEntries(categoryIds.map((id) => {
      const base = fallback.rates[id];
      const own = stored?.rates?.[id] as LegacyRate | undefined;
      const rate: PickupRate = {
        enabled: typeof own?.enabled === "boolean" ? own.enabled : base.enabled,
        maxPerRide: isNumber(own?.maxPerRide) && own.maxPerRide >= 0 ? own.maxPerRide : null,
        ranges: migrateRanges(own, base.ranges),
        riderFee: completeRiderFee(own?.riderFee, base.riderFee),
      };
      return [id, rate];
    })),
    offers: { ...fallback.offers, ...(stored?.offers ?? {}) },
  };
}

export function validatePickupPay(pay: PickupPay, categories: readonly { id: string; label: string; archived?: unknown }[]): PickupProblem[] {
  const problems: PickupProblem[] = [];
  for (const category of categories.filter((item) => !item.archived)) {
    const rate = pay.rates[category.id];
    if (!rate) continue;
    if (rate.maxPerRide !== null && (!Number.isFinite(rate.maxPerRide) || rate.maxPerRide < 0)) problems.push({ path: `pickup.${category.id}.maxPerRide`, message: `${category.label}: maximum pickup pay per ride must be 0 or more.` });
    for (const [side, label] of [["live", "rider pickup fee for live rides"], ["reservation", "rider pickup fee for reservations"]] as const) {
      const amount = rate.riderFee[side].amount;
      if (!Number.isFinite(amount) || amount < 0) problems.push({ path: `pickup.${category.id}.riderFee.${side}`, message: `${category.label}: ${label} must be 0 or more.` });
    }
    problems.push(...validatePickupRanges(rate.ranges, `pickup.${category.id}`, category.label));
  }
  return problems;
}

const OFFER_LABEL = Object.fromEntries(PICKUP_OFFERS.map((item) => [item.kind, item.label])) as Record<PickupOfferKind, string>;

/** "0–1 km 0/km 0/min, >1 km and above 3/km 1/min". */
export function rangesText(ranges: readonly PickupRange[] | undefined): string {
  return ranges?.length ? ranges.map((range) => `${rangeLabel(range)} ${range.krPerKm}/km ${range.krPerMinute}/min`).join(", ") : "none";
}

/** Plain-language list of pickup pay changes, for the publish history. */
export function diffPickupPay(before: PickupPay, after: PickupPay, categories: readonly { id: string; label: string }[]): string[] {
  const lines: string[] = [];
  const onOff = (value: boolean) => (value ? "on" : "off");
  const maxText = (value: number | null) => (value === null ? "none" : String(value));
  for (const category of categories) {
    const a = before.rates[category.id];
    const b = after.rates[category.id];
    if (!a || !b) continue;
    if (a.enabled !== b.enabled) lines.push(`${category.label} · pickup pay turned ${onOff(b.enabled)}`);
    if (a.maxPerRide !== b.maxPerRide) lines.push(`${category.label} · pickup pay maximum per ride ${maxText(a.maxPerRide)} → ${maxText(b.maxPerRide)}`);
    if (rangesText(a.ranges) !== rangesText(b.ranges)) lines.push(`${category.label} · pickup ranges ${rangesText(a.ranges)} → ${rangesText(b.ranges)}`);
    for (const [side, label] of [["live", "live rides"], ["reservation", "reservations"]] as const) {
      const x = a.riderFee[side];
      const y = b.riderFee[side];
      if (x.on !== y.on) lines.push(`${category.label} · rider pickup fee for ${label} turned ${onOff(y.on)}`);
      if (x.amount !== y.amount) lines.push(`${category.label} · rider pickup fee for ${label} ${x.amount} → ${y.amount}`);
    }
  }
  for (const item of PICKUP_OFFERS) {
    if (before.offers[item.kind] !== after.offers[item.kind]) lines.push(`Pickup pay for ${OFFER_LABEL[item.kind]} turned ${onOff(after.offers[item.kind])}`);
  }
  return lines;
}

/** Copy pickup pay to another zone, converting every amount with `convert` (km stay). */
export function convertPickupPay(pay: PickupPay, convert: (value: number) => number): PickupPay {
  return {
    offers: { ...pay.offers },
    rates: Object.fromEntries(Object.entries(pay.rates).map(([id, rate]) => [id, {
      enabled: rate.enabled,
      maxPerRide: rate.maxPerRide === null ? null : convert(rate.maxPerRide),
      ranges: rate.ranges.map((range) => ({ ...range, krPerKm: convert(range.krPerKm), krPerMinute: convert(range.krPerMinute) })),
      riderFee: {
        live: { on: rate.riderFee.live.on, amount: convert(rate.riderFee.live.amount) },
        reservation: { on: rate.riderFee.reservation.on, amount: convert(rate.riderFee.reservation.amount) },
      },
    } satisfies PickupRate])),
  };
}
