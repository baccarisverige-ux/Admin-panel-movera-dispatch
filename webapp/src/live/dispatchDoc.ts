/**
 * The Dispatch rules read back from the server's documents (split from configDocs.ts so the first load carries only
 * this part: dispatch/rules.ts needs it; the save / publish code stays in the lazily loaded live chunk).
 */
import { completeBookingWindow, completeEarlyEnd, RIDE_CHECK_LIMITS, type ZoneDispatch } from "../dispatch/rules.ts";
import { completeOfferCard } from "../dispatch/offers.ts";
import { validPickupMove, validRaiseFactor, validSamePoint } from "../dispatch/offerRules.ts";

type Doc = Record<string, unknown>;

/** Contract defaults for offer seconds a document holds as 0. */
export const SECONDS_DEFAULT = { radar: 15, exclusive: 30 } as const;

/** The Dispatch rules for a server dispatch document (+ the driver document's offer and cancel-share parts) over `fallback`. */
export function rulesOfDispatch(doc: Doc | null, driver: Doc | null, fallback: ZoneDispatch): ZoneDispatch {
  const zone = structuredClone(fallback);
  if (doc) {
    const d = doc as unknown as Partial<ZoneDispatch> & { finishing?: Partial<ZoneDispatch["finishing"]>; favourite?: Partial<ZoneDispatch["favourite"]> };
    if (d.radar) zone.radar = { ...zone.radar, ...d.radar };
    if (d.exclusive) zone.exclusive = { ...zone.exclusive, ...d.exclusive };
    // Checker HIGH (live test 2026-11-01): a document holding 0 / missing seconds loads with the contract default
    // (radar 15 s, exclusive 30 s) and the editor says so; it publishes fine whether the mode is on or off.
    const defaulted: ("radar" | "exclusive")[] = [];
    if (!(Number(zone.radar.seconds) >= 1)) { zone.radar = { ...zone.radar, seconds: SECONDS_DEFAULT.radar }; defaulted.push("radar"); }
    if (!(Number(zone.exclusive.seconds) >= 1)) { zone.exclusive = { ...zone.exclusive, seconds: SECONDS_DEFAULT.exclusive }; defaulted.push("exclusive"); }
    if (defaulted.length) zone.secondsDefaulted = defaulted;
    else delete zone.secondsDefaulted;
    if (d.choose) zone.choose = structuredClone(d.choose);
    // v0.18.11: a document without start / limits / neighbours / own steps keeps the defaults (today's behaviour).
    const raw = doc as { radar?: { steps?: unknown }; exclusive?: { steps?: unknown }; start?: { mode?: unknown; nearKm?: unknown }; limits?: { maxPickupKm?: unknown; maxPickupEtaMin?: unknown; farReachKm?: unknown }; noDriverNearby?: { on?: unknown; afterSec?: unknown; message?: unknown }; neighbours?: { on?: unknown; zoneIds?: unknown; afterStep?: unknown } };
    const kmList = (value: unknown) => (Array.isArray(value) && value.length > 0 && value.every((km) => typeof km === "number") ? (value as number[]) : undefined);
    zone.radar = { ...zone.radar, steps: kmList(raw.radar?.steps) };
    zone.exclusive = { ...zone.exclusive, steps: kmList(raw.exclusive?.steps) };
    if (!zone.radar.steps) delete zone.radar.steps;
    if (!zone.exclusive.steps) delete zone.exclusive.steps;
    const modes = ["auto", "radar", "exclusive", "both", "byDistance"];
    zone.start = { mode: modes.includes(raw.start?.mode as string) ? (raw.start!.mode as ZoneDispatch["start"]["mode"]) : "auto", nearKm: typeof raw.start?.nearKm === "number" ? raw.start.nearKm : 2 };
    // v0.18.39 §63: far reach (0 < km <= 50) and "No driver nearby" (60–1800 s); missing or bad = the zone default (contract).
    const far = raw.limits?.farReachKm;
    zone.limits = { maxPickupKm: typeof raw.limits?.maxPickupKm === "number" ? raw.limits.maxPickupKm : 0, maxPickupEtaMin: typeof raw.limits?.maxPickupEtaMin === "number" ? raw.limits.maxPickupEtaMin : 0, farReachKm: typeof far === "number" && far > 0 && far <= 50 ? far : zone.limits.farReachKm };
    const nd = raw.noDriverNearby;
    zone.noDriverNearby = {
      on: typeof nd?.on === "boolean" ? nd.on : zone.noDriverNearby.on,
      afterSec: typeof nd?.afterSec === "number" && nd.afterSec >= 60 && nd.afterSec <= 1800 ? nd.afterSec : zone.noDriverNearby.afterSec,
      message: typeof nd?.message === "string" && nd.message.trim() ? nd.message : zone.noDriverNearby.message,
    };
    zone.neighbours = { on: raw.neighbours?.on === true, zoneIds: Array.isArray(raw.neighbours?.zoneIds) ? (raw.neighbours.zoneIds as unknown[]).filter((z): z is string => typeof z === "string") : [], afterStep: typeof raw.neighbours?.afterStep === "number" ? raw.neighbours.afterStep : 0 };
    if (d.rulesFrom) zone.rulesFrom = d.rulesFrom;
    if (d.radius) zone.radius = structuredClone(d.radius);
    if (d.factors) zone.factors = structuredClone(d.factors);
    if (d.finishing) zone.finishing = { ...zone.finishing, ...d.finishing };
    if (d.favourite) zone.favourite = { ...zone.favourite, ...d.favourite };
    if (d.exclusiveWhileDriving) zone.exclusiveWhileDriving = { ...d.exclusiveWhileDriving };
    // v0.18.33 (owner Q7): a missing or bad value keeps the default (on, 60 min).
    const next = doc["bookedNext"] as { on?: unknown; withinMin?: unknown } | undefined;
    if (next) zone.bookedNext = { on: typeof next.on === "boolean" ? next.on : zone.bookedNext.on, withinMin: typeof next.withinMin === "number" && next.withinMin >= 0 && next.withinMin <= 240 ? next.withinMin : zone.bookedNext.withinMin };
    // v0.18.6 (G4-E4): the rider raise limit as the server has it; a missing or bad value keeps the contract default.
    const factor = validRaiseFactor((doc["raisePrice"] as { maxFactor?: unknown } | undefined)?.maxFactor);
    if (factor !== null) zone.raisePrice = { maxFactor: factor };
    if (Array.isArray(d.waiting)) zone.waiting = d.waiting.map((step) => ({ ...step, ...(step.extraMin === null ? { extraMin: undefined } : {}) })).map(({ extraMin, ...rest }) => (extraMin === undefined ? rest : { ...rest, extraMin }));
  }
  const offers = (driver?.["offers"] ?? null) as { radarApp?: ZoneDispatch["radarApp"]; offerCard?: unknown; autoOffline?: { on?: boolean; missedExclusive?: number; noFixMinutes?: number } } | null;
  if (offers?.radarApp) zone.radarApp = { ...zone.radarApp, ...offers.radarApp };
  // v0.18.6 (owner decision 3): the offer card switches as the zone's drivers get them (riderRating among them).
  if (offers?.offerCard && typeof offers.offerCard === "object") zone.offerCard = completeOfferCard({ ...zone.offerCard, ...(offers.offerCard as object) });
  if (offers?.autoOffline && typeof offers.autoOffline.missedExclusive === "number") zone.autoOffline = { ...zone.autoOffline, on: offers.autoOffline.on ?? true, after: offers.autoOffline.missedExclusive };
  // G3-R1 (v0.18.4): minutes without a position before the server sets the driver offline (0 = never).
  if (offers?.autoOffline && typeof offers.autoOffline.noFixMinutes === "number") zone.autoOffline = { ...zone.autoOffline, noFixMinutes: offers.autoOffline.noFixMinutes };
  const share = (driver?.["cancelFees"] as { driverSharePct?: number } | undefined)?.driverSharePct;
  if (typeof share === "number") zone.riderCancel = { ...zone.riderCancel, driverSharePct: share };
  // v0.18.10 (G8 Q2): the early-end re-price limits as the zone's drivers get them (default 2 km / 8 min).
  const earlyEnd = (driver?.["cancelFees"] as { earlyEnd?: unknown } | undefined)?.earlyEnd;
  if (earlyEnd && typeof earlyEnd === "object") zone.riderCancel = { ...zone.riderCancel, earlyEnd: completeEarlyEnd(earlyEnd) };
  // v0.18.7 (G5 Q2): "Cancel after the driver arrived counts as a no-show" as the zone's drivers get it (default on).
  const afterArrived = (driver?.["waiting"] as { cancelAfterArrivedIsNoShow?: unknown } | undefined)?.cancelAfterArrivedIsNoShow;
  if (typeof afterArrived === "boolean") zone.pickupWait = { ...zone.pickupWait, cancelAfterArrivedIsNoShow: afterArrived };
  // v0.18.7 (G5 item 4): the pickup move limit the server checks (booking.maxPickupMoveMeters, 0–2000; migration 0041 moved 500 to 200).
  const move = validPickupMove((driver?.["booking"] as { maxPickupMoveMeters?: unknown } | undefined)?.maxPickupMoveMeters);
  if (move !== null) zone.pickupMove = { maxMeters: move };
  // v0.18.30 (owner Q9): "Shortest ride (m)" as the zone's drivers and the server get it (booking.samePointWarnMeters, 0–1000).
  const samePoint = validSamePoint((driver?.["booking"] as { samePointWarnMeters?: unknown } | undefined)?.samePointWarnMeters);
  if (samePoint !== null) zone.samePoint = { warnMeters: samePoint };
  // v0.18.8 (G6): the free wait at each stop the server charges by (waiting.stopFreeWaitMin, 0–20; 0 while stops are off).
  const stopFree = (driver?.["waiting"] as { stopFreeWaitMin?: unknown } | undefined)?.stopFreeWaitMin;
  if (zone.stops.on && typeof stopFree === "number" && Number.isInteger(stopFree) && stopFree >= 0 && stopFree <= 20) zone.stops = { ...zone.stops, freeWaitMin: stopFree };
  // v0.18.8 (G6): "Rider PIN before Start" as the zone's drivers get it (pickupPin; default off, 5 tries, 5 min).
  const pin = driver?.["pickupPin"] as { required?: unknown; maxAttempts?: unknown; lockMinutes?: unknown } | undefined;
  if (pin && typeof pin === "object") {
    const whole = (value: unknown, min: number, max: number, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback);
    zone.pickupPin = { required: pin.required === true, maxAttempts: whole(pin.maxAttempts, 1, 10, zone.pickupPin.maxAttempts), lockMinutes: whole(pin.lockMinutes, 1, 60, zone.pickupPin.lockMinutes) };
  }
  // v0.18.9 (G7): the server's ride check, the route change switches and the max stops as the zone's drivers get them.
  const check = driver?.["rideCheck"] as Record<string, unknown> | undefined;
  if (check && typeof check === "object") {
    const n = (key: string, limit: { min: number; max: number }, fallback: number) => (typeof check[key] === "number" && (check[key] as number) >= limit.min && (check[key] as number) <= limit.max ? (check[key] as number) : fallback);
    const b = (key: string, fallback: boolean) => (typeof check[key] === "boolean" ? (check[key] as boolean) : fallback);
    const rc = zone.rideCheck;
    zone.rideCheck = {
      ...rc,
      on: b("on", rc.on), noAnswerAlarm: b("noAnswerAlarm", rc.noAnswerAlarm),
      stopMinutes: n("stopMinutes", RIDE_CHECK_LIMITS.stopMinutes, rc.stopMinutes), routeKm: n("offRouteKm", RIDE_CHECK_LIMITS.routeKm, rc.routeKm),
      endFarMeters: n("endFarMeters", RIDE_CHECK_LIMITS.endFarMeters, rc.endFarMeters), noAnswerSeconds: n("noAnswerSeconds", RIDE_CHECK_LIMITS.noAnswerSeconds, rc.noAnswerSeconds),
      repeatMinutes: n("repeatMinutes", RIDE_CHECK_LIMITS.repeatMinutes, rc.repeatMinutes),
    };
  }
  const change = driver?.["routeChange"] as Record<string, unknown> | undefined;
  if (change && typeof change === "object") {
    const answer = change["answerSeconds"];
    const fixed = change["fixedPriceTrips"];
    zone.stops = {
      ...zone.stops,
      ...(typeof change["on"] === "boolean" && zone.stops.on ? { changeDuring: change["on"] } : {}),
      ...(typeof change["driverCanRefuse"] === "boolean" ? { driverCanRefuse: change["driverCanRefuse"] } : {}),
      ...(typeof answer === "number" && Number.isInteger(answer) && answer >= 15 && answer <= 300 ? { answerSeconds: answer } : {}),
      ...(typeof change["beforePickup"] === "boolean" ? { beforePickup: change["beforePickup"] } : {}),
      ...(fixed === "block" || fixed === "switch_to_normal" ? { fixedPriceTrips: fixed } : {}),
    };
  }
  // v0.18.17 Book later (contract.json#bookLater): Dispatch › Reservations as the zone's drivers get it, so a reload on
  // live shows the server's values (before this the reservation settings were never read back from the server).
  const resv = driver?.["reservations"] as Record<string, unknown> | undefined;
  if (resv && typeof resv === "object") zone.reservation = reservationOfDriverDoc(resv, zone.reservation, zone);
  // v0.18.35 job 4 (contract.json#bookedTakeBack): the "not driving to the rider" notice, read back from headingCheck.
  const heading = driver?.["headingCheck"] as Record<string, unknown> | undefined;
  if (heading && typeof heading === "object") {
    zone.reservation = { ...zone.reservation, booking: completeBookingWindow({ ...zone.reservation.booking, notHeadingNotice: heading["notice"], notHeadingNoticeEveryMin: heading["noticeEveryMin"] }) };
  }
  const maxStops = (driver?.["booking"] as { maxStops?: unknown } | undefined)?.maxStops;
  if (typeof maxStops === "number" && Number.isInteger(maxStops)) {
    if (maxStops === 0) zone.stops = { ...zone.stops, on: false };
    else if (maxStops >= 1 && maxStops <= 5) zone.stops = { ...zone.stops, on: true, max: maxStops };
  }
  return zone;
}

