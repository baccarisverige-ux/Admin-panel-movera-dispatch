import { currencySymbol } from "../../pricing/zonePricing.ts";
import { validRaiseFactor, validSamePoint } from "../offerRules.ts";
import { DEFAULT_FEE_CATEGORIES, cancelFeeIssues, type FeeCategory } from "../cancelFees.ts";
import { cancelReasonIssues, exclusiveReasonIssues, pickupWaitIssues } from "../offers.ts";
import { destinationModeIssues, nextTripsIssues } from "../tripRules.ts";
import { tr, trx } from "../../i18n/core.ts";
import { type OfferMode, type ReservationStep, RIDE_TYPES, PICKUP_MOVE_MAX_METERS, RESERVATION_STEP_LABEL, BOOKING_WINDOW_DEFAULT, BOOKING_LIMITS, MAX_TRIP_KM_LIMIT, BOOKING_LABELS, type ReservationRules, type ZoneDispatch, type CountryDispatch, type DriverGroup } from "./model.ts";
import { raiseCap, countryOfZone, rideCheckIssues } from "./defaults.ts";

/** Dispatch rules, part: Save checks and the reservation timeline (was rules.ts lines 957–1206). rules.ts re-exports everything; import from "../rules.ts" as before. */
/** Problems that stop a save. Empty means the rules are fine. */
/** categories: the car types Pricing lists for the zone; the cancel fee rows are checked for these. */
export function zoneIssues(zone: ZoneDispatch, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES): string[] {
  const issues: string[] = [];
  if (!zone.radar.on && !zone.exclusive.on) issues.push("Switch on Radar or Exclusive, or both. A zone needs a way to offer rides.");
  if (zone.radar.on && (zone.radar.drivers < 1 || zone.radar.drivers > 30)) issues.push("Radar: drivers who see a request must be 1 to 30.");
  if (zone.radar.on && (zone.radar.seconds < 5 || zone.radar.seconds > 120)) issues.push("Radar: time on the radar must be 5 to 120 seconds.");
  if (zone.exclusive.on && (zone.exclusive.seconds < 5 || zone.exclusive.seconds > 60)) issues.push("Exclusive: time to accept must be 5 to 60 seconds.");
  if (zone.radar.on && zone.radarApp.fullOn && (zone.radarApp.full < 1 || zone.radarApp.full > 20)) issues.push("Radar in the driver app: full screen must show 1 to 20 offers.");
  if (zone.radar.on && zone.radarApp.popupOn && (zone.radarApp.popup < 1 || zone.radarApp.popup > 5)) issues.push("Radar in the driver app: the popup must show 1 to 5 offers.");
  if (zone.radar.on && !zone.radarApp.fullOn && !zone.radarApp.popupOn) issues.push("Radar in the driver app: switch on the full screen or the popup, or drivers cannot see Radar offers.");
  if (zone.radar.on && zone.radarApp.popupOn && zone.radarApp.popupSplitByDriving && (zone.radarApp.popupWhileDriving < 1 || zone.radarApp.popupWhileDriving > zone.radarApp.popup || !Number.isInteger(zone.radarApp.popupWhileDriving))) issues.push("Radar in the driver app: offer cards while driving must be 1 to the number shown while stopped.");
  if (!Number.isInteger(zone.autoOffline.noFixMinutes) || zone.autoOffline.noFixMinutes < 0 || zone.autoOffline.noFixMinutes > 120) issues.push("Set offline without position: must be 0 to 120 minutes (0 = never).");
  if (zone.autoOffline.on && (zone.autoOffline.after < 1 || zone.autoOffline.after > 99 || !Number.isInteger(zone.autoOffline.after))) issues.push("Go offline automatically: must be after 1 to 99 offers.");
  if (zone.exclusive.on && zone.exclusiveWhileDriving.on && (zone.exclusiveWhileDriving.count < 1 || zone.exclusiveWhileDriving.count > 5)) issues.push("Exclusive while driving: must be 1 to 5 offers at a time.");
  if (zone.radar.on && (zone.hiddenComesBackMin < 1 || zone.hiddenComesBackMin > 60)) issues.push("Radar in the driver app: a hidden trip can come back after 1 to 60 minutes.");
  // v0.18.6 (G4-E4): contract.json#dispatch.raisePrice.range; the server answers 400 invalid_document outside it.
  if (validRaiseFactor(zone.raisePrice.maxFactor) === null) issues.push("Rider raise limit: must be 1× to 3× the booked price.");
  issues.push(...exclusiveReasonIssues(zone.exclusiveReasons));
  issues.push(...pickupWaitIssues(zone.pickupWait, countryOfZone(zone.zoneId)));
  if (zone.exclusive.on && (zone.exclusive.drivers < 1 || zone.exclusive.drivers > 10)) issues.push("Exclusive: drivers to try must be 1 to 10.");
  if (zone.choose.how === "manual" && !zone[zone.choose.main].on) issues.push(`The main mode (${modeLabel(zone.choose.main)}) is off. Switch it on or pick the other mode.`);
  if ((zone.start.mode === "both" || zone.start.mode === "byDistance") && (!zone.radar.on || !zone.exclusive.on)) issues.push("Start & order: both at once and by distance need Radar and Exclusive on.");
  if ((zone.start.mode === "radar" || zone.start.mode === "exclusive") && !zone[zone.start.mode].on) issues.push("Start & order: the mode that starts first is off. Switch it on or choose another start.");
  if (zone.start.mode === "byDistance" && (!(zone.start.nearKm > 0) || zone.start.nearKm > 50)) issues.push("Start & order: the distance for Exclusive first must be above 0 and at most 50 km.");
  for (const mode of ["radar", "exclusive"] as const) {
    const own = zone[mode].steps;
    if (!own) continue;
    if (!own.length || own.length > 5 || own.some((km) => km <= 0 || km > 50)) issues.push("Own distance steps: 1 to 5 steps, each above 0 and at most 50 km.");
    if (own.some((km, index) => index > 0 && km <= own[index - 1]!)) issues.push("Own distance steps: each step must be larger than the one before.");
  }
  if (zone.limits.maxPickupKm < 0 || zone.limits.maxPickupKm > 50) issues.push("Pickup limits: the farthest pickup must be 0 to 50 km (0 = the widest search step).");
  if (zone.limits.maxPickupEtaMin < 0 || zone.limits.maxPickupEtaMin > 60) issues.push("Pickup limits: the longest pickup time must be 0 to 60 minutes (0 = off).");
  if (zone.neighbours.on && zone.neighbours.zoneIds.length === 0) issues.push("Neighbour zones: choose at least one zone or switch it off.");
  if (zone.choose.how === "auto" && (!zone.radar.on || !zone.exclusive.on)) issues.push("Automatic choice needs both Radar and Exclusive on. Switch both on or choose by hand.");
  if (zone.choose.how === "auto" && (zone.choose.radarAbove <= 0 || zone.choose.radarAbove > 10)) issues.push("Automatic choice: the busy level must be above 0 and at most 10.");
  for (const rule of zone.choose.times.filter((item) => item.on)) {
    if (!/^\d\d:\d\d$/.test(rule.from) || !/^\d\d:\d\d$/.test(rule.to) || rule.from === rule.to) issues.push("Each time rule needs a start and an end time that differ.");
    if (!zone[rule.mode].on) issues.push(`A time rule uses ${modeLabel(rule.mode)}, which is off.`);
  }
  const steps = zone.radius.steps;
  if (!steps.length || steps.some((km) => km <= 0 || km > 50)) issues.push("Search distance steps must be above 0 and at most 50 km.");
  if (steps.some((km, index) => index > 0 && km <= steps[index - 1])) issues.push("Each search distance step must be larger than the one before.");
  if (zone.radius.maxWaitMin < 1 || zone.radius.maxWaitMin > 30) issues.push("Longest search must be 1 to 30 minutes.");
  if (!zone.factors.some((item) => item.on && item.weight > 0)) issues.push("Best driver: switch on at least one thing that counts.");
  const waits = zone.waiting.filter((step) => step.on);
  if (waits.some((step) => step.afterMin < 0 || step.afterMin > 30)) issues.push("Rider waiting: each step must start between 0 and 30 minutes.");
  if (waits.some((step) => !step.message.trim())) issues.push("Rider waiting: each step that is on needs a message.");
  if (zone.reservation.on && (zone.reservation.searchBeforeMin < 5 || zone.reservation.searchBeforeMin > 240)) issues.push("Reservations: start looking 5 to 240 minutes before pickup.");
  if (zone.reservation.on && zone.reservation.toExclusive && zone.reservation.exclusiveBeforeMin >= zone.reservation.searchBeforeMin) issues.push("Reservations: the switch to Exclusive must come after the search starts (a smaller number of minutes).");
  issues.push(...reservationIssues(zone.reservation, zone.zoneId, categories));
  if (zone.driverCancel.on && (zone.driverCancel.commissionCutPct < 0 || zone.driverCancel.commissionCutPct > 30)) issues.push("Driver cancels: lower commission must be 0 to 30%.");
  if (zone.riderCancel.on && (zone.riderCancel.closerPct < 5 || zone.riderCancel.closerPct > 100)) issues.push("Rider cancels: \"came closer\" must be 5 to 100%.");
  if (zone.riderCancel.on) issues.push(...cancelFeeIssues(zone.riderCancel.fees, "live", categories));
  if (zone.stops.on && (zone.stops.max < 1 || zone.stops.max > 5)) issues.push("Stops: max stops must be 1 to 5.");
  if (!Number.isInteger(zone.stops.answerSeconds) || zone.stops.answerSeconds < 15 || zone.stops.answerSeconds > 300) issues.push("Route change: the driver's time to answer must be 15 to 300 s.");
  if (!Number.isInteger(zone.pickupMove.maxMeters) || zone.pickupMove.maxMeters < 0 || zone.pickupMove.maxMeters > PICKUP_MOVE_MAX_METERS) issues.push(`Pickup move after accept: 0 to ${PICKUP_MOVE_MAX_METERS} m, in whole metres.`);
  if (zone.samePoint && validSamePoint(zone.samePoint.warnMeters) === null) issues.push("Shortest ride: 0 to 1000 m, in whole metres.");
  if (zone.longTripKm < 10 || zone.longTripKm > 500) issues.push("Long trip must be 10 to 500 km.");
  if (!Number.isInteger(zone.pickupPin.maxAttempts) || zone.pickupPin.maxAttempts < 1 || zone.pickupPin.maxAttempts > 10) issues.push("Rider PIN: wrong tries before lock must be 1 to 10.");
  if (!Number.isInteger(zone.pickupPin.lockMinutes) || zone.pickupPin.lockMinutes < 1 || zone.pickupPin.lockMinutes > 60) issues.push("Rider PIN: lock minutes must be 1 to 60.");
  if (zone.safety.minRating && (zone.safety.ratingBelow < 1 || zone.safety.ratingBelow > 5)) issues.push("Safety: lowest rating must be 1 to 5.");
  issues.push(...rideCheckIssues(zone.rideCheck));
  issues.push(...destinationModeIssues(zone.destinationMode), ...nextTripsIssues(zone.nextTrips));
  if (zone.alerts.some((alert) => alert.on && !alert.panel && !alert.email && !alert.sms)) issues.push("Alerts: each alert that is on needs a place to show (panel, email or SMS).");
  return issues;
}

