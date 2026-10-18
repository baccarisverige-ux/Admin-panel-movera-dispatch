import type { MarketId } from "../markets/markets.ts";
import { currencySymbol, fromSek } from "../pricing/zonePricing.ts";

/**
 * Round 3 offer and trip rules (Q14–Q22): what the offer card shows, why an offer is Exclusive,
 * waiting at pickup and cancel reasons. The names follow the driver app's config
 * (DriverOfferRules, WaitingRules, CancelReasons), so a backend can feed the same values.
 */

/* ---------- Q14: what the offer card shows ---------- */

export type OfferCardDetails = {
  /** The driver's share instead of the full fare. */
  netFare: boolean;
  pickupAddress: boolean;
  /** Only the area of the drop-off, not the street. */
  dropoffAreaOnly: boolean;
  stops: boolean;
  riderRating: boolean;
  tripMinutesKm: boolean;
  pickupDistance: boolean;
  /** Cash, Reservation, extras and the fare boost. */
  badges: boolean;
};

export const OFFER_CARD_DETAILS: { id: Exclude<keyof OfferCardDetails, "netFare" | "dropoffAreaOnly">; label: string; help: string }[] = [
  { id: "pickupAddress", label: "Pickup address", help: "Off: the card says “Pickup nearby”." },
  { id: "stops", label: "Stops", help: "How many stops the trip has." },
  { id: "riderRating", label: "Rider rating and trips", help: "For example 4.9 · 120 trips." },
  { id: "tripMinutesKm", label: "Trip minutes and km", help: "How long the trip is." },
  { id: "pickupDistance", label: "Distance to pickup", help: "How far the pickup is, in km and minutes." },
  { id: "badges", label: "Badges", help: "Cash, Reservation, extras like a child seat, and a fare boost." },
];

export function offerCardDefault(): OfferCardDetails {
  return { netFare: false, pickupAddress: true, dropoffAreaOnly: false, stops: true, riderRating: true, tripMinutesKm: true, pickupDistance: true, badges: true };
}

export function completeOfferCard(stored: unknown): OfferCardDetails {
  const base = offerCardDefault();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof OfferCardDetails)[]) if (typeof raw[key] === "boolean") base[key] = raw[key] as boolean;
  return base;
}

/* ---------- Q15: why an offer is Exclusive ---------- */

export type ExclusiveReasonId = "best-match" | "favourite" | "finishing-nearby" | "airport-queue" | "pickup-soon" | "nearby";
export type ExclusiveReason = { text: string; on: boolean };

export const EXCLUSIVE_REASON_MAX = 28;

export const EXCLUSIVE_REASONS: { id: ExclusiveReasonId; when: string; text: string }[] = [
  { id: "best-match", when: "The best driver by the rules", text: "Best match" },
  { id: "favourite", when: "The rider's favourite driver", text: "Rider's favourite" },
  { id: "finishing-nearby", when: "A driver finishing a ride close to the pickup", text: "Finishing nearby" },
  { id: "airport-queue", when: "First in the airport queue", text: "Airport queue" },
  { id: "pickup-soon", when: "A scheduled ride close to pickup with no driver yet", text: "Pickup soon" },
  { id: "nearby", when: "Any other Exclusive offer", text: "Only for you · nearby" },
];

export function exclusiveReasonsDefault(): Record<ExclusiveReasonId, ExclusiveReason> {
  return Object.fromEntries(EXCLUSIVE_REASONS.map((item) => [item.id, { text: item.text, on: true }])) as Record<ExclusiveReasonId, ExclusiveReason>;
}

export function completeExclusiveReasons(stored: unknown): Record<ExclusiveReasonId, ExclusiveReason> {
  const base = exclusiveReasonsDefault();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Record<string, Partial<ExclusiveReason> | undefined>;
  for (const item of EXCLUSIVE_REASONS) {
    const own = raw[item.id];
    if (own && typeof own === "object") base[item.id] = { text: typeof own.text === "string" ? own.text : item.text, on: typeof own.on === "boolean" ? own.on : true };
  }
  return base;
}

