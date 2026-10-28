import { isLiveData, liveRiderOf } from "../live/realData.ts";
import { market, type MarketId } from "../markets/markets.ts";
import { defaultRefundPolicy, needsSecondAdmin, type RefundPolicy } from "../payments/refundPolicy.ts";
import { countryOf, hash, type Booking, type RiderProfile, type RiderRecord } from "./profile.ts";

/**
 * What admins do for riders: messages, wallet credit, refunds, promotions, bans,
 * lost items and saved filters. One shared book, saved through audited commands.
 * Amounts are major units (kr, €, DT) in the rider's own currency.
 */

export const CARE_KEY = "riderCare";

export type CareMessage = { from: "admin" | "contact"; text: string; at: string; by: string };
export type Credit = { id: string; riderId: string; amount: number; currency: MarketId; reason: string; by: string; at: string };
export type RefundDestination = "wallet" | "card" | "bank";
export type Refund = {
  id: string;
  riderId: string;
  bookingId: string;
  amount: number;
  currency: MarketId;
  destination: RefundDestination;
  reason: string;
  status: "sent" | "waiting" | "rejected";
  by: string;
  at: string;
  decidedBy: string | null;
};
export type PromoKind = "percent" | "fixed";
export type PromoTicket = {
  id: string;
  code: string;
  title: string;
  kind: PromoKind;
  value: number;
  rides: number;
  maxPerRide: number;
  minFare: number;
  validFrom: string;
  validTo: string;
  country: MarketId;
  zones: string[];
  categories: string[];
  budget: number | null;
  riderIds: string[];
  group: string;
  createdBy: string;
  createdAt: string;
  status: "active" | "paused" | "stopped";
  /** Picture on the home-screen card in the rider app. */
  image?: string;
  editedBy?: string;
  editedAt?: string;
  /** "riders": given to the riders listed. "code": anyone who types the code in the app, up to maxUses riders. */
  audience?: PromoAudience;
  maxUses?: number | null;
  /** Shown as a popup when riders open the app, until the promotion ends. */
  popup?: boolean;
  sends?: PromoSend[];
};
export type PromoAudience = "riders" | "code";
export type SendChannel = "push" | "inapp" | "popup" | "sms" | "email";
export const SEND_CHANNELS: { id: SendChannel; label: string; hint: string }[] = [
  { id: "push", label: "Push notification", hint: "On the phone lock screen" },
  { id: "inapp", label: "Message in the app", hint: "In the rider's messages" },
  { id: "popup", label: "Popup in the app", hint: "Shows when the rider opens the app" },
  { id: "sms", label: "SMS", hint: "Text message to the phone number" },
  { id: "email", label: "Email", hint: "To the rider's email" },
];
export type PromoSend = { id: string; channels: SendChannel[]; riders: number; emails: number; subject: string; message: string; by: string; at: string };
export type AutoAudience = "all" | "new" | "inactive" | "top" | "loyal" | "random" | "picked";
export const AUTO_AUDIENCES: { id: AutoAudience; label: string }[] = [
  { id: "all", label: "All riders" },
  { id: "new", label: "New riders" },
  { id: "inactive", label: "Inactive riders" },
  { id: "top", label: "Top riders" },
  { id: "loyal", label: "Loyal riders" },
  { id: "random", label: "Random riders" },
  { id: "picked", label: "Riders I pick" },
];
/** from / to are days (2026-10-01). Empty means no start or no end. */
type AutoBase = { on: boolean; percent: number; maxPerRide: number; rides: number; audience: AutoAudience; categories: string[]; from: string; to: string;
  /** For "random" and "picked": the riders who can get it. count is how many random riders. */
  riderIds: string[]; count: number };
export type AutoPromos = {
  firstRide: AutoBase;
  birthday: AutoBase;
  winBack: AutoBase & { afterDays: number };
};
export type BanEntry = { value: string; riderId: string; reason: string; by: string; at: string };
export type LostItem = { id: string; item: string; bookingId: string; status: "reported" | "driver contacted" | "returned"; at: string; by: string };
export type SavedFilter = { id: string; name: string; by: string; segment: string; query: string; sort: string; period: string };

