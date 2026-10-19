import type { DemoRecord } from "../api/seed.ts";
import type { Role } from "../auth/permissions.ts";
import { lengthKm, tripRoute, type LatLng } from "../dashboard/route.ts";
import { CATEGORIES } from "../domain/contract.ts";
import { market, marketOfZone, zoneById, type MarketId } from "../markets/markets.ts";
import type { ZoneBook } from "../pricing/zonePricing.ts";
import { categoryOf, fareBreakdown, startedAt, timelineOf, tripIndex } from "./present.ts";

/**
 * Everything about one trip, in one place: route, money, chat, calls, offers and admin work.
 * Demo data is built from the trip id, so it is the same on every screen and after a reload.
 */

export const TRIP_OPS_KEY = "tripOps";

export type TripGroup = "all" | "live" | "searching" | "completed" | "cancelled" | "problem" | "flagged";

export const GROUPS: { id: TripGroup; label: string; help: string }[] = [
  { id: "all", label: "All trips", help: "Every trip in the chosen country and zones." },
  { id: "live", label: "On the road", help: "A driver is on the way, waiting or driving the rider." },
  { id: "searching", label: "Searching", help: "Looking for a driver: requested and not accepted yet." },
  { id: "completed", label: "Completed", help: "Finished trips." },
  { id: "cancelled", label: "Cancelled", help: "Cancelled by the rider, the driver or an admin, or expired." },
  { id: "problem", label: "Problems", help: "Failed trips, no-shows and failed payments." },
  { id: "flagged", label: "Flagged", help: "Trips an admin marked for a closer look." },
];