/** DriverAppConfig.reservations (contract §6, v0.18.17) over the admin's Reservation rules; a bad or missing value keeps `base`. */
export function reservationOfDriverDoc(doc: Record<string, unknown>, base: ZoneDispatch["reservation"], zone?: ZoneDispatch): ZoneDispatch["reservation"] {
  const next = structuredClone(base);
  const n = (key: string, min: number, max: number, fallback: number) => (typeof doc[key] === "number" && (doc[key] as number) >= min && (doc[key] as number) <= max ? (doc[key] as number) : fallback);
  const b = (key: string, fallback: boolean) => (typeof doc[key] === "boolean" ? (doc[key] as boolean) : fallback);
  next.on = b("on", next.on);
  next.lateWarn = b("lateWarn", next.lateWarn);
  next.lateBackupAfterMin = n("offlineBackupAfterMin", 1, 60, next.lateBackupAfterMin);
  next.homePopupAfterMin = n("homePopupAfterMin", 1, 1440, next.homePopupAfterMin);
  next.exclusiveBeforeMin = n("exclusiveBeforeMin", 1, 180, next.exclusiveBeforeMin);
  next.radarBeforeMin = n("radarBeforeMin", 1, 180, next.radarBeforeMin);
  if (["byTime", "list", "home", "exclusive"].includes(doc["onDriverCancel"] as string)) next.onDriverCancel = doc["onDriverCancel"] as typeof next.onDriverCancel;
  next.hideClashing = b("hideClashing", next.hideClashing);
  next.towardPickup = b("towardPickup", next.towardPickup);
  next.towardPickupBeforeMin = n("towardPickupBeforeMin", 15, 240, next.towardPickupBeforeMin);
  next.driverLateCancelHours = n("driverLateCancelHours", 0.5, 72, next.driverLateCancelHours);
  next.latePauseAfter = n("lateCancelLimit", 1, 20, next.latePauseAfter);
  next.latePeriodDays = n("lateCancelPeriodDays", 1, 90, next.latePeriodDays);
  next.latePauseDays = n("pauseDays", 1, 365, next.latePauseDays);
  next.assignAcceptSec = n("assignAcceptSeconds", 10, 600, next.assignAcceptSec);
  next.homePopup = b("homePopup", next.homePopup);
  next.listOpenAll = b("listOpenAll", next.listOpenAll);
  next.listOpenAllAfterMin = n("listOpenAllAfterMin", 1, 1440, next.listOpenAllAfterMin);
  if (["all", "category", "rating", "random", "homeNear", "nearNow", "favourites", "areaRegulars", "group", "nearAtTime"].includes(doc["listTo"] as string)) next.listTo = doc["listTo"] as typeof next.listTo;
  next.listMinRating = n("listMinRating", 1, 5, next.listMinRating);
  next.listGroupSize = n("listGroupSize", 1, 500, next.listGroupSize);
  next.listNearKm = n("listNearKm", 0.5, 50, next.listNearKm);
  next.listAreaTrips = n("listAreaTrips", 1, 200, next.listAreaTrips);
  if (typeof doc["listGroupId"] === "string") next.listGroupId = doc["listGroupId"] as string;
  else if (doc["listGroupId"] === null) next.listGroupId = "";
  next.booking = completeBookingWindow({ ...next.booking, ...doc, maxTripKm: "maxTripKm" in doc ? doc["maxTripKm"] : next.booking.maxTripKm });
  next.searchBeforeMin = n("dispatchBeforeMin", 5, 240, next.searchBeforeMin);
  next.listHomeKm = n("listHomeKm", 0.5, 50, next.listHomeKm);
  // Owner C (v0.18.19): the booked-ride raise switch and highest raise, read back from the server.
  next.raiseFare = b("raiseFare", next.raiseFare);
  next.raiseMax = doc["raiseMax"] === null ? next.raiseMax : n("raiseMax", 0, 100000, next.raiseMax);
  const ADMIN_TYPE: Record<string, keyof typeof next.types> = { normal: "normal", airport: "airport", longTrip: "long", comfortPremium: "premium", event: "event" };
  const types = doc["rideTypes"] as Record<string, { onlineBeforeMin?: unknown; spareMin?: unknown; reminderMin?: unknown }> | undefined;
  if (types && typeof types === "object") {
    for (const [key, id] of Object.entries(ADMIN_TYPE)) {
      const own = types[key];
      if (!own || typeof own !== "object") continue;
      const rule = next.types[id];
      const reminders = Array.isArray(own.reminderMin) ? own.reminderMin.filter((m): m is number => typeof m === "number") : [];
      next.types[id] = {
        onlineBeforeMin: typeof own.onlineBeforeMin === "number" ? own.onlineBeforeMin : rule.onlineBeforeMin,
        spareMin: typeof own.spareMin === "number" ? own.spareMin : rule.spareMin,
        remindFirstMin: reminders[0] ?? rule.remindFirstMin,
        remindLastMin: reminders.length ? (reminders[1] ?? 0) : rule.remindLastMin,
      };
    }
  }
  const late = doc["lateEta"] as Partial<typeof next.lateEta> | undefined;
  if (late && typeof late === "object") next.lateEta = { ...next.lateEta, ...Object.fromEntries(Object.entries(late).filter(([, v]) => v !== undefined)) } as typeof next.lateEta;
  if (zone && typeof doc["longTripKm"] === "number") zone.longTripKm = doc["longTripKm"] as number;
  return next;
}

/* ---------------------------------------------------------------- app documents */