export type RiderCare = {
  draftRev: number;
  messages: Record<string, CareMessage[]>;
  assigned: Record<string, string>;
  credits: Credit[];
  refunds: Refund[];
  promotions: PromoTicket[];
  autoPromos: AutoPromos;
  bans: { phones: BanEntry[]; cards: BanEntry[] };
  lostFound: Record<string, LostItem[]>;
  identity: Record<string, "requested" | "verified">;
  merges: Record<string, string>;
  paid: Record<string, string>;
  savedFilters: SavedFilter[];
  /** Most wallet credit one rider can get in a calendar month, per country. */
  limits: Record<MarketId, number>;
};

export const CREDIT_MAX: Record<MarketId, number> = { SE: 500, FR: 50, TN: 150 };

export function emptyRiderCare(): RiderCare {
  return {
    draftRev: 1,
    messages: {},
    assigned: {},
    credits: [],
    refunds: [],
    promotions: [
      { id: "P-SEED-1", code: "WELCOME30", title: "Welcome to Movera", kind: "percent", value: 30, rides: 3, maxPerRide: 50, minFare: 0, validFrom: "2026-09-01T00:00:00.000Z", validTo: "2026-12-31T23:00:00.000Z", country: "SE", zones: [], categories: [], budget: 20000, riderIds: ["R0001", "R0017", "R0033", "R0049", "R0065", "R0081", "R0097", "R0113", "R0129", "R0145"], group: "New riders", createdBy: "nora", createdAt: "2026-09-20T09:00:00.000Z", status: "active", image: "gradient" },
      { id: "P-SEED-2", code: "THANKYOU20", title: "Thank you for riding", kind: "percent", value: 20, rides: 10, maxPerRide: 40, minFare: 80, validFrom: "2026-09-15T00:00:00.000Z", validTo: "2026-11-30T23:00:00.000Z", country: "SE", zones: [], categories: ["economy", "comfort"], budget: 30000, riderIds: ["R0010", "R0020", "R0030", "R0040", "R0050", "R0060", "R0070", "R0080"], group: "Top riders", createdBy: "lena", createdAt: "2026-09-15T08:00:00.000Z", status: "active", image: "comfort" },
    ],
    autoPromos: {
      firstRide: { on: true, percent: 50, maxPerRide: 100, rides: 1, audience: "new", categories: [], from: "", to: "", riderIds: [], count: 20 },
      birthday: { on: false, percent: 20, maxPerRide: 60, rides: 1, audience: "all", categories: [], from: "", to: "", riderIds: [], count: 20 },
      winBack: { on: true, percent: 25, afterDays: 30, maxPerRide: 60, rides: 3, audience: "inactive", categories: [], from: "", to: "", riderIds: [], count: 20 },
    },
    bans: { phones: [], cards: [] },
    lostFound: {},
    identity: {},
    merges: {},
    paid: {},
    savedFilters: [],
    limits: { SE: 1000, FR: 100, TN: 300 },
  };
}

export function normalizeCare(value: unknown): RiderCare {
  const fallback = emptyRiderCare();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<RiderCare>;
  return {
    ...fallback,
    ...raw,
    autoPromos: {
      firstRide: { ...fallback.autoPromos.firstRide, ...(raw.autoPromos?.firstRide ?? {}) },
      birthday: { ...fallback.autoPromos.birthday, ...(raw.autoPromos?.birthday ?? {}) },
      winBack: { ...fallback.autoPromos.winBack, ...(raw.autoPromos?.winBack ?? {}) },
    },
    bans: { ...fallback.bans, ...(raw.bans ?? {}) },
    limits: { ...fallback.limits, ...(raw.limits ?? {}) },
    promotions: Array.isArray(raw.promotions) ? raw.promotions : fallback.promotions,
  };
}

function bump(care: RiderCare, patch: Partial<RiderCare>): RiderCare {
  return { ...care, ...patch, draftRev: care.draftRev + 1 };
}

export function toMinor(amount: number, country: MarketId): number {
  return Math.round(amount * market(country).minorUnits);
}

export function toMajor(minor: number, country: MarketId): number {
  return minor / market(country).minorUnits;
}

/* ---------- Messages ---------- */

const TOPICS = [
  ["I left my umbrella in the car this morning. Can you help me find it?", "lost"],
  ["Why was I charged twice for my last ride?", "payment"],
  ["The driver was rude and drove too fast.", "complaint"],
  ["Can I get a receipt for my ride on Monday?", "receipt"],
  ["My promo code is not working.", "promo"],
  ["The driver took a much longer route than needed.", "complaint"],
] as const;

