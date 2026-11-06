import { market, zoneById, type MarketId } from "../../markets/markets.ts";
import { rulesOfDispatch } from "../../live/dispatchDoc.ts";
import { DEFAULT_FEE_CATEGORIES, cancelFeeDefaults, feeRow, type CancelFeeTable } from "../cancelFees.ts";
import { EXCLUSIVE_REASONS as EXCLUSIVE_REASON_LIST, WAIT_FIELDS as WAIT_FIELD_LIST, cancelReasonLines } from "../offers.ts";
import { TRIP_RULE_LABELS } from "../tripRules.ts";
import { tr, trx } from "../../i18n/core.ts";
import { type TabId, type RideTypeRule, RIDE_TYPES, type ZoneDispatch, type CountryDispatch, type Preset, type Control, type Version, type DispatchBook } from "./model.ts";
import { clone, feeDefaults, raiseCap, complete, liveRules, draftRules, liveCountry } from "./defaults.ts";
import { zoneIssues, countryIssues, modeLabel } from "./checks.ts";

/** Dispatch rules, part: Change lines, publish, approvals, undo, copy and presets (was rules.ts lines 1207–1554). rules.ts re-exports everything; import from "../rules.ts" as before. */
/** Readable labels for the settings, used in change lists and the history. */
const LABELS: Record<string, string> = {
  "rideCheck.farOn": "Ride check when finished far from drop-off",
  "rideCheck.stopOn": "Ride check on an unexpected long stop",
  "rideCheck.routeOn": "Ride check off the route", "rideCheck.routeKm": "Off the route from (km)",
  "rideCheck.longerOn": "Ride check when longer than expected", "rideCheck.longerPct": "Longer than expected from (%)",
  "rideCheck.crashOn": "Ride check on a possible crash",
  "rideCheck.on": "Ride check by the server", "rideCheck.stopMinutes": "Long stop (min)", "rideCheck.endFarMeters": "Ended far from the drop-off (m)",
  "rideCheck.noAnswerSeconds": "Time to answer (s)", "rideCheck.repeatMinutes": "Ask again after (min)", "rideCheck.noAnswerAlarm": "No answer rings the alarm",
  "radar.on": "Radar", "radar.drivers": "Radar drivers", "radar.seconds": "Radar time", "radar.then": "After Radar",
  "exclusive.on": "Exclusive", "exclusive.seconds": "Exclusive time to accept", "exclusive.drivers": "Exclusive drivers to try", "exclusive.then": "After Exclusive",
  "radarApp.fullOn": "Radar full screen", "radarApp.full": "Offers on full-screen radar", "radarApp.popupOn": "Radar popup", "radarApp.popup": "Offers in the popup",
  "radarApp.fullLockWhileDriving": "Full-screen radar locked while driving", "radarApp.popupSplitByDriving": "Own card limit while driving", "radarApp.popupWhileDriving": "Offer cards while driving",
  "radarApp.drivingOn": "Radar offers while driving", "radarApp.driving": "Offers while driving", "autoOffline.on": "Go offline automatically", "autoOffline.after": "Offline after offers not accepted", "autoOffline.noFixMinutes": "Set offline after minutes without position",
  "reservation.on": "Reservations", "reservation.searchBeforeMin": "Reservation search starts", "reservation.assignEarly": "Assign early", "reservation.assignHoursBefore": "Assign hours before",
  "reservation.backup": "Backup driver", "reservation.toExclusive": "Reservation to Exclusive", "reservation.exclusiveBeforeMin": "Exclusive before pickup",
  "reservation.listTo": "Scheduled rides go to", "reservation.listMinRating": "Lowest rating for Scheduled rides",
  "reservation.listGroupSize": "Random group size", "reservation.listHomeKm": "Home distance from pickup", "reservation.listNearKm": "Distance from pickup now",
  "reservation.listAreaTrips": "Trips from the area", "reservation.listOpenAll": "Open to all drivers", "reservation.listOpenAllAfterMin": "Open to all drivers after",
  "reservation.homePopup": "Reservation Home popup", "reservation.homePopupAfterMin": "Home popup after booking",
  "reservation.toRadar": "Reservation to Radar trips", "reservation.radarBeforeMin": "Radar trips before pickup", "reservation.onDriverCancel": "After a driver cancels",
  "choose.how": "How the mode is chosen", "choose.radarAbove": "Busy level for Radar", "choose.main": "Main mode", "start.mode": "Start & order", "start.nearKm": "Exclusive first within", "limits.maxPickupKm": "Farthest pickup", "limits.maxPickupEtaMin": "Longest pickup time", "limits.farReachKm": "Far reach", "reaskLimit": "Ask one driver at most (offers)", "noDriverNearby.on": "No driver nearby", "noDriverNearby.afterSec": "No driver nearby after (s)", "noDriverNearby.message": "No driver nearby message", "neighbours.on": "Neighbour zones", "choose.times": "Time rules",
  // Live fix 2026-11-02 (audit 1f): the Start & order fields had no label, so "Se ändringar" showed raw keys.
  "radar.steps": "Radar distance steps", "exclusive.steps": "Exclusive distance steps", "neighbours.zoneIds": "Neighbour zones list", "neighbours.afterStep": "Neighbours from step",
  rulesFrom: "Whose rules", "radius.steps": "Search distance steps", "radius.maxWaitMin": "Longest search",
  "batching.on": "Smart waiting", "batching.seconds": "Smart waiting seconds", "batching.fromRatio": "Smart waiting from busy level",
  "finishing.radar": "Finishing nearby on Radar", "finishing.exclusive": "Finishing nearby on Exclusive", "finishing.withinMin": "Finishing within minutes", "finishing.withinKm": "Finishing within km",
  "favourite.on": "Favourite drivers", "favourite.maxKm": "Favourite max distance", "favourite.waitSec": "Wait for favourite",
  waiting: "Rider waiting steps", "driverCancel.on": "Driver cancels: search again", "driverCancel.commissionCutPct": "Lower commission after a driver cancel",
  "riderCancel.on": "Smart cancel check", "riderCancel.closerPct": "Came closer by",
  "riderCancel.priority": "Priority after rider cancel", "riderCancel.priorityMin": "Priority minutes",
  extras: "Special requests", longTripKm: "Long trip from", "stops.on": "Stops", "stops.max": "Max stops", "pickupMove.maxMeters": "Pickup move after accept (m)", "samePoint.warnMeters": "Shortest ride (m)", "stops.freeWaitMin": "Free wait per stop",
  "stops.perMin": "Wait price per minute", "stops.perStop": "Fee per stop", "stops.changeDuring": "Change during the trip", "stops.driverCanRefuse": "Driver can refuse changes",
  "stops.answerSeconds": "Driver's time to answer a change", "stops.beforePickup": "Change before pickup", "stops.fixedPriceTrips": "Fixed-price trips",
  "airport.on": "Airport queue", "airport.order": "Airport order", "airport.maxQueueMin": "Longest time in queue", "airport.queueAreas": "Queue area",
  "goingHome.on": "Going home", "goingHome.perDay": "Going home per day", "goingHome.maxOffDeg": "Going home direction",
  "fairness.idleBoost": "Boost for waiting drivers", "fairness.idlePoints": "Boost points", "fairness.hourCap": "Rides per hour cap", "fairness.hourRides": "Rides per hour",
  "fairness.skipPause": "Pause after skips", "fairness.skips": "Skips in a row", "fairness.pauseMin": "Skip pause minutes",
  "decline.on": "Saying no rules", "decline.countsAcceptance": "No lowers acceptance", "decline.pauseAfter": "Pause after no's", "decline.pauseMin": "No pause minutes",
  "decline.longTripFree": "Long trips free to refuse", "decline.farPickupFree": "Far pickups free to refuse", "decline.farPickupKm": "Far pickup from",
  "safety.minRating": "Lowest rating check", "pickupPin.required": "Rider PIN before Start", "pickupPin.maxAttempts": "Wrong tries before lock", "pickupPin.lockMinutes": "Lock minutes", "safety.ratingBelow": "Lowest rating", "safety.maxCancel": "No requests over the cancel rate limit",
  "safety.doNotMatch": "Do not match list", "safety.womenOnly": "Women-only rides", alerts: "Alerts",
};

