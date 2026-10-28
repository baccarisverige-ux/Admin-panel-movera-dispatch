import { isLiveData } from "../live/realData.ts";
import { complaintOf, promoUsed, randomRiders, threadOf, unpaidMinor, waitingMinutes, walletMinor, type CareMessage, type PromoTicket, type RiderCare } from "./care.ts";
import { hash, riderBookings, riderProfile, type Booking, type RiderProfile, type RiderRecord } from "./profile.ts";

/** One row per rider for the list, plus the categories each rider belongs to. */

export type LiveState = "waiting" | "on_trip" | "online" | "offline";

export type SegmentId = "all" | "new" | "top" | "loyal" | "online" | "attention" | "reply" | "unpaid" | "cancels" | "inactive" | "promo" | "blocked";

export const SEGMENTS: { id: SegmentId; label: string; hint: string }[] = [
  { id: "all", label: "All riders", hint: "Everyone in this selection" },
  { id: "new", label: "New riders", hint: "Joined in the last 7 days" },
  { id: "top", label: "Top riders", hint: "Book the most in the chosen period" },
  { id: "loyal", label: "Loyal riders", hint: "With Movera 3+ months and ride often" },
  { id: "online", label: "Online now", hint: "App open, waiting or on a trip" },
  { id: "attention", label: "Needs attention", hint: "Waiting for a reply, unpaid, complaint or safety report" },
  { id: "reply", label: "Waiting for reply", hint: "Sent a message nobody answered yet" },
  { id: "unpaid", label: "Unpaid balance", hint: "A failed payment; rides blocked until paid" },
  { id: "cancels", label: "Many cancellations", hint: "Cancel or no-show rate above 20%, or 3+ no-shows" },
  { id: "inactive", label: "Inactive", hint: "No ride in the last 30 days" },
  { id: "promo", label: "With promotion", hint: "Has an active promotion" },
  { id: "blocked", label: "Blocked or on hold", hint: "Account stopped" },
];

export type Period = "today" | "week" | "month" | "year";

export const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Week", days: 7 },
  { id: "month", label: "Month", days: 30 },
  { id: "year", label: "Year", days: 365 },
];

export type RiderRow = {
  rider: RiderRecord;
  profile: RiderProfile;
  bookings: Booking[];
  live: LiveState;
  thread: CareMessage[];
  waitingMin: number | null;
  unpaidMinor: number;
  walletMinor: number;
  complaint: string | null;
  promos: { ticket: PromoTicket; used: number }[];
  periodRides: number;
  periodSpentMinor: number;
  isNew: boolean;
  segments: Set<SegmentId>;
};

const DAY = 86_400_000;