/** The text an Exclusive card shows for a reason, or "" when it is off. */
export function exclusiveReasonText(reasons: Record<ExclusiveReasonId, ExclusiveReason>, id: ExclusiveReasonId): string {
  const reason = reasons[id];
  return reason?.on ? reason.text.trim() : "";
}

/** The list the driver app reads (DriverOfferRules.exclusiveReasons). */
export function exclusiveReasonList(reasons: Record<ExclusiveReasonId, ExclusiveReason>): { id: ExclusiveReasonId; text: string; on: boolean }[] {
  return EXCLUSIVE_REASONS.map((item) => ({ id: item.id, text: reasons[item.id].text.trim(), on: reasons[item.id].on }));
}

export function exclusiveReasonIssues(reasons: Record<ExclusiveReasonId, ExclusiveReason>): string[] {
  const issues: string[] = [];
  for (const item of EXCLUSIVE_REASONS) {
    const reason = reasons[item.id];
    if (!reason.on) continue;
    if (!reason.text.trim()) issues.push(`Exclusive reasons: “${item.when}” needs a short text, or switch it off.`);
    else if (reason.text.trim().length > EXCLUSIVE_REASON_MAX) issues.push(`Exclusive reasons: “${reason.text.trim()}” is too long. Keep it to ${EXCLUSIVE_REASON_MAX} characters.`);
  }
  return issues;
}

/* ---------- Q19/Q20: waiting at pickup ---------- */

/** Values a rule changes. Null: the same as the zone's own terms. */
export type WaitOverride = { freeWaitMin: number | null; perMin: number | null; noShowAfterMin: number | null; noShowFee: number | null };
export type WaitRideType = "scheduled" | "airport" | "event";

export type PickupWait = {
  /** From then the driver can cancel for no-show. Free wait, price per minute and the no-show fee come from Pricing, per category. */
  noShowAfterMin: number;
  driverShareWaitPct: number;
  driverShareNoShowPct: number;
  /** Pickups farther than farPickupKm get the far rule. */
  farPickupOn: boolean;
  farPickupKm: number;
  farPickup: WaitOverride;
  /** A scheduled ride's free wait is the reservation policy's included waiting. */
  rideTypes: Record<WaitRideType, WaitOverride & { on: boolean }>;
};

export const WAIT_RIDE_TYPES: { id: WaitRideType; label: string; help: string }[] = [
  { id: "scheduled", label: "Scheduled ride", help: "A ride booked for later. Its free wait is the included waiting of the reservation policy." },
  { id: "airport", label: "Airport pickup", help: "Pickup at an airport, for flight delays." },
  { id: "event", label: "Event pickup", help: "Pickup in an event area while the event runs." },
];

export const WAIT_FIELDS: { id: keyof WaitOverride; label: string; unit: "min" | "money" }[] = [
  { id: "freeWaitMin", label: "Free wait", unit: "min" },
  { id: "perMin", label: "Price per minute", unit: "money" },
  { id: "noShowAfterMin", label: "No-show after", unit: "min" },
  { id: "noShowFee", label: "No-show fee", unit: "money" },
];

const none = (): WaitOverride => ({ freeWaitMin: null, perMin: null, noShowAfterMin: null, noShowFee: null });

export function pickupWaitDefault(country: MarketId = "SE"): PickupWait {
  return {
    noShowAfterMin: 5,
    driverShareWaitPct: 100,
    driverShareNoShowPct: 80,
    farPickupOn: true,
    farPickupKm: 5,
    farPickup: { ...none(), freeWaitMin: 1, noShowFee: fromSek(85, country) },
    rideTypes: {
      scheduled: { ...none(), on: true },
      airport: { ...none(), on: true, freeWaitMin: 15, noShowAfterMin: 20 },
      event: { ...none(), on: true, freeWaitMin: 3 },
    },
  };
}

function completeOverride(base: WaitOverride, stored: unknown): WaitOverride {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...base };
  const raw = stored as Record<string, unknown>;
  const next = { ...base };
  for (const field of WAIT_FIELDS) {
    const value = raw[field.id];
    if (value === null || (typeof value === "number" && Number.isFinite(value))) next[field.id] = value as number | null;
  }
  return next;
}

