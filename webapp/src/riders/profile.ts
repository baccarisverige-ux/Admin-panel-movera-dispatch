import { market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import { NOT_CONNECTED_TEXT, isLiveData, liveRiderOf, liveTripOf, liveTripsOfRider } from "../live/realData.ts";
import { placeText } from "../trips/present.ts";
import type { DemoRecord } from "../api/seed.ts";

/**
 * Everything the admin sees about one rider, built from the rider record.
 * The booking history drives every number (rides, spend, cancellations), so lists and
 * the rider page always agree. Demo model: stable per rider, anchored to "now".
 */

export type RiderRecord = { id: string; name: string; phone: string; zoneId: string; status: string; tripId?: string | null; email?: string; live?: true; liveRider?: DemoRecord["liveRider"] };

export type BookingStatus =
  | "completed"
  | "cancelled_rider"
  | "cancelled_driver"
  | "no_show"
  | "interrupted"
  | "in_progress"
  | "scheduled";

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  completed: "Completed",
  cancelled_rider: "Cancelled by rider",
  cancelled_driver: "Cancelled by driver",
  no_show: "No-show",
  interrupted: "Interrupted",
  in_progress: "In progress",
  scheduled: "Scheduled",
};

export type Booking = {
  id: string;
  at: number;
  status: BookingStatus;
  /** Why an interrupted or cancelled ride stopped. */
  reason: string | null;
  category: string;
  from: string;
  to: string;
  km: number;
  minutes: number;
  /** What the rider paid, in minor units of the rider's currency (0 when nothing was charged). */
  fareMinor: number;
  feeMinor: number;
  driverId: string | null;
  driverName: string | null;
  payment: string;
  ratingGiven: number | null;
  promo: boolean;
  zoneId: string;
};

export type RiderProfile = {
  id: string;
  code: string;
  country: MarketId;
  joinedAt: number;
  email: string;
  language: string;
  rating: number;
  score: number;
  completed: number;
  cancelled: number;
  noShows: number;
  interrupted: number;
  cancelRate: number;
  spentMinor: number;
  avgFareMinor: number;
  promoMinor: number;
  lastRideAt: number | null;
  ridesLast30: number;
  favouriteCategory: string;
  usualTimes: string;
  payment: { method: string; expires: string; expiringSoon: boolean; failed: number; chargebacks: number };
  devices: { platform: string; model: string; app: string; lastSeen: number }[];
  referral: { code: string; invited: number; joined: number };
  fraudFlags: string[];
  trustedContacts: { name: string; relation: string }[];
  homeArea: string;
  workArea: string;
  birthdayMonth: number;
};

const DAY = 86_400_000;
const CATEGORY_NAMES: Record<string, string> = { economy: "Movera", comfort: "Comfort", premium: "Premium", priority: "Priority", xl: "Movera XL", electric: "Electric", pet: "Pet", child_seat: "Child Seat" };
const CATEGORY_WEIGHTS: [string, number][] = [["economy", 46], ["comfort", 18], ["electric", 10], ["xl", 8], ["premium", 7], ["priority", 5], ["pet", 3], ["child_seat", 3]];
const CATEGORY_LIFT: Record<string, number> = { economy: 1, comfort: 1.25, premium: 1.8, priority: 1.35, xl: 1.5, electric: 1.1, pet: 1.15, child_seat: 1.2 };
const CURRENCY_FACTOR: Record<MarketId, number> = { SE: 1, FR: 0.095, TN: 0.3 };
const INTERRUPTIONS = ["SOS pressed during the ride", "Driver ended the ride early", "Payment failed at the end", "Vehicle problem on the way"];
const RIDER_CANCEL = ["Waited too long", "Changed plans", "Booked by mistake", "Price too high"];
const DRIVER_CANCEL = ["Rider not at pickup", "Too far away", "Vehicle problem"];
const CARDS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "Wallet"];
const LANG: Record<MarketId, string[]> = { SE: ["Swedish", "English", "Arabic"], FR: ["French", "English", "Arabic"], TN: ["Arabic", "French", "English"] };
const RELATIONS = ["Partner", "Mother", "Friend", "Brother", "Sister", "Father"];
const FIRST = ["Lina", "Omar", "Elsa", "Karim", "Maja", "Noah", "Sara", "Yasmin", "Hugo", "Leo"];