export function buildRows(riders: readonly RiderRecord[], care: RiderCare, now: number, period: Period, waitingIds: ReadonlySet<string>, drivers: readonly { id: string; name: string; zoneId: string }[] = []): RiderRow[] {
  const since = now - (PERIODS.find((item) => item.id === period)?.days ?? 30) * DAY;
  const rows: RiderRow[] = riders.map((rider) => {
    const bookings = riderBookings(rider, now, drivers);
    const profile = riderProfile(rider, bookings, now);
    const thread = threadOf(care, rider, now);
    const inPeriod = bookings.filter((booking) => booking.status === "completed" && booking.at >= since && booking.at <= now);
    const live: LiveState = waitingIds.has(rider.id) ? "waiting" : bookings.some((booking) => booking.status === "in_progress") ? "on_trip" : !isLiveData() && hash(`online:${rider.id}`) % 18 === 0 ? "online" : "offline";
    const promos = care.promotions
      .filter((ticket) => ticket.status === "active" && ticket.riderIds.includes(rider.id) && Date.parse(ticket.validTo) > now)
      .map((ticket) => ({ ticket, used: promoUsed(ticket, rider.id, bookings) }))
      .filter((item) => item.used < item.ticket.rides);
    return {
      rider,
      profile,
      bookings,
      live,
      thread,
      waitingMin: waitingMinutes(thread, now),
      unpaidMinor: unpaidMinor(care, rider, profile),
      walletMinor: walletMinor(care, rider),
      complaint: complaintOf(rider),
      promos,
      periodRides: inPeriod.length,
      periodSpentMinor: inPeriod.reduce((sum, booking) => sum + booking.fareMinor, 0),
      isNew: now - profile.joinedAt < 7 * DAY,
      segments: new Set<SegmentId>(["all"]),
    };
  });
  // Top riders: the top tenth by rides in the period (at least the top 3 who rode).
  const riding = rows.filter((row) => row.periodRides > 0).sort((a, b) => b.periodRides - a.periodRides || b.periodSpentMinor - a.periodSpentMinor);
  const topCount = Math.max(Math.min(3, riding.length), Math.ceil(riding.length * 0.1));
  const top = new Set(riding.slice(0, topCount).map((row) => row.rider.id));
  for (const row of rows) {
    const s = row.segments;
    const blocked = row.rider.status === "blocked" || row.rider.status === "on_hold";
    if (row.isNew) s.add("new");
    if (top.has(row.rider.id)) s.add("top");
    if (now - row.profile.joinedAt > 90 * DAY && row.profile.ridesLast30 >= 4) s.add("loyal");
    if (row.live !== "offline") s.add("online");
    if (row.waitingMin !== null) s.add("reply");
    if (row.unpaidMinor > 0) s.add("unpaid");
    if ((row.profile.cancelRate > 20 && row.profile.completed + row.profile.cancelled > 5) || row.profile.noShows >= 3) s.add("cancels");
    if (!row.isNew && (!row.profile.lastRideAt || now - row.profile.lastRideAt > 30 * DAY)) s.add("inactive");
    if (row.promos.length) s.add("promo");
    if (blocked) s.add("blocked");
    if (s.has("reply") || s.has("unpaid") || row.complaint) s.add("attention");
  }
  return rows;
}

export function segmentCounts(rows: readonly RiderRow[]): Record<SegmentId, number> {
  const counts = Object.fromEntries(SEGMENTS.map((item) => [item.id, 0])) as Record<SegmentId, number>;
  for (const row of rows) for (const id of row.segments) counts[id] += 1;
  return counts;
}

export type SortId = "rides" | "spent" | "recent" | "rating" | "newest" | "waiting";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "rides", label: "Most rides" },
  { id: "spent", label: "Most spent" },
  { id: "recent", label: "Last ride" },
  { id: "rating", label: "Best rating" },
  { id: "newest", label: "Newest" },
  { id: "waiting", label: "Longest waiting for reply" },
];

export function sortRows(rows: RiderRow[], sort: SortId): RiderRow[] {
  const by: Record<SortId, (a: RiderRow, b: RiderRow) => number> = {
    rides: (a, b) => b.periodRides - a.periodRides || b.profile.completed - a.profile.completed,
    spent: (a, b) => b.periodSpentMinor - a.periodSpentMinor || b.profile.spentMinor - a.profile.spentMinor,
    recent: (a, b) => (b.profile.lastRideAt ?? 0) - (a.profile.lastRideAt ?? 0),
    rating: (a, b) => b.profile.rating - a.profile.rating,
    newest: (a, b) => b.profile.joinedAt - a.profile.joinedAt,
    waiting: (a, b) => (b.waitingMin ?? -1) - (a.waitingMin ?? -1),
  };
  return [...rows].sort(by[sort]);
}

export function matches(row: RiderRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.rider.id, row.rider.name, row.rider.phone, row.profile.code, row.profile.email, row.rider.tripId ?? "", ...row.bookings.slice(0, 30).map((booking) => booking.id)]
    .some((value) => value.toLowerCase().includes(needle));
}

export type Insights = {
  signups: { day: number; count: number }[];
  firstRideIn7: number;
  churned: number;
  retention: number;
  topZones: { zoneId: string; rides: number }[];
};