export function completePickupWait(base: PickupWait, stored: unknown): PickupWait {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return structuredClone(base);
  const raw = stored as Partial<PickupWait>;
  const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const types = (raw.rideTypes && typeof raw.rideTypes === "object" ? raw.rideTypes : {}) as Partial<PickupWait["rideTypes"]>;
  return {
    noShowAfterMin: num(raw.noShowAfterMin, base.noShowAfterMin),
    driverShareWaitPct: num(raw.driverShareWaitPct, base.driverShareWaitPct),
    driverShareNoShowPct: num(raw.driverShareNoShowPct, base.driverShareNoShowPct),
    farPickupOn: typeof raw.farPickupOn === "boolean" ? raw.farPickupOn : base.farPickupOn,
    farPickupKm: num(raw.farPickupKm, base.farPickupKm),
    farPickup: completeOverride(base.farPickup, raw.farPickup),
    rideTypes: Object.fromEntries(WAIT_RIDE_TYPES.map((type) => {
      const own = types[type.id];
      return [type.id, { ...completeOverride(base.rideTypes[type.id], own), on: typeof own?.on === "boolean" ? own.on : base.rideTypes[type.id].on }];
    })) as PickupWait["rideTypes"],
  };
}

function overrideIssues(label: string, rule: WaitOverride, symbol: string): string[] {
  const issues: string[] = [];
  if (rule.freeWaitMin !== null && (rule.freeWaitMin < 0 || rule.freeWaitMin > 60)) issues.push(`Waiting at pickup, ${label}: free wait must be 0 to 60 minutes.`);
  if (rule.perMin !== null && (rule.perMin < 0 || rule.perMin > 1000)) issues.push(`Waiting at pickup, ${label}: price per minute must be 0 to 1000 ${symbol}.`);
  if (rule.noShowAfterMin !== null && (rule.noShowAfterMin < 1 || rule.noShowAfterMin > 60)) issues.push(`Waiting at pickup, ${label}: no-show after must be 1 to 60 minutes.`);
  if (rule.noShowFee !== null && (rule.noShowFee < 0 || rule.noShowFee > 1000)) issues.push(`Waiting at pickup, ${label}: the no-show fee must be 0 to 1000 ${symbol}.`);
  if (rule.freeWaitMin !== null && rule.noShowAfterMin !== null && rule.noShowAfterMin < rule.freeWaitMin) issues.push(`Waiting at pickup, ${label}: no-show must come after the free wait.`);
  return issues;
}

export function pickupWaitIssues(wait: PickupWait, country: MarketId): string[] {
  const symbol = currencySymbol(country);
  const issues: string[] = [];
  if (wait.noShowAfterMin < 1 || wait.noShowAfterMin > 60) issues.push("Waiting at pickup: no-show after must be 1 to 60 minutes.");
  if (wait.driverShareWaitPct < 0 || wait.driverShareWaitPct > 100 || wait.driverShareNoShowPct < 0 || wait.driverShareNoShowPct > 100) issues.push("Waiting at pickup: the driver's share must be 0 to 100%.");
  if (wait.farPickupOn) {
    if (wait.farPickupKm < 0.5 || wait.farPickupKm > 50) issues.push("Waiting at pickup: a far pickup must start 0.5 to 50 km away.");
    issues.push(...overrideIssues(`over ${wait.farPickupKm} km`, wait.farPickup, symbol));
  }
  for (const type of WAIT_RIDE_TYPES) if (wait.rideTypes[type.id].on) issues.push(...overrideIssues(type.label.toLowerCase(), wait.rideTypes[type.id], symbol));
  return issues;
}

/** The zone's own terms for one category, from Pricing. */
export type WaitBase = { freeWaitMin: number; perMin: number; noShowFee: number };
export type WaitTerms = WaitBase & { noShowAfterMin: number; driverShareWaitPct: number; driverShareNoShowPct: number; rule: string };

/**
 * The terms for one pickup, like the driver app works them out: the category's terms from Pricing, then the ride type,
 * then the distance rule. A later rule wins where it sets a value. A scheduled ride's free wait is the policy's included waiting.
 */
