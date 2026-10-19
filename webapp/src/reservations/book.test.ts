import {
  answerAsk,
  askDriver,
  currentAsk,
  notAccepted,
  raiseFare,
  DEFAULT_RESERVATION_POLICY,
  GIVE_UP_MINUTES,
  assignReservation,
  cancelReservation,
  emptyReservationBook,
  needsDriverSoon,
  normalizeReservationBook,
  recordReservationContact,
  reservationCandidates,
  reservationOps,
  reservationWarning,
  saveReservationPolicy,
  scheduleReturnRide,
  stockholmLocalToIso,
  timeZoneCity,
  zonedLabel,
  zonedLocalToIso,
  zonedLocalValue,
} from "./book.ts";
import type { DemoRecord } from "../api/seed.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const soon = { id: "B1", pickupAt: "2026-10-05T11:30:00Z", driverId: null, policyVersion: "res-2", status: "booked" as const };
assert(needsDriverSoon(soon, "2026-10-05T10:40:00Z"), "under 60 minutes without a driver");
assert(!needsDriverSoon(soon, "2026-10-05T09:00:00Z"), "not flagged when there is time");
const assigned = assignReservation(soon, "D1");
assert(assigned.status === "assigned" && !needsDriverSoon(assigned, "2026-10-05T10:40:00Z"), "assignment updates status and warning");
const cancelled = cancelReservation(assigned);
assert(cancelled.status === "cancelled" && cancelled.policyVersion === "res-2", "policy version stays after cancel");
assert(GIVE_UP_MINUTES === 5, "give-up default");

let book = emptyReservationBook();
const record: DemoRecord = {
  id: "B021",
  name: "Rider",
  phone: "+46 70 100 00 21",
  zoneId: "Z001",
  status: "waiting",
  driverId: null,
  category: "economy",
  pickupAt: "2026-10-06T12:00:00.000Z",
  returnAt: null,
  policyVersion: "res-1",
};

const oldOps = reservationOps(book, record);
assert(oldOps.policy.version === "res-1", "reservation uses its stored policy version");
assert(oldOps.policy.bookingHorizonDays === 5, "legacy policy snapshot values resolve");

const nextPolicy = { ...DEFAULT_RESERVATION_POLICY, bookingHorizonDays: 10 };
const policySave = saveReservationPolicy(book, nextPolicy);
assert(!policySave.error, "valid policy saves");
book = policySave.book;
assert(book.currentPolicy.version === "res-3", "policy save creates a new version");
assert(reservationOps(book, record).policy.version === "res-1", "old booking still points at res-1");
assert(reservationOps(book, record).policy.bookingHorizonDays === 5, "old booking values remain immutable");
// "Free cancel after accept" is gone from the policy (Rider cancel fees in Dispatch has it). Older saves with it still open.
assert(!("freeCancelAfterAcceptMinutes" in DEFAULT_RESERVATION_POLICY), "the policy has no free cancel time");
const oldPolicySave = normalizeReservationBook({
  draftRev: 4,
  currentPolicy: { ...DEFAULT_RESERVATION_POLICY, version: "res-4", freeCancelAfterAcceptMinutes: 3 },
  policies: { "res-4": { ...DEFAULT_RESERVATION_POLICY, version: "res-4", freeCancelAfterAcceptMinutes: 3 } },
  reservations: {},
});
assert(oldPolicySave.currentPolicy.version === "res-4" && !("freeCancelAfterAcceptMinutes" in oldPolicySave.currentPolicy) && !("freeCancelAfterAcceptMinutes" in oldPolicySave.policies["res-4"]), "an older policy with free cancel after accept still opens, without it");
assert(!saveReservationPolicy(oldPolicySave, oldPolicySave.currentPolicy).error, "and saves");