/** Labels for the offer and waiting settings (Round 3, Q14–Q20). */
Object.assign(LABELS, {
  "offerCard.netFare": "Offer card shows the driver's share", "offerCard.pickupAddress": "Offer card: pickup address", "offerCard.dropoffAreaOnly": "Offer card: drop-off area only",
  "offerCard.stops": "Offer card: stops", "offerCard.riderRating": "Show rider rating on offers", "offerCard.tripMinutesKm": "Offer card: trip minutes and km",
  "offerCard.pickupDistance": "Offer card: distance to pickup", "offerCard.badges": "Offer card: badges",
  "raisePrice.maxFactor": "Rider raise limit",
  hiddenComesBackMin: "Hidden Radar trip comes back after", "exclusiveWhileDriving.on": "Exclusive while driving", "exclusiveWhileDriving.count": "Exclusive offers while driving",
  "bookedNext.on": "Booked ride for a driver on a trip", "bookedNext.withinMin": "Driver on a trip can get a booked ride starting within (min)",
    "pickupWait.farPickupOn": "Rule for far pickups", "pickupWait.farPickupKm": "Far pickup from",
    "pickupWait.cancelAfterArrivedIsNoShow": "Cancel after the driver arrived counts as a no-show",
});
for (const reason of EXCLUSIVE_REASON_LIST) {
  LABELS[`exclusiveReasons.${reason.id}.text`] = `Exclusive reason (${reason.when.toLowerCase()})`;
  LABELS[`exclusiveReasons.${reason.id}.on`] = `Exclusive reason “${reason.text}”`;
}
for (const [rule, words] of [["farPickup", "Far pickup"], ["rideTypes.scheduled", "Scheduled ride pickup"], ["rideTypes.airport", "Airport pickup"], ["rideTypes.event", "Event pickup"]] as const) {
  for (const field of WAIT_FIELD_LIST) LABELS[`pickupWait.${rule}.${field.id}`] = `${words}: ${field.label.toLowerCase()}`;
  if (rule !== "farPickup") LABELS[`pickupWait.${rule}.on`] = `${words} rule`;
}