export function pickupTerms(base: WaitBase, wait: PickupWait, input: { type: "normal" | WaitRideType; pickupKm: number; includedWaitingMin: number }): WaitTerms {
  let terms: WaitTerms = { ...base, noShowAfterMin: wait.noShowAfterMin, driverShareWaitPct: wait.driverShareWaitPct, driverShareNoShowPct: wait.driverShareNoShowPct, rule: "" };
  const apply = (rule: WaitOverride, label: string) => {
    terms = {
      ...terms,
      freeWaitMin: rule.freeWaitMin ?? terms.freeWaitMin,
      perMin: rule.perMin ?? terms.perMin,
      noShowAfterMin: rule.noShowAfterMin ?? terms.noShowAfterMin,
      noShowFee: rule.noShowFee ?? terms.noShowFee,
      rule: [terms.rule, label].filter(Boolean).join(" · "),
    };
  };
  if (input.type !== "normal" && wait.rideTypes[input.type].on) {
    const type = wait.rideTypes[input.type];
    apply(input.type === "scheduled" ? { ...type, freeWaitMin: input.includedWaitingMin } : type, WAIT_RIDE_TYPES.find((item) => item.id === input.type)!.label);
  }
  if (wait.farPickupOn && input.pickupKm > wait.farPickupKm) apply(wait.farPickup, `Pickup over ${wait.farPickupKm} km`);
  if (terms.noShowAfterMin < terms.freeWaitMin) terms = { ...terms, noShowAfterMin: terms.freeWaitMin };
  return terms;
}

/** What the driver gets from a no-show fee. */
export function driverNoShowShare(terms: Pick<WaitTerms, "noShowFee" | "driverShareNoShowPct">): number {
  return Math.round(terms.noShowFee * terms.driverShareNoShowPct) / 100;
}

/* ---------- Q21: cancel reasons, per country and language ---------- */

export type CancelGroupId = "driverBeforeTrip" | "driverDuringTrip" | "driverNextTrip" | "scheduled" | "rider";
export type LangId = "en" | "sv" | "fr" | "ar";
export type Texts = Partial<Record<LangId, string>>;
export type CancelReason = { code: string; title: Texts; subtitle: Texts; counts: boolean };
export type CancelReasonBook = { groups: Record<CancelGroupId, CancelReason[]>; noShow: CancelReason };

export const LANGS: { id: LangId; label: string; rtl?: boolean }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Swedish" },
  { id: "fr", label: "French" },
  { id: "ar", label: "Arabic", rtl: true },
];

export const CANCEL_GROUPS: { id: CancelGroupId; label: string; help: string; subtitles: boolean }[] = [
  { id: "driverBeforeTrip", label: "Driver, before the trip", help: "After accepting, before the rider is in the car.", subtitles: true },
  { id: "driverDuringTrip", label: "Driver, during the trip", help: "Ending a trip early with the rider in the car.", subtitles: true },
  { id: "driverNextTrip", label: "Driver, next trip", help: "Cancelling the secured next trip while on a trip. The current trip goes on, the next goes back to dispatch.", subtitles: true },
  { id: "scheduled", label: "Driver, scheduled rides", help: "Cancelling an accepted scheduled ride.", subtitles: false },
  { id: "rider", label: "Rider", help: "What the rider app asks when the rider cancels.", subtitles: false },
];

export const CANCEL_TITLE_MAX = 60;
export const CANCEL_SUBTITLE_MAX = 90;

const reason = (code: string, title: string, subtitle = "", counts = true): CancelReason => ({ code, title: { en: title }, subtitle: subtitle ? { en: subtitle } : {}, counts });