const giveUpRecord: DemoRecord = { ...record, id: "B022", pickupAt: "2026-10-06T10:04:00.000Z", policyVersion: "res-2" };
const giveUpOps = reservationOps(book, giveUpRecord);
assert(reservationWarning(giveUpRecord, giveUpOps, "2026-10-06T10:00:00.000Z")?.includes("Give-up"), "give-up warning wins at threshold");

const drivers: DemoRecord[] = [
  { id: "D1", name: "Eligible", phone: "", zoneId: "Z001", status: "active" },
  { id: "D2", name: "Suspended", phone: "", zoneId: "Z001", status: "suspended" },
  { id: "D3", name: "Wrong category", phone: "", zoneId: "Z001", status: "active" },
];
const vehicles: DemoRecord[] = [
  { id: "V1", name: "", phone: "", zoneId: "Z001", status: "eligible", driverId: "D1", category: "economy" },
  { id: "V2", name: "", phone: "", zoneId: "Z001", status: "eligible", driverId: "D2", category: "economy" },
  { id: "V3", name: "", phone: "", zoneId: "Z001", status: "eligible", driverId: "D3", category: "premium" },
];
assert(reservationCandidates(record, reservationOps(book, record), drivers, vehicles).map((item) => item.id).join() === "D1", "candidate requires active driver and eligible matching vehicle");

const contact = recordReservationContact(book, record, "daniel", "sms", "Pickup confirmed", "2026-10-06T10:00:00.000Z");
assert(!contact.error, "contact note saves");
book = contact.book;
assert(reservationOps(book, record).contacts[0]?.channel === "sms", "contact history persists");

const badReturn = scheduleReturnRide(book, record, "2026-10-06T11:00:00.000Z", "daniel");
assert(badReturn.error?.includes("after"), "return must be after outbound pickup");
const goodReturn = scheduleReturnRide(book, record, "2026-10-06T18:00:00.000Z", "daniel");
assert(!goodReturn.error, "later return ride saves");

const springGap = stockholmLocalToIso("2026-03-29T02:30");
assert(springGap.error?.includes("does not exist"), "spring-forward missing local time is rejected");
const fallEarlier = stockholmLocalToIso("2026-10-25T02:30", "earlier");
const fallLater = stockholmLocalToIso("2026-10-25T02:30", "later");
assert(fallEarlier.ambiguous && fallLater.ambiguous, "fall-back repeated local time is marked ambiguous");
assert(Boolean(fallEarlier.iso && fallLater.iso), "both repeated-hour choices resolve");
assert(Math.abs(Date.parse(fallLater.iso!) - Date.parse(fallEarlier.iso!)) === 60 * 60_000, "repeated-hour choices are one hour apart");

assert(normalizeReservationBook({}).currentPolicy.version === "res-2", "empty legacy slice normalizes safely");

// Movera gives a ride to a driver: the driver must accept, like an Exclusive with a timer.
const t0 = "2026-10-06T10:00:00.000Z";
const asked = askDriver(book, record, "D1", "daniel", 60, t0);
assert(!asked.error, "a driver can be asked");
const waiting = currentAsk(reservationOps(asked.book, record), "2026-10-06T10:00:20.000Z");
assert(waiting?.state === "waiting" && waiting.secondsLeft === 40 && waiting.ask.driverId === "D1", "the timer counts down");
assert(reservationOps(asked.book, record).offers[0]?.result === "offered", "the offer history shows the request");
assert(askDriver(asked.book, record, "D3", "daniel", 60, "2026-10-06T10:00:30.000Z").error === "Waiting for D1 to accept.", "one request at a time");
const accepted = answerAsk(asked.book, record, "accepted", "2026-10-06T10:00:30.000Z");
assert(!accepted.error && accepted.patch.driverId === "D1" && accepted.patch.status === "assigned", "accepting gives the ride to the driver");
assert(currentAsk(reservationOps(accepted.book, record), "2026-10-06T10:00:31.000Z")?.state === "accepted", "the request shows as accepted");
const declined = answerAsk(asked.book, record, "declined", "2026-10-06T10:00:30.000Z");
assert(!declined.error && Object.keys(declined.patch).length === 0 && notAccepted(reservationOps(declined.book, record), "2026-10-06T10:00:31.000Z").has("D1"), "a no keeps the ride open and marks the driver");
const late = currentAsk(reservationOps(asked.book, record), "2026-10-06T10:01:01.000Z");
assert(late?.state === "expired" && notAccepted(reservationOps(asked.book, record), "2026-10-06T10:01:01.000Z").has("D1"), "time runs out: the admin sees it");
assert(answerAsk(asked.book, record, "accepted", "2026-10-06T10:01:01.000Z").error?.includes("run out"), "a late accept is refused");
assert(!askDriver(asked.book, record, "D3", "daniel", 60, "2026-10-06T10:01:01.000Z").error, "after the time runs out the admin can pick someone else");
assert(askDriver(book, { ...record, status: "assigned", driverId: "D9" }, "D1", "daniel", 60, t0).error, "a ride with a driver cannot be asked again");

