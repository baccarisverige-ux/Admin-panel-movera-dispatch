import { TRIP_STATUSES, isTerminal } from "../domain/contract.ts";
import {
  CANCEL_OK,
  COMPLETE_OK,
  NO_SHOW_OK,
  FARE_ADJUST_OK,
  OFFER_OK,
  REASSIGN_OK,
  REFUND_TRIP_OK,
  WAITING_OK,
  adjustFare,
  canAdjustFare,
  canCancel,
  canOffer,
  canReassign,
  canRefundTrip,
  canSetWaiting,
  cancelTrip,
  completeTrip,
  markNoShow,
  eligibleDrivers,
  offerTrip,
  reassign,
  saveDispatch,
  waitingMinutes,
  type OfferDriver,
  type Trip,
} from "./rules.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const trip: Trip = { id: "T1001", status: "accepted", category: "economy", fareOre: 14900, ruleVersion: "price-3", driverId: "D1" };
const drivers: OfferDriver[] = [
  { id: "D1", name: "Erik Lind", status: "active", category: "economy" },
  { id: "D2", name: "Sara Berg", status: "suspended", category: "economy" },
  { id: "D3", name: "Noah Ek", status: "active", category: "economy" },
  { id: "D4", name: "Maja XL", status: "active", category: "xl" },
];

for (const status of TRIP_STATUSES) {
  assert(canCancel(status) === (CANCEL_OK as readonly string[]).includes(status), `cancel matrix ${status}`);
  assert(canOffer(status) === (OFFER_OK as readonly string[]).includes(status), `offer matrix ${status}`);
  assert(canReassign(status) === (REASSIGN_OK as readonly string[]).includes(status), `reassign matrix ${status}`);
  assert(canAdjustFare(status) === (FARE_ADJUST_OK as readonly string[]).includes(status), `fare matrix ${status}`);
  assert(canSetWaiting(status) === (WAITING_OK as readonly string[]).includes(status), `waiting matrix ${status}`);
  assert(canRefundTrip(status) === (REFUND_TRIP_OK as readonly string[]).includes(status), `refund matrix ${status}`);
}

assert(cancelTrip({ ...trip, status: "completed" }, "Wrong car").error?.includes("completed"), "finished trip stays");
assert(cancelTrip(trip, "Rider asked").trip.status === "cancelled_by_admin", "admin can cancel an accepted trip");
assert(eligibleDrivers(trip, drivers).map((driver) => driver.id).join() === "D3", "only an eligible active driver");
assert(offerTrip({ ...trip, status: "searching", driverId: null }, drivers[2]!, drivers).trip.status === "offered", "searching trip can be offered");
assert(offerTrip(trip, drivers[2]!, drivers).error?.includes("no longer"), "accepted trip cannot be newly offered");
assert(reassign(trip).trip.status === "searching" && reassign(trip).trip.driverId === null, "reassign sends the trip back to dispatch, no driver");
assert(reassign({ ...trip, status: "searching" }).error?.includes("no longer"), "searching is offer, not reassign");
const back = reassign(trip).trip;
assert(offerTrip(back, drivers[2]!, drivers).trip.status === "offered" && offerTrip(back, drivers[2]!, drivers).trip.driverId === "D3", "after reassign the admin offers it; the driver still has to accept");
assert(offerTrip({ ...back, status: "offered", driverId: "D1" }, drivers[1]!, drivers).error?.includes("not eligible"), "suspended driver refused");

// The contract gaps the old hand lists had: cancel while the driver is on the way or the rider is onboard.
for (const status of ["requested", "offered", "driver_to_pickup", "rider_onboard", "approaching_dropoff"] as const) assert(canCancel(status), `admin can cancel in ${status}`);
for (const status of TRIP_STATUSES) assert(canCancel(status) === !isTerminal(status), `cancel = every non-terminal status (${status})`);
assert(NO_SHOW_OK.join() === "accepted,driver_to_pickup,arrived" && markNoShow({ ...trip, status: "arrived" }, "Rider never came").trip.status === "no_show", "admin no-show");
assert(markNoShow({ ...trip, status: "in_trip" }, "x").error?.includes("not allowed") && markNoShow({ ...trip, status: "arrived" }, " ").error === "A reason is required.", "no-show gated");
assert(COMPLETE_OK.join() === "rider_onboard,in_trip,approaching_dropoff" && completeTrip({ ...trip, status: "in_trip" }, "Driver app crashed").trip.status === "completed", "admin completes a stuck trip");
assert(completeTrip(trip, "x").error?.includes("rider is in the car"), "cannot complete before pickup");
assert(!REFUND_TRIP_OK.includes("expired") && REFUND_TRIP_OK.includes("cancelled_by_system") && REFUND_TRIP_OK.every(isTerminal), "refund: terminal statuses except expired");
assert(adjustFare(trip, 40).error?.includes("15%"), "fare cap");
assert(adjustFare(trip, 10).trip.fareOre === 16390, "ten percent");
assert(adjustFare(trip, 10).trip.ruleVersion === "price-3", "rule version kept");
assert(adjustFare({ ...trip, status: "completed" }, 10).error?.includes("not allowed"), "completed fare cannot change");
assert(waitingMinutes("arrived", 8).minutes === 8, "arrived waiting time can be corrected");
assert(waitingMinutes("searching", 8).error?.includes("cannot be changed"), "waiting time is lifecycle gated");
assert(waitingMinutes("arrived", 121).error?.includes("120"), "waiting correction has a safety bound");

const dispatch = saveDispatch({ offerSeconds: 8.5, radiusKm: 30 }, { offerSeconds: 8.5, radiusKm: 25 });
assert(dispatch.rules.radiusKm === 25 && dispatch.rules.offerSeconds === 8.5, "dispatch saves");

console.log("trips ok");