/** Labels for Destination mode and next trips (Round 13). */
Object.assign(LABELS, TRIP_RULE_LABELS);

/** Labels for the reservation settings in Dispatch › Reservations. */
Object.assign(LABELS, {
  "reservation.listGroupId": "Driver group for Scheduled rides", "reservation.homePopupTo": "Home popup goes to",
  "reservation.popupClosedExclusive": "Closed popup comes back as Exclusive", "reservation.hideClashing": "Clashing rides leave the list",
  "reservation.lateWarn": "Late warning", "reservation.lateBackupAfterMin": "Offline driver loses the ride after",
  "reservation.lateEta.on": "Watch arrival time", "reservation.lateEta.toleranceMin": "Minutes late allowed", "reservation.lateEta.checkEverySeconds": "Check arrival every (seconds)", "reservation.lateEta.reassignTo": "Late ride goes to",
  "reservation.towardPickup": "Trips toward the pickup before the ride", "reservation.towardPickupBeforeMin": "Trips toward the pickup from",
  "reservation.driverLateCancelHours": "Driver late cancel, hours before pickup", "reservation.latePause": "Pause after late cancels",
  "reservation.latePauseAfter": "Late cancels before a pause", "reservation.latePeriodDays": "Late cancels counted over days", "reservation.latePauseDays": "Scheduled rides paused for days",
  "reservation.showDriverOnAccept": "Rider sees the driver at once", "reservation.raiseFare": "Raise the driver's fare", "reservation.raiseMax": "Highest fare raise",
  "reservation.assignAcceptSec": "Time to accept a ride assigned by Movera",
});

