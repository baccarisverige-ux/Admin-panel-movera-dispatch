import {
  cancelReasonsDefault, cancelReasonsFor, completeCancelReasons, driverNoShowShare, exclusiveReasonList, exclusiveReasonText, pickupTerms,
} from "./offers.ts";
import {
  approve,
  completeCountry,
  countryIssues,
  countryLines,
  applyPreset,
  BUILT_IN_PRESETS,
  cancelDecision,
  changeLines,
  copyParts,
  countryDefault,
  draftRules,
  emptyDispatchBook,
  homePopupSkippedBelowMin,
  inTime,
  leaveNowBeforeMin,
  liveCountry,
  liveRules,
  modeNow,
  normalizeDispatchBook,
  publish,
  raiseCap,
  raiseSplit,
  rankDrivers,
  requestControl,
  reservationStepAt,
  reservationTimeline,
  ridesClash,
  riderScheduledRules,
  rulesFile,
  simulate,
  smartGapMin,
  stepAfterDriverCancel,
  undoTo,
  withEvent,
  zoneDefault,
  zoneIssues,
  type DispatchBook,
  type DriverFacts,
  type Preset,
  type ReservationRules,
  type ZoneDispatch,
} from "./rules.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const base = zoneDefault("Z001");
assert(zoneIssues(base).length === 0, "default rules are valid");
assert(zoneDefault("ARN").airport.on && zoneDefault("ARN").airport.order === "fifo", "airports queue first in, first out");
assert(zoneDefault("FR-PC").riderCancel.fee === 5 && zoneDefault("Z001").riderCancel.fee === 50, "fees follow the country");
assert(zoneIssues({ ...base, radar: { ...base.radar, on: false }, exclusive: { ...base.exclusive, on: false } })[0].includes("Radar or Exclusive"), "a zone needs a mode");
assert(zoneIssues({ ...base, radius: { ...base.radius, steps: [5, 3] } }).some((line) => line.includes("larger")), "search steps grow");
assert(zoneIssues({ ...base, choose: { ...base.choose, how: "auto" }, radar: { ...base.radar, on: false } }).some((line) => line.includes("Automatic")), "auto needs both modes");

assert(inTime({ from: "22:00", to: "04:00" }, "23:30") && inTime({ from: "22:00", to: "04:00" }, "02:00") && !inTime({ from: "22:00", to: "04:00" }, "12:00"), "time rules pass midnight");
assert(modeNow(base, undefined, 2, "12:00").mode === "radar", "busy zone uses radar");
assert(modeNow(base, undefined, 0.5, "12:00").mode === "exclusive", "calm zone uses exclusive");
assert(modeNow(base, { paused: true, mode: null, by: "", at: "" }, 2, "12:00").mode === null, "paused zone offers nothing");
const night = { ...base, choose: { ...base.choose, times: [{ id: "t", on: true, from: "22:00", to: "04:00", mode: "radar" as const }] } };
assert(modeNow(night, undefined, 0.1, "23:00").mode === "radar", "time rule wins");

const driver = (id: string, patch: Partial<DriverFacts>): DriverFacts => ({
  id, name: id, lat: 59.334, lng: 18.063, zoneId: "Z001", finishing: null, rating: 4.8, acceptancePct: 90, cancelPct: 3, idleMin: 5,
  categories: ["economy"], extras: [], female: false, ridesThisHour: 0, skipsInRow: 0, noInRow: 0, favourite: false, goingHome: false,
  homeDirectionOk: true, priorityUntilMin: 0, queuePos: null, restNeeded: false, ...patch,
});
const request = { zoneId: "Z001", at: [59.334, 18.063] as [number, number], category: "economy", extras: [], womenOnly: false, tripKm: 8, blocked: [] as string[] };
const country = countryDefault("SE");
const ranked = rankDrivers(base, country, request, [
  driver("far", { lat: 59.36, lng: 18.1 }),
  driver("near", { lat: 59.335, lng: 18.064 }),
  driver("low", { lat: 59.335, lng: 18.064, rating: 4.0 }),
  driver("rest", { restNeeded: true }),
  driver("cat", { categories: ["comfort"] }),
]);
assert(ranked[0].driver.id === "near", "nearest good driver first");
assert(ranked.find((row) => row.driver.id === "low")?.out?.includes("Rating"), "low rating blocked");
assert(ranked.find((row) => row.driver.id === "rest")?.out?.includes("rest"), "tired driver blocked");
assert(ranked.find((row) => row.driver.id === "cat")?.out?.includes("category"), "category is checked");
const women = rankDrivers(base, country, { ...request, womenOnly: true }, [driver("m", {}), driver("f", { female: true })]);
assert(women[0].driver.id === "f" && women[1].out, "women-only rides");

const steps = simulate(base, ranked, "radar");
assert(steps[0].title.startsWith("Radar"), "radar first");
assert(steps.some((step) => step.title === "Switch to Exclusive"), "radar falls back to exclusive");
assert(steps.some((step) => step.title === "Suggest a higher price"), "rider sees raise price");
assert(steps[steps.length - 1].title === "Search stops", "search ends");

const fee = cancelDecision({ id: "c", tripId: "t", zoneId: "Z001", rider: "r", driverId: "d", driver: "d", acceptedAt: "", cancelledAt: "", minutesAfterAccept: 4, atAccept: { km: 4, etaMin: 10 }, atCancel: { km: 2, etaMin: 5 }, path: [], pickup: [0, 0] }, base);
assert(fee.fee && fee.closerPct === 50, "driver came closer: fee");
const free = cancelDecision({ id: "c", tripId: "t", zoneId: "Z001", rider: "r", driverId: "d", driver: "d", acceptedAt: "", cancelledAt: "", minutesAfterAccept: 4, atAccept: { km: 4, etaMin: 10 }, atCancel: { km: 3.9, etaMin: 10 }, path: [], pickup: [0, 0] }, base);
assert(!free.fee, "driver did not move: no fee");

// Publish: small changes go live now, big ones wait for a second admin.
let book = emptyDispatchBook();
const small = { ...base, radar: { ...base.radar, drivers: 8 } };
assert(changeLines(base, small)[0] === "Radar drivers: 5 → 8", "change line reads well");
const first = publish(book, { Z001: small }, {}, ["Z001"], "nora", "2026-10-12T10:00", "More drivers");
assert(!first.error && first.live[0] === "Z001", "small change is live");
book = first.book;
assert(liveRules(book, "Z001").radar.drivers === 8 && book.versions.length === 1, "version saved");
const big = { ...liveRules(book, "Z001"), choose: { ...base.choose, how: "manual" as const, main: "radar" as const, backup: "exclusive" as const } };
const second = publish(book, { Z001: big }, {}, ["Z001"], "nora", "2026-10-12T11:00", "");
assert(second.waiting[0] === "Z001" && second.book.approvals.length === 1, "big change waits");
assert(approve(second.book, second.book.approvals[0].id, "nora", "x").error, "the same admin cannot approve");
const ok = approve(second.book, second.book.approvals[0].id, "lena", "2026-10-12T11:05");
assert(!ok.error && liveRules(ok.book, "Z001").choose.main === "radar" && ok.book.versions[0].approvedBy === "lena", "second admin approves");
const back = undoTo(ok.book, ok.book.versions[0].rev, "nora", "2026-10-12T12:00");
assert(liveRules(back.book, "Z001").choose.how === "auto", "undo goes back");
assert(draftRules(back.book, "Z001").radar.drivers === 8, "draft follows live");