export const REPLY_TEMPLATES = [
  "Thanks for writing. We are looking into it and will reply within the hour.",
  "Your refund is approved. You will see it in 3–5 working days.",
  "We found your item. The driver will contact you to return it.",
  "Sorry the driver was late. We added a credit to your wallet.",
  "Your receipt has been sent to your email.",
];

/** About one rider in seven has written to Movera recently. */
export function seededThread(rider: RiderRecord, now: number): CareMessage[] {
  const seed = hash(`msg:${rider.id}`);
  if (seed % 7 !== 0) return [];
  const [text] = TOPICS[(seed >>> 3) % TOPICS.length];
  const minutesAgo = 12 + ((seed >>> 5) % (60 * 30));
  const thread: CareMessage[] = [{ from: "contact", text, at: new Date(now - minutesAgo * 60_000).toISOString(), by: rider.name }];
  // Half of them were already answered.
  if ((seed >>> 9) % 2 === 0) thread.push({ from: "admin", text: REPLY_TEMPLATES[0], at: new Date(now - (minutesAgo - 8) * 60_000).toISOString(), by: "maja" });
  return thread;
}

export function threadOf(care: RiderCare, rider: RiderRecord, now: number): CareMessage[] {
  // Live: no seeded conversation; only messages this panel saved.
  if (isLiveData()) return care.messages[rider.id] ?? [];
  return care.messages[rider.id] ?? seededThread(rider, now);
}

/** Minutes the rider has waited for an answer, or null when nothing is waiting. */
export function waitingMinutes(thread: readonly CareMessage[], now: number): number | null {
  const last = thread[thread.length - 1];
  if (!last || last.from !== "contact") return null;
  return Math.max(0, Math.round((now - Date.parse(last.at)) / 60_000));
}

export function responseTone(minutes: number | null): "green" | "orange" | "red" | null {
  if (minutes === null) return null;
  return minutes < 60 ? "green" : minutes < 240 ? "orange" : "red";
}

export function reply(care: RiderCare, rider: RiderRecord, text: string, by: string, now: number): RiderCare {
  const thread = threadOf(care, rider, now);
  return bump(care, { messages: { ...care.messages, [rider.id]: [...thread, { from: "admin", text: text.trim(), at: new Date(now).toISOString(), by }] } });
}

export function messageGroup(care: RiderCare, riders: readonly RiderRecord[], text: string, by: string, now: number): RiderCare {
  const messages = { ...care.messages };
  for (const rider of riders) messages[rider.id] = [...threadOf(care, rider, now), { from: "admin", text: text.trim(), at: new Date(now).toISOString(), by }];
  return bump(care, { messages });
}

export function assign(care: RiderCare, riderId: string, agentId: string | null): RiderCare {
  const assigned = { ...care.assigned };
  if (agentId) assigned[riderId] = agentId;
  else delete assigned[riderId];
  return bump(care, { assigned });
}

/* ---------- Money ---------- */

export function walletMinor(care: RiderCare, rider: RiderRecord): number {
  // Live: the server's wallet balance (AdminRider.wallet), NaN when it sent none.
  if (isLiveData()) return liveRiderOf(rider)?.walletMinor ?? NaN;
  const country = countryOf(rider);
  const base = toMinor((hash(`wallet:${rider.id}`) % 7 === 0 ? (hash(rider.id) % 250) : 0) * (country === "SE" ? 1 : country === "FR" ? 0.1 : 0.3), country);
  const credits = care.credits.filter((item) => item.riderId === rider.id).reduce((sum, item) => sum + toMinor(item.amount, country), 0);
  const refunds = care.refunds.filter((item) => item.riderId === rider.id && item.destination === "wallet" && item.status === "sent").reduce((sum, item) => sum + toMinor(item.amount, country), 0);
  return base + credits + refunds;
}

export function creditedThisMonth(care: RiderCare, riderId: string, now: number): number {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return care.credits.filter((item) => item.riderId === riderId && Date.parse(item.at) >= start).reduce((sum, item) => sum + item.amount, 0);
}

