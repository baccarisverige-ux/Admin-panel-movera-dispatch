import type { SettingsBook } from "../drivers/onboardingSettings.ts";
import type { DemoRecord } from "../api/seed.ts";
import type { DocStatus, Vehicle } from "../drivers/gate.ts";
import { EXPIRY_WARNING_DAYS, docHealth, type DocHealth } from "../fleet/documents.ts";
import { MARKETS, marketOfZone, type MarketId } from "../markets/markets.ts";

/**
 * Vehicles: which car fits which category in each country, the documents and photos of
 * every car, holds with a reason, and what each car earns.
 */

export const VEHICLE_RULES_KEY = "vehicleRules";

export type Fuel = Vehicle["fuel"];
export type CategoryId = Vehicle["category"];

export const FUELS: { id: Fuel; label: string }[] = [
  { id: "petrol", label: "Petrol" },
  { id: "diesel", label: "Diesel" },
  { id: "hybrid", label: "Hybrid" },
  { id: "electric", label: "Electric" },
];

export const CATEGORY_LABELS: Record<CategoryId, string> = { economy: "Movera", comfort: "Comfort", premium: "Premium", priority: "Priority", xl: "Movera XL", electric: "Electric", pet: "Pet" };

export type CatRule = { category: CategoryId; on: boolean; minYear: number; minSeats: number; fuels: Fuel[] };
export type CountryRules = { categories: CatRule[]; warnDays: number; autoHold: boolean; photosNeeded: boolean };

export type PhotoSide = "front" | "back" | "side" | "inside";
export const PHOTO_SIDES: { id: PhotoSide; label: string }[] = [
  { id: "front", label: "Front with plate" },
  { id: "back", label: "Back with plate" },
  { id: "side", label: "Side" },
  { id: "inside", label: "Inside" },
];
export type PhotoState = "waiting" | "approved" | "rejected";
export type Photo = { status: PhotoState; by: string; at: string; note: string };

export type VehicleRules = { draftRev: number; countries: Record<MarketId, CountryRules>; photos: Record<string, Partial<Record<PhotoSide, Photo>>> };

const ALL_FUELS: Fuel[] = ["petrol", "diesel", "hybrid", "electric"];

function countryDefaults(id: MarketId): CountryRules {
  const base = id === "TN" ? 2012 : id === "FR" ? 2016 : 2015;
  return {
    warnDays: 30,
    autoHold: true,
    photosNeeded: true,
    categories: [
      { category: "economy", on: true, minYear: base, minSeats: 4, fuels: ALL_FUELS },
      { category: "comfort", on: true, minYear: base + 4, minSeats: 4, fuels: ALL_FUELS },
      { category: "premium", on: true, minYear: base + 6, minSeats: 4, fuels: ["hybrid", "electric", "petrol", "diesel"] },
      { category: "priority", on: true, minYear: base, minSeats: 4, fuels: ALL_FUELS },
      { category: "xl", on: true, minYear: base, minSeats: 6, fuels: ALL_FUELS },
      { category: "electric", on: true, minYear: base + 2, minSeats: 4, fuels: ["electric"] },
      { category: "pet", on: true, minYear: base, minSeats: 4, fuels: ALL_FUELS },
    ],
  };
}

export function emptyVehicleRules(): VehicleRules {
  return { draftRev: 1, countries: { SE: countryDefaults("SE"), FR: countryDefaults("FR"), TN: countryDefaults("TN") }, photos: {} };
}

export function normalizeVehicleRules(value: unknown): VehicleRules {
  const base = emptyVehicleRules();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<VehicleRules>;
  const countries = { ...base.countries };
  for (const item of MARKETS) {
    const saved = raw.countries?.[item.id];
    if (saved) countries[item.id] = { ...base.countries[item.id], ...saved, categories: base.countries[item.id].categories.map((rule) => ({ ...rule, ...(saved.categories?.find((row) => row.category === rule.category) ?? {}) })) };
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, countries, photos: raw.photos && typeof raw.photos === "object" ? raw.photos : {} };
}

export type CarFacts = { year: number; seats: number; fuel: Fuel; category: CategoryId };

/** Why a car does not fit a category, or null when it fits. */
export function categoryProblem(car: CarFacts, rule: CatRule): string | null {
  if (!rule.on) return "This category is off in the country.";
  if (car.year < rule.minYear) return `Built ${car.year}, needs ${rule.minYear} or newer.`;
  if (car.seats < rule.minSeats) return `${car.seats} seats, needs ${rule.minSeats}.`;
  if (!rule.fuels.includes(car.fuel)) return `${FUELS.find((fuel) => fuel.id === car.fuel)?.label ?? car.fuel} is not allowed.`;
  return null;
}