const paused = requestControl(book, "Z001", { paused: true, mode: null }, "nora", "now");
assert(paused.waiting && !paused.book.control.Z001, "pause waits for approval");
const resumed = requestControl({ ...book, control: { Z001: { paused: true, mode: null, by: "x", at: "" } } }, "Z001", { paused: false, mode: null }, "nora", "now");
assert(!resumed.waiting && !resumed.book.control.Z001.paused, "resume is immediate");

const copied = copyParts(small, zoneDefault("Z002"), ["modes"]);
assert(copied.zoneId === "Z002" && copied.radar.drivers === 8, "copy keeps the zone");
const airport = applyPreset(zoneDefault("FR-PC"), BUILT_IN_PRESETS.find((item) => item.id === "airport")!, "FR");
assert(airport.airport.on && airport.riderCancel.fee === 5 && airport.zoneId === "FR-PC", "preset keeps the country's money");
const file = rulesFile(book, "SE", "now");
assert(file.zones.length > 5 && file.zones[0].rules.radar.drivers === 8, "rules file has every zone");

const arena = emptyDispatchBook().events[0];
assert(withEvent(base, arena, [59.372, 17.999]).rules.radar.drivers === 12, "event rules inside the area");
assert(withEvent(base, arena, [59.334, 18.063]).event === null, "normal rules outside the area");
const once = simulate(base, rankDrivers(base, country, request, [driver("a", {}), driver("b", { lat: 59.335 })]), "exclusive");
assert(once.filter((step) => step.title === "Exclusive to a").length === 1, "a driver who said no is not asked again");

// Radar in the driver app and going offline.
assert(zoneIssues({ ...base, radarApp: { ...base.radarApp, popup: 9 } }).some((line) => line.includes("popup")), "popup has a limit");
assert(zoneIssues({ ...base, radarApp: { ...base.radarApp, fullOn: false, popupOn: false } }).some((line) => line.includes("cannot see")), "radar needs a screen");
const offline = rankDrivers(base, country, request, [driver("quiet", { noInRow: 6 })]);
assert(offline[0].out?.includes("offline"), "driver goes offline after offers not accepted");
assert(!rankDrivers({ ...base, autoOffline: { on: false, after: 5 } }, country, request, [driver("quiet", { noInRow: 6 })])[0].out?.includes("offline"), "auto offline can be off");
const busyDriver = driver("busy", { finishing: { inMin: 2, dropKm: 0.5 } });
// Q18: a driver with a rider gets Exclusive offers only, never Radar.
assert(!simulate(base, rankDrivers(base, country, request, [busyDriver]), "radar")[0].detail.includes("busy"), "no Radar offers while driving a rider");
assert(simulate(base, rankDrivers(base, country, request, [busyDriver]), "exclusive")[0].title === "Exclusive to busy", "Exclusive while driving reaches a driver with a rider");
const noDriving = { ...base, exclusiveWhileDriving: { on: false, count: 1 } };
assert(simulate(noDriving, rankDrivers(noDriving, country, request, [busyDriver]), "exclusive")[0].title !== "Exclusive to busy", "no offers while driving when Exclusive while driving is off");
assert(changeLines(base, { ...base, autoOffline: { on: true, after: 8 } })[0] === "Offline after offers not accepted: 5 → 8", "change line for auto offline");

// Ride check: four triggers, each on or off, with their numbers.
const rcDefault = base.rideCheck;
assert(rcDefault.farOn && rcDefault.stopOn && !("farM" in rcDefault) && !("stopMin" in rcDefault), "far from drop-off and long stop are on; their numbers are shared by every zone");
assert(rcDefault.routeOn && rcDefault.routeKm === 2 && rcDefault.longerOn && rcDefault.longerPct === 50 && rcDefault.crashOn, "by default 2 km off the route, 50% longer, and possible crash on");
const withRc = (patch: Partial<ZoneDispatch["rideCheck"]>): ZoneDispatch => ({ ...base, rideCheck: { ...rcDefault, ...patch } });
const rcIssues = (patch: Partial<ZoneDispatch["rideCheck"]>) => zoneIssues(withRc(patch)).filter((line) => line.startsWith("Ride check:"));
assert(rcIssues({ routeKm: 25 })[0] === "Ride check: off the route must be 0.5 to 20 km.", "off the route has a limit");
assert(rcIssues({ longerPct: 5 })[0] === "Ride check: longer than expected must be 10 to 300%.", "longer than expected has a limit");
assert(rcIssues({ farOn: false, stopOn: false, routeOn: false, routeKm: 0, longerOn: false, longerPct: 0 }).length === 0, "a trigger that is off is not checked");
assert(rcIssues({ routeKm: Number.NaN }).length === 1, "an empty number is not valid");
const rcLines = changeLines(base, withRc({ stopOn: false, crashOn: false, routeKm: 3 }));
assert(rcLines.includes("Ride check on an unexpected long stop: on → off"), "change line for the long stop");
assert(rcLines.includes("Ride check on a possible crash: on → off"), "change line for possible crash");
assert(rcLines.includes("Off the route from (km): 2 → 3"), "change line for off the route");
assert(copyParts(withRc({ routeKm: 9 }), zoneDefault("Z002"), ["safety"]).rideCheck.routeKm === 9, "copying the Safety tab copies Ride check");
assert(copyParts(withRc({ routeKm: 9 }), zoneDefault("Z002"), ["modes"]).rideCheck.routeKm === 2, "other tabs leave Ride check alone");
assert(BUILT_IN_PRESETS.every((preset) => zoneIssues(applyPreset(zoneDefault("Z001"), preset, "SE")).length === 0 && applyPreset(zoneDefault("Z001"), preset, "SE").rideCheck.longerPct === 50), "built-in presets stay valid and carry Ride check");
// Saves from before Ride check get the defaults; broken values fall back, the rest is kept.
const { rideCheck: _rc, ...rcOld } = base;
void _rc;
const rcBook = normalizeDispatchBook(JSON.parse(JSON.stringify({
  ...emptyDispatchBook(),
  live: { Z001: rcOld, Z002: { ...base, rideCheck: { stopMin: 7, longerPct: 70, farOn: "yes", routeKm: null } } },
})));
assert(JSON.stringify(liveRules(rcBook, "Z001").rideCheck) === JSON.stringify(rcDefault) && zoneIssues(liveRules(rcBook, "Z001")).length === 0, "old live rules get Ride check");
const rcPartial = liveRules(rcBook, "Z002").rideCheck;
assert(rcPartial.longerPct === 70 && rcPartial.farOn === true && rcPartial.routeKm === 2 && !("stopMin" in rcPartial), "a part-saved Ride check keeps its values, fills the rest and drops the old per-zone numbers");
assert(changeLines(liveRules(rcBook, "Z001"), draftRules(rcBook, "Z001")).length === 0, "old rules without Ride check do not show as changed");
const rcPreset: Preset = { id: "P-check", name: "Old", note: "", builtIn: false, values: rcOld as unknown as Preset["values"] };
assert(applyPreset(zoneDefault("Z003"), rcPreset, "SE").rideCheck.longerPct === 50, "an old preset gets Ride check");
assert(rulesFile(rcBook, "SE", "now").zones[0].rules.rideCheck.farOn && rulesFile(rcBook, "SE", "now").glossary.rideCheck.includes("finishFarFromDropoffKm"), "the rules file has Ride check");
assert(JSON.stringify(rulesFile(rcBook, "SE", "now").rideCheckThresholds) === JSON.stringify({ finishFarFromDropoffKm: 3, longStopMinutes: 5 }), "the rules file has the default shared thresholds");
assert(JSON.stringify(rulesFile(rcBook, "SE", "now", { finishFarFromDropoffKm: 5, longStopMinutes: 10 }).rideCheckThresholds) === JSON.stringify({ finishFarFromDropoffKm: 5, longStopMinutes: 10 }), "the rules file has the admin-set thresholds");

