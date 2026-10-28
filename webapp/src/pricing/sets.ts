import { ZONES } from "../api/seed.ts";
import { formatSek } from "../data/catalog.ts";

export const CATEGORY_IDS = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"] as const;
export type PriceCategoryId = (typeof CATEGORY_IDS)[number];

export const CATEGORY_INFO: { id: PriceCategoryId; label: string; line: string; badge: string; eligibility: string }[] = [
  { id: "economy", label: "Movera", line: "Everyday ride", badge: "Standard", eligibility: "4 seats, year 2015 or newer" },
  { id: "comfort", label: "Comfort", line: "Extra comfort", badge: "Plush", eligibility: "4 seats, year 2018 or newer" },
  { id: "premium", label: "Premium", line: "Premium service", badge: "Luxury", eligibility: "4 seats, year 2020 or newer" },
  { id: "priority", label: "Priority", line: "Faster pickup", badge: "Priority", eligibility: "Acceptance at least 90 percent" },
  { id: "xl", label: "Movera XL", line: "More seats", badge: "XL", eligibility: "6 seats" },
  { id: "electric", label: "Electric", line: "Low emissions", badge: "Eco", eligibility: "Electric vehicle" },
  { id: "pet", label: "Pet", line: "Pet friendly", badge: "Carrier OK", eligibility: "Driver accepts pets" },
];

export const RIDE_OPTION_INFO = [
  { id: "baby_seat", label: "Baby seat", note: "Infant seat" },
  { id: "child_seat", label: "Child seat", note: "Kids safe" },
  { id: "booster_seat", label: "Booster seat", note: "Child seat" },
  { id: "extra_bags", label: "Extra bags", note: "Luggage" },
  { id: "pet", label: "Pet", note: "Carrier OK" },
] as const;

export type Rate = { pickup: number; perKm: number; perMin: number; minimum: number; maximum: number };

export type ZonePrice = {
  zoneId: string;
  zoneName: string;
  version: number;
  rates: Record<PriceCategoryId, Rate>;
  adjustMin: number;
  adjustMax: number;
  adjustStep: number;
  reservationFee: number;
  bookingFee: number;
  airportFee: number;
  eventFee: number;
  waitingPerMin: number;
  quoteSeconds: number;
  tips: number[];
  boostManual: number;
  boostScheduled: number;
  boostAuto: number;
  boostCap: number;
  commission: Record<PriceCategoryId, number>;
  fleetCommission: number;
  optionFee: Record<string, number>;
  enabledCategories: Record<PriceCategoryId, boolean>;
  enabledOptions: Record<string, boolean>;
};

const BASE: Record<PriceCategoryId, Rate> = {
  economy: { pickup: 29, perKm: 12, perMin: 4, minimum: 49, maximum: 1500 },
  comfort: { pickup: 39, perKm: 15, perMin: 5, minimum: 69, maximum: 2200 },
  premium: { pickup: 59, perKm: 22, perMin: 7, minimum: 99, maximum: 3500 },
  priority: { pickup: 49, perKm: 16, perMin: 6, minimum: 79, maximum: 2500 },
  xl: { pickup: 49, perKm: 18, perMin: 6, minimum: 79, maximum: 2800 },
  electric: { pickup: 35, perKm: 13, perMin: 4, minimum: 59, maximum: 1800 },
  pet: { pickup: 39, perKm: 14, perMin: 5, minimum: 69, maximum: 2000 },
};

export type PriceBook = { zones: ZonePrice[] };

function zonePrice(zoneId: string, zoneName: string): ZonePrice {
  const commission = Object.fromEntries(CATEGORY_IDS.map((id) => [id, id === "premium" || id === "xl" ? 20 : 15])) as Record<PriceCategoryId, number>;
  const optionFee = Object.fromEntries(RIDE_OPTION_INFO.map((item) => [item.id, item.id === "pet" ? 30 : 20]));
  const enabledCategories = Object.fromEntries(CATEGORY_IDS.map((id) => [id, true])) as Record<PriceCategoryId, boolean>;
  const enabledOptions = Object.fromEntries(RIDE_OPTION_INFO.map((item) => [item.id, true]));
  return {
    zoneId,
    zoneName,
    version: 1,
    rates: structuredClone(BASE),
    adjustMin: 65,
    adjustMax: 180,
    adjustStep: 5,
    reservationFee: 25,
    bookingFee: 0,
    airportFee: zoneId === "ARN" || zoneId === "BMA" ? 40 : 0,
    eventFee: 0,
    waitingPerMin: 6,
    quoteSeconds: 120,
    tips: [10, 20, 30],
    boostManual: 1.5,
    boostScheduled: 2,
    boostAuto: 1.8,
    boostCap: 2.5,
    commission,
    fleetCommission: 12,
    optionFee,
    enabledCategories,
    enabledOptions,
  };
}

export function defaultPriceBook(): PriceBook {
  return { zones: ZONES.map(([id, name]) => zonePrice(id, name)) };
}

export function defaultRate(category: PriceCategoryId): Rate {
  return { ...BASE[category] };
}

export function ruleVersion(zone: ZonePrice, category: PriceCategoryId): string {
  const same = JSON.stringify(zone.rates[category]) === JSON.stringify(BASE[category]) && zone.version === 1;
  if (same) return "price-3";
  return `price-${zone.zoneId}-v${zone.version}`;
}

export function quoteZone(zone: ZonePrice, category: PriceCategoryId, km: number, minutes: number) {
  const rate = zone.rates[category];
  const distance = Math.max(0, km);
  const duration = Math.max(0, minutes);
  const pickup = rate.pickup;
  const distanceKr = distance * rate.perKm;
  const timeKr = duration * rate.perMin;
  const raw = pickup + distanceKr + timeKr;
  const total = Math.min(rate.maximum, Math.max(rate.minimum, raw));
  return {
    pickup,
    perKm: rate.perKm,
    perMin: rate.perMin,
    distance,
    duration,
    distanceKr,
    timeKr,
    raw,
    total,
    label: formatSek(total),
    ruleVersion: ruleVersion(zone, category),
    minimumApplied: raw < rate.minimum,
    maximumApplied: raw > rate.maximum,
  };
}

export const PLACES = [
  { id: "central", name: "Centralstation", km: 0 },
  { id: "slussen", name: "Slussen", km: 10 },
  { id: "odenplan", name: "Odenplan", km: 4 },
  { id: "arlanda", name: "Arlanda", km: 42 },
  { id: "globen", name: "Globen", km: 8 },
] as const;

export function distanceBetween(fromId: string, toId: string): number {
  const from = PLACES.find((place) => place.id === fromId)?.km ?? 0;
  const to = PLACES.find((place) => place.id === toId)?.km ?? 0;
  return Math.abs(to - from) || 10;
}