/** Labels for the rider cancel fees per car type: "Live trips, Comfort: fee", "Reservations, Premium: highest fee". */
const FEE_FIELDS = { freeMin: "free cancel minutes", type: "fee type", value: "fee", min: "lowest fee", max: "highest fee" } as const;
const FEE_PATH = /^(riderCancel\.fees|reservation\.riderFees)\.([^.]+)\.(freeMin|type|value|min|max)$/;
/** Any car type, also ones added in Pricing: the label from the built-in list, else the id. */
function feeLabel(path: string): string | undefined {
  const match = FEE_PATH.exec(path);
  if (!match) return undefined;
  const [, part, id, field] = match;
  const name = DEFAULT_FEE_CATEGORIES.find((item) => item.id === id)?.label ?? id;
  return `${part === "riderCancel.fees" ? "Live trips" : "Reservations"}, ${name}: ${field === "freeMin" && part === "reservation.riderFees" ? "free cancel minutes before pickup" : FEE_FIELDS[field as keyof typeof FEE_FIELDS]}`;
}

/** Both sides get a row for every car type either has, so a car type that starts as a copy of Economy only shows what changed. */
function alignFees(a: CancelFeeTable, b: CancelFeeTable): CancelFeeTable {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((id) => [id, feeRow(a, id)]));
}

const RIDE_TYPE_FIELDS: Record<keyof RideTypeRule, string> = { onlineBeforeMin: "be online before", spareMin: "spare minutes", remindFirstMin: "first reminder", remindLastMin: "second reminder" };
for (const type of RIDE_TYPES) {
  for (const [field, words] of Object.entries(RIDE_TYPE_FIELDS)) LABELS[`reservation.types.${type.id}.${field}`] = `${type.label} rides: ${words}`;
}

function flat(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) for (const [k, v] of flat(item, path)) out.set(k, v);
      else out.set(path, JSON.stringify(item));
    }
  }
  return out;
}

/** Words for the reservation choices, by setting, so "list" or "all" read well in change lines. */
const PATH_WORDS: Record<string, Record<string, string>> = {
  "reservation.listTo": { all: "all drivers in the zone", category: "drivers of the category", rating: "drivers with a high rating", random: "a random group of drivers", homeNear: "drivers whose home is near the pickup", nearNow: "drivers near the pickup now", favourites: "the rider's favourite drivers", areaRegulars: "drivers often in the area", group: "a driver group" },
  "reservation.homePopupTo": { list: "same drivers as the list", zone: "all drivers in the zone" },
  "reservation.listGroupId": { "": "none" },
  "reservation.onDriverCancel": { byTime: "by time left", list: "Scheduled rides", home: "Home popup", exclusive: "Exclusive" },
  "reservation.lateEta.reassignTo": { exclusive: "Exclusive offer to nearest driver", radar: "Radar", dispatch: "back to dispatch" },
};

function show(raw: string | undefined, path = "", shown = false): string {
  // Live fix 2026-11-02: words in the panel's language for the "See changes" list (stored history stays English).
  return shown ? trx(showWords(raw, path)) : showWords(raw, path);
}