// Reservations: who gets them, the Home popup, Exclusive, Radar trips and what happens when a driver cancels.
const resv = base.reservation;
assert(resv.listTo === "all" && resv.listMinRating === 4.5, "by default every driver in the zone gets reservations in Scheduled rides");
assert(resv.homePopup && resv.homePopupAfterMin === 10, "by default the Home popup starts 10 min after booking");
assert(resv.toExclusive && resv.exclusiveBeforeMin === 20 && resv.toRadar && resv.radarBeforeMin === 15, "by default Exclusive 20 min and Radar trips 15 min before pickup");
assert(resv.onDriverCancel === "byTime", "by default a cancelled reservation goes back by the time left");
const withResv = (patch: Partial<ReservationRules>): ZoneDispatch => ({ ...base, reservation: { ...resv, ...patch } });
const resvIssues = (patch: Partial<ReservationRules>) => zoneIssues(withResv(patch)).filter((line) => line.startsWith("Reservations:"));
assert(resvIssues({ radarBeforeMin: 20 })[0] === "Reservations: Radar trips must come after Exclusive (a smaller number of minutes before pickup).", "Radar trips come after Exclusive");
assert(resvIssues({ radarBeforeMin: 25 }).length === 1, "Radar at 25 min only breaks the order with Exclusive");
assert(resvIssues({ toExclusive: false, radarBeforeMin: 30 })[0] === "Reservations: Radar trips must come after the search starts (a smaller number of minutes).", "Radar trips come after the search starts");
assert(resvIssues({ toExclusive: false, radarBeforeMin: 25 }).length === 0, "without Exclusive, Radar only needs to be after the search starts");
assert(resvIssues({ toRadar: false, radarBeforeMin: 25 }).length === 0, "a Radar step that is off is not checked");
assert(resvIssues({ listTo: "rating", listMinRating: 6 })[0] === "Reservations: the lowest rating for Scheduled rides must be 1 to 5.", "rating for Scheduled rides has a limit");
assert(resvIssues({ listTo: "all", listMinRating: 6 }).length === 0, "the rating only counts with High rating only");
assert(resvIssues({ homePopupAfterMin: 0 })[0] === "Reservations: the Home popup must start 1 to 1440 minutes (24 h) after the rider booked.", "Home popup has a limit");
assert(resvIssues({ exclusiveBeforeMin: 0, radarBeforeMin: 0 }).includes("Reservations: Exclusive must start 1 to 180 minutes before pickup."), "Exclusive has a limit");
assert(resvIssues({ onDriverCancel: "home", homePopup: false })[0] === "Reservations: after a driver cancels it cannot go to the Home popup, because the Home popup is off.", "cancel to Home needs the popup");
assert(resvIssues({ onDriverCancel: "exclusive", toExclusive: false })[0] === "Reservations: after a driver cancels it cannot become Exclusive, because \"Becomes an Exclusive trip\" is off.", "cancel to Exclusive needs Exclusive");
assert(resvIssues({ on: false, radarBeforeMin: 25, onDriverCancel: "home", homePopup: false }).length === 0, "reservations off: nothing to check");

const flow = reservationTimeline(base, 180);
assert(flow.map((step) => step.id).join(",") === "list,home,exclusive,radar,pickup", "steps come in order: list, Home popup, Exclusive, Radar trips, pickup");
assert(flow.map((step) => step.afterBookedMin).join(",") === "0,10,160,165,180", "booked 3 h ahead: popup after 10 min, Exclusive 20 min and Radar 15 min before pickup");
assert(flow.every((step, index) => !step.skipped && (index === 0 || step.afterBookedMin >= flow[index - 1].afterBookedMin)), "every step happens, one after the other");
assert(flow[0].detail.startsWith("All drivers in the zone"), "the list step says who gets it");
const radarStep = flow.find((step) => step.id === "radar")!;
assert(!radarStep.title.includes("Exclusive") && radarStep.detail.includes("Never labelled Exclusive"), "Radar trips are never labelled Exclusive");
assert(reservationTimeline(withResv({ listTo: "rating", listMinRating: 4.8 }), 180)[0].detail.startsWith("Only drivers rated 4.8"), "list step with a rating");
// More ways to pick who gets it in Scheduled rides, and opening it to everyone later.
assert(resv.listGroupSize === 10 && resv.listHomeKm === 5 && resv.listNearKm === 5 && resv.listAreaTrips === 5 && resv.listOpenAll && resv.listOpenAllAfterMin === 30, "defaults for the group choices");
assert(resvIssues({ listTo: "random", listGroupSize: 0 })[0] === "Reservations: the random group must be 1 to 500 drivers.", "random group size has a limit");
assert(resvIssues({ listTo: "homeNear", listHomeKm: 80 })[0] === "Reservations: home near pickup must be 0.5 to 50 km.", "home distance has a limit");
assert(resvIssues({ listTo: "nearNow", listNearKm: 0 })[0] === "Reservations: near pickup now must be 0.5 to 50 km.", "near-now distance has a limit");
assert(resvIssues({ listTo: "areaRegulars", listAreaTrips: 0 })[0] === "Reservations: trips from the area must be 1 to 200.", "area trips have a limit");
assert(resvIssues({ listTo: "favourites", listOpenAllAfterMin: 0 })[0] === "Reservations: opening to all drivers must be 1 to 1440 minutes after booking.", "opening to all has a limit");
assert(resvIssues({ listTo: "all", listOpenAllAfterMin: 0, listGroupSize: 0 }).length === 0, "group settings only count with their choice");
assert(reservationTimeline(withResv({ listTo: "random", listGroupSize: 12 }), 180)[0].detail === "A random group of 12 drivers see it in Scheduled rides. Still untaken after 30 min: every driver in the zone sees it.", "list step with a random group");
assert(reservationTimeline(withResv({ listTo: "homeNear", listHomeKm: 3, listOpenAll: false }), 180)[0].detail === "Only drivers whose home is within 3 km of the pickup see it in Scheduled rides.", "list step with home near pickup, not opened to all");
assert(changeLines(base, withResv({ listTo: "homeNear" }))[0] === "Scheduled rides go to: all drivers in the zone → drivers whose home is near the pickup", "change line for home near pickup");
const late = reservationTimeline(base, 25);
assert(late.find((step) => step.id === "home")?.skipped?.includes("already Exclusive"), "booked 25 min ahead: Exclusive comes before the popup");
assert(late.find((step) => step.id === "exclusive")?.afterBookedMin === 5, "booked 25 min ahead: Exclusive after 5 min");
const soon = reservationTimeline(base, 15);
assert(soon.find((step) => step.id === "exclusive")?.afterBookedMin === 0 && soon.find((step) => step.id === "exclusive")?.detail.includes("at once"), "booked inside the Exclusive time: Exclusive at once");
assert(reservationTimeline(withResv({ homePopup: false }), 180).find((step) => step.id === "home")?.skipped === "Off.", "popup off shows as off");
assert(reservationTimeline({ ...base, radar: { ...base.radar, on: false } }, 180).find((step) => step.id === "radar")?.skipped === "Skipped: Radar is off in this zone.", "no Radar trips when Radar is off in the zone");
assert(homePopupSkippedBelowMin(base) === 30 && homePopupSkippedBelowMin(withResv({ homePopup: false })) === null, "rides booked under 30 min ahead skip the popup");