export function insights(rows: readonly RiderRow[], now: number): Insights {
  const today = Math.floor(now / DAY) * DAY;
  const signups = Array.from({ length: 14 }, (_, index) => ({ day: today - (13 - index) * DAY, count: 0 }));
  for (const row of rows) {
    const index = 13 - Math.floor((today - Math.floor(row.profile.joinedAt / DAY) * DAY) / DAY);
    if (index >= 0 && index < 14) signups[index].count += 1;
  }
  const recent = rows.filter((row) => now - row.profile.joinedAt > 7 * DAY && now - row.profile.joinedAt < 120 * DAY);
  const firstRide = recent.filter((row) => row.bookings.some((booking) => booking.status === "completed" && booking.at - row.profile.joinedAt < 7 * DAY)).length;
  const lastMonth = rows.filter((row) => row.bookings.some((booking) => booking.status === "completed" && booking.at < now - 30 * DAY && booking.at >= now - 60 * DAY));
  const churned = lastMonth.filter((row) => !row.bookings.some((booking) => booking.status === "completed" && booking.at >= now - 30 * DAY)).length;
  const riders = rows.filter((row) => row.profile.completed >= 1);
  const zones = new Map<string, number>();
  for (const row of rows) for (const booking of row.bookings) if (booking.status === "completed" && booking.at > now - 30 * DAY) zones.set(booking.zoneId, (zones.get(booking.zoneId) ?? 0) + 1);
  return {
    signups,
    firstRideIn7: recent.length ? Math.round((firstRide / recent.length) * 100) : 0,
    churned,
    retention: riders.length ? Math.round((riders.filter((row) => row.profile.completed >= 2).length / riders.length) * 100) : 0,
    topZones: [...zones.entries()].map(([zoneId, rides]) => ({ zoneId, rides })).sort((a, b) => b.rides - a.rides).slice(0, 6),
  };
}

/** CSV of the chosen riders, without hidden contact details. */
export function ridersCsv(rows: readonly RiderRow[], money: (row: RiderRow, minor: number) => string): string {
  const head = ["Code", "Name", "Zone", "Status", "Rating", "Rides", "Spent", "Last ride", "Joined"];
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = rows.map((row) => [
    row.profile.code,
    row.rider.name,
    row.profile.homeArea,
    row.rider.status,
    row.profile.rating.toFixed(2),
    String(row.profile.completed),
    money(row, row.profile.spentMinor),
    row.profile.lastRideAt ? new Date(row.profile.lastRideAt).toISOString().slice(0, 10) : "",
    new Date(row.profile.joinedAt).toISOString().slice(0, 10),
  ].map(escape).join(","));
  return [head.join(","), ...lines].join("\n");
}

export type AudienceKind = "new" | "top" | "loyal" | "inactive" | "all" | "random" | "newest";

export const AUDIENCE_KINDS: { id: AudienceKind; label: string; count?: boolean }[] = [
  { id: "new", label: "New riders" },
  { id: "top", label: "Top riders" },
  { id: "loyal", label: "Loyal riders" },
  { id: "inactive", label: "Inactive riders" },
  { id: "all", label: "Everyone" },
  { id: "random", label: "Random riders", count: true },
  { id: "newest", label: "Newest riders", count: true },
];

/** Riders for a group, never blocked accounts. Random and newest take the number given. */
export function pickAudience(rows: readonly RiderRow[], kind: AudienceKind, count: number, seed: number): RiderRow[] {
  const open = rows.filter((row) => !row.segments.has("blocked"));
  if (kind === "random") return randomRiders(open.map((row) => ({ ...row, id: row.rider.id })), count, seed);
  if (kind === "newest") return [...open].sort((a, b) => b.profile.joinedAt - a.profile.joinedAt).slice(0, Math.max(0, Math.round(count)));
  return open.filter((row) => row.segments.has(kind));
}