/** The reservation steps must come in order: Scheduled rides → Home popup → Exclusive → Radar trips. */
function reservationIssues(resv: ReservationRules, zoneId: string, categories: readonly FeeCategory[]): string[] {
  if (!resv.on) return [];
  const issues: string[] = [];
  if (resv.listTo === "rating" && (resv.listMinRating < 1 || resv.listMinRating > 5)) issues.push("Reservations: the lowest rating for Scheduled rides must be 1 to 5.");
  if (resv.listTo === "random" && (resv.listGroupSize < 1 || resv.listGroupSize > 500)) issues.push("Reservations: the random group must be 1 to 500 drivers.");
  if (resv.listTo === "homeNear" && (resv.listHomeKm < 0.5 || resv.listHomeKm > 50)) issues.push("Reservations: home near pickup must be 0.5 to 50 km.");
  if (resv.listTo === "nearNow" && (resv.listNearKm < 0.5 || resv.listNearKm > 50)) issues.push("Reservations: near pickup now must be 0.5 to 50 km.");
  if (resv.listTo === "areaRegulars" && (resv.listAreaTrips < 1 || resv.listAreaTrips > 200)) issues.push("Reservations: trips from the area must be 1 to 200.");
  if (resv.listTo !== "all" && resv.listOpenAll && (resv.listOpenAllAfterMin < 1 || resv.listOpenAllAfterMin > 1440)) issues.push("Reservations: opening to all drivers must be 1 to 1440 minutes after booking.");
  if (resv.homePopup && (resv.homePopupAfterMin < 1 || resv.homePopupAfterMin > 1440)) issues.push("Reservations: the Home popup must start 1 to 1440 minutes (24 h) after the rider booked.");
  if (resv.toExclusive && (resv.exclusiveBeforeMin < 1 || resv.exclusiveBeforeMin > 180)) issues.push("Reservations: Exclusive must start 1 to 180 minutes before pickup.");
  if (resv.toRadar && (resv.radarBeforeMin < 1 || resv.radarBeforeMin > 180)) issues.push("Reservations: Radar trips must start 1 to 180 minutes before pickup.");
  if (resv.toRadar && resv.radarBeforeMin >= resv.searchBeforeMin) issues.push("Reservations: Radar trips must come after the search starts (a smaller number of minutes).");
  if (resv.toRadar && resv.toExclusive && resv.radarBeforeMin >= resv.exclusiveBeforeMin) issues.push("Reservations: Radar trips must come after Exclusive (a smaller number of minutes before pickup).");
  if (resv.onDriverCancel === "home" && !resv.homePopup) issues.push("Reservations: after a driver cancels it cannot go to the Home popup, because the Home popup is off.");
  if (resv.onDriverCancel === "exclusive" && !resv.toExclusive) issues.push("Reservations: after a driver cancels it cannot become Exclusive, because \"Becomes an Exclusive trip\" is off.");
  if (resv.listTo === "group" && !resv.listGroupId) issues.push("Reservations: pick the driver group that gets Scheduled rides.");
  // v0.18.17 Book later: the booking policy numbers stay inside the contract's limits.
  const bw = resv.booking ?? BOOKING_WINDOW_DEFAULT;
  for (const [key, limit] of Object.entries(BOOKING_LIMITS) as [keyof typeof BOOKING_LIMITS, { min: number; max: number }][]) {
    if (!(bw[key] >= limit.min && bw[key] <= limit.max)) issues.push(`Reservations: ${BOOKING_LABELS[key]} must be ${limit.min} to ${limit.max}.`);
  }
  if (bw.maxTripKm !== null && !(bw.maxTripKm >= MAX_TRIP_KM_LIMIT.min && bw.maxTripKm <= MAX_TRIP_KM_LIMIT.max)) issues.push("Reservations: longest booked ride must be 1 to 1000 km.");
  if (resv.lateBackupAfterMin < 1 || resv.lateBackupAfterMin > 60) issues.push("Reservations: an offline driver must lose the ride 1 to 60 minutes after Leave now.");
  if (resv.lateEta.on && (!Number.isInteger(resv.lateEta.toleranceMin) || resv.lateEta.toleranceMin < 0 || resv.lateEta.toleranceMin > 30)) issues.push("Reservations: minutes late allowed must be 0 to 30.");
  if (resv.lateEta.on && (!Number.isInteger(resv.lateEta.checkEverySeconds) || resv.lateEta.checkEverySeconds < 15 || resv.lateEta.checkEverySeconds > 600)) issues.push("Reservations: the arrival time must be checked every 15 to 600 seconds.");
  if (resv.towardPickup && (resv.towardPickupBeforeMin < 15 || resv.towardPickupBeforeMin > 240)) issues.push("Reservations: trips toward the pickup must start 15 to 240 minutes before pickup.");
  for (const type of RIDE_TYPES) {
    const rule = resv.types[type.id];
    if (rule.onlineBeforeMin < 5 || rule.onlineBeforeMin > 240) issues.push(`Reservations, ${type.label}: be online before must be 5 to 240 minutes.`);
    if (rule.spareMin < 0 || rule.spareMin > 60) issues.push(`Reservations, ${type.label}: spare minutes must be 0 to 60.`);
    if (rule.remindFirstMin < 1 || rule.remindFirstMin > 1440 || rule.remindLastMin < 0 || rule.remindLastMin > 1440) issues.push(`Reservations, ${type.label}: reminders must be 1 to 1440 minutes before pickup (the second can be 0 = off).`);
    else if (rule.remindLastMin > 0 && rule.remindFirstMin <= rule.remindLastMin) issues.push(`Reservations, ${type.label}: the first reminder must come before the second (a larger number of minutes).`);
  }
  issues.push(...cancelFeeIssues(resv.riderFees, "reservation", categories));
  if (resv.driverLateCancelHours < 0.5 || resv.driverLateCancelHours > 72) issues.push("Reservations: a driver's late cancel must be set 0.5 to 72 hours before pickup.");
  if (resv.latePause && (resv.latePauseAfter < 1 || resv.latePauseAfter > 20)) issues.push("Reservations: the pause must come after 1 to 20 late cancels.");
  if (resv.latePause && (resv.latePeriodDays < 1 || resv.latePeriodDays > 90)) issues.push("Reservations: late cancels must be counted over 1 to 90 days.");
  if (resv.latePause && (resv.latePauseDays < 1 || resv.latePauseDays > 365)) issues.push("Reservations: scheduled rides can be paused for 1 to 365 days.");
  const country = countryOfZone(zoneId);
  const cap = raiseCap(country);
  if (resv.raiseFare && (resv.raiseMax <= 0 || resv.raiseMax > cap)) issues.push(`Reservations: the highest fare raise must be above 0 and at most ${cap} ${currencySymbol(country)}.`);
  if (resv.assignAcceptSec < 10 || resv.assignAcceptSec > 600) issues.push("Reservations: the time to accept a ride assigned by Movera must be 10 to 600 seconds.");
  return issues;
}