assert(reservationStepAt(base, 5, 100) === "list" && reservationStepAt(base, 10, 100) === "home", "list first, popup after its minutes");
assert(reservationStepAt(base, 160, 20) === "exclusive" && reservationStepAt(base, 165, 15) === "radar", "Exclusive, then Radar trips, by minutes before pickup");
assert(stepAfterDriverCancel(base, 120, 60) === "home", "cancel by time: the popup time has passed");
assert(stepAfterDriverCancel(withResv({ onDriverCancel: "list" }), 120, 60) === "list", "cancel back to the list: the popup waits again");
assert(stepAfterDriverCancel(withResv({ onDriverCancel: "home" }), 2, 600) === "home", "cancel to the popup at once");
assert(stepAfterDriverCancel(withResv({ onDriverCancel: "exclusive" }), 2, 600) === "exclusive", "cancel to Exclusive at once");
assert(stepAfterDriverCancel(withResv({ onDriverCancel: "list" }), 170, 10) === "radar", "a step closer to pickup wins over the chosen one");

const listChange = changeLines(base, withResv({ listTo: "rating", homePopupAfterMin: 15, onDriverCancel: "list" }));
assert(listChange.includes("Scheduled rides go to: all drivers in the zone → drivers with a high rating"), "change line for who gets Scheduled rides");
assert(listChange.includes("Home popup after booking: 10 → 15"), "change line for the popup time");
assert(listChange.includes("After a driver cancels: by time left → Scheduled rides"), "change line for the cancel rule");

// Saved rules from before these settings still load: drafts, live, history and undo, approvals, presets.
const oldReservation = { on: true, searchBeforeMin: 30, assignEarly: true, assignHoursBefore: 12, backup: false, toExclusive: true, exclusiveBeforeMin: 20 };
const oldZone = (patch: Record<string, unknown> = {}) => ({ ...base, reservation: { ...oldReservation, ...patch } }) as unknown as ZoneDispatch;
const oldBook = normalizeDispatchBook(JSON.parse(JSON.stringify({
  ...emptyDispatchBook(),
  draftRev: 7,
  live: { Z001: oldZone(), Z002: oldZone({ exclusiveBeforeMin: 10 }), Z003: oldZone({ exclusiveBeforeMin: 1, searchBeforeMin: 5 }) },
  draft: { Z004: oldZone({ listTo: "nobody", onDriverCancel: "never" }) },
  versions: [
    { rev: 7, at: "2026-09-01T10:00", actorId: "nora", note: "", zoneIds: ["Z001"], lines: ["Norrmalm: Backup driver: on → off"], live: { Z001: oldZone() }, liveCountries: {} },
    { rev: 6, at: "2026-08-01T10:00", actorId: "nora", note: "", zoneIds: ["Z001"], lines: [], live: { Z001: oldZone({ exclusiveBeforeMin: 12 }) }, liveCountries: {} },
  ],
}))) as DispatchBook;
const oldLive = liveRules(oldBook, "Z001");
assert(oldLive.reservation.backup === false && oldLive.reservation.listTo === "all" && oldLive.reservation.homePopupAfterMin === 10 && oldLive.reservation.toRadar && oldLive.reservation.radarBeforeMin === 15 && oldLive.reservation.onDriverCancel === "byTime", "old live rules get the new reservation settings");
assert(zoneIssues(oldLive).length === 0, "old live rules stay valid");
assert(liveRules(oldBook, "Z002").reservation.radarBeforeMin === 5 && zoneIssues(liveRules(oldBook, "Z002")).length === 0, "old rules with Exclusive at 10 min get Radar at 5 min");
assert(!liveRules(oldBook, "Z003").reservation.toRadar && zoneIssues(liveRules(oldBook, "Z003")).length === 0, "no room for Radar: the Radar step starts off");
const oldDraft = draftRules(oldBook, "Z004");
assert(oldDraft.reservation.listTo === "all" && oldDraft.reservation.onDriverCancel === "byTime", "unknown choices in a draft fall back to the defaults");
assert(changeLines(liveRules(oldBook, "Z001"), draftRules(oldBook, "Z001")).length === 0, "old rules do not show as changed");
const undone = undoTo(oldBook, 7, "nora", "2026-10-12T12:00");
assert(!undone.error && liveRules(undone.book, "Z001").reservation.exclusiveBeforeMin === 12 && liveRules(undone.book, "Z001").reservation.radarBeforeMin === 6, "undo to an old version fills the new settings");
const pending = publish(oldBook, { Z001: { ...oldLive, reservation: { ...oldLive.reservation, homePopupAfterMin: 20 } } }, {}, ["Z001"], "nora", "2026-10-12T13:00", "");
assert(!pending.error && pending.live[0] === "Z001" && liveRules(pending.book, "Z001").reservation.homePopupAfterMin === 20, "a reservation change publishes now");
assert(pending.book.versions[0].lines.join() === "Norrmalm: Home popup after booking: 10 → 20", "only the real change is listed");
const waitingOld = { ...oldBook, approvals: [{ id: "AP-old", kind: "publish" as const, zoneIds: ["Z001"], lines: ["Norrmalm: Main mode: Automatic → By hand"], by: "nora", at: "x", zones: { Z001: oldZone() } }] };
const approvedOld = approve(waitingOld, "AP-old", "lena", "2026-10-12T14:00");
assert(!approvedOld.error && liveRules(approvedOld.book, "Z001").reservation.toRadar, "an old waiting approval still goes live with the new settings");
const { zoneId: _zone, ...oldValues } = oldZone({ exclusiveBeforeMin: 10 });
void _zone;
const oldPreset: Preset = { id: "P-old", name: "Old", note: "", builtIn: false, values: oldValues };
const fromOldPreset = applyPreset(zoneDefault("Z002"), oldPreset, "SE");
assert(fromOldPreset.zoneId === "Z002" && fromOldPreset.reservation.homePopup && fromOldPreset.reservation.radarBeforeMin === 5 && zoneIssues(fromOldPreset).length === 0, "an old saved preset gets the new settings");
const resvFile = rulesFile(oldBook, "SE", "now");
assert(resvFile.zones[0].rules.reservation.homePopupAfterMin === 10 && resvFile.glossary.reservationTie.includes("random"), "rules file has the reservation steps and the tie rule");