export function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

function weighted(seed: number): string {
  let roll = seed % 100;
  for (const [id, weight] of CATEGORY_WEIGHTS) {
    if (roll < weight) return id;
    roll -= weight;
  }
  return "economy";
}

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] ?? id;
}

export function countryOf(rider: { zoneId: string }): MarketId {
  return marketOfZone(rider.zoneId)?.id ?? "SE";
}

/** Short code to read out on the phone: RD, country, four digits (RD-SE-0001). */
export function riderCode(rider: { id: string; zoneId: string }): string {
  return `RD-${countryOf(rider)}-${rider.id.replace(/\D/g, "").padStart(4, "0").slice(-4)}`;
}

/** When the rider signed up: about one in sixteen joined this week. */
export function joinedAt(rider: { id: string }, now: number): number {
  // Live: the server sends no sign-up date for a rider (NaN = "Not connected yet").
  if (isLiveData()) return NaN;
  const seed = hash(`join:${rider.id}`);
  const days = seed % 16 === 0 ? seed % 7 : 8 + (seed >>> 5) % 900;
  return now - days * DAY - ((seed >>> 3) % 86_400) * 1000;
}

type DriverLite = { id: string; name: string; zoneId: string };

/** Every booking the rider ever made, newest first, with the outcome of each. */
const LIVE_STATUS: Record<string, BookingStatus> = {
  completed: "completed",
  cancelled_by_rider: "cancelled_rider",
  cancelled_by_driver: "cancelled_driver",
  cancelled_by_admin: "cancelled_driver",
  cancelled_by_system: "cancelled_driver",
  expired: "cancelled_driver",
  no_show: "no_show",
  failed: "interrupted",
};

/** Live: the rider's trips the panel has read from the server; km and minutes are not on a trip (NaN). */
function liveBookings(rider: RiderRecord, drivers: readonly DriverLite[]): Booking[] {
  return liveTripsOfRider(rider.id).flatMap((trip): Booking[] => {
    const facts = liveTripOf(trip);
    if (!facts) return [];
    const status: BookingStatus = LIVE_STATUS[trip.status] ?? (facts.kind === "scheduled" && !trip.driverId ? "scheduled" : "in_progress");
    const driver = trip.driverId ? drivers.find((row) => row.id === trip.driverId) ?? null : null;
    return [{
      id: trip.id,
      at: Date.parse(trip.pickupAt ?? trip.createdAt ?? facts.updatedAt),
      status,
      reason: (trip as { cancelReasonCode?: string }).cancelReasonCode ?? null,
      category: facts.categoryId,
      from: placeText(facts.pickup),
      to: placeText(facts.dropoff),
      km: NaN,
      minutes: NaN,
      fareMinor: status === "completed" || status === "no_show" || status === "cancelled_rider" ? facts.fare : 0,
      feeMinor: NaN,
      driverId: trip.driverId ?? null,
      driverName: driver?.name ?? null,
      payment: facts.paymentMethod,
      ratingGiven: null,
      promo: false,
      zoneId: trip.zoneId,
    }];
  });
}