export function addCredit(care: RiderCare, rider: RiderRecord, amount: number, reason: string, by: string, now: number): { care: RiderCare; error?: string } {
  const country = countryOf(rider);
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
  if (!(amount > 0)) return { care, error: "Enter an amount above 0." };
  if (amount > CREDIT_MAX[country]) return { care, error: `One credit can be at most ${CREDIT_MAX[country]} ${symbol}.` };
  if (!reason.trim()) return { care, error: "Write why the rider gets this credit." };
  const used = creditedThisMonth(care, rider.id, now);
  if (used + amount > care.limits[country]) return { care, error: `Monthly limit is ${care.limits[country]} ${symbol}. ${used} ${symbol} already given this month.` };
  const credit: Credit = { id: `CR-${rider.id}-${care.credits.length + 1}`, riderId: rider.id, amount, currency: country, reason: reason.trim(), by, at: new Date(now).toISOString() };
  return { care: bump(care, { credits: [credit, ...care.credits] }) };
}

/** `policy` is the one second-admin rule from Settings (Q25); the defaults apply until it is loaded. */
export function requestRefund(care: RiderCare, rider: RiderRecord, booking: Booking | undefined, amount: number, destination: RefundDestination, reason: string, by: string, now: number, policy: RefundPolicy = defaultRefundPolicy()): { care: RiderCare; error?: string; needsApproval: boolean } {
  const country = countryOf(rider);
  if (!booking) return { care, error: "Pick the ride to refund.", needsApproval: false };
  const paid = toMajor(booking.fareMinor, country);
  const already = care.refunds.filter((item) => item.bookingId === booking.id && item.status !== "rejected").reduce((sum, item) => sum + item.amount, 0);
  if (!(amount > 0)) return { care, error: "Enter an amount above 0.", needsApproval: false };
  if (amount + already > paid + 0.001) return { care, error: `The rider paid ${paid.toFixed(market(country).minorUnits === 1000 ? 3 : 2)} for this ride${already ? `, ${already} already refunded` : ""}.`, needsApproval: false };
  if (!reason.trim()) return { care, error: "Write why the rider is refunded.", needsApproval: false };
  const needsApproval = needsSecondAdmin(policy, country, toMinor(amount, country));
  const refund: Refund = { id: `RF-${rider.id}-${care.refunds.length + 1}`, riderId: rider.id, bookingId: booking.id, amount, currency: country, destination, reason: reason.trim(), status: needsApproval ? "waiting" : "sent", by, at: new Date(now).toISOString(), decidedBy: null };
  return { care: bump(care, { refunds: [refund, ...care.refunds] }), needsApproval };
}

/** A second admin approves or rejects a big refund. */
export function decideRefund(care: RiderCare, refundId: string, approve: boolean, by: string): { care: RiderCare; error?: string } {
  const refund = care.refunds.find((item) => item.id === refundId);
  if (!refund || refund.status !== "waiting") return { care, error: "This refund is not waiting for approval." };
  if (refund.by === by) return { care, error: "Another admin must approve a refund you asked for." };
  return { care: bump(care, { refunds: care.refunds.map((item) => (item.id === refundId ? { ...item, status: approve ? "sent" : "rejected", decidedBy: by } : item)) }) };
}

/** A failed rider payment that is not settled yet. Rides stay blocked until it is paid. */
export function unpaidMinor(care: RiderCare, rider: RiderRecord, profile: RiderProfile): number {
  // Live: the server's unpaid fees (AdminRider.outstanding).
  if (isLiveData()) return liveRiderOf(rider)?.outstandingMinor ?? 0;
  if (!profile.payment.failed || care.paid[rider.id]) return 0;
  return Math.max(profile.avgFareMinor, toMinor(profile.country === "SE" ? 149 : profile.country === "FR" ? 14 : 45, profile.country)) * profile.payment.failed;
}

export function markPaid(care: RiderCare, riderId: string, now: number): RiderCare {
  return bump(care, { paid: { ...care.paid, [riderId]: new Date(now).toISOString() } });
}

/* ---------- Promotions ---------- */

export type PromoDraft = Omit<PromoTicket, "id" | "createdBy" | "createdAt" | "status">;

