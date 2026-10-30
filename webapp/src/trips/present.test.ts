import { createSeed } from "../api/seed.ts";
import { cashFigures, cashOwed, isCashTrip } from "./cash.ts";
import { offerLog, timelineOffers } from "./offerLog.ts";
import { TRIP_STATUSES } from "../domain/contract.ts";
import {
  adjustBlock,
  cancelBlock,
  defaultDispatch,
  dispatchError,
  fareBreakdown,
  liveMarkers,
  offerBlock,
  offersFor,
  paymentOf,
  pinVerified,
  ratingLabel,
  reassignBlock,
  refundBlock,
  stopsOf,
  timelineOf,
  waitingBlock,
} from "./present.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const seed = createSeed();
assert(seed.trips.filter((trip) => /^T0\d{3}$/.test(trip.id)).length === 600, "present reads 600 Stockholm trips");
assert(new Set(seed.trips.map((trip) => trip.status)).size === 18, "all 18 statuses are seeded");

const requested = seed.trips.find((trip) => trip.status === "requested")!;
const searching = seed.trips.find((trip) => trip.id === "T0004")!;
const arrived = seed.trips.find((trip) => trip.status === "arrived")!;
const completed = seed.trips.find((trip) => trip.id === "T0012")!;
const cancelledAdmin = seed.trips.find((trip) => trip.status === "cancelled_by_admin")!;

assert(!cancelBlock(searching.status), "searching can be cancelled");
assert(cancelBlock(completed.status)?.includes("completed"), "completed cannot be cancelled");
assert(offerBlock(requested.status) === null, "requested can be offered");
assert(offerBlock(arrived.status) !== null, "arrived cannot be newly offered");
assert(reassignBlock(arrived.status) === null, "arrived can be reassigned");
assert(reassignBlock(searching.status) !== null, "searching uses offer instead of reassign");
assert(adjustBlock(arrived.status) === null && adjustBlock(completed.status) !== null, "fare adjustment follows lifecycle");
assert(waitingBlock(arrived.status) === null && waitingBlock(searching.status) !== null, "waiting correction follows lifecycle");

assert(pinVerified("T0001") === "Yes" && pinVerified("T0002") === "No", "pin is yes or no, never a code");
assert(!pinVerified("T0001").match(/\d{4}/), "pin text has no code");
const rated = (status: string, previousStatus?: string) => ratingLabel({ id: "T0001", name: "R", phone: "", zoneId: "Z001", status, previousStatus });
assert(rated("cancelled_by_rider", "in_trip") !== "Not rated yet" && rated("completed") !== "Not rated yet", "contract v0.3.1: a trip the rider ended early is rated like a completed one");
assert(rated("cancelled_by_rider", "arrived") === "Not rated yet" && rated("cancelled_by_rider") === "Not rated yet", "a plain rider cancel is not rated");

const stops = stopsOf(searching);
assert(stops.length >= 2 && stops.length <= 5, "route has pickup, up to 3 stops, and drop-off");
assert(stops.filter((stop) => stop.kind === "stop").length <= 3, "at most 3 intermediate stops");

const line = timelineOf(completed);
assert(line.length === TRIP_STATUSES.indexOf("completed") + 1, "completed timeline includes every active status up to completion");
const cancelledLine = timelineOf(cancelledAdmin);
assert(cancelledLine.at(-1)?.code === "cancelled_by_admin", "cancelled timeline ends at its real terminal state");
assert(!cancelledLine.some((event) => event.code === "cancelled_by_rider" || event.code === "cancelled_by_driver"), "cancelled timeline does not pass through other terminal states");

assert(fareBreakdown(searching).ruleVersion.startsWith("price-"), "fare names a rule version");
assert(fareBreakdown({ ...arrived, waitingMin: 9 }).waitingMin === 9, "admin waiting override drives fare presentation");

const rules = defaultDispatch();
assert(rules.length === 11, "dispatch for every seeded zone including both airports");
assert(rules.every((rule) => rule.offerSeconds === 8.5 && rule.nextTripKm === 30), "today's offer time and next-trip radius");
assert(dispatchError({ ...rules[0]!, offerSeconds: 0 })?.includes("Offer"), "offer time is validated");

const markers = liveMarkers(seed.drivers, seed.trips);
assert(markers.some((marker) => marker.kind === "driver" && marker.stale), "a driver position is stale");
assert(markers.some((marker) => marker.kind === "queue"), "airport queue is on the live map");
assert(markers.some((marker) => marker.kind === "boost"), "boosts are on the live map");
assert(markers.some((marker) => marker.kind === "request"), "open requests are on the live map");