/** Smart gap in minutes: the first ride's trip time + the drive to the next pickup + spare minutes. */
export function smartGapMin(tripMin: number, driveMin: number, spareMin: number): number {
  return Math.max(0, tripMin) + Math.max(0, driveMin) + Math.max(0, spareMin);
}

/**
 * Two scheduled rides clash for one driver when the later pickup comes before the smart gap of the earlier one.
 * Times are minutes from any fixed start. Once a driver takes one, the clashing one leaves that driver's list.
 */
export function ridesClash(first: { pickupMin: number; tripMin: number }, second: { pickupMin: number; tripMin: number }, driveMin: number, spareMin: number): boolean {
  const [a, b] = first.pickupMin <= second.pickupMin ? [first, second] : [second, first];
  return a.pickupMin + smartGapMin(a.tripMin, driveMin, spareMin) > b.pickupMin;
}

/** Leave now: how many minutes before pickup the ride lands on the driver's screen as the active trip. */
export function leaveNowBeforeMin(driveMin: number, spareMin: number): number {
  return Math.max(0, Math.round(driveMin)) + Math.max(0, spareMin);
}

/** How a fare raise is paid: from Movera's commission first, and Movera pays anything beyond it. */
export function raiseSplit(raise: number, fare: number, commissionPct: number): { commission: number; fromCommission: number; beyond: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const commission = round(Math.max(0, fare) * Math.max(0, commissionPct) / 100);
  const amount = Math.max(0, raise);
  return { commission, fromCommission: round(Math.min(amount, commission)), beyond: round(Math.max(0, amount - commission)) };
}