export function riderBookings(rider: RiderRecord, now: number, drivers: readonly DriverLite[] = []): Booking[] {
  if (isLiveData()) return liveBookings(rider, drivers);
  const seed = hash(rider.id);
  const country = countryOf(rider);
  const start = joinedAt(rider, now);
  // Most riders rode in the last few days; some stopped weeks or months ago.
  const quiet = hash(`quiet:${rider.id}`) % 100;
  const idleDays = quiet < 60 ? (quiet % 4) + (quiet % 7) / 7 : quiet < 82 ? 4 + (quiet % 25) : 31 + ((quiet * 37) % 280);
  const end = Math.max(start + DAY / 4, Math.min(now - 30 * 60_000, now - idleDays * DAY));
  const ageDays = Math.max(0.5, (end - start) / DAY);
  // Some riders ride daily, most a few times a month, some once and never again.
  const habit = seed % 10;
  const perMonth = habit === 0 ? 24 : habit < 3 ? 9 : habit < 7 ? 3 : habit < 9 ? 1 : 0.3;
  const total = Math.max(rider.status === "blocked" ? 2 : 0, Math.min(140, Math.round((ageDays / 30) * perMonth)));
  const zones = market(country).zones;
  const home = zoneById(rider.zoneId) ?? zones[0];
  const local = drivers.filter((driver) => marketOfZone(driver.zoneId)?.id === country);
  const factor = CURRENCY_FACTOR[country];
  const unit = market(country).minorUnits;
  const bookings: Booking[] = [];
  for (let index = 0; index < total; index += 1) {
    const s = hash(`${rider.id}:${index}`);
    const at = Math.round(start + (((index + 0.5) / Math.max(1, total)) * (end - start)) - ((s >>> 7) % 3_600_000));
    const roll = s % 1000;
    const cancelBias = habit === 9 ? 3 : 1;
    let status: BookingStatus = "completed";
    if (roll < 60 * cancelBias) status = "cancelled_rider";
    else if (roll < 60 * cancelBias + 35) status = "cancelled_driver";
    else if (roll < 60 * cancelBias + 35 + 22 * cancelBias) status = "no_show";
    else if (roll < 60 * cancelBias + 35 + 22 * cancelBias + 14) status = "interrupted";
    const category = weighted(s >>> 4);
    const other = pick(zones, s >>> 9);
    const outbound = (s >>> 2) % 2 === 0;
    const km = Math.round((2 + ((s >>> 11) % 220) / 10) * 10) / 10;
    const minutes = Math.round(km * 2.1 + 4 + ((s >>> 13) % 9));
    const sek = (29 + 12 * km + 4 * minutes) * (CATEGORY_LIFT[category] ?? 1) * 1.1;
    const fullMinor = Math.round(sek * factor * unit);
    const fareMinor = status === "completed" ? fullMinor
      : status === "interrupted" ? Math.round(fullMinor * 0.55)
      : status === "no_show" || (status === "cancelled_rider" && (s >>> 6) % 3 === 0) ? Math.round(50 * factor * unit)
      : 0;
    const driver = local.length && status !== "cancelled_rider" ? local[(s >>> 3) % local.length] : null;
    bookings.push({
      id: `${rider.id}-B${String(index + 1).padStart(3, "0")}`,
      at,
      status,
      reason: status === "interrupted" ? pick(INTERRUPTIONS, s >>> 5) : status === "cancelled_rider" ? pick(RIDER_CANCEL, s >>> 5) : status === "cancelled_driver" ? pick(DRIVER_CANCEL, s >>> 5) : status === "no_show" ? "Rider did not come to the pickup" : null,
      category,
      from: outbound ? home.name : other.name,
      to: outbound ? other.name : home.name,
      km,
      minutes,
      fareMinor,
      feeMinor: status === "completed" ? Math.round(fareMinor * 0.09) : 0,
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? null,
      payment: pick(CARDS, seed >>> 6),
      ratingGiven: status === "completed" && (s >>> 8) % 3 !== 0 ? 3 + ((s >>> 10) % 3) : null,
      promo: status === "completed" && (s >>> 12) % 9 === 0,
      zoneId: outbound ? home.id : other.id,
    });
  }
  // The rider's current or next ride.
  if (rider.tripId && total > 0 && seed % 13 === 0) bookings.push({ ...bookings[bookings.length - 1], id: `${rider.id}-NOW`, at: now - 9 * 60_000, status: "in_progress", reason: null, fareMinor: 0, feeMinor: 0, ratingGiven: null });
  if (seed % 6 === 0) {
    const base = bookings[bookings.length - 1] ?? { category: "economy", from: home.name, to: pick(zones, seed).name, km: 12, minutes: 25, payment: pick(CARDS, seed), zoneId: home.id };
    bookings.push({ ...base, id: `${rider.id}-SCH`, at: now + (2 + (seed % 40)) * 3_600_000, status: "scheduled", reason: null, fareMinor: 0, feeMinor: 0, driverId: null, driverName: null, ratingGiven: null, promo: false } as Booking);
  }
  return bookings.sort((a, b) => b.at - a.at);
}