export function validatePromo(draft: PromoDraft): string | null {
  if (!/^[A-Z0-9]{3,16}$/.test(draft.code)) return "Code needs 3–16 letters or digits, like SPRING30.";
  if (!draft.title.trim()) return "Give the promotion a title riders see.";
  if (draft.kind === "percent" && !(draft.value > 0 && draft.value <= 100)) return "Discount must be between 1 and 100%.";
  if (draft.kind === "fixed" && !(draft.value > 0)) return "Discount must be above 0.";
  if (!(draft.rides >= 1 && draft.rides <= 100)) return "Number of rides must be between 1 and 100.";
  if (draft.kind === "percent" && !(draft.maxPerRide > 0)) return "Set the most a rider can save per ride.";
  if (!draft.validFrom || !draft.validTo || Date.parse(draft.validTo) <= Date.parse(draft.validFrom)) return "The end date must be after the start date.";
  if (draft.audience === "code") {
    if (!(draft.maxUses && draft.maxUses >= 1)) return "Set how many riders can use the code.";
  } else if (!draft.riderIds.length) return "Pick at least one rider.";
  if (draft.budget !== null && draft.budget > 0 && maxCost(draft) > draft.budget) return `The most it can cost (${Math.round(maxCost(draft))}) is above the budget of ${draft.budget}.`;
  return null;
}

/** The most the promotion can cost if every rider uses every ride at the top discount. */
export function maxCost(draft: Pick<PromoTicket, "kind" | "value" | "rides" | "maxPerRide" | "riderIds" | "audience" | "maxUses">): number {
  const perRide = draft.kind === "percent" ? draft.maxPerRide : draft.value;
  return promoReach(draft) * draft.rides * perRide;
}

/** How many riders the promotion can reach: the riders listed, or the code's limit. */
export function promoReach(ticket: Pick<PromoTicket, "riderIds" | "audience" | "maxUses">): number {
  return ticket.audience === "code" ? ticket.maxUses ?? 0 : ticket.riderIds.length;
}

export function createPromotion(care: RiderCare, draft: PromoDraft, by: string, now: number): { care: RiderCare; error?: string; ticket?: PromoTicket } {
  const error = validatePromo(draft);
  if (error) return { care, error };
  if (care.promotions.some((item) => item.code === draft.code && item.status === "active")) return { care, error: `${draft.code} is already used by an active promotion.` };
  const ticket: PromoTicket = { ...draft, id: `P-${now}-${care.promotions.length + 1}`, createdBy: by, createdAt: new Date(now).toISOString(), status: "active" };
  return { care: bump(care, { promotions: [ticket, ...care.promotions] }), ticket };
}

export function stopPromotion(care: RiderCare, id: string): RiderCare {
  return bump(care, { promotions: care.promotions.map((item) => (item.id === id ? { ...item, status: "stopped" } : item)) });
}

/** Switch a promotion off for now (riders keep it but cannot use it) or back on. */
export function setPromotionOn(care: RiderCare, id: string, on: boolean): RiderCare {
  return bump(care, { promotions: care.promotions.map((item) => (item.id === id && item.status !== "stopped" ? { ...item, status: on ? "active" : "paused" } : item)) });
}

export type PromoEdit = { value: number; maxPerRide: number; rides: number };

/** Change the discount, the most per ride or how many rides, on a promotion already given. */
export function editPromotion(care: RiderCare, id: string, edit: PromoEdit, by: string, now: number): { care: RiderCare; error?: string } {
  const ticket = care.promotions.find((item) => item.id === id);
  if (!ticket) return { care, error: "Promotion not found." };
  if (ticket.status === "stopped") return { care, error: "A stopped promotion cannot be changed." };
  const next = { ...ticket, ...edit, maxPerRide: ticket.kind === "percent" ? edit.maxPerRide : edit.value };
  const error = validatePromo(next);
  if (error) return { care, error };
  return { care: bump(care, { promotions: care.promotions.map((item) => (item.id === id ? { ...next, editedBy: by, editedAt: new Date(now).toISOString() } : item)) }) };
}

export function setAutoPromos(care: RiderCare, auto: AutoPromos): { care: RiderCare; error?: string } {
  for (const item of Object.values(auto)) {
    if (item.from && item.to && item.to < item.from) return { care, error: "The end day must be after the start day." };
    if ((item.audience === "random" || item.audience === "picked") && item.on && !item.riderIds.length) return { care, error: item.audience === "random" ? "Pick the random riders." : "Pick at least one rider." };
  }
  return { care: bump(care, { autoPromos: auto }) };
}

/** Whether an automatic promotion runs on this day. */
export function autoState(item: Pick<AutoBase, "on" | "from" | "to">, now: number): "off" | "running" | "waiting" | "ended" {
  if (!item.on) return "off";
  const today = new Date(now).toISOString().slice(0, 10);
  if (item.from && today < item.from) return "waiting";
  if (item.to && today > item.to) return "ended";
  return "running";
}