export type ReservationTimelineStep = {
  id: ReservationStep | "pickup";
  title: string;
  detail: string;
  /** Minutes after the rider booked, and minutes left before pickup, when this step starts. */
  afterBookedMin: number;
  beforePickupMin: number;
  /** Why the step does not happen for this booking, or null when it does. */
  skipped: string | null;
};

function listWho(resv: ReservationRules, groups: readonly DriverGroup[]): string {
  if (resv.listTo === "category") return tr("Only drivers who drive the ride's category");
  if (resv.listTo === "rating") return tr("Only drivers rated {0} or more", [resv.listMinRating]);
  if (resv.listTo === "random") return tr("A random group of {0} drivers", [resv.listGroupSize]);
  if (resv.listTo === "homeNear") return tr("Only drivers whose home is within {0} km of the pickup", [resv.listHomeKm]);
  if (resv.listTo === "nearNow") return tr("Only drivers within {0} km of the pickup when the rider books", [resv.listNearKm]);
  if (resv.listTo === "favourites") return tr("Only the rider's favourite drivers");
  if (resv.listTo === "areaRegulars") return tr("Only drivers with {0}+ trips from the pickup area in 30 days", [resv.listAreaTrips]);
  if (resv.listTo === "group") {
    const group = groups.find((item) => item.id === resv.listGroupId);
    return group ? tr("Only drivers in the group {0}", [group.name]) : tr("Only drivers in the chosen group");
  }
  return tr("All drivers in the zone");
}