export function fits(car: CarFacts, rules: CountryRules): CategoryId[] {
  return rules.categories.filter((rule) => !categoryProblem(car, rule)).map((rule) => rule.category);
}

export function countryOfZone(zoneId: string): MarketId {
  return marketOfZone(zoneId)?.id ?? "SE";
}

export type CarDoc = { id: "insurance" | "inspection" | "registration"; label: string; expiresAt: string; health: DocHealth; text: string };

/** The car's papers. When the driver uploaded insurance or registration, the worse of the two counts. warnDays: the country's warning days for papers. */
export function carDocs(
  profile: { insuranceExpiresAt: string; inspectionExpiresAt: string; registrationStatus: "in_review" | "approved" | "rejected" },
  driverDocs: Partial<Record<"vehicle_insurance" | "vehicle_registration", { status: DocStatus; expiresAt: string }>>,
  now: number,
  warnDays = EXPIRY_WARNING_DAYS,
): CarDoc[] {
  type Seen = { health: DocHealth; label: string; expiresAt: string };
  const rank: Record<DocHealth, number> = { invalid: 0, expiring: 1, review: 2, valid: 3 };
  // A paper the driver has not uploaded yet does not count against the car's own record.
  const fromDriver = (doc?: { status: DocStatus; expiresAt: string }): Seen | undefined => (doc && doc.status !== "needed" ? { ...docHealth(doc, now, warnDays), expiresAt: doc.expiresAt } : undefined);
  const worse = (a: Seen, b?: Seen) => (b && rank[b.health] < rank[a.health] ? b : a);
  const insurance = worse({ ...docHealth({ status: "approved", expiresAt: profile.insuranceExpiresAt }, now, warnDays), expiresAt: profile.insuranceExpiresAt }, fromDriver(driverDocs.vehicle_insurance));
  const inspection = { ...docHealth({ status: "approved", expiresAt: profile.inspectionExpiresAt }, now, warnDays), expiresAt: profile.inspectionExpiresAt };
  const regStatus: DocStatus = profile.registrationStatus === "approved" ? "approved" : profile.registrationStatus === "rejected" ? "rejected" : "in_review";
  const registration = worse({ ...docHealth({ status: regStatus, expiresAt: "" }, now, warnDays), expiresAt: "" }, fromDriver(driverDocs.vehicle_registration));
  return [
    { id: "insurance", label: "Insurance", expiresAt: insurance.expiresAt, health: insurance.health, text: insurance.label },
    { id: "inspection", label: "Inspection", expiresAt: inspection.expiresAt, health: inspection.health, text: inspection.label },
    { id: "registration", label: "Registration and permit", expiresAt: registration.expiresAt, health: registration.health, text: registration.label },
  ];
}

/** Demo photos until the driver app uploads them: most approved, some waiting, a few rejected. */
export function photosOf(rules: VehicleRules, vehicleId: string): Record<PhotoSide, Photo> {
  const seed = Number(vehicleId.replace(/\D/g, "")) || 0;
  const saved = rules.photos[vehicleId] ?? {};
  const out = {} as Record<PhotoSide, Photo>;
  PHOTO_SIDES.forEach((side, index) => {
    const demo: PhotoState = (seed + index) % 9 === 0 ? "waiting" : (seed + index) % 23 === 0 ? "rejected" : "approved";
    out[side.id] = saved[side.id] ?? { status: demo, by: demo === "approved" ? "nora" : "", at: "", note: demo === "rejected" ? "Plate not readable" : "" };
  });
  return out;
}

export function setPhoto(rules: VehicleRules, vehicleId: string, side: PhotoSide, status: PhotoState, by: string, at: string, note: string): VehicleRules {
  return { ...rules, draftRev: rules.draftRev + 1, photos: { ...rules.photos, [vehicleId]: { ...rules.photos[vehicleId], [side]: { status, by, at, note } } } };
}

export type Check = { label: string; ok: boolean; detail: string };

/** Everything that decides if the car can drive, as a checklist. */
export function checks(car: CarFacts, docs: readonly CarDoc[], photos: Record<PhotoSide, Photo>, rules: CountryRules, chosen: CategoryId): Check[] {
  const rule = rules.categories.find((item) => item.category === chosen);
  const problem = rule ? categoryProblem(car, rule) : "Unknown category.";
  const list: Check[] = [
    { label: `Fits ${CATEGORY_LABELS[chosen]}`, ok: !problem, detail: problem ?? `${car.year}, ${car.seats} seats, ${car.fuel}` },
    ...docs.map((doc) => ({ label: doc.label, ok: doc.health === "valid" || doc.health === "expiring", detail: doc.text })),
  ];
  if (rules.photosNeeded) {
    const waiting = Object.values(photos).filter((photo) => photo.status !== "approved").length;
    list.push({ label: "Photos", ok: waiting === 0, detail: waiting ? `${waiting} of 4 not approved` : "All 4 approved" });
  }
  return list;
}