function showWords(raw: string | undefined, path = ""): string {
  if (raw === undefined) return /^(radar|exclusive)\.steps$/.test(path) ? "Same as search distance" : "";
  if (/^limits\./.test(path) && raw === "0") return "no limit";
  if (path === "neighbours.afterStep" && raw === "0") return "the last step";
  const value = JSON.parse(raw) as unknown;
  if (value === null) return /\.riderFees\.|\.fees\./.test(path) ? "none" : "same as the zone";
  if (/\.(riderFees|fees)\.\w+\.type$/.test(path) && typeof value === "string") return value === "percent" ? "% of price" : "fixed";
  if (typeof value === "string" && PATH_WORDS[path]?.[value]) return PATH_WORDS[path][value];
  if (value === true) return "on";
  if (value === false) return "off";
  if (Array.isArray(value)) return value.every((item) => typeof item === "number") ? value.join(", ") : `${value.length} items`;
  if (value === "widen_then_exclusive") return "wider area, then Exclusive";
  if (value === "widen_then_radar") return "wider area, then Radar";
  if (value === "widen") return "wider area";
  const words: Record<string, string> = { byDistance: "By distance", both: "Both at the same time", auto: "Automatic", manual: "By hand", driver: "the driver's zone", pickup: "the pickup zone", fifo: "first in the queue", best: "best driver", none: "none" };
  if (typeof value === "string" && words[value]) return words[value];
  if (typeof value === "string") return value === "radar" || value === "exclusive" ? modeLabel(value) : value;
  return String(value);
}

/** What changed between two rule sets, in plain lines like "Radar drivers: 5 → 8". */
/** shown = in the panel's language, for the screen only (live fix 2026-11-02); the stored history lines stay English. */
export function changeLines(before: ZoneDispatch, after: ZoneDispatch, shown = false): string[] {
  const withFees = (zone: ZoneDispatch, other: ZoneDispatch): ZoneDispatch => ({
    ...zone,
    riderCancel: { ...zone.riderCancel, fees: alignFees(zone.riderCancel.fees, other.riderCancel.fees) },
    reservation: { ...zone.reservation, riderFees: alignFees(zone.reservation.riderFees, other.reservation.riderFees) },
  });
  const a = flat(withFees(before, after));
  const b = flat(withFees(after, before));
  const lines: string[] = [];
  for (const [path, value] of b) {
    if (path === "zoneId" || a.get(path) === value) continue;
    const english = LABELS[path] ?? feeLabel(path) ?? path;
    const label = shown ? trx(english) : english;
    const listChanged = Array.isArray(JSON.parse(value)) && !(JSON.parse(value) as unknown[]).every((item) => typeof item === "number");
    lines.push(listChanged ? (shown ? tr("{0} changed", [label]) : `${label} changed`) : `${label}: ${show(a.get(path), path, shown)} → ${show(value, path, shown)}`);
  }
  return lines;
}

export function countryLines(before: CountryDispatch, after: CountryDispatch): string[] {
  const lines: string[] = [];
  if (before.rest.on !== after.rest.on) lines.push(`Rest after long work: ${before.rest.on ? "on" : "off"} → ${after.rest.on ? "on" : "off"}`);
  if (before.rest.workHours !== after.rest.workHours) lines.push(`Work hours before rest: ${before.rest.workHours} → ${after.rest.workHours}`);
  if (before.rest.restHours !== after.rest.restHours) lines.push(`Rest hours: ${before.rest.restHours} → ${after.rest.restHours}`);
  if (before.rest.warnFirstMin !== after.rest.warnFirstMin) lines.push(`First driving limit warning: ${before.rest.warnFirstMin} → ${after.rest.warnFirstMin} min`);
  if (before.rest.warnLastMin !== after.rest.warnLastMin) lines.push(`Second driving limit warning: ${before.rest.warnLastMin} → ${after.rest.warnLastMin} min`);
  if (before.rest.blockOnline !== after.rest.blockOnline) lines.push(`Block going online at the limit: ${before.rest.blockOnline ? "on" : "off"} → ${after.rest.blockOnline ? "on" : "off"}`);
  if (before.cancelRateLimitPct !== after.cancelRateLimitPct) lines.push(`Cancel rate limit: ${before.cancelRateLimitPct}% → ${after.cancelRateLimitPct}%`);
  if (before.noShowDriverSharePct !== after.noShowDriverSharePct) lines.push(`Driver's share of the no-show fee: ${before.noShowDriverSharePct}% → ${after.noShowDriverSharePct}%`);
  lines.push(...cancelReasonLines(before.cancelReasons, after.cancelReasons));
  return lines;
}