// Round 3: who gets it, the Home popup, smart gap, cancels, no driver near pickup and rides given by Movera.
assert(resv.listGroupId === "" && resv.homePopupTo === "list" && resv.popupClosedExclusive, "Home popup goes to the list's drivers and a closed popup comes back as Exclusive by default");
assert(resv.hideClashing && resv.leaveNow && resv.lateWarn && resv.lateBackupAfterMin === 5 && resv.towardPickup, "smart gap parts are on by default");
assert(Object.values(resv.types).every((type) => type.spareMin === 15), "spare minutes start at 15 for every kind of ride");
assert(resv.types.normal.onlineBeforeMin === 30 && resv.types.airport.onlineBeforeMin === 60 && resv.types.long.onlineBeforeMin === 60 && resv.types.premium.onlineBeforeMin === 45 && resv.types.event.onlineBeforeMin === 45, "be online before: normal 30, airport 60, long trip 60, Comfort/Premium 45, events 45 (same as the driver app)");
assert(resv.types.normal.remindFirstMin === 60 && resv.types.normal.remindLastMin === 15, "reminders 60 and 15 min before pickup");
assert(resv.freeCancelMinutesBeforePickup === 60 && resv.driverLateCancelHours === 1 && resv.lateCancelFee === 50 && zoneDefault("FR-PC").reservation.lateCancelFee === 5 && zoneDefault("TN-TC").reservation.lateCancelFee === 3, "riders free until 60 min before pickup, a late driver cancel is under 1 h, the fee is in the country's money");
assert(resv.latePause && resv.latePauseAfter === 2 && resv.latePeriodDays === 7, "2 late cancels a week pause scheduled rides");
assert(resv.showDriverOnAccept, "the rider sees the driver at once by default");
assert(JSON.stringify(riderScheduledRules(resv, "SE")) === JSON.stringify({ freeCancelMinutesBeforePickup: 60, lateCancelFeeMinor: 5000, currency: "SEK", showDriverOnAccept: true }), "the rider app's rules: 60 min, 5000 öre, SEK, driver shown on accept");
assert(riderScheduledRules(zoneDefault("TN-TC").reservation, "TN").lateCancelFeeMinor === 3000 && riderScheduledRules(zoneDefault("FR-PC").reservation, "FR").currency === "EUR", "the rider app's fee is in minor units of the country's money");
assert(raiseCap("SE") === 500 && raiseCap("FR") === 47.5 && raiseCap("TN") === 150, "the raise cap is 500 kr, the same value in local money elsewhere");
assert(resv.raiseFare && resv.raiseMax === 500 && zoneDefault("FR-PC").reservation.raiseMax === 47.5 && zoneDefault("TN-TC").reservation.raiseMax === 150, "the highest raise starts at the country cap");
assert(resv.assignAcceptSec === 30, "a ride given by Movera has 30 s to accept");
assert(resv.lateBackupAfterMin === 5 && resv.exclusiveBeforeMin === 20 && resv.radarBeforeMin === 15 && resv.latePauseDays === 7, "the same defaults as the driver app");

const groups = emptyDispatchBook().groups;
assert(resvIssues({ listTo: "group" })[0] === "Reservations: pick the driver group that gets Scheduled rides.", "A driver group needs a group");
assert(resvIssues({ listTo: "group", listGroupId: "G-airport" }).length === 0, "a picked group is fine");
const groupFlow = reservationTimeline(withResv({ listTo: "group", listGroupId: "G-airport", listOpenAll: false }), 180, groups);
assert(groupFlow[0].detail === "Only drivers in the group Airport drivers see it in Scheduled rides.", "the list step names the group");
assert(groupFlow[1].detail.includes("the same drivers as the list") && groupFlow[1].detail.includes("back as an Exclusive"), "the popup goes to the list's drivers and can come back as Exclusive");
assert(reservationTimeline(withResv({ listTo: "group", listGroupId: "G-airport", homePopupTo: "zone" }), 180, groups)[1].detail.includes("every online driver in the zone"), "the popup can go to every driver in the zone");
assert(!reservationTimeline(withResv({ popupClosedExclusive: false }), 180)[1].detail.includes("Exclusive"), "a closed popup can stay closed");

assert(resvIssues({ lateBackupAfterMin: 0 })[0] === "Reservations: the backup driver must come 1 to 60 minutes after the late warning.", "backup has a limit");
assert(resvIssues({ lateWarn: false, lateBackupAfterMin: 0 }).length === 0, "a late warning that is off is not checked");
assert(resvIssues({ towardPickupBeforeMin: 5 })[0] === "Reservations: trips toward the pickup must start 15 to 240 minutes before pickup.", "trips toward the pickup have a limit");
const typeIssues = (patch: Partial<ReservationRules["types"]["airport"]>) => zoneIssues(withResv({ types: { ...resv.types, airport: { ...resv.types.airport, ...patch } } }));
assert(typeIssues({ onlineBeforeMin: 2 }).includes("Reservations, Airport: be online before must be 5 to 240 minutes."), "be online before has a limit per kind");
assert(typeIssues({ spareMin: 90 }).includes("Reservations, Airport: spare minutes must be 0 to 60."), "spare minutes have a limit");
assert(typeIssues({ remindFirstMin: 10, remindLastMin: 15 }).includes("Reservations, Airport: the first reminder must come before the second (a larger number of minutes)."), "reminders come in order");
assert(resvIssues({ freeCancelMinutesBeforePickup: 20000 })[0] === "Reservations: free cancel for riders must end 0 to 10080 minutes (7 days) before pickup, in whole minutes.", "rider free cancel has the rider app's limit");
assert(resvIssues({ freeCancelMinutesBeforePickup: 30.5 }).length === 1, "rider free cancel is in whole minutes");
assert(resvIssues({ driverLateCancelHours: 0 })[0] === "Reservations: a driver's late cancel must be set 0.5 to 72 hours before pickup.", "late cancel time has a limit");
assert(resvIssues({ latePauseAfter: 0 })[0] === "Reservations: the pause must come after 1 to 20 late cancels.", "pause count has a limit");
assert(resvIssues({ latePause: false, latePauseAfter: 0 }).length === 0, "a pause that is off is not checked");
assert(resvIssues({ raiseMax: 600 })[0] === "Reservations: the highest fare raise must be above 0 and at most 500 kr.", "the raise never goes over 500 kr in Sweden");
assert(zoneIssues({ ...zoneDefault("FR-PC"), reservation: { ...zoneDefault("FR-PC").reservation, raiseMax: 60 } }).includes("Reservations: the highest fare raise must be above 0 and at most 47.5 €."), "the cap in France is in euros");
assert(resvIssues({ assignAcceptSec: 5 })[0] === "Reservations: the time to accept a ride assigned by Movera must be 10 to 600 seconds.", "time to accept has a limit");