export function bookingCounts(bookings: readonly Booking[]): Record<BookingStatus | "all", number> {
  const counts = { all: bookings.length, completed: 0, cancelled_rider: 0, cancelled_driver: 0, no_show: 0, interrupted: 0, in_progress: 0, scheduled: 0 };
  for (const booking of bookings) counts[booking.status] += 1;
  return counts;
}

function usualTimes(bookings: readonly Booking[], timeZone: string): string {
  if (bookings.length < 3) return "Not enough rides yet";
  const hours = new Array(24).fill(0);
  let weekday = 0;
  const format = new Intl.DateTimeFormat("en-GB", { hour: "numeric", weekday: "short", hourCycle: "h23", timeZone });
  for (const booking of bookings.slice(0, 40)) {
    const parts = Object.fromEntries(format.formatToParts(booking.at).map((part) => [part.type, part.value]));
    hours[Number(parts.hour) % 24] += 1;
    if (!["Sat", "Sun"].includes(parts.weekday)) weekday += 1;
  }
  const peak = hours.indexOf(Math.max(...hours));
  const days = weekday / Math.min(40, bookings.length) > 0.7 ? "weekdays" : weekday / Math.min(40, bookings.length) < 0.35 ? "weekends" : "all week";
  return `${days}, around ${String(peak).padStart(2, "0")}:00`;
}

/** Live: only what the server sends (rating, email); every other number is NaN and every text "Not connected yet". */
function liveProfile(rider: RiderRecord): RiderProfile {
  const facts = liveRiderOf(rider);
  const none = NOT_CONNECTED_TEXT;
  return {
    id: rider.id,
    code: rider.id,
    country: facts?.currency === "EUR" ? "FR" : facts?.currency === "TND" ? "TN" : countryOf(rider),
    joinedAt: NaN,
    email: rider.email ?? none,
    language: none,
    rating: facts?.rating ?? NaN,
    score: NaN,
    completed: NaN,
    cancelled: NaN,
    noShows: NaN,
    interrupted: NaN,
    cancelRate: NaN,
    spentMinor: NaN,
    avgFareMinor: NaN,
    promoMinor: NaN,
    lastRideAt: null,
    ridesLast30: NaN,
    favouriteCategory: none,
    usualTimes: none,
    payment: { method: none, expires: none, expiringSoon: false, failed: NaN, chargebacks: NaN },
    devices: [],
    referral: { code: none, invited: NaN, joined: NaN },
    fraudFlags: [],
    trustedContacts: [],
    homeArea: none,
    workArea: none,
    birthdayMonth: NaN,
  };
}