const LIVE = ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"];
const SEARCHING = ["draft", "quoted", "requested", "searching", "offered"];
const CANCELLED = ["cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "expired"];

export function groupOf(status: string): Exclude<TripGroup, "all" | "flagged"> {
  if (LIVE.includes(status)) return "live";
  if (SEARCHING.includes(status)) return "searching";
  if (status === "completed") return "completed";
  if (CANCELLED.includes(status)) return "cancelled";
  return "problem";
}

export function countryOf(zoneId: string): MarketId {
  return marketOfZone(zoneId)?.id ?? "SE";
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

export type { TripRecord } from "../api/seed.ts";

/* ------------------------------------------------------------------ route */

const STREETS: Record<MarketId, string[]> = {
  SE: ["Drottninggatan 12", "Sveavägen 44", "Götgatan 18", "Strandvägen 7", "Hantverkargatan 22", "Odengatan 51", "Karlaplan 3", "Kungsgatan 8", "Birger Jarlsgatan 15", "Hornsgatan 80"],
  FR: ["12 rue de Rivoli", "44 boulevard Haussmann", "8 avenue de l'Opéra", "3 place de la Bastille", "21 rue Oberkampf", "15 quai de Valmy", "60 rue de la Roquette", "9 rue du Bac", "27 avenue Montaigne", "5 rue Lepic"],
  TN: ["20 avenue Habib Bourguiba", "7 rue de Marseille", "14 avenue de la Liberté", "3 rue du Lac Léman", "11 avenue Mohamed V", "5 rue de Rome", "18 avenue de Paris", "9 rue Ibn Khaldoun", "2 rue d'Alger", "30 avenue Hédi Chaker"],
};

export type RouteStop = { kind: "pickup" | "stop" | "dropoff"; label: string; at: LatLng };
export type TripRouteInfo = { stops: RouteStop[]; path: LatLng[]; approach: LatLng[]; km: number; minutes: number; center: LatLng };

export function routeOf(trip: DemoRecord): TripRouteInfo {
  const index = tripIndex(trip.id);
  const country = countryOf(trip.zoneId);
  const zone = zoneById(trip.zoneId);
  const center: LatLng = zone?.center ?? market(country).center;
  const route = tripRoute(center, hash(trip.id), zone?.kind === "airport");
  const streets = STREETS[country];
  const zoneLabel = zone?.name ?? trip.zoneId;
  const extra = index % 4;
  const mids: RouteStop[] = Array.from({ length: extra }, (_, step) => {
    const at = route.path[Math.round(((step + 1) / (extra + 1)) * (route.path.length - 1))];
    return { kind: "stop", label: streets[(index + step + 1) % streets.length], at };
  });
  const fare = fareBreakdown(trip);
  return {
    stops: [
      { kind: "pickup", label: `${streets[index % streets.length]}, ${zoneLabel}`, at: route.pickup },
      ...mids,
      { kind: "dropoff", label: `${streets[(index + 5) % streets.length]}, ${zone?.city ?? market(country).name}`, at: route.dropoff },
    ],
    path: route.path,
    approach: route.approach,
    km: fare.km || Math.round(lengthKm(route.path) * 10) / 10,
    minutes: fare.minutes,
    center,
  };
}

/* ------------------------------------------------------------------ money */

/** VAT included in a ride price. Placeholders until finance confirms them (listed under "To confirm"). */
export const VAT_RATE: Record<MarketId, number> = { SE: 0.06, FR: 0.1, TN: 0.07 };

export type Entry = {
  id: string;
  tripId: string;
  at: string;
  actorId: string;
  kind: "note" | "flag" | "unflag" | "refund" | "pay" | "block" | "receipt" | "case";
  text: string;
  /** Money in minor units: a refund to the rider, or a change to the driver's pay (+ or −). */
  amountMinor?: number;
  /** For a case: "ticket" or "incident". For a block: "rider" or "both". */
  target?: string;
  status: "done" | "waiting" | "declined";
  decidedBy?: string;
  decidedAt?: string;
};

export type MoneySplit = {
  country: MarketId;
  state: "charged" | "estimate" | "cancel_fee" | "none";
  price: number;
  appFee: number;
  ridePrice: number;
  commissionPct: number;
  commission: number;
  promo: number;
  tip: number;
  refunded: number;
  payChange: number;
  vat: number;
  vatRate: number;
  fleetPct: number;
  fleet: number;
  riderPaid: number;
  driverGets: number;
  moveraKeeps: number;
};

export function moneySplit(trip: DemoRecord, book: ZoneBook | null, hasFleet: boolean, entries: readonly Entry[]): MoneySplit {
  const country = countryOf(trip.zoneId);
  const minor = market(country).minorUnits;
  const index = tripIndex(trip.id);
  const category = categoryOf(trip.id).id;
  const prices = book?.prices[category];
  const group = groupOf(trip.status);
  const fare = fareBreakdown(trip).chargedOre;
  let state: MoneySplit["state"] = "charged";
  let price = fare;
  if (group === "searching") state = "estimate";
  else if (group === "live") state = "estimate";
  else if (group === "cancelled" || trip.status === "no_show") {
    const fee = trip.status === "no_show" ? prices?.noShowFee ?? 0 : trip.status === "cancelled_by_rider" && index % 3 === 0 ? prices?.cancelFee ?? 0 : 0;
    price = Math.round(fee * minor);
    state = price > 0 ? "cancel_fee" : "none";
  } else if (trip.status === "failed") {
    state = "none";
    price = 0;
  }
  const appFeePct = state === "cancel_fee" ? 0 : prices?.appFeePct ?? 0;
  const ridePrice = Math.round(price / (1 + appFeePct / 100));
  const appFee = price - ridePrice;
  const commissionPct = book?.commission[category] ?? 20;
  const commission = Math.round((ridePrice * commissionPct) / 100);
  const promo = state === "charged" && index % 7 === 0 ? Math.round(price * 0.15) : 0;
  const tip = state === "charged" && index % 3 === 0 ? Math.round(price * 0.1 / minor) * minor : 0;
  const done = entries.filter((entry) => entry.tripId === trip.id && entry.status === "done");
  const refunded = done.filter((entry) => entry.kind === "refund").reduce((sum, entry) => sum + (entry.amountMinor ?? 0), 0);
  const payChange = done.filter((entry) => entry.kind === "pay").reduce((sum, entry) => sum + (entry.amountMinor ?? 0), 0);
  const vatRate = VAT_RATE[country];
  const vat = Math.round((price * vatRate) / (1 + vatRate));
  const fleetPct = hasFleet ? book?.fleetCommissionPct ?? 0 : 0;
  const driverRide = ridePrice - commission + payChange;
  const fleet = Math.round((driverRide * fleetPct) / 100);
  const riderPaid = price - promo + tip - refunded;
  const driverGets = driverRide - fleet + tip;
  return {
    country,
    state,
    price,
    appFee,
    ridePrice,
    commissionPct,
    commission,
    promo,
    tip,
    refunded,
    payChange,
    vat,
    vatRate,
    fleetPct,
    fleet,
    riderPaid,
    driverGets,
    moveraKeeps: riderPaid - driverGets - fleet,
  };
}

/* ------------------------------------------------------------------ chat, calls, offers */

export type ChatLine = { at: string; from: "rider" | "driver" | "system"; text: string };
export type CallLine = { at: string; from: "rider" | "driver"; seconds: number; answered: boolean };
export type OfferLine = { at: string; driverId: string; answer: "accepted" | "declined" | "no answer" };

const DRIVER_LINES = ["Hi, I'm on my way.", "I'm outside, grey car.", "I can't stop here, I'm by the bus stop.", "I'm 2 minutes away, traffic is heavy.", "Thank you, have a nice day!"];
const RIDER_LINES = ["Thanks, coming down now.", "I'm at the main door.", "Can you wait one minute please?", "I have a big suitcase.", "Found you, thanks!"];

function reached(trip: DemoRecord, code: string): string | null {
  return timelineOf(trip).find((event) => event.code === code)?.at ?? null;
}

function plus(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

/** Messages sent through the Movera app between rider and driver. */
export function chatOf(trip: DemoRecord): ChatLine[] {
  if (!trip.driverId) return [];
  const accepted = reached(trip, "accepted");
  if (!accepted) return [];
  const index = tripIndex(trip.id);
  const lines: ChatLine[] = [{ at: accepted, from: "system", text: "Chat opened when the driver accepted." }];
  const count = 2 + (index % 4);
  for (let step = 0; step < count; step += 1) {
    const driver = (step + index) % 2 === 0;
    const list = driver ? DRIVER_LINES : RIDER_LINES;
    lines.push({ at: plus(accepted, 25 + step * 40), from: driver ? "driver" : "rider", text: list[(index + step) % list.length] });
  }
  return lines;
}

/** Calls made through the Movera line. Numbers stay hidden from both sides; nothing is recorded. */
export function callsOf(trip: DemoRecord): CallLine[] {
  if (!trip.driverId) return [];
  const accepted = reached(trip, "accepted");
  if (!accepted) return [];
  const index = tripIndex(trip.id);
  const calls: CallLine[] = [];
  if (index % 3 === 0) calls.push({ at: plus(accepted, 70), from: "driver", seconds: 38 + (index % 50), answered: true });
  if (index % 5 === 1) calls.push({ at: plus(accepted, 95), from: "driver", seconds: 0, answered: false });
  if (index % 4 === 2) calls.push({ at: plus(accepted, 120), from: "rider", seconds: 22 + (index % 30), answered: true });
  return calls;
}

/** Drivers asked before one said yes. */
export function offersOf(trip: DemoRecord, driverIds: readonly string[]): OfferLine[] {
  const asked = reached(trip, "searching") ?? reached(trip, "requested");
  if (!asked || !driverIds.length) return [];
  const index = tripIndex(trip.id);
  const others = driverIds.filter((id) => id !== trip.driverId);
  const misses = index % 3;
  const lines: OfferLine[] = Array.from({ length: Math.min(misses, others.length) }, (_, step) => ({
    at: plus(asked, 10 + step * 12),
    driverId: others[(index + step * 7) % others.length],
    answer: step % 2 === 0 ? "no answer" : "declined",
  }));
  const accepted = reached(trip, "accepted");
  if (trip.driverId && accepted) lines.push({ at: plus(accepted, -5), driverId: trip.driverId, answer: "accepted" });
  return lines;
}

/** One line summary for the trip page: did the driver call the rider through Movera? */
export function callSummary(calls: readonly CallLine[]): string {
  const driver = calls.filter((call) => call.from === "driver");
  const rider = calls.filter((call) => call.from === "rider");
  const parts: string[] = [];
  parts.push(driver.length ? `Driver called the rider ${driver.length === 1 ? "once" : `${driver.length} times`}${driver.some((call) => !call.answered) ? " (not all answered)" : ""}` : "Driver did not call the rider");
  parts.push(rider.length ? `rider called the driver ${rider.length === 1 ? "once" : `${rider.length} times`}` : "rider did not call the driver");
  return parts.join(", ");
}

/* ------------------------------------------------------------------ settings and admin work */

export type ActionId = "refund" | "price" | "note" | "contact" | "flag" | "case" | "pay" | "block" | "receipt";

export const ACTIONS: { id: ActionId; label: string; help: string }[] = [
  { id: "refund", label: "Refund (full or part)", help: "Give money back to the rider. Over the limit, a second admin approves." },
  { id: "price", label: "Change the price", help: "The live price controls (fare ±15%, waiting time)." },
  { id: "note", label: "Notes", help: "Private notes on the trip for other admins." },
  { id: "contact", label: "Contact rider or driver", help: "Call or message from the trip page." },
  { id: "flag", label: "Flag the trip", help: "Mark it for a closer look. Flagged trips have their own filter." },
  { id: "case", label: "Open a support ticket or incident", help: "Start a case linked to this trip." },
  { id: "pay", label: "Change the driver's pay", help: "Add or take away money from the driver for this trip. Over the limit, a second admin approves." },
  { id: "block", label: "Do not match again", help: "This rider and this driver will not be matched again." },
  { id: "receipt", label: "Resend the receipt", help: "Send the receipt to the rider again." },
];

/** Roles that always see phone numbers and chats. The Super admin can add more. */
export const PRIVATE_BASE: readonly Role[] = ["super", "ops", "support", "safety"];

export type TripView = { id: string; name: string; by: string; shared: boolean; country: MarketId; query: string };

export type TripSettings = {
  extraRoles: Role[];
  /** Ask for a reason before showing numbers and chats. Every look is logged either way. */
  reasonToShow: boolean;
  actions: Record<ActionId, boolean>;
  /** Over this amount (major units), a refund or a pay change waits for a second admin. */
  approvalOver: Record<MarketId, number>;
};

export type TripOps = { draftRev: number; settings: TripSettings; entries: Entry[]; views: TripView[] };

export function defaultTripSettings(): TripSettings {
  return {
    extraRoles: [],
    reasonToShow: true,
    actions: Object.fromEntries(ACTIONS.map((item) => [item.id, true])) as Record<ActionId, boolean>,
    approvalOver: { SE: 500, FR: 50, TN: 150 },
  };
}

export function emptyTripOps(): TripOps {
  return { draftRev: 1, settings: defaultTripSettings(), entries: [], views: [] };
}

export function normalizeTripOps(value: unknown): TripOps {
  const base = emptyTripOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<TripOps>;
  const settings = (raw.settings ?? {}) as Partial<TripSettings>;
  return {
    draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1,
    settings: {
      extraRoles: Array.isArray(settings.extraRoles) ? settings.extraRoles : [],
      reasonToShow: settings.reasonToShow !== false,
      actions: { ...base.settings.actions, ...(settings.actions ?? {}) },
      approvalOver: { ...base.settings.approvalOver, ...(settings.approvalOver ?? {}) },
    },
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    views: Array.isArray(raw.views) ? raw.views : [],
  };
}

export function canSeePrivate(role: Role, settings: TripSettings): boolean {
  return PRIVATE_BASE.includes(role) || settings.extraRoles.includes(role);
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, "");
  return digits.length <= 4 ? "••••" : `•••• ${digits.slice(-4)}`;
}

export function entriesFor(ops: TripOps, tripId: string): Entry[] {
  return ops.entries.filter((entry) => entry.tripId === tripId).sort((a, b) => b.at.localeCompare(a.at));
}

export function isFlagged(ops: TripOps, tripId: string): boolean {
  const last = ops.entries.filter((entry) => entry.tripId === tripId && (entry.kind === "flag" || entry.kind === "unflag")).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  return last?.kind === "flag";
}

export function flaggedIds(ops: TripOps): Set<string> {
  return new Set(ops.entries.filter((entry) => entry.kind === "flag").map((entry) => entry.tripId).filter((id) => isFlagged(ops, id)));
}

export type NewEntry = Omit<Entry, "id" | "at" | "status" | "actorId">;

/** Adds admin work to a trip. Money over the limit waits for a second admin. */
export function addEntry(ops: TripOps, input: NewEntry, actorId: string, at: string, split?: MoneySplit): { ops: TripOps; entry: Entry; error?: string } {
  const entry: Entry = { ...input, id: `${input.tripId}-${input.kind}-${ops.entries.length + 1}`, at, actorId, status: "done" };
  const fail = (error: string) => ({ ops, entry, error });
  if (input.kind === "note" && !input.text.trim()) return fail("Write the note first.");
  if ((input.kind === "flag" || input.kind === "case") && !input.text.trim()) return fail("Say why.");
  if (input.kind === "refund") {
    const amount = input.amountMinor ?? 0;
    if (!split) return fail("The price is not ready yet.");
    if (amount <= 0) return fail("Choose an amount above zero.");
    const left = split.riderPaid - split.tip - waitingRefunds(ops, input.tripId);
    if (amount > left) return fail("That is more than the rider paid.");
  }
  if (input.kind === "pay") {
    const amount = input.amountMinor ?? 0;
    if (!amount) return fail("Choose an amount, more or less than zero.");
    if (split && split.driverGets + amount < 0) return fail("The driver cannot get less than zero.");
  }
  return { ops: { ...ops, draftRev: ops.draftRev + 1, entries: [...ops.entries, entry] }, entry };
}

function waitingRefunds(ops: TripOps, tripId: string): number {
  return ops.entries.filter((entry) => entry.tripId === tripId && entry.kind === "refund" && entry.status === "waiting").reduce((sum, entry) => sum + (entry.amountMinor ?? 0), 0);
}

/** Money entries above the country limit need a second admin. */
export function needsApproval(kind: Entry["kind"], amountMinor: number, country: MarketId, settings: TripSettings): boolean {
  if (kind !== "refund" && kind !== "pay") return false;
  return Math.abs(amountMinor) > settings.approvalOver[country] * market(country).minorUnits;
}

export function withStatus(result: { ops: TripOps; entry: Entry; error?: string }, waiting: boolean): { ops: TripOps; entry: Entry; error?: string } {
  if (result.error || !waiting) return result;
  const entry = { ...result.entry, status: "waiting" as const };
  return { ...result, entry, ops: { ...result.ops, entries: result.ops.entries.map((item) => (item.id === entry.id ? entry : item)) } };
}

export function decide(ops: TripOps, entryId: string, approverId: string, approve: boolean, at: string): { ops: TripOps; error?: string } {
  const entry = ops.entries.find((item) => item.id === entryId);
  if (!entry || entry.status !== "waiting") return { ops, error: "Nothing waits here." };
  if (entry.actorId === approverId) return { ops, error: "A second admin must decide." };
  const next: Entry = { ...entry, status: approve ? "done" : "declined", decidedBy: approverId, decidedAt: at };
  return { ops: { ...ops, draftRev: ops.draftRev + 1, entries: ops.entries.map((item) => (item.id === entryId ? next : item)) } };
}

export function saveSettings(ops: TripOps, settings: TripSettings): { ops: TripOps; error?: string } {
  for (const [country, value] of Object.entries(settings.approvalOver)) {
    if (!Number.isFinite(value) || value < 0) return { ops, error: `The approval limit for ${market(country as MarketId).name} must be zero or more.` };
  }
  return { ops: { ...ops, draftRev: ops.draftRev + 1, settings } };
}

export function saveView(ops: TripOps, view: Omit<TripView, "id">): { ops: TripOps; error?: string } {
  const name = view.name.trim();
  if (!name) return { ops, error: "Give the view a name." };
  if (ops.views.some((item) => item.by === view.by && item.name.toLowerCase() === name.toLowerCase())) return { ops, error: "You already have a view with that name." };
  return { ops: { ...ops, draftRev: ops.draftRev + 1, views: [...ops.views, { ...view, name, id: `view-${ops.views.length + 1}-${hash(name + view.by) % 10_000}` }] } };
}

/* ------------------------------------------------------------------ list numbers */

export type ListStats = { total: number; live: number; searching: number; completed: number; cancelled: number; problem: number; avgPrice: number; taken: number };

export function listStats(trips: readonly DemoRecord[]): ListStats {
  const stats: ListStats = { total: trips.length, live: 0, searching: 0, completed: 0, cancelled: 0, problem: 0, avgPrice: 0, taken: 0 };
  for (const trip of trips) {
    const group = groupOf(trip.status);
    stats[group] += 1;
    if (group === "completed") stats.taken += fareBreakdown(trip).chargedOre;
  }
  stats.avgPrice = stats.completed ? Math.round(stats.taken / stats.completed) : 0;
  return stats;
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

export function whenOf(trip: DemoRecord): string {
  return startedAt(trip.id);
}

/** One line for the CSV and the trip list. */
export function shortWhen(iso: string, country: MarketId): string {
  const item = market(country);
  return new Intl.DateTimeFormat(item.locale, { timeZone: item.timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}