assert(smartGapMin(35, 20, 15) === 70, "smart gap: trip + drive + spare");
assert(ridesClash({ pickupMin: 0, tripMin: 35 }, { pickupMin: 60, tripMin: 20 }, 20, 15), "a ride 60 min later does not fit a 70 min gap");
assert(!ridesClash({ pickupMin: 0, tripMin: 35 }, { pickupMin: 70, tripMin: 20 }, 20, 15), "a ride 70 min later fits");
assert(ridesClash({ pickupMin: 60, tripMin: 20 }, { pickupMin: 0, tripMin: 35 }, 20, 15), "the order of the two rides does not matter");
assert(leaveNowBeforeMin(18, 15) === 33, "leave now: drive time + spare minutes");
assert(JSON.stringify(raiseSplit(50, 520, 20)) === JSON.stringify({ commission: 104, fromCommission: 50, beyond: 0 }), "a small raise comes from the commission");
assert(raiseSplit(150, 520, 20).beyond === 46 && raiseSplit(150, 520, 20).fromCommission === 104, "the part beyond the commission is shown");

const r3Change = changeLines(base, withResv({ listTo: "group", listGroupId: "G-airport", homePopupTo: "zone", popupClosedExclusive: false, freeCancelMinutesBeforePickup: 120, raiseMax: 300, types: { ...resv.types, airport: { ...resv.types.airport, onlineBeforeMin: 90 } } }));
assert(r3Change.includes("Scheduled rides go to: all drivers in the zone → a driver group"), "change line for a driver group");
assert(r3Change.includes("Driver group for Scheduled rides: none → G-airport"), "change line for the group");
assert(r3Change.includes("Home popup goes to: same drivers as the list → all drivers in the zone"), "change line for the popup audience");
assert(r3Change.includes("Closed popup comes back as Exclusive: on → off"), "change line for the closed popup");
assert(r3Change.includes("Rider free cancel, minutes before pickup: 60 → 120") && r3Change.includes("Highest fare raise: 500 → 300"), "change lines for cancels and the raise");
assert(r3Change.includes("Airport rides: be online before: 60 → 90"), "change line per kind of ride");

// Saves from before Round 3 get the new settings from the defaults.
const R3_KEYS = ["listGroupId", "homePopupTo", "popupClosedExclusive", "hideClashing", "leaveNow", "lateWarn", "lateBackupAfterMin", "towardPickup", "towardPickupBeforeMin", "types", "freeCancelMinutesBeforePickup", "lateCancelFee", "driverLateCancelHours", "latePause", "latePauseAfter", "latePeriodDays", "latePauseDays", "showDriverOnAccept", "raiseFare", "raiseMax", "assignAcceptSec"];
const preR3 = Object.fromEntries(Object.entries(zoneDefault("FR-PC").reservation).filter(([key]) => !R3_KEYS.includes(key)));
const r3Book = normalizeDispatchBook(JSON.parse(JSON.stringify({ ...emptyDispatchBook(), live: { "FR-PC": { ...zoneDefault("FR-PC"), reservation: { ...preR3, homePopupTo: "everyone", types: { airport: { onlineBeforeMin: 75 }, normal: "bad" } } } } })));
const r3Live = liveRules(r3Book, "FR-PC").reservation;
assert(r3Live.homePopupTo === "list" && r3Live.popupClosedExclusive && r3Live.lateCancelFee === 5 && r3Live.raiseMax === 47.5 && r3Live.assignAcceptSec === 30 && r3Live.freeCancelMinutesBeforePickup === 60 && r3Live.showDriverOnAccept, "an old save gets the new settings in the country's money");
assert(r3Live.types.airport.onlineBeforeMin === 75 && r3Live.types.airport.spareMin === 15 && r3Live.types.normal.onlineBeforeMin === 30 && r3Live.types.event.onlineBeforeMin === 45 && r3Live.types.premium.onlineBeforeMin === 45, "kinds of ride are filled in one by one");
assert(zoneIssues(liveRules(r3Book, "FR-PC")).length === 0, "an old save stays valid");
assert(changeLines(liveRules(r3Book, "FR-PC"), draftRules(r3Book, "FR-PC")).length === 0, "an old save does not show as changed");
const r3Preset = applyPreset(zoneDefault("TN-TC"), BUILT_IN_PRESETS[0], "TN");
assert(r3Preset.reservation.lateCancelFee === 3 && r3Preset.reservation.raiseMax === 150, "a ready-made preset keeps the country's money for reservations");
const r3Copy = copyParts(withResv({ leaveNow: false }), zoneDefault("Z002"), ["reservations"]);
assert(!r3Copy.reservation.leaveNow && r3Copy.zoneId === "Z002", "reservations copy as their own part");
assert(copyParts(withResv({ leaveNow: false }), zoneDefault("Z002"), ["modes"]).reservation.leaveNow, "Modes no longer copies reservations");
const r3File = rulesFile(emptyDispatchBook(), "SE", "now");
assert(r3File.glossary.smartGap.includes("spareMin") && r3File.glossary.raiseFare.includes("500 kr") && r3File.zones[0].rules.reservation.types.normal.spareMin === 15, "the rules file explains the new settings");
assert(r3File.riderApp.Z001.lateCancelFeeMinor === 5000 && r3File.glossary.riderApp.includes("/api/v1/rider/scheduled-rides/rules"), "the rules file has what the rider app reads");