/** The main way a zone offers rides, as a short badge. */
export function mainMode(zone: ZoneDispatch): "radar" | "exclusive" | "auto" {
  if (zone.choose.how === "auto") return "auto";
  return zone.choose.main;
}

/** Big changes need a second admin: switching the main way of offering, or switching a mode off. */
export function isBigChange(before: ZoneDispatch, after: ZoneDispatch): boolean {
  return mainMode(before) !== mainMode(after) || (before.radar.on && !after.radar.on) || (before.exclusive.on && !after.exclusive.on);
}

export type ZoneChange = { zoneId: string; lines: string[]; big: boolean; issues: string[] };

/** Zones whose working copy differs from what is live. */
export function pendingChanges(book: DispatchBook, working: Record<string, ZoneDispatch>, zoneIds: readonly string[], shown = false): ZoneChange[] {
  return zoneIds.flatMap((zoneId) => {
    const next = working[zoneId] ?? draftRules(book, zoneId);
    const lines = changeLines(liveRules(book, zoneId), next, shown);
    return lines.length ? [{ zoneId, lines, big: isBigChange(liveRules(book, zoneId), next), issues: zoneIssues(next) }] : [];
  });
}

export function saveDraft(book: DispatchBook, working: Record<string, ZoneDispatch>, countries: Record<string, CountryDispatch>): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, draft: { ...book.draft, ...clone(working) }, countries: { ...book.countries, ...clone(countries) } };
}

/**
 * Make the working rules live. Big changes wait for a second admin; everything else goes live now.
 * Returns the new book, what went live and what waits.
 */
export function publish(
  book: DispatchBook,
  working: Record<string, ZoneDispatch>,
  countries: Record<string, CountryDispatch>,
  zoneIds: readonly string[],
  actorId: string,
  at: string,
  note: string,
  /** v0.8.0 (owner 2026-10-27): the live panel publishes at once, no second admin. */
  options: { direct?: boolean } = {},
): { book: DispatchBook; live: string[]; waiting: string[]; error?: string } {
  const changes = pendingChanges(book, working, zoneIds);
  const countryChanges = Object.values(countries).flatMap((item) => countryLines(liveCountry(book, item.country), item).map((line) => `${market(item.country).name}: ${line}`));
  const bad = changes.find((change) => change.issues.length);
  if (bad) return { book, live: [], waiting: [], error: `${zoneById(bad.zoneId)?.name ?? bad.zoneId}: ${bad.issues[0]}` };
  const badCountry = Object.values(countries).map(countryIssues).find((list) => list.length);
  if (badCountry) return { book, live: [], waiting: [], error: badCountry[0] };
  if (!changes.length && !countryChanges.length) return { book, live: [], waiting: [], error: "Nothing to publish. Change a rule first." };
  const now = changes.filter((change) => options.direct || !change.big);
  const later = changes.filter((change) => !options.direct && change.big);
  const nextLive = { ...book.live };
  for (const change of now) nextLive[change.zoneId] = clone(working[change.zoneId] ?? draftRules(book, change.zoneId));
  const nextCountries = { ...book.liveCountries, ...clone(countries) };
  const draft = { ...book.draft };
  for (const change of now) delete draft[change.zoneId];
  const draftCountries = { ...book.countries };
  for (const id of Object.keys(countries)) delete draftCountries[id];
  for (const change of later) draft[change.zoneId] = clone(working[change.zoneId] ?? draftRules(book, change.zoneId));
  const approvals = later.length ? [...book.approvals.filter((item) => !(item.kind === "publish" && item.zoneIds.some((id) => later.some((change) => change.zoneId === id)))), {
    id: `AP-${book.draftRev + 1}`,
    kind: "publish" as const,
    zoneIds: later.map((change) => change.zoneId),
    lines: later.flatMap((change) => change.lines.map((line) => `${zoneById(change.zoneId)?.name ?? change.zoneId}: ${line}`)),
    by: actorId,
    at,
    zones: Object.fromEntries(later.map((change) => [change.zoneId, clone(working[change.zoneId] ?? draftRules(book, change.zoneId))])),
  }] : book.approvals;
  const lines = [...now.flatMap((change) => change.lines.map((line) => `${zoneById(change.zoneId)?.name ?? change.zoneId}: ${line}`)), ...countryChanges];
  const versions = now.length || countryChanges.length
    ? [{ rev: book.draftRev + 1, at, actorId, note, zoneIds: now.map((change) => change.zoneId), lines, live: clone(nextLive), liveCountries: clone(nextCountries) }, ...book.versions].slice(0, 40)
    : book.versions;
  return {
    book: { ...book, draftRev: book.draftRev + 1, live: nextLive, liveCountries: nextCountries, draft, countries: draftCountries, approvals, versions },
    live: now.map((change) => change.zoneId),
    waiting: later.map((change) => change.zoneId),
  };
}