// Raise the driver's fare for a ride nobody takes.
const raised = raiseFare(book, record, 120, 500, "daniel", t0, "kr");
assert(!raised.error && reservationOps(raised.book, record).raise?.amount === 120, "the raise is saved");
assert(raiseFare(book, record, 600, 500, "daniel", t0, "kr").error === "The raise can be at most 500 kr.", "never over the highest raise");
assert(raiseFare(book, record, 0, 500, "daniel", t0).error === "Write a raise above 0.", "a raise must be above 0");
assert(raiseFare(book, { ...record, driverId: "D1", status: "assigned" }, 50, 500, "daniel", t0).error, "a ride with a driver gets no raise");

// Saves from before these steps still open.
const oldStored = normalizeReservationBook(JSON.parse(JSON.stringify({ ...book, reservations: { B021: { ...reservationOps(book, record), asks: undefined, raise: undefined } } })));
const oldStoredOps = reservationOps(oldStored, record);
assert(Array.isArray(oldStoredOps.asks) && oldStoredOps.asks.length === 0 && oldStoredOps.raise === null && currentAsk(oldStoredOps, t0) === null, "an old save has no request and no raise");

console.log("reservations ok");

import { reservationClosed } from "./book.ts";
if (!reservationClosed("no_show") || !reservationClosed("cancelled") || reservationClosed("assigned")) throw new Error("no-show is a closed reservation status");

// C-11: times use the zone's own time zone. Tunis is UTC+1 all year; Stockholm is UTC+2 in summer.
assert(zonedLabel("2026-10-05T16:35:00.000Z", "Africa/Tunis").endsWith("17:35"), "a Tunis pickup shows Tunis time");
assert(zonedLabel("2026-10-05T16:35:00.000Z", "Europe/Stockholm").endsWith("18:35"), "a Stockholm pickup shows Stockholm time");
assert(zonedLocalToIso("2026-10-06T18:00", "Africa/Tunis").iso === "2026-10-06T17:00:00.000Z", "a return typed in Tunis local time is stored as 17:00Z, not an hour early");
assert(zonedLocalToIso("2026-10-06T18:00", "Europe/Paris").iso === "2026-10-06T16:00:00.000Z", "Paris summer time is UTC+2");
assert(zonedLocalToIso("2026-03-29T02:30", "Europe/Paris").error?.includes("Paris local time does not exist"), "the Paris spring gap is named after Paris");
assert(!zonedLocalToIso("2026-03-29T02:30", "Africa/Tunis").error && !zonedLocalToIso("2026-10-25T02:30", "Africa/Tunis").ambiguous, "Tunis has no DST gap or repeated hour");
assert(zonedLocalValue("2026-10-06T17:00:00.000Z", "Africa/Tunis") === "2026-10-06T18:00", "the return box shows Tunis local time");
assert(timeZoneCity("Africa/Tunis") === "Tunis", "the city name comes from the zone");
console.log("zoned time ok");