// Round 3, A2: offer card, Exclusive reasons, going offline, hidden trips, Exclusive while driving.
assert(JSON.stringify(base.offerCard) === JSON.stringify({ netFare: false, pickupAddress: true, dropoffAreaOnly: false, stops: true, riderRating: true, tripMinutesKm: true, pickupDistance: true, badges: true }), "the offer card shows the full fare and every detail by default, like the driver app");
assert(exclusiveReasonList(base.exclusiveReasons).map((item) => item.text).join("|") === "Best match|Rider's favourite|Finishing nearby|Airport queue|Pickup soon|Only for you · nearby", "the Exclusive reasons start with the six short texts");
assert(exclusiveReasonText({ ...base.exclusiveReasons, favourite: { text: "Your rider", on: false } }, "favourite") === "", "a reason that is off shows no text");
assert(zoneIssues({ ...base, exclusiveReasons: { ...base.exclusiveReasons, "best-match": { text: " ", on: true } } }).some((line) => line.includes("needs a short text")), "a reason that is on needs a text");
assert(zoneIssues({ ...base, exclusiveReasons: { ...base.exclusiveReasons, nearby: { text: "Only for you because you are very close", on: true } } }).some((line) => line.includes("too long")), "a reason is short");
assert(zoneIssues({ ...base, exclusiveReasons: { ...base.exclusiveReasons, nearby: { text: "", on: false } } }).length === 0, "a reason that is off needs no text");
assert(zoneIssues({ ...base, autoOffline: { on: true, after: 1 } }).length === 0 && zoneIssues({ ...base, autoOffline: { on: true, after: 99 } }).length === 0, "going offline allows 1 to 99 offers");
assert(zoneIssues({ ...base, autoOffline: { on: true, after: 100 } })[0] === "Go offline automatically: must be after 1 to 99 offers.", "100 is too many");
assert(base.hiddenComesBackMin === 2 && zoneIssues({ ...base, hiddenComesBackMin: 0 }).some((line) => line.includes("come back after 1 to 60")), "a hidden trip comes back after 2 min by default");
assert(base.exclusiveWhileDriving.on && base.exclusiveWhileDriving.count === 1 && !("drivingOn" in base.radarApp), "Exclusive while driving replaces Radar offers while driving");
assert(zoneIssues({ ...base, exclusiveWhileDriving: { on: true, count: 6 } })[0] === "Exclusive while driving: must be 1 to 5 offers at a time.", "while driving has a limit");
const q18Old = normalizeDispatchBook(JSON.parse(JSON.stringify({ ...emptyDispatchBook(), live: { Z001: { ...base, exclusiveWhileDriving: undefined, radarApp: { fullOn: true, full: 8, popupOn: true, popup: 2, drivingOn: false, driving: 3 }, finishing: { radar: true, exclusive: true, withinMin: 3, withinKm: 1.5 } }, Z002: { ...base, exclusiveWhileDriving: undefined, radarApp: { fullOn: true, full: 8, popupOn: true, popup: 2, drivingOn: true, driving: 9 } } } })));
const q18Live = liveRules(q18Old, "Z001");
assert(!q18Live.exclusiveWhileDriving.on && q18Live.exclusiveWhileDriving.count === 3 && !("drivingOn" in q18Live.radarApp) && !q18Live.finishing.radar, "an old save moves Radar offers while driving to Exclusive while driving");
assert(liveRules(q18Old, "Z002").exclusiveWhileDriving.count === 5 && zoneIssues(liveRules(q18Old, "Z002")).length === 0, "an old count over 5 becomes 5");
assert(changeLines(q18Live, draftRules(q18Old, "Z001")).length === 0, "the move does not show as a change");
const a2Change = changeLines(base, { ...base, offerCard: { ...base.offerCard, netFare: true, dropoffAreaOnly: true }, exclusiveReasons: { ...base.exclusiveReasons, "best-match": { text: "Top match", on: true } }, hiddenComesBackMin: 5, exclusiveWhileDriving: { on: false, count: 1 } });
assert(a2Change.includes("Offer card shows the driver's share: off → on") && a2Change.includes("Offer card: drop-off area only: off → on"), "change lines for the offer card");
assert(a2Change.includes("Exclusive reason (the best driver by the rules): Best match → Top match"), "change line for a reason text");
assert(a2Change.includes("Hidden Radar trip comes back after: 2 → 5") && a2Change.includes("Exclusive while driving: on → off"), "change lines for hidden trips and while driving");

// Waiting at pickup: Pricing's values per category, then ride type, then distance.
const wait = base.pickupWait;
assert(wait.noShowAfterMin === 5 && wait.driverShareWaitPct === 100 && wait.driverShareNoShowPct === 80 && wait.farPickupKm === 5 && wait.farPickup.noShowFee === 85 && wait.farPickup.freeWaitMin === 1, "waiting defaults like the driver app");
assert(zoneDefault("FR-PC").pickupWait.farPickup.noShowFee === 8.05 && zoneDefault("TN-TC").pickupWait.farPickup.noShowFee === 25.5, "the far-pickup fee is in the country's money");
const pricingBase = { freeWaitMin: 2, perMin: 5, noShowFee: 50 };
const normalTerms = pickupTerms(pricingBase, wait, { type: "normal", pickupKm: 2, includedWaitingMin: 5 });
assert(normalTerms.freeWaitMin === 2 && normalTerms.perMin === 5 && normalTerms.noShowAfterMin === 5 && normalTerms.noShowFee === 50 && normalTerms.rule === "", "a normal pickup uses Pricing's values");
assert(driverNoShowShare(normalTerms) === 40, "the driver gets 80% of the no-show fee");
const airportTerms = pickupTerms(pricingBase, wait, { type: "airport", pickupKm: 2, includedWaitingMin: 5 });
assert(airportTerms.freeWaitMin === 15 && airportTerms.noShowAfterMin === 20 && airportTerms.perMin === 5 && airportTerms.rule === "Airport pickup", "an airport pickup waits longer");
assert(pickupTerms(pricingBase, wait, { type: "scheduled", pickupKm: 2, includedWaitingMin: 7 }).freeWaitMin === 7, "a scheduled ride's free wait is the reservation policy's included waiting");
const farAirport = pickupTerms(pricingBase, wait, { type: "airport", pickupKm: 9, includedWaitingMin: 5 });
assert(farAirport.freeWaitMin === 1 && farAirport.noShowFee === 85 && farAirport.noShowAfterMin === 20 && farAirport.rule === "Airport pickup · Pickup over 5 km", "the distance rule comes last and wins where it sets a value");
assert(pickupTerms(pricingBase, { ...wait, farPickupOn: false }, { type: "normal", pickupKm: 9, includedWaitingMin: 5 }).freeWaitMin === 2, "the far rule can be off");
assert(zoneIssues({ ...base, pickupWait: { ...wait, driverShareNoShowPct: 120 } }).includes("Waiting at pickup: the driver's share must be 0 to 100%."), "shares are 0 to 100%");
assert(zoneIssues({ ...base, pickupWait: { ...wait, rideTypes: { ...wait.rideTypes, airport: { ...wait.rideTypes.airport, noShowAfterMin: 10 } } } }).includes("Waiting at pickup, airport pickup: no-show must come after the free wait."), "no-show comes after the free wait");
const waitChange = changeLines(base, { ...base, pickupWait: { ...wait, noShowAfterMin: 6, farPickup: { ...wait.farPickup, perMin: 8 }, rideTypes: { ...wait.rideTypes, event: { ...wait.rideTypes.event, freeWaitMin: null } } } });
assert(waitChange.includes("No-show after: 5 → 6") && waitChange.includes("Far pickup: price per minute: same as the zone → 8") && waitChange.includes("Event pickup: free wait: 3 → same as the zone"), "change lines for waiting at pickup");
assert(copyParts({ ...base, pickupWait: { ...wait, noShowAfterMin: 9 } }, zoneDefault("Z002"), ["rides"]).pickupWait.noShowAfterMin === 9, "waiting copies with Rides & stops");