/** The apps' reasons today: the driver app's, and the rider app's for the rider. Safety, car problems and rider no-show do not count. */
export function cancelReasonsDefault(): CancelReasonBook {
  return {
    noShow: reason("rider_no_show", "Rider did not arrive", "The no-show time has passed and the rider is not here", false),
    groups: {
      driverBeforeTrip: [
        reason("rider_requested_cancel", "Rider asked to cancel", "The rider doesn’t want to continue"),
        reason("rider_not_at_pickup", "Rider not at pickup", "You arrived but couldn’t find the rider"),
        reason("unsafe_pickup", "Pickup unsafe", "You can’t stop there safely", false),
        reason("vehicle_issue_before_start", "Vehicle problem", "Your car can’t make the trip", false),
        reason("driver_emergency_before_start", "Personal emergency", "Something urgent came up"),
        reason("other_before_start", "Other reason", "Something else stops this pickup"),
      ],
      driverDuringTrip: [
        reason("rider_requested_early_end", "Rider asked to end the trip", "The rider wants to leave before the destination"),
        reason("safety_concern_on_trip", "Safety concern", "Continuing the trip may be unsafe", false),
        reason("vehicle_issue_on_trip", "Vehicle problem", "A vehicle issue makes it unsafe to continue", false),
        reason("accident_or_road_emergency", "Accident or road emergency", "An incident or emergency prevents continuing", false),
        reason("rider_behavior", "Rider behavior", "The rider’s behavior requires the trip to end"),
        reason("trip_or_destination_issue", "Trip or destination issue", "A trip detail or destination problem prevents continuing"),
        reason("other_on_trip", "Other reason", "Another issue requires the trip to end early"),
      ],
      driverNextTrip: [
        reason("next_trip_current_running_late", "Current trip is taking longer", "You can’t reach the next pickup in time"),
        reason("next_trip_pickup_too_far", "Too far from the pickup", "The next pickup is further than expected"),
        reason("next_trip_rider_requested", "Rider asked me to cancel", "The next rider doesn’t want the trip"),
        reason("next_trip_vehicle_issue", "Problem with the car", "Your car can’t make the next trip", false),
        reason("next_trip_driver_emergency", "Personal emergency", "Something urgent came up"),
        reason("next_trip_other", "Other reason", "Something else stops the next trip"),
      ],
      scheduled: [
        reason("scheduled_cannot_make_time", "I can no longer make the pickup time"),
        reason("scheduled_vehicle_issue", "Vehicle issue", "", false),
        reason("scheduled_personal_emergency", "Personal emergency"),
        reason("scheduled_pickup_too_far", "Pickup is too far from me"),
        reason("scheduled_trip_details", "Trip details no longer work for me"),
        reason("scheduled_other", "Other reason"),
      ],
      rider: [
        reason("pickup_incorrect", "Pickup point is incorrect"),
        reason("wrong_ride_option", "I chose the wrong ride option"),
        reason("requested_by_mistake", "I requested the ride by mistake"),
        reason("wait_too_long", "The wait is taking too long"),
        reason("destination_change", "Destination needs to be changed"),
        reason("driver_not_suitable", "Driver/ride details are not suitable"),
        reason("plans_changed", "Plans changed"),
        reason("something_else", "Something else"),
      ],
    },
  };
}

function completeTexts(stored: unknown, fallback: Texts): Texts {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...fallback };
  const raw = stored as Record<string, unknown>;
  const out: Texts = {};
  for (const lang of LANGS) if (typeof raw[lang.id] === "string") out[lang.id] = raw[lang.id] as string;
  return out;
}

function completeReason(stored: unknown, fallback?: CancelReason): CancelReason | null {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return fallback ? structuredClone(fallback) : null;
  const raw = stored as Partial<CancelReason>;
  const code = typeof raw.code === "string" && raw.code ? raw.code : fallback?.code;
  if (!code) return null;
  return { code, title: completeTexts(raw.title, fallback?.title ?? {}), subtitle: completeTexts(raw.subtitle, fallback?.subtitle ?? {}), counts: typeof raw.counts === "boolean" ? raw.counts : fallback?.counts ?? true };
}

export function completeCancelReasons(stored: unknown): CancelReasonBook {
  const base = cancelReasonsDefault();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Partial<CancelReasonBook>;
  const groups = { ...base.groups };
  for (const group of CANCEL_GROUPS) {
    const list = raw.groups?.[group.id];
    if (Array.isArray(list)) groups[group.id] = list.map((item) => completeReason(item)).filter((item): item is CancelReason => Boolean(item));
  }
  return { groups, noShow: completeReason(raw.noShow, base.noShow) ?? base.noShow };
}