/** Riders picked at random (no blocked accounts). The same seed gives the same riders. */
export function randomRiders<T extends { id: string }>(riders: readonly T[], count: number, seed: number): T[] {
  return [...riders].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`)).slice(0, Math.max(0, Math.round(count)));
}

export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);
  const valid = [...new Set(parts.filter((part) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(part)).map((part) => part.toLowerCase()))];
  return { valid, invalid: parts.filter((part) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(part)) };
}

export function promoMessage(ticket: Pick<PromoTicket, "title" | "kind" | "value" | "rides" | "maxPerRide" | "code" | "validTo" | "country">, locale: string): string {
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[ticket.country];
  const deal = ticket.kind === "percent" ? `${ticket.value}%` : `${ticket.value} ${symbol}`;
  const until = ticket.validTo ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(Date.parse(ticket.validTo)) : "";
  return `${ticket.title}: ${deal} off your next ${ticket.rides} ride${ticket.rides === 1 ? "" : "s"} with Movera. Use code ${ticket.code}${until ? ` before ${until}` : ""}.`;
}

/**
 * Send the code by the chosen channels. In-app messages land in each rider's messages;
 * a popup stays on until the promotion ends.
 */
export function sendPromotion(
  care: RiderCare,
  id: string,
  send: { channels: SendChannel[]; riders: readonly RiderRecord[]; emails: readonly string[]; subject: string; message: string },
  by: string,
  now: number,
): { care: RiderCare; error?: string } {
  const ticket = care.promotions.find((item) => item.id === id);
  if (!ticket || ticket.status !== "active") return { care, error: "Only an active promotion can be sent." };
  if (!send.channels.length) return { care, error: "Pick at least one way to send it." };
  if (!send.message.trim()) return { care, error: "Write the message." };
  if (!send.message.includes(ticket.code)) return { care, error: `Put the code ${ticket.code} in the message.` };
  const appChannels = send.channels.filter((channel) => channel !== "email");
  if (appChannels.length && !send.riders.length) return { care, error: "Pick the riders to send it to." };
  if (!send.riders.length && !send.emails.length) return { care, error: "Pick riders or add email addresses." };
  if (send.emails.length && !send.channels.includes("email")) return { care, error: "Tick Email to send to the email addresses." };
  if (send.channels.includes("email") && !send.subject.trim()) return { care, error: "Write the email subject." };
  const entry: PromoSend = { id: `S-${ticket.id}-${(ticket.sends?.length ?? 0) + 1}`, channels: send.channels, riders: send.riders.length, emails: send.emails.length, subject: send.subject.trim(), message: send.message.trim(), by, at: new Date(now).toISOString() };
  const messages = send.channels.includes("inapp") ? messageGroup(care, send.riders, send.message, by, now).messages : care.messages;
  return {
    care: bump(care, {
      messages,
      promotions: care.promotions.map((item) => (item.id === id ? { ...item, popup: item.popup || send.channels.includes("popup"), sends: [entry, ...(item.sends ?? [])] } : item)),
    }),
  };
}

export function setPopup(care: RiderCare, id: string, on: boolean): RiderCare {
  return bump(care, { promotions: care.promotions.map((item) => (item.id === id ? { ...item, popup: on } : item)) });
}

/** What a promotion does to one category's price: the old price, the new price, or nothing. */
export function promoPrice(price: number, categoryId: string, promo: { kind: PromoKind; value: number; maxPerRide: number; minFare: number; categories: readonly string[] }): { applies: boolean; discount: number; newPrice: number } {
  const covered = !promo.categories.length || promo.categories.includes(categoryId);
  if (!covered || price <= 0 || price < promo.minFare) return { applies: false, discount: 0, newPrice: price };
  const discount = promo.kind === "percent" ? Math.min(promo.maxPerRide, (price * promo.value) / 100) : Math.min(promo.value, price);
  const rounded = Math.round(discount * 100) / 100;
  return { applies: rounded > 0, discount: rounded, newPrice: Math.round((price - rounded) * 100) / 100 };
}

/** How many rides of a promotion this rider already used. */
export function promoUsed(ticket: PromoTicket, riderId: string, bookings: readonly Booking[]): number {
  if (!ticket.riderIds.includes(riderId)) return 0;
  const after = bookings.filter((booking) => booking.status === "completed" && booking.at >= Date.parse(ticket.createdAt) && (!ticket.categories.length || ticket.categories.includes(booking.category))).length;
  const share = hash(`${ticket.id}:${riderId}`) % 3 === 0 ? 0.5 : 1;
  return Math.min(ticket.rides, Math.floor(after * share));
}

export function promoResults(ticket: PromoTicket, usedBy: (riderId: string) => { used: number; avgFare: number }): { reached: number; usedBy: number; ridesUsed: number; cost: number; ridesGained: number } {
  let users = 0;
  let rides = 0;
  let cost = 0;
  for (const riderId of ticket.riderIds) {
    const { used, avgFare } = usedBy(riderId);
    if (used) users += 1;
    rides += used;
    cost += used * (ticket.kind === "percent" ? Math.min(ticket.maxPerRide, avgFare * (ticket.value / 100)) : ticket.value);
  }
  return { reached: ticket.riderIds.length, usedBy: users, ridesUsed: rides, cost: Math.round(cost), ridesGained: Math.round(rides * 0.35) };
}

/* ---------- Trust and safety ---------- */

export function ban(care: RiderCare, kind: "phones" | "cards", value: string, riderId: string, reason: string, by: string, now: number): { care: RiderCare; error?: string } {
  if (!value.trim()) return { care, error: "Nothing to ban." };
  if (care.bans[kind].some((item) => item.value === value)) return { care, error: "Already on the ban list." };
  return { care: bump(care, { bans: { ...care.bans, [kind]: [{ value, riderId, reason, by, at: new Date(now).toISOString() }, ...care.bans[kind]] } }) };
}

export function isBanned(care: RiderCare, phone: string, card: string): boolean {
  return care.bans.phones.some((item) => item.value === phone) || care.bans.cards.some((item) => item.value === card);
}

export function addLostItem(care: RiderCare, riderId: string, item: string, bookingId: string, by: string, now: number): { care: RiderCare; error?: string } {
  if (!item.trim()) return { care, error: "Describe the lost item." };
  const list = care.lostFound[riderId] ?? [];
  const entry: LostItem = { id: `LF-${riderId}-${list.length + 1}`, item: item.trim(), bookingId, status: "reported", at: new Date(now).toISOString(), by };
  return { care: bump(care, { lostFound: { ...care.lostFound, [riderId]: [entry, ...list] } }) };
}

export function advanceLostItem(care: RiderCare, riderId: string, id: string): RiderCare {
  const next: Record<LostItem["status"], LostItem["status"]> = { reported: "driver contacted", "driver contacted": "returned", returned: "returned" };
  return bump(care, { lostFound: { ...care.lostFound, [riderId]: (care.lostFound[riderId] ?? []).map((item) => (item.id === id ? { ...item, status: next[item.status] } : item)) } });
}

export function setIdentity(care: RiderCare, riderId: string, state: "requested" | "verified"): RiderCare {
  return bump(care, { identity: { ...care.identity, [riderId]: state } });
}

export function merge(care: RiderCare, fromId: string, intoId: string): { care: RiderCare; error?: string } {
  if (!intoId.trim() || intoId === fromId) return { care, error: "Pick the other account to keep." };
  if (care.merges[intoId]) return { care, error: `${intoId} was itself merged into ${care.merges[intoId]}.` };
  return { care: bump(care, { merges: { ...care.merges, [fromId]: intoId } }) };
}

export function saveFilter(care: RiderCare, filter: Omit<SavedFilter, "id">): { care: RiderCare; error?: string } {
  if (!filter.name.trim()) return { care, error: "Name the filter." };
  return { care: bump(care, { savedFilters: [{ ...filter, name: filter.name.trim(), id: `SF-${care.savedFilters.length + 1}-${hash(filter.name) % 1000}` }, ...care.savedFilters].slice(0, 20) }) };
}

export function deleteFilter(care: RiderCare, id: string): RiderCare {
  return bump(care, { savedFilters: care.savedFilters.filter((item) => item.id !== id) });
}

/* ---------- Signals that need a person ---------- */

export function complaintOf(rider: RiderRecord): string | null {
  if (isLiveData()) return null;
  const seed = hash(`complaint:${rider.id}`);
  return seed % 19 === 0 ? ["Overcharged on a long route", "Driver behaviour", "Car was dirty", "Driver cancelled after waiting"][(seed >>> 4) % 4] : null;
}