/** Insurance or inspection expired: with auto hold on, the car should come off the road. */
export function shouldHold(docs: readonly CarDoc[], rules: CountryRules): boolean {
  return rules.autoHold && docs.some((doc) => (doc.id === "insurance" || doc.id === "inspection") && doc.health === "invalid");
}

export type Earnings = { trips: number; completed: number; grossMinor: number; lastTripId: string | null };

/** Trips the car's driver drove, as the car's work. */
export function carEarnings(trips: readonly DemoRecord[], driverId: string | null | undefined): Earnings {
  if (!driverId) return { trips: 0, completed: 0, grossMinor: 0, lastTripId: null };
  const mine = trips.filter((trip) => trip.driverId === driverId);
  const done = mine.filter((trip) => trip.status === "completed");
  return { trips: mine.length, completed: done.length, grossMinor: done.reduce((sum, trip) => sum + (trip.fareOre ?? 0), 0), lastTripId: mine[0]?.id ?? null };
}

export function rulesError(rules: CountryRules): string | null {
  for (const rule of rules.categories) {
    if (!Number.isInteger(rule.minYear) || rule.minYear < 1990 || rule.minYear > 2030) return `${CATEGORY_LABELS[rule.category]}: the year must be 1990 to 2030.`;
    if (!Number.isInteger(rule.minSeats) || rule.minSeats < 1 || rule.minSeats > 9) return `${CATEGORY_LABELS[rule.category]}: seats must be 1 to 9.`;
    if (rule.on && !rule.fuels.length) return `${CATEGORY_LABELS[rule.category]}: allow at least one fuel.`;
  }
  if (!Number.isInteger(rules.warnDays) || rules.warnDays < 1 || rules.warnDays > 120) return "Warn 1 to 120 days before papers expire.";
  return null;
}

/** How many cars gain or lose each category with the draft rules. */
export function rulesImpact(cars: readonly CarFacts[], before: CountryRules, after: CountryRules): { category: CategoryId; before: number; after: number }[] {
  return after.categories.map((rule) => ({
    category: rule.category,
    before: cars.filter((car) => fits(car, before).includes(rule.category)).length,
    after: cars.filter((car) => fits(car, after).includes(rule.category)).length,
  }));
}

/** Contract v0.17.0 §25: the car rules of each country come from its onboarding settings document (vehicles). */
export function withVehicleSettings(rules: VehicleRules, book: SettingsBook): VehicleRules {
  const countries = { ...rules.countries };
  for (const item of MARKETS) {
    const doc = book.countries[item.id]?.document;
    if (!doc) continue;
    countries[item.id] = { ...countries[item.id], warnDays: doc.vehicles.warnDays, autoHold: doc.vehicles.autoHold, photosNeeded: doc.vehicles.photosNeeded, categories: countries[item.id].categories.map((rule) => ({ ...rule, ...(doc.vehicles.categories.find((row) => row.category === rule.category) ?? {}) }) as CatRule) };
  }
  return { ...rules, countries };
}

/**
 * The car rules a page uses. Live (owner G2 R2/R10, 2026-10-30): only the onboarding config the server holds
 * (GET /admin/config/onboarding?country), never the browser's demo slice; the demo keeps its slice under the settings.
 */
export function effectiveVehicleRules(slice: unknown, book: SettingsBook, live: boolean): VehicleRules {
  return withVehicleSettings(normalizeVehicleRules(live ? null : slice), book);
}

/**
 * Live (owner G2 R1, 2026-10-30): the car's papers as the server has them, registration and insurance with their real
 * status and end date; nothing assumed approved, no inspection the server does not keep.
 */
export function liveCarDocs(documents: readonly { type: string; status: string; expiresAt?: string }[] | undefined, now: number, warnDays = EXPIRY_WARNING_DAYS): CarDoc[] {
  const status: Record<string, DocStatus> = { approved: "approved", in_review: "in_review", rejected: "rejected", expired: "expired" };
  const one = (id: CarDoc["id"], label: string, types: string[]): CarDoc => {
    const doc = [...(documents ?? [])].reverse().find((item) => types.includes(item.type));
    const expiresAt = doc?.expiresAt ? doc.expiresAt.slice(0, 10) : "";
    const health = docHealth({ status: doc ? status[doc.status] ?? "needed" : "needed", expiresAt }, now, warnDays);
    return { id, label, expiresAt, health: health.health, text: health.label };
  };
  return [one("registration", "Registration and permit", ["vehicle_registration"]), one("insurance", "Insurance", ["insurance", "vehicle_insurance"])];
}