export function cancelReasonIssues(book: CancelReasonBook): string[] {
  const issues: string[] = [];
  const codes = new Set<string>();
  const check = (item: CancelReason, where: string) => {
    if (!item.title.en?.trim()) issues.push(`Cancel reasons, ${where}: each reason needs an English text.`);
    for (const lang of LANGS) {
      if ((item.title[lang.id] ?? "").trim().length > CANCEL_TITLE_MAX) issues.push(`Cancel reasons, ${where}: “${item.title[lang.id]!.trim().slice(0, 24)}…” is too long (at most ${CANCEL_TITLE_MAX} characters).`);
      if ((item.subtitle[lang.id] ?? "").trim().length > CANCEL_SUBTITLE_MAX) issues.push(`Cancel reasons, ${where}: a second line is too long (at most ${CANCEL_SUBTITLE_MAX} characters).`);
    }
    if (codes.has(item.code)) issues.push(`Cancel reasons, ${where}: the code ${item.code} is used twice.`);
    codes.add(item.code);
  };
  check(book.noShow, "rider no-show");
  for (const group of CANCEL_GROUPS) {
    const list = book.groups[group.id];
    if (!list.length) issues.push(`Cancel reasons, ${group.label.toLowerCase()}: keep at least one reason.`);
    for (const item of list) check(item, group.label.toLowerCase());
  }
  return [...new Set(issues)];
}

/** "Rider did not arrive", or the English text when a language is empty. */
export function reasonText(texts: Texts, lang: LangId): string {
  return (texts[lang] ?? "").trim() || (texts.en ?? "").trim();
}

/** What changed in the cancel reasons, in plain lines. */
export function cancelReasonLines(before: CancelReasonBook, after: CancelReasonBook): string[] {
  const lines: string[] = [];
  const name = (item: CancelReason) => `“${item.title.en?.trim() || item.code}”`;
  const compare = (a: CancelReason, b: CancelReason, where: string) => {
    for (const lang of LANGS) {
      if ((a.title[lang.id] ?? "") !== (b.title[lang.id] ?? "")) lines.push(`Cancel reasons, ${where}: ${name(a)} ${lang.label} text changed`);
      if ((a.subtitle[lang.id] ?? "") !== (b.subtitle[lang.id] ?? "")) lines.push(`Cancel reasons, ${where}: ${name(a)} ${lang.label} second line changed`);
    }
    if (a.counts !== b.counts) lines.push(`Cancel reasons, ${where}: ${name(b)} ${b.counts ? "doesn't count → counts" : "counts → doesn't count"}`);
  };
  compare(before.noShow, after.noShow, "rider no-show");
  for (const group of CANCEL_GROUPS) {
    const where = group.label.toLowerCase();
    const a = before.groups[group.id];
    const b = after.groups[group.id];
    for (const item of b) {
      const old = a.find((row) => row.code === item.code);
      if (!old) lines.push(`Cancel reasons, ${where}: added ${name(item)}`);
      else compare(old, item, where);
    }
    for (const item of a) if (!b.some((row) => row.code === item.code)) lines.push(`Cancel reasons, ${where}: removed ${name(item)}`);
    const kept = b.filter((item) => a.some((row) => row.code === item.code)).map((item) => item.code).join();
    const was = a.filter((item) => b.some((row) => row.code === item.code)).map((item) => item.code).join();
    if (kept !== was) lines.push(`Cancel reasons, ${where}: order changed`);
  }
  return lines;
}

/** The list the driver app reads for one language (CancelReasons): empty texts fall back to English. */
export function cancelReasonsFor(book: CancelReasonBook, lang: LangId) {
  const one = (item: CancelReason) => ({ code: item.code, title: reasonText(item.title, lang), subtitle: reasonText(item.subtitle, lang), counts: item.counts });
  return { language: lang, noShow: one(book.noShow), groups: Object.fromEntries(CANCEL_GROUPS.map((group) => [group.id, book.groups[group.id].map(one)])) as Record<CancelGroupId, ReturnType<typeof one>[]> };
}

/* ---------- Q22: cancel rate ---------- */

/** The cancel rate a driver should stay under. Never shown to drivers. */
export const CANCEL_RATE_LIMIT_DEFAULT = 30;
/** What drivers see under their cancel rate instead of the number. */
export const CANCEL_RATE_DRIVER_TEXT = "Keep your cancel rate low to keep full access to trips";
