import { market, type MarketId } from "../../markets/markets.ts";
import { DEFAULT_FEE_CATEGORIES, cancelFeeAmount, feeRow, type CancelFeeKind, type FeeCategory } from "../cancelFees.ts";
import { RIDE_CHECK_SETTINGS_DEFAULT, rideCheckThresholds, type RideCheckThresholds } from "../../safety/rideCheckSettings.ts";
import { LANGS as LANG_LIST, cancelReasonsFor } from "../offers.ts";
import { destinationModeForDriverApp, nextTripsForDriverApp } from "../tripRules.ts";
import { tr, trx } from "../../i18n/core.ts";
import { type OfferMode, type FactorId, type ExtraId, WAIT_KINDS, riderScheduledRules, type TimeRule, type ZoneDispatch, type CountryDispatch, type DispatchEvent, type Control, type DispatchBook } from "./model.ts";
import { countryOfZone, liveRules, liveCountry } from "./defaults.ts";
import { modeLabel } from "./checks.ts";

/** Dispatch rules, part: Mode now, driver ranking, the simulator, cancel fees and the rules file (was rules.ts lines 1555–end). rules.ts re-exports everything; import from "../rules.ts" as before. */
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inTime(rule: Pick<TimeRule, "from" | "to">, hhmm: string): boolean {
  const now = minutes(hhmm);
  const from = minutes(rule.from);
  const to = minutes(rule.to);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Which mode a new request uses right now, and why. */
export function modeNow(zone: ZoneDispatch, control: Control | undefined, busy: number, hhmm: string): { mode: OfferMode | null; why: string } {
  if (control?.paused) return { mode: null, why: tr("Dispatch is paused in this zone.") };
  if (control?.mode) return { mode: control.mode, why: tr("An admin switched this zone to {0}.", [trx(modeLabel(control.mode))]) };
  const timed = zone.choose.times.find((rule) => rule.on && zone[rule.mode].on && inTime(rule, hhmm));
  if (timed) return { mode: timed.mode, why: tr("Time rule {0}–{1} uses {2}.", [timed.from, timed.to, trx(modeLabel(timed.mode))]) };
  if (zone.choose.how === "auto" && zone.radar.on && zone.exclusive.on) {
    return busy >= zone.choose.radarAbove
      ? { mode: "radar", why: tr("Busy: {0} requests per free driver (Radar from {1}).", [busy.toFixed(1), zone.choose.radarAbove]) }
      : { mode: "exclusive", why: tr("Calm: {0} requests per free driver (Radar from {1}).", [busy.toFixed(1), zone.choose.radarAbove]) };
  }
  const main = zone[zone.choose.main].on ? zone.choose.main : zone.radar.on ? "radar" : zone.exclusive.on ? "exclusive" : null;
  return main ? { mode: main, why: tr("Main mode is {0}.", [trx(modeLabel(main))]) } : { mode: null, why: tr("No mode is on.") };
}

export function insideRing(point: [number, number], ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ay, ax] = ring[i];
    const [by, bx] = ring[j];
    if ((ay > point[0]) !== (by > point[0]) && point[1] < ((bx - ax) * (point[0] - ay)) / (by - ay || 1e-12) + ax) inside = !inside;
  }
  return inside;
}

/** During an event, a pickup inside its area uses the event's mode (and radar size). */
export function withEvent(zone: ZoneDispatch, event: DispatchEvent | null, pickup: [number, number]): { rules: ZoneDispatch; event: DispatchEvent | null } {
  if (!event || !event.on || !insideRing(pickup, event.ring)) return { rules: zone, event: null };
  const rules: ZoneDispatch = {
    ...zone,
    radar: { ...zone.radar, on: zone.radar.on || event.mode === "radar", drivers: event.mode === "radar" ? event.radarDrivers : zone.radar.drivers },
    exclusive: { ...zone.exclusive, on: zone.exclusive.on || event.mode === "exclusive" },
    choose: { ...zone.choose, how: "manual", main: event.mode, backup: event.mode === "radar" ? (zone.exclusive.on ? "exclusive" : "none") : (zone.radar.on ? "radar" : "none"), times: [] },
  };
  return { rules, event };
}