const legacyOffers = offersFor(searching, seed.drivers);
assert(legacyOffers.length > 0, "legacy offer calculation has an eligible driver");
const vehicleAware = offersFor(searching, seed.drivers, seed.vehicles);
assert(vehicleAware.every((driver) => seed.vehicles.some((vehicle) => vehicle.driverId === driver.id && vehicle.status === "eligible" && vehicle.category === driver.category)), "vehicle-aware offers require an eligible matching vehicle");

assert(refundBlock("captured", "completed") === null, "captured completed trip can be refunded");
assert(refundBlock("pending", "completed") !== null, "refund requires capture");
assert(refundBlock("captured", "in_trip") !== null, "refund requires a terminal trip");
assert(paymentOf(seed.payments[0]!), "payment state resolves");

// Q28: the offer log. Q23: cash trips.
const logDrivers = seed.drivers.map((row) => ({ id: row.id, name: row.name, zoneId: row.zoneId }));
const doneTrips = seed.trips.filter((trip) => trip.driverId && trip.status === "completed");
const logs = doneTrips.map((trip) => ({ trip, steps: offerLog(trip, logDrivers) }));
assert(logs.length > 0 && logs.every(({ steps }) => steps.some((step) => step.kind === "won")), "every taken trip shows who won");
assert(logs.every(({ trip, steps }) => steps.filter((step) => step.kind === "won").every((step) => step.driverIds[0] === trip.driverId)), "the winner is the trip's driver");
assert(logs.every(({ steps }) => steps.every((step, index) => index === 0 || Date.parse(step.at) >= Date.parse(steps[index - 1].at))), "the steps are in time order");
assert(logs.some(({ steps }) => steps[0]?.kind === "list" && steps[1]?.kind === "home") && logs.some(({ steps }) => steps.some((step) => step.kind === "lost" && step.detail.includes("No longer available"))), "some trips show Scheduled rides, the Home popup and No longer available");
assert(JSON.stringify(offerLog(doneTrips[0], logDrivers)) === JSON.stringify(logs[0].steps), "the same trip always shows the same log");
const sample = logs.find(({ steps }) => steps.some((step) => step.kind === "exclusive"))!;
const answers = timelineOffers(sample.steps);
assert(answers.length === sample.steps.filter((step) => step.kind === "won" || (step.kind === "exclusive" && !step.detail.endsWith("accepted"))).length && answers.some((item) => item.answer === "accepted"), "the timeline shows the same offers");
const fakeSplit = { state: "charged", riderPaid: 25_000, tip: 2_000, driverGets: 19_000 } as unknown as Parameters<typeof cashFigures>[0];
const figures = cashFigures(fakeSplit)!;
assert(figures.collected === 23_000 && figures.driverKeeps === 17_000 && figures.owed === 6_000, "cash: the driver collects the fare without the tip and owes Movera's part");
assert(cashFigures({ ...fakeSplit, state: "estimate" }) === null, "no cash figures before the trip is paid");
const tnTrips = seed.trips.filter((trip) => trip.zoneId.startsWith("TN"));
const cashCount = (rows: typeof seed.trips, country: string) => rows.filter((trip) => isCashTrip(trip, country)).length;
assert(cashCount(seed.trips, "SE") > 0 && cashCount(seed.trips, "SE") < seed.trips.length / 3 && (tnTrips.length === 0 || cashCount(tnTrips, "TN") >= cashCount(tnTrips, "SE")), "some trips are cash, more in Tunisia");
const owedAll = cashOwed(seed.trips, doneTrips[0].driverId!, () => fakeSplit, () => "TN");
assert(owedAll.minor === owedAll.trips * 6_000, "a driver's cash owed adds up the trips");

console.log("present ok");

// Owner G3-R5 (2026-10-30, "Fix all"): on live the Dispatch live map has only what the server sends — online drivers
// and their stale positions, trips and open requests; no airport queue or boosts (no server source), no demo activity.
{
  const { liveBoardLayers } = await import("./present.ts");
  assert(JSON.stringify(liveBoardLayers(true)) === JSON.stringify(["driver", "stale", "trip", "request"]), "live: no airport queue or boosts layer");
  assert(liveBoardLayers(false).includes("queue") && liveBoardLayers(false).includes("boost"), "the demo keeps its queue and boosts");
  console.log("G3-R5 live map layers ok");
}