/** Exclusive and Radar steps only happen when the step and the zone's mode are both on. */
function activeUrgent(zone: ZoneDispatch): { exclusive: boolean; radar: boolean } {
  return { exclusive: zone.reservation.toExclusive && zone.exclusive.on, radar: zone.reservation.toRadar && zone.radar.on };
}

/**
 * What happens to a reservation nobody takes, booked this many minutes before pickup:
 * Scheduled rides → Home popup → Exclusive → Radar trips → pickup. Steps that are off or come too late are marked skipped.
 */
export function reservationTimeline(zone: ZoneDispatch, bookedBeforeMin: number, groups: readonly DriverGroup[] = []): ReservationTimelineStep[] {
  const resv = zone.reservation;
  const lead = Math.max(0, Math.round(bookedBeforeMin));
  const urgent = activeUrgent(zone);
  const startAt = (beforePickup: number) => Math.max(0, lead - beforePickup);
  const exclusiveAt = urgent.exclusive ? startAt(resv.exclusiveBeforeMin) : Infinity;
  const radarAt = urgent.radar ? startAt(resv.radarBeforeMin) : Infinity;
  const step = (id: ReservationTimelineStep["id"], title: string, detail: string, afterBookedMin: number, skipped: string | null): ReservationTimelineStep => {
    const at = Math.min(lead, Math.max(0, afterBookedMin));
    return { id, title, detail, afterBookedMin: at, beforePickupMin: lead - at, skipped };
  };
  const homeSkip = !resv.homePopup ? tr("Off.")
    : resv.homePopupAfterMin >= Math.min(exclusiveAt, radarAt) ? (exclusiveAt <= radarAt ? tr("Skipped: it is already Exclusive by then.") : tr("Skipped: it is already in Radar trips by then."))
      : resv.homePopupAfterMin >= lead ? tr("Skipped: pickup comes first.")
        : null;
  const modeSkip = (setting: boolean, mode: OfferMode) => (!setting ? tr("Off.") : !zone[mode].on ? tr("Skipped: {0} is off in this zone.", [trx(modeLabel(mode))]) : null);
  return [
    step("list", RESERVATION_STEP_LABEL.list, resv.listTo !== "all" && resv.listOpenAll ? tr("{0} see it in Scheduled rides. Still untaken after {1} min: every driver in the zone sees it.", [listWho(resv, groups), resv.listOpenAllAfterMin]) : tr("{0} see it in Scheduled rides.", [listWho(resv, groups)]), 0, null),
    step("home", RESERVATION_STEP_LABEL.home, [resv.homePopupTo === "zone" || resv.listTo === "all" ? tr("Nobody took it yet, so it also pops up on Home for every online driver in the zone. It stays in Scheduled rides.") : tr("Nobody took it yet, so it also pops up on Home for the same drivers as the list. It stays in Scheduled rides."), resv.popupClosedExclusive && (resv.toExclusive && zone.exclusive.on) ? tr("A driver who closes it with × can get it back as an Exclusive if nobody took it.") : ""].filter(Boolean).join(" "), resv.homePopupAfterMin, homeSkip),
    step("exclusive", RESERVATION_STEP_LABEL.exclusive, lead <= resv.exclusiveBeforeMin ? tr("Booked this close to pickup, so it is an Exclusive offer at once.") : tr("Close to pickup it becomes an Exclusive offer, like today's Exclusive."), lead - resv.exclusiveBeforeMin, modeSkip(resv.toExclusive, "exclusive")),
    step("radar", RESERVATION_STEP_LABEL.radar, tr("It also comes into Radar trips (Home deck and Live list) as a normal trip that needs a driver soon. Never labelled Exclusive there."), lead - resv.radarBeforeMin, modeSkip(resv.toRadar, "radar")),
    step("pickup", "Pickup", tr("Pickup time."), lead, null),
  ];
}