/** A second admin approves a waiting change. The person who asked cannot approve it. */
export function approve(book: DispatchBook, approvalId: string, actorId: string, at: string): { book: DispatchBook; error?: string } {
  const item = book.approvals.find((entry) => entry.id === approvalId);
  if (!item) return { book, error: "That approval is gone." };
  if (item.by === actorId) return { book, error: "A second admin must approve. You asked for this change." };
  const approvals = book.approvals.filter((entry) => entry.id !== approvalId);
  if (item.kind === "control" && item.control) {
    return { book: { ...book, draftRev: book.draftRev + 1, approvals, control: { ...book.control, [item.control.zoneId]: { ...item.control.value, at } } } };
  }
  const live = { ...book.live, ...clone(item.zones ?? {}) };
  const draft = { ...book.draft };
  for (const id of item.zoneIds) delete draft[id];
  const version: Version = { rev: book.draftRev + 1, at, actorId: item.by, approvedBy: actorId, note: "Approved by a second admin", zoneIds: item.zoneIds, lines: item.lines, live: clone(live), liveCountries: clone(book.liveCountries) };
  return { book: { ...book, draftRev: book.draftRev + 1, approvals, live, draft, versions: [version, ...book.versions].slice(0, 40) } };
}

export function decline(book: DispatchBook, approvalId: string): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, approvals: book.approvals.filter((entry) => entry.id !== approvalId) };
}

/** Go back to an older version: it becomes live again and is saved as a new version. */
export function undoTo(book: DispatchBook, rev: number, actorId: string, at: string): { book: DispatchBook; error?: string } {
  const index = book.versions.findIndex((entry) => entry.rev === rev);
  const target = book.versions[index];
  if (!target) return { book, error: "That version was not found." };
  // Undoing a version means going back to what was live just before it.
  const previous = book.versions[index + 1];
  const live = previous ? clone(previous.live) : {};
  const liveCountries = previous ? clone(previous.liveCountries) : {};
  const version: Version = { rev: book.draftRev + 1, at, actorId, note: `Undo of version ${rev}`, zoneIds: target.zoneIds, lines: target.lines.map((line) => `Undone: ${line}`), live: clone(live), liveCountries: clone(liveCountries) };
  return { book: { ...book, draftRev: book.draftRev + 1, live, liveCountries, versions: [version, ...book.versions].slice(0, 40) } };
}