export function riderProfile(rider: RiderRecord, bookings: readonly Booking[], now: number): RiderProfile {
  if (isLiveData()) return liveProfile(rider);
  const seed = hash(rider.id);
  const country = countryOf(rider);
  const done = bookings.filter((booking) => booking.status === "completed");
  const cancelled = bookings.filter((booking) => booking.status === "cancelled_rider" || booking.status === "cancelled_driver").length;
  const noShows = bookings.filter((booking) => booking.status === "no_show").length;
  const interrupted = bookings.filter((booking) => booking.status === "interrupted").length;
  const past = bookings.filter((booking) => booking.status !== "scheduled" && booking.status !== "in_progress");
  const spentMinor = past.reduce((sum, booking) => sum + booking.fareMinor, 0);
  const ridesLast30 = done.filter((booking) => booking.at > now - 30 * DAY).length;
  const counts = new Map<string, number>();
  for (const booking of done) counts.set(booking.category, (counts.get(booking.category) ?? 0) + 1);
  const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "economy";
  const rated = 4.3 + ((seed >>> 4) % 70) / 100 - noShows * 0.04;
  const cancelRate = past.length ? Math.round(((cancelled + noShows) / past.length) * 100) : 0;
  const failed = seed % 41 === 0 ? 2 : seed % 23 === 0 ? 1 : 0;
  const chargebacks = seed % 61 === 0 ? 1 : 0;
  const rating = Math.max(3.1, Math.min(5, Math.round(rated * 100) / 100));
  const score = Math.max(5, Math.min(100, Math.round(100 - cancelRate * 1.6 - noShows * 4 - failed * 9 - chargebacks * 20 - (5 - rating) * 18)));
  const zones = market(country).zones.filter((zone) => zone.kind === "operating");
  const month = (seed >>> 9) % 12;
  const year = 26 + ((seed >>> 3) % 4);
  const flags: string[] = [];
  if (seed % 47 === 0) flags.push("Same card used on 3 accounts");
  if (seed % 53 === 0) flags.push("Phone number used by another account before");
  if (chargebacks) flags.push("Card chargeback in the last 90 days");
  const first = rider.name.split(" ")[0]?.toLowerCase() ?? "rider";
  return {
    id: rider.id,
    code: riderCode(rider),
    country,
    joinedAt: joinedAt(rider, now),
    email: `${first}.${(seed % 900) + 100}@mail.${country === "SE" ? "se" : country === "FR" ? "fr" : "tn"}`,
    language: pick(LANG[country], seed >>> 2),
    rating,
    score,
    completed: done.length,
    cancelled,
    noShows,
    interrupted,
    cancelRate,
    spentMinor,
    avgFareMinor: done.length ? Math.round(done.reduce((sum, booking) => sum + booking.fareMinor, 0) / done.length) : 0,
    promoMinor: Math.round(done.filter((booking) => booking.promo).reduce((sum, booking) => sum + booking.fareMinor * 0.25, 0)),
    lastRideAt: done[0]?.at ?? null,
    ridesLast30,
    favouriteCategory: favourite,
    usualTimes: usualTimes(done, market(country).timeZone),
    payment: { method: `${pick(CARDS, seed >>> 6)}${pick(CARDS, seed >>> 6) === "Wallet" ? "" : ` •• ${String(1000 + (seed % 9000))}`}`, expires: `${String(month + 1).padStart(2, "0")}/${year}`, expiringSoon: year === 26 && month <= 11, failed, chargebacks },
    devices: [
      { platform: seed % 2 ? "iOS" : "Android", model: seed % 2 ? pick(["iPhone 15", "iPhone 13", "iPhone 16 Pro"], seed >>> 3) : pick(["Galaxy S24", "Pixel 8", "Xiaomi 14"], seed >>> 3), app: `Movera ${3 + (seed % 2)}.${(seed >>> 4) % 9}.${(seed >>> 6) % 5}`, lastSeen: now - ((seed >>> 5) % 72) * 3_600_000 },
      ...(seed % 4 === 0 ? [{ platform: "Web", model: "Chrome", app: "movera.app", lastSeen: now - ((seed >>> 7) % 30) * DAY }] : []),
    ],
    referral: { code: `${first.slice(0, 4).toUpperCase()}${(seed % 90) + 10}`, invited: seed % 5 === 0 ? 1 + (seed % 9) : 0, joined: seed % 5 === 0 ? (seed % 9) % 4 : 0 },
    fraudFlags: flags,
    trustedContacts: seed % 3 === 0 ? [{ name: `${pick(FIRST, seed >>> 2)} ${rider.name.split(" ")[1] ?? ""}`.trim(), relation: pick(RELATIONS, seed >>> 4) }] : [],
    homeArea: zoneById(rider.zoneId)?.name ?? rider.zoneId,
    workArea: pick(zones, seed >>> 8).name,
    birthdayMonth: month,
  };
}