/** Rides booked with less time than this before pickup skip the Home popup: Exclusive or Radar comes first. Null when the popup is off. */
export function homePopupSkippedBelowMin(zone: ZoneDispatch): number | null {
  const resv = zone.reservation;
  if (!resv.homePopup) return null;
  const urgent = activeUrgent(zone);
  const first = Math.max(urgent.exclusive ? resv.exclusiveBeforeMin : 0, urgent.radar ? resv.radarBeforeMin : 0);
  return resv.homePopupAfterMin + first;
}

const STEP_ORDER: ReservationStep[] = ["list", "home", "exclusive", "radar"];

/** Where an untaken reservation is at a moment: minutes since the rider booked and minutes left before pickup. */
export function reservationStepAt(zone: ZoneDispatch, sinceBookedMin: number, beforePickupMin: number): ReservationStep {
  const resv = zone.reservation;
  const urgent = activeUrgent(zone);
  if (urgent.radar && beforePickupMin <= resv.radarBeforeMin) return "radar";
  if (urgent.exclusive && beforePickupMin <= resv.exclusiveBeforeMin) return "exclusive";
  if (resv.homePopup && sinceBookedMin >= resv.homePopupAfterMin) return "home";
  return "list";
}

/** Where it goes back when the driver who took it cancels. A step closer to pickup always wins over the chosen one. */
export function stepAfterDriverCancel(zone: ZoneDispatch, sinceBookedMin: number, beforePickupMin: number): ReservationStep {
  const resv = zone.reservation;
  const byTime = reservationStepAt(zone, sinceBookedMin, beforePickupMin);
  if (resv.onDriverCancel === "byTime") return byTime;
  // Back to the list: the Home popup waits its minutes again, counted from the cancel.
  if (resv.onDriverCancel === "list") return reservationStepAt(zone, 0, beforePickupMin);
  const chosen: ReservationStep = resv.onDriverCancel === "home" ? (resv.homePopup ? "home" : "list") : (activeUrgent(zone).exclusive ? "exclusive" : "list");
  return STEP_ORDER.indexOf(chosen) >= STEP_ORDER.indexOf(byTime) ? chosen : byTime;
}