/** Live switch from the Live tab: pause a zone or force a mode. Big ones wait for a second admin. */
export function requestControl(book: DispatchBook, zoneId: string, value: Omit<Control, "at" | "by">, actorId: string, at: string, options: { direct?: boolean } = {}): { book: DispatchBook; waiting: boolean } {
  const current = book.control[zoneId] ?? { paused: false, mode: null, by: "", at: "" };
  const big = value.paused !== current.paused || value.mode !== current.mode;
  const resume = !value.paused && !value.mode;
  if (!big || resume || options.direct) return { book: { ...book, draftRev: book.draftRev + 1, control: { ...book.control, [zoneId]: { ...value, by: actorId, at } } }, waiting: false };
  const lines = [`${zoneById(zoneId)?.name ?? zoneId}: ${value.paused ? "pause dispatch" : `use ${modeLabel(value.mode ?? "none")} now`}`];
  const approvals = [...book.approvals.filter((item) => !(item.kind === "control" && item.control?.zoneId === zoneId)), { id: `AP-${book.draftRev + 1}`, kind: "control" as const, zoneIds: [zoneId], lines, by: actorId, at, control: { zoneId, value: { ...value, by: actorId, at } } }];
  return { book: { ...book, draftRev: book.draftRev + 1, approvals }, waiting: true };
}

export type CopyPart = TabId;

const PART_KEYS: Record<TabId, (keyof ZoneDispatch)[]> = {
  modes: ["choose", "rulesFrom", "offerCard", "raisePrice"],
  radar: ["radar", "radarApp", "hiddenComesBackMin", "autoOffline"],
  exclusive: ["exclusive", "exclusiveWhileDriving", "bookedNext"],
  reservations: ["reservation"],
  best: ["factors", "radius", "batching", "finishing", "favourite"],
  waiting: ["waiting", "noDriverNearby", "reaskLimit"],
  rides: ["extras", "longTripKm", "stops", "pickupMove", "samePoint", "driverCancel", "riderCancel", "airport", "pickupWait"],
  drivers: ["goingHome", "fairness", "decline"],
  destination: ["destinationMode", "nextTrips"],
  safety: ["safety", "pickupPin", "rideCheck"],
  alerts: ["alerts"],
};

export function copyParts(from: ZoneDispatch, to: ZoneDispatch, parts: readonly TabId[]): ZoneDispatch {
  const next = clone(to) as unknown as Record<string, unknown>;
  for (const part of parts) for (const key of PART_KEYS[part]) next[key] = clone(from[key]);
  return next as unknown as ZoneDispatch;
}

export function applyPreset(zone: ZoneDispatch, preset: Preset, country: MarketId): ZoneDispatch {
  // G4-F2: a preset saved on the server holds a dispatch document's parts; only those parts of the zone change.
  if (preset.doc) return rulesOfDispatch(preset.doc, null, zone);
  const money = feeDefaults(country);
  // Presets saved before newer settings existed get those settings from the defaults.
  const values = complete(zone.zoneId, clone(preset.values) as Partial<ZoneDispatch>);
  return {
    ...values,
    zoneId: zone.zoneId,
    // Built-in presets carry no money, so fees stay in the country's currency.
    riderCancel: preset.builtIn ? { ...values.riderCancel, fees: cancelFeeDefaults("live", country) } : values.riderCancel,
    stops: preset.builtIn ? { ...values.stops, perMin: money.perMin, perStop: money.perStop } : values.stops,
    reservation: preset.builtIn ? { ...values.reservation, riderFees: cancelFeeDefaults("reservation", country), raiseMax: raiseCap(country) } : values.reservation,
  };
}

export function presetFrom(zone: ZoneDispatch, name: string, id: string): Preset {
  const { zoneId: _drop, ...values } = clone(zone);
  void _drop;
  return { id, name, note: `Saved from ${zoneById(zone.zoneId)?.name ?? zone.zoneId}`, builtIn: false, values };
}