export type DriverFacts = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoneId: string;
  /** free, or finishing a ride: minutes to the drop-off and its distance to the new pickup. */
  finishing: { inMin: number; dropKm: number } | null;
  rating: number;
  acceptancePct: number;
  cancelPct: number;
  idleMin: number;
  categories: string[];
  extras: ExtraId[];
  female: boolean;
  ridesThisHour: number;
  skipsInRow: number;
  noInRow: number;
  favourite: boolean;
  goingHome: boolean;
  homeDirectionOk: boolean;
  priorityUntilMin: number;
  queuePos: number | null;
  restNeeded: boolean;
};

export type TestRequest = {
  zoneId: string;
  at: [number, number];
  category: string;
  extras: ExtraId[];
  womenOnly: boolean;
  tripKm: number;
  blocked: string[];
};

export type Ranked = {
  driver: DriverFacts;
  km: number;
  etaMin: number;
  score: number;
  parts: { label: string; points: number }[];
  out: string | null;
  ring: number;
};

export function distanceKm(a: [number, number], b: [number, number]): number {
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  const y = b[0] - a[0];
  return Math.sqrt(x * x + y * y) * 111.32 * 1.25;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Score and order drivers for a request with the zone's rules. Drivers who cannot take it get a reason. */
export function rankDrivers(zone: ZoneDispatch, country: CountryDispatch, request: TestRequest, drivers: readonly DriverFacts[]): Ranked[] {
  const widest = zone.radius.steps[zone.radius.steps.length - 1] ?? 8;
  const weights = new Map(zone.factors.filter((item) => item.on).map((item) => [item.id, item.weight]));
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  const rows = drivers.map((driver): Ranked => {
    const finishingOk = driver.finishing && (zone.finishing.radar || zone.finishing.exclusive) && weights.has("finishing") && driver.finishing.inMin <= zone.finishing.withinMin && driver.finishing.dropKm <= zone.finishing.withinKm;
    const km = round1(driver.finishing ? driver.finishing.dropKm : distanceKm([driver.lat, driver.lng], request.at));
    const etaMin = Math.max(1, Math.round((km / 24) * 60) + (driver.finishing ? driver.finishing.inMin : 0));
    const ring = zone.radius.steps.findIndex((step) => km <= step);
    let out: string | null = null;
    if (country.rest.on && driver.restNeeded) out = `Needs ${country.rest.restHours} h rest after ${country.rest.workHours} h of work`;
    else if (driver.finishing && !finishingOk) out = "On a ride that does not end close enough or soon enough";
    else if (!driver.categories.includes(request.category)) out = "Not allowed to drive this category";
    else if (request.blocked.includes(driver.id) && zone.safety.doNotMatch) out = "On the do-not-match list with this rider";
    else if (request.womenOnly && zone.safety.womenOnly && !driver.female) out = "The rider asked for a woman driver";
    else if (zone.safety.minRating && driver.rating < zone.safety.ratingBelow) out = `Rating ${driver.rating.toFixed(1)} is under ${zone.safety.ratingBelow}`;
    else if (zone.safety.maxCancel && driver.cancelPct > country.cancelRateLimitPct) out = `Cancel rate ${driver.cancelPct}% is over the ${country.cancelRateLimitPct}% limit`;
    else if (zone.fairness.hourCap && driver.ridesThisHour >= zone.fairness.hourRides) out = `Already had ${driver.ridesThisHour} rides this hour (cap ${zone.fairness.hourRides})`;
    else if (zone.fairness.skipPause && driver.skipsInRow >= zone.fairness.skips) out = `Paused ${zone.fairness.pauseMin} min after ${driver.skipsInRow} skipped offers`;
    else if (zone.autoOffline.on && driver.noInRow >= zone.autoOffline.after) out = `Went offline after ${driver.noInRow} offers not accepted in a row`;
    else if (zone.decline.on && driver.noInRow >= zone.decline.pauseAfter) out = `Paused ${zone.decline.pauseMin} min after ${driver.noInRow} no's in a row`;
    else if (zone.goingHome.on && driver.goingHome && !driver.homeDirectionOk) out = "Going home, and this ride is the other way";
    else if (request.extras.some((extra) => zone.extras.find((item) => item.id === extra)?.on && extra !== "long_trip" && !driver.extras.includes(extra))) out = "Does not have what the rider asked for";
    else if (km > widest) out = `Too far: ${km} km (widest search ${widest} km)`;
    const parts: { label: string; points: number }[] = [];
    const add = (id: FactorId, label: string, ratio: number) => {
      const weight = weights.get(id);
      if (weight) parts.push({ label, points: Math.round((weight / total) * 100 * Math.max(0, Math.min(1, ratio))) });
    };
    add("eta", `${etaMin} min to pickup`, 1 - etaMin / 20);
    add("rating", `rating ${driver.rating.toFixed(1)}`, (driver.rating - 3.5) / 1.5);
    add("acceptance", `accepts ${driver.acceptancePct}%`, driver.acceptancePct / 100);
    add("cancel", `cancels ${driver.cancelPct}%`, 1 - driver.cancelPct / 30);
    add("idle", `waited ${driver.idleMin} min`, driver.idleMin / 30);
    if (finishingOk) add("finishing", `finishes in ${driver.finishing!.inMin} min nearby`, 1);
    if (driver.favourite && zone.favourite.on && km <= zone.favourite.maxKm) add("favourite", "rider's favourite", 1);
    if (zone.fairness.idleBoost && driver.idleMin >= 20) parts.push({ label: "fairness boost", points: zone.fairness.idlePoints });
    if (zone.riderCancel.on && zone.riderCancel.priority && driver.priorityUntilMin > 0) parts.push({ label: "first in line after a rider cancel", points: 25 });
    return { driver, km, etaMin, score: parts.reduce((sum, part) => sum + part.points, 0), parts, out, ring: ring < 0 ? zone.radius.steps.length : ring };
  });
  const airportFifo = zone.airport.on && zone.airport.order === "fifo";
  return rows.sort((a, b) => Number(Boolean(a.out)) - Number(Boolean(b.out))
    || (airportFifo ? (a.driver.queuePos ?? 999) - (b.driver.queuePos ?? 999) : 0)
    || b.score - a.score
    || a.km - b.km);
}

export type SimStep = { atSec: number; who: "system" | "driver" | "rider" | "admin"; title: string; detail: string };

/** What happens second by second when nobody accepts: every offer, every wider search, every message to the rider. */
export function simulate(zone: ZoneDispatch, ranked: readonly Ranked[], start: OfferMode | null): SimStep[] {
  const steps: SimStep[] = [];
  if (!start) return [{ atSec: 0, who: "system", title: "No offer", detail: "Dispatch is paused or no mode is on, so the request waits for an admin." }];
  const able = ranked.filter((row) => !row.out);
  let t = zone.batching.on ? zone.batching.seconds : 0;
  if (zone.batching.on) steps.push({ atSec: 0, who: "system", title: "Smart waiting", detail: `Collects requests for ${zone.batching.seconds} s, then matches them together.` });
  const limit = zone.radius.maxWaitMin * 60;
  let ring = 0;
  let mode: OfferMode = start;
  let tried = 0;
  // A driver who already said no to this request is not asked again on Exclusive.
  const asked = new Set<string>();
  const switched = new Set<OfferMode>();
  let guard = 0;
  const stepCount = Math.max(zone.radius.steps.length, (zone.radar.steps ?? zone.radius.steps).length, (zone.exclusive.steps ?? zone.radius.steps).length);
  const kmAt = (m: OfferMode, at: number) => { const list = zone[m].steps ?? zone.radius.steps; return list[Math.min(at, list.length - 1)]!; };
  while (t < limit && guard < 40) {
    guard += 1;
    // v0.18.9: each mode uses its own steps (missing = the search distance); the step index is shared and a shorter
    // list keeps its widest value (contract.json#dispatch.modeSteps).
    const km = kmAt(mode, ring);
    // A driver with a rider gets Exclusive offers only, when Exclusive while driving is on (Q18). Never Radar.
    const inRing = able.filter((row) => row.km <= km && (!row.driver.finishing || (mode === "exclusive" && zone.finishing.exclusive && zone.exclusiveWhileDriving.on)));
    if (mode === "radar") {
      const shown = inRing.slice(0, zone.radar.drivers);
      steps.push({ atSec: t, who: "driver", title: `Radar, ${km} km`, detail: shown.length ? `Shown to ${shown.length} driver${shown.length === 1 ? "" : "s"} at once for ${zone.radar.seconds} s: ${shown.map((row) => row.driver.name).join(", ")}.` : `No driver within ${km} km.` });
      t += zone.radar.seconds;
      const wider = ring < stepCount - 1;
      if ((zone.radar.then === "widen" || zone.radar.then === "widen_then_exclusive") && wider) ring += 1;
      else if ((zone.radar.then === "exclusive" || zone.radar.then === "widen_then_exclusive") && zone.exclusive.on && !switched.has("exclusive")) { switched.add("exclusive"); mode = "exclusive"; tried = 0; steps.push({ atSec: t, who: "system", title: "Switch to Exclusive", detail: "Nobody accepted on the radar." }); }
      else if (wider) ring += 1;
      else break;
    } else {
      const next = inRing.find((row) => !asked.has(row.driver.id));
      if (next && tried < zone.exclusive.drivers) {
        asked.add(next.driver.id);
        steps.push({ atSec: t, who: "driver", title: `Exclusive to ${next.driver.name}`, detail: `${next.km} km, ${next.etaMin} min away. ${zone.exclusive.seconds} s to accept.` });
        t += zone.exclusive.seconds;
        tried += 1;
        continue;
      }
      const wider = ring < stepCount - 1;
      if ((zone.exclusive.then === "widen" || zone.exclusive.then === "widen_then_radar") && wider) { ring += 1; tried = 0; steps.push({ atSec: t, who: "system", title: "Wider search", detail: `Now up to ${kmAt("exclusive", ring)} km.${able.some((row) => row.km <= kmAt("exclusive", ring) && !asked.has(row.driver.id)) ? "" : " No new driver in the wider area."}` }); }
      else if ((zone.exclusive.then === "radar" || zone.exclusive.then === "widen_then_radar") && zone.radar.on && !switched.has("radar")) { switched.add("radar"); mode = "radar"; steps.push({ atSec: t, who: "system", title: "Switch to Radar", detail: `${asked.size ? `${asked.size} driver${asked.size === 1 ? "" : "s"} said no.` : "No driver to try."} Many drivers see it now.` }); }
      else if (wider) { ring += 1; tried = 0; }
      else break;
    }
  }
  let end = limit;
  for (const step of zone.waiting.filter((item) => item.on).sort((a, b) => a.afterMin - b.afterMin)) {
    const at = step.afterMin * 60;
    if (at > end) break;
    const label = WAIT_KINDS.find((item) => item.id === step.kind)?.label ?? step.kind;
    steps.push({ atSec: at, who: step.kind === "alert_admin" ? "admin" : "rider", title: label, detail: step.kind === "keep_waiting" && step.extraMin ? `${step.message} (wait ${step.extraMin} more min)` : step.message });
    if (step.kind === "busy") end = at;
  }
  const shown = steps.filter((step) => step.atSec <= end);
  shown.push({ atSec: end, who: "system", title: "Search stops", detail: end < limit ? "The rider saw the busy message." : `Longest search is ${zone.radius.maxWaitMin} min.` });
  return shown.sort((a, b) => a.atSec - b.atSec);
}

export type CancelRecord = {
  id: string;
  tripId: string;
  zoneId: string;
  rider: string;
  driverId: string;
  driver: string;
  acceptedAt: string;
  cancelledAt: string;
  minutesAfterAccept: number;
  atAccept: { km: number; etaMin: number };
  atCancel: { km: number; etaMin: number };
  path: [number, number][];
  pickup: [number, number];
  /** The trip's car type and price (major units of the zone's money), for the fee of that car type. */
  category: string;
  fare: number;
};

/**
 * The rider's cancel fee for one trip in a zone: live (Radar and live Exclusive) or reservation (booked rides, Exclusive
 * reservations too), by car type. A % fee is of the trip price, rounded half-up to a whole minor unit and kept between its min and max.
 */
export function riderCancelFee(zone: ZoneDispatch, kind: CancelFeeKind, category: string, fare: number): number {
  const table = kind === "live" ? zone.riderCancel.fees : zone.reservation.riderFees;
  return cancelFeeAmount(feeRow(table, category), fare, countryOfZone(zone.zoneId));
}

/** The automatic fee decision for a rider cancel, the fee for the trip's car type, and the reason in words. */
export function cancelDecision(record: CancelRecord, zone: ZoneDispatch): { fee: boolean; why: string; closerPct: number; amount: number; freeMin: number } {
  const closerPct = record.atAccept.km > 0 ? Math.round(((record.atAccept.km - record.atCancel.km) / record.atAccept.km) * 100) : 0;
  const freeMin = feeRow(zone.riderCancel.fees, record.category).freeMin;
  const amount = riderCancelFee(zone, "live", record.category, record.fare);
  if (!zone.riderCancel.on) return { fee: false, why: tr("The smart cancel check is off in this zone."), closerPct, amount, freeMin };
  if (record.minutesAfterAccept < freeMin) return { fee: false, why: tr("Cancelled {0} min after accept, inside the free {1} min.", [record.minutesAfterAccept, freeMin]), closerPct, amount, freeMin };
  if (closerPct >= zone.riderCancel.closerPct) return { fee: true, why: tr("The driver came {0}% closer ({1} → {2} km). Fee applies.", [closerPct, record.atAccept.km, record.atCancel.km]), closerPct, amount, freeMin };
  return { fee: false, why: tr("The driver came only {0}% closer (needs {1}%). No fee.", [Math.max(0, closerPct), zone.riderCancel.closerPct]), closerPct, amount, freeMin };
}

/** Everything the backend needs, in one file: the live rules per zone, country rules, events and groups. */
export function rulesFile(book: DispatchBook, country: MarketId, at: string, thresholds: RideCheckThresholds = RIDE_CHECK_SETTINGS_DEFAULT, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES) {
  const info = market(country);
  return {
    format: "movera.dispatch.rules",
    version: 1,
    exportedAt: at,
    revision: book.draftRev,
    /** Ride check numbers shared by every zone (admin Ride check triggers). */
    rideCheckThresholds: rideCheckThresholds(thresholds),
    country: { id: country, name: info.name, currency: info.currency, timeZone: info.timeZone, ...liveCountry(book, country) },
    glossary: {
      rideCheck: "When the driver and rider apps show \"Is everything OK?\". farOn: the driver tapped Finish more than endFarMeters metres (this zone's own number) from the drop-off; the card opens right after finish. stopOn: no movement for more than rideCheckThresholds.longStopMinutes minutes mid-trip, not at a planned stop and not in traffic; that number is the same for every zone. routeKm: this many km off the route; longerPct: the trip this much longer than expected. crashOn: a very hard stop or impact opens the card at once with Call 112 on top. Each part works only when its switch is on.",
      radar: "One request shown to the N nearest suitable drivers at once. The first to accept gets it.",
      exclusive: "One request offered to one driver at a time, best first, for a few seconds each.",
      busy: "Waiting requests divided by free online drivers in the zone.",
      score: "Each factor gives 0 to its weight; drivers are offered in order of total score.",
      radarApp: "The most Radar offers one driver sees at once, one setting per screen: the full-screen radar list (full; fullLockWhileDriving = the list cannot be opened while the car is moving, it opens again once stopped) and the offer cards over the map (popup while stopped; with popupSplitByDriving, popupWhileDriving while the car is moving). The app waits about 10 s before switching between stopped and driving, and cards never pop over navigation. No Radar offers while driving a rider.",
      autoOffline: "After this many Exclusive or hand-sent (assigned, Dispatch › send offer) offers of live trips in a row that the driver declined or let run out, sent while the driver was free, the driver is set offline (1 to 99, default 10; contract.json#autoOffline, owner G4-E2/E3). Radar offers (also admin radar groups), reservation offers and offers sent during a trip never count. Any accept or going online starts again from 0. noFixMinutes: no position for this many minutes (not during a trip) and the server sets the driver offline (0 = never, default 5).",
      offerCard: "What the driver app's offer cards show (Radar, Exclusive, the reservation popup): netFare = the driver's share instead of the full fare; dropoffAreaOnly = only the area of the drop-off; the other switches show or hide pickup address, stops, the rider's rating (riderRating: off = the server sends none; a rider with no rating shows nothing), trip minutes and km, distance to pickup and badges.",
      raisePrice: "raisePrice.maxFactor: the rider may raise the fare to at most this many times the booked fare while searching (1 to 3, default 2; owner G4-E4). The server refuses a higher raise (400 raise_too_high) and copies the limit into the zone's rider app config.",
      exclusiveReasons: "Not used since v0.18.6 (owner G4-E7): the driver app shows no 'why you' line and the server no longer sends Offer.reasonCode.",
      hiddenComesBackMin: "A trip the driver hid with × in the Live list can come back after this many minutes if nobody took it and it is still in Radar. It never counts against the driver.",
      exclusiveWhileDriving: "While driving a rider the driver gets Exclusive offers only (at most count at a time), never Radar trips.",
      pickupWait: "Waiting at pickup. Free wait, price per minute and the no-show fee come from Pricing per category (one source); the driver can cancel for no-show when the free wait ends (Q41). Then rideTypes (scheduled, airport, event; a scheduled ride's free wait is the reservation policy's included waiting) and farPickup (pickups over farPickupKm). A later rule wins where it sets a value; null = same as before. The waiting money goes 100% to the driver; country.noShowDriverSharePct is the driver's part of the no-show fee.",
      destinationMode: "driverApp.destinationMode[zoneId]: enabled = the whole Destination mode. timeLimitOn/timeLimitHours: how long a destination stays active. dailyLimitOn/destinationsPerDay: destinations one driver can set per day. corridorOn/corridorKm: a trip is marked On your way (no trip is hidden, owner Q2) when its drop-off is within corridorKm of the driver's road route to the destination AND the trip brings the driver closer. focusFinalDestinationOn: trips ending near the destination; focusOnTheWayOn: trips along the route; focus = both, final, onTheWay or none. A part whose switch is off has no limit.",
      nextTrips: "driverApp.nextTrips[zoneId]: while driving a rider only Exclusive offers and Exclusive reservations come as next trips (offerTypes), never Radar cards, and only on the way to the final drop-off, never while heading to a stop or before pickup. Offers start within withinKmOfDropoff km (withinKmOfDropoffOn) or withinMinutesOfDropoff minutes (withinMinutesOfDropoffOn) of the final drop-off, whichever comes first (startWhen either); both off = the whole last leg (startWhen wholeLastLeg). A destination the driver sets during a trip uses destinationMode. The demo keeps today's next-trip behaviour (no limits).",
      driverApp: "driverApp has the same values in the driver app's shapes: cancelReasons per language with English filled in where a language is empty, destinationMode and nextTrips per zone.",
      countryRules: "country.rest: work and rest hours, warnings warnFirstMin and warnLastMin before the limit, blockOnline at the limit. country.cancelRateLimitPct: the cancel rate drivers should stay under, never shown to drivers (they see a rule text). It is the only cancel rate number: in zones where safety.maxCancel is on, drivers over it get no requests. Only normal-trip cancels count, without pause or fee; reasons with counts=false never count. country.cancelReasons: per group and language (en, sv, fr, ar); an empty language uses English.",
      reservationWho: "listTo group = only the drivers of the saved group listGroupId (groups below). homePopupTo: list = the same drivers as the list, zone = every online driver in the zone. popupClosedExclusive: a driver who closed the Home popup with × can get it back as an Exclusive if nobody took it.",
      smartGap: "A driver cannot hold two scheduled rides whose times are the same or close. Gap = the first ride's trip time + the drive to the next pickup + types[kind].spareMin. With hideClashing, once a driver takes one, the rides that do not fit leave that driver's list (they still see them all before taking one).",
      leaveNow: "Leave now: at the driver's estimated drive time to the pickup + types[kind].spareMin before pickup, the ride always lands on the driver's screen as the active trip with Head to pickup (no switch, contract v0.4.2). lateWarn: when Leave now cannot start the trip (driver offline or busy), an island warning at once. lateBackupAfterMin: only an offline driver loses the ride that many minutes after Leave now; an online driver keeps it. lateEta: from Leave now until arrival the driver's ETA is checked every checkEverySeconds; when now + ETA is later than pickup + toleranceMin the ride goes early to reassignTo (exclusive, radar or dispatch). towardPickup: from towardPickupBeforeMin before pickup, offers head toward the scheduled pickup, each checked with the smart gap.",
      rideTypes: "types: normal, airport, long (over longTripKm), premium (Comfort and Premium) and event, each with onlineBeforeMin, spareMin and two reminders (remindFirstMin, remindLastMin) before pickup.",
      riderCancelFees: "Rider cancel fees per car type (Pricing's category ids; a car type without its own row uses the economy row), two sets. riderCancel.fees = live trips (Radar and live Exclusive): free for freeMin minutes after the driver accepts. reservation.riderFees = booked rides, Exclusive reservations too: free until freeMin minutes before pickup. Then the fee: type fixed = value in country money (major units); type percent = value % of the trip price, rounded half-up to a whole minor unit (öre, cent, millime), then kept between min and max (major units, null = no limit).",
      reservationCancels: "Drivers never pay. Riders cancel for free and then pay the late cancel fee by car type, see riderCancelFees. A driver cancel under driverLateCancelHours before pickup is a late cancel; latePauseAfter late cancels in latePeriodDays = no scheduled rides for latePauseDays. Every driver cancel counts in the cancel rate.",
      showDriverOnAccept: "true = the rider sees the driver's name, photo and car as soon as a driver accepts, and the new driver if it changes.",
      raiseFare: "No driver near pickup: an admin can raise the driver's fare up to raiseMax (country money, never over 500 kr or the same value in local money). It is paid from Movera's commission; the admin sees when it goes beyond it. The rider pays the same.",
      riderApp: "riderApp[zoneId] is what the rider app reads at GET /api/v1/rider/scheduled-rides/rules: {freeCancelMinutesBeforePickup, lateCancelFeeMinor, currency, showDriverOnAccept, byCategory}. byCategory[car type] = {freeCancelMinutesBeforePickup, feeType fixed|percent, feeMinor, feePct, minFeeMinor, maxFeeMinor} (minor units, null = not used). The top-level free time and fee are the Economy row, for older rider apps.",
      assignAccept: "An admin gives the ride to one driver: it comes like an Exclusive, labelled Assigned by Movera, with assignAcceptSec seconds to accept. Not accepted: the admin sees it and picks someone else.",
      reservation: "A ride booked for later. Nobody took it yet: first in Scheduled rides (for listTo drivers), then also the Home popup homePopupAfterMin minutes after booking, then Exclusive exclusiveBeforeMin minutes before pickup, then also Radar trips radarBeforeMin minutes before pickup (never labelled Exclusive there). When a driver takes it, it leaves every other driver's app at once.",
      reservationCancel: "onDriverCancel: where it goes back when the driver who took it cancels. byTime = the step the time says; list = Scheduled rides, the Home popup waits again from the cancel; home or exclusive = that step at once. A step closer to pickup always wins.",
      reservationTie: "Several drivers take it at the same time: the first tap wins; at exactly the same moment the server picks one at random. The server decides, never the app.",
    },
    zones: info.zones.map((zone) => ({ id: zone.id, name: zone.name, kind: zone.kind, control: book.control[zone.id] ?? { paused: false, mode: null }, rules: liveRules(book, zone.id) })),
    events: book.events.filter((event) => event.country === country),
    groups: book.groups.filter((group) => group.country === country),
    riderApp: Object.fromEntries(info.zones.map((zone) => [zone.id, riderScheduledRules(liveRules(book, zone.id).reservation, country, categories)])),
    driverApp: {
      cancelReasons: Object.fromEntries(LANG_LIST.map((lang) => [lang.id, cancelReasonsFor(liveCountry(book, country).cancelReasons, lang.id)])),
      destinationMode: Object.fromEntries(info.zones.map((zone) => [zone.id, destinationModeForDriverApp(liveRules(book, zone.id).destinationMode)])),
      nextTrips: Object.fromEntries(info.zones.map((zone) => [zone.id, nextTripsForDriverApp(liveRules(book, zone.id).nextTrips)])),
    },
  };
}