export function countryIssues(country: CountryDispatch): string[] {
  const issues: string[] = [];
  if (country.cancelRateLimitPct < 1 || country.cancelRateLimitPct > 100) issues.push("Cancel rate limit must be 1 to 100%.");
  if (!(country.noShowDriverSharePct >= 0 && country.noShowDriverSharePct <= 100)) issues.push("The driver's share of the no-show fee must be 0 to 100%.");
  issues.push(...cancelReasonIssues(country.cancelReasons));
  if (!country.rest.on) return issues;
  if (country.rest.warnFirstMin < 1 || country.rest.warnFirstMin > 120 || country.rest.warnLastMin < 1 || country.rest.warnLastMin > 120) issues.push("Driving limit warnings must be 1 to 120 minutes before the limit.");
  else if (country.rest.warnFirstMin <= country.rest.warnLastMin) issues.push("Driving limit: the first warning must come before the second (a larger number of minutes).");
  if (country.rest.workHours < 4 || country.rest.workHours > 16) issues.push("Work hours before rest must be 4 to 16.");
  if (country.rest.restHours < 1 || country.rest.restHours > 12) issues.push("Rest hours must be 1 to 12.");
  return issues;
}

export function modeLabel(mode: OfferMode | "none"): string {
  return mode === "radar" ? "Radar" : mode === "exclusive" ? "Exclusive" : "None";
}