// Country rules: driving limit warnings, cancel rate, cancel reasons.
const se = countryDefault("SE");
assert(se.rest.warnFirstMin === 30 && se.rest.warnLastMin === 10 && se.rest.blockOnline && se.cancelRateLimitPct === 30, "warnings at 30 and 10 min, block at the limit, cancel rate limit 30%");
assert(countryIssues({ ...se, rest: { ...se.rest, warnFirstMin: 10, warnLastMin: 30 } })[0] === "Driving limit: the first warning must come before the second (a larger number of minutes).", "warnings come in order");
assert(countryIssues({ ...se, cancelRateLimitPct: 0 })[0] === "Cancel rate limit must be 1 to 100%.", "the cancel rate limit has a range");
const oldCountry = completeCountry("SE", { country: "SE", rest: { on: true, workHours: 10, restHours: 8 } } as never);
assert(oldCountry.rest.workHours === 10 && oldCountry.rest.warnFirstMin === 30 && oldCountry.cancelRateLimitPct === 30 && oldCountry.cancelReasons.groups.driverDuringTrip.length === 7, "an old country save gets the new rules");
assert(liveCountry({ ...emptyDispatchBook(), liveCountries: { SE: { country: "SE", rest: { on: false, workHours: 12, restHours: 6 } } as never } }, "SE").rest.blockOnline, "old live country rules are completed");
const reasons = cancelReasonsDefault();
assert(reasons.groups.driverBeforeTrip.length === 6 && reasons.groups.driverDuringTrip.length === 7 && reasons.groups.scheduled.length === 6 && reasons.groups.rider.length === 8, "the apps' reasons today: 6 before, 7 during, 6 scheduled, 8 rider");
assert(!reasons.noShow.counts && !reasons.groups.driverDuringTrip.find((item) => item.code === "safety_concern_on_trip")!.counts && !reasons.groups.driverBeforeTrip.find((item) => item.code === "vehicle_issue_before_start")!.counts, "no-show, safety and car problems don't count");
const svReasons = { ...reasons, groups: { ...reasons.groups, scheduled: reasons.groups.scheduled.map((item) => (item.code === "scheduled_other" ? { ...item, title: { ...item.title, sv: "Annat skäl" } } : item)) } };
assert(cancelReasonsFor(svReasons, "sv").groups.scheduled.at(-1)!.title === "Annat skäl" && cancelReasonsFor(svReasons, "sv").groups.scheduled[0].title === "I can no longer make the pickup time", "an empty language shows the English text");
assert(countryIssues({ ...se, cancelReasons: { ...reasons, groups: { ...reasons.groups, rider: [] } } }).includes("Cancel reasons, rider: keep at least one reason."), "every group keeps a reason");
assert(countryIssues({ ...se, cancelReasons: { ...reasons, groups: { ...reasons.groups, rider: [...reasons.groups.rider, { code: "rider_new", title: {}, subtitle: {}, counts: true }] } } }).includes("Cancel reasons, rider: each reason needs an English text."), "a new reason needs an English text");
const reasonChange = countryLines(se, { ...se, cancelReasons: { ...svReasons, groups: { ...svReasons.groups, rider: [...reasons.groups.rider.slice(1), { code: "rider_new", title: { en: "Found another ride" }, subtitle: {}, counts: false }], driverBeforeTrip: reasons.groups.driverBeforeTrip.map((item) => (item.code === "rider_not_at_pickup" ? { ...item, counts: false } : item)) } } });
assert(reasonChange.includes("Cancel reasons, driver, scheduled rides: “Other reason” Swedish text changed"), "change line for a language");
assert(reasonChange.includes("Cancel reasons, rider: added “Found another ride”") && reasonChange.includes("Cancel reasons, rider: removed “Pickup point is incorrect”"), "change lines for added and removed reasons");
assert(reasonChange.includes("Cancel reasons, driver, before the trip: “Rider not at pickup” counts → doesn't count"), "change line for Doesn't count");
assert(completeCancelReasons({ groups: { rider: [{ code: "x", title: { en: "X", de: "Y" } }] } }).groups.rider[0].title.en === "X" && completeCancelReasons({}).groups.scheduled.length === 6, "stored reasons are cleaned and missing groups come from the defaults");
const publishedCountry = publish(emptyDispatchBook(), {}, { SE: { ...se, cancelRateLimitPct: 25 } }, ["Z001"], "nora", "2026-10-15T10:00", "");
assert(!publishedCountry.error && liveCountry(publishedCountry.book, "SE").cancelRateLimitPct === 25 && publishedCountry.book.versions[0].lines.includes("Sweden: Cancel rate limit: 30% → 25%"), "country rules publish with a version line");
const a2File = rulesFile(emptyDispatchBook(), "SE", "now");
assert(a2File.driverApp.cancelReasons.sv.groups.rider.length === 8 && a2File.driverApp.exclusiveReasons.Z001[0].id === "best-match", "the rules file has the driver app's shapes");
assert(a2File.country.cancelRateLimitPct === 30 && a2File.glossary.pickupWait.includes("Pricing") && a2File.zones[0].rules.offerCard.badges, "the rules file has the new settings");

// Round 3, A3: one cancel rate number. Safety's switch uses the country's cancel rate limit (30%).
const overLimit = rankDrivers(base, se, request, [driver("ok", { cancelPct: 25 }), driver("high", { cancelPct: 31 })]);
assert(!overLimit.find((row) => row.driver.id === "ok")!.out && overLimit.find((row) => row.driver.id === "high")!.out === "Cancel rate 31% is over the 30% limit", "drivers over the country's cancel rate limit get no requests");
assert(rankDrivers(base, { ...se, cancelRateLimitPct: 20 }, request, [driver("ok", { cancelPct: 25 })])[0].out === "Cancel rate 25% is over the 20% limit", "a lower country limit blocks more drivers");
assert(!rankDrivers({ ...base, safety: { ...base.safety, maxCancel: false } }, se, request, [driver("high", { cancelPct: 31 })])[0].out, "with the Safety switch off, the limit does not block requests");
const oldSafety = liveRules({ ...emptyDispatchBook(), live: { Z001: { safety: { minRating: true, ratingBelow: 4.3, maxCancel: true, cancelAbove: 20, doNotMatch: true, womenOnly: true } } as never } }, "Z001");
assert(!("cancelAbove" in oldSafety.safety) && oldSafety.safety.maxCancel && !("cancelAbove" in zoneDefault("Z001").safety), "the old zone cancel rate number is gone");

console.log("dispatch rules ok");
