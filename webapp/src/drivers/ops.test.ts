import { accessLabel, accessState, choiceError, clearAccess, driverScheduledRides, emptyAccessBook, lateCancelsFor, normalizeAccessBook, setAccess } from "./scheduledAccess.ts";
import {
  approveRequiredDocuments,
  driverActivationIssue,
  driverOps,
  emptyDriverOpsBook,
  requestDriverInfo,
  reviewDriverDocument,
  setBankReview,
  setDriverCategory,
  setDriverNote,
  updateVehicleOps,
  vehicleOps,
} from "./ops.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const independent = { id: "D0005", name: "Maja Holm", fleetId: null };
const fleet = { id: "D0001", name: "Erik Lind", fleetId: "F1" };
const vehicleSeed = {
  id: "V0005",
  status: "eligible",
  year: 2022,
  seats: 4,
  fuel: "electric",
  category: "electric",
  fleetId: null,
};

let book = emptyDriverOpsBook();
assert(book.draftRev === 1, "driver operations starts at revision one");

book = reviewDriverDocument(book, independent, "driver_license", "rejected", "ida", "Unreadable image");
assert(driverOps(book, independent).documents.driver_license.status === "rejected", "document rejection persists");
assert(driverOps(book, independent).documents.driver_license.note === "Unreadable image", "review note persists");

book = requestDriverInfo(book, independent, "driver_license", "ida", "Upload both sides");
assert(driverOps(book, independent).documents.driver_license.status === "needed", "request info returns document to needed");
assert(driverOps(book, independent).documents.driver_license.note === "Upload both sides", "request info stores the requested detail");

book = approveRequiredDocuments(book, independent, "ida");
assert(
  Object.values(driverOps(book, independent).documents).every((item) => item.status === "approved" || item.status === "expiring"),
  "independent driver requires all documents",
);

const fleetBook = approveRequiredDocuments(emptyDriverOpsBook(), fleet, "ida");
assert(driverOps(fleetBook, fleet).documents.company_registration.status === "needed", "fleet driver keeps company registration exempt");

book = setBankReview(book, independent, "approved", "ida", "Matched holder");
assert(driverOps(book, independent).bank.status === "approved", "bank approval persists");

let car = vehicleOps(book, vehicleSeed);
assert(car.category === "electric" && car.fuel === "electric", "vehicle profile uses fixture attributes");
book = updateVehicleOps(book, vehicleSeed, { registrationStatus: "approved" });
car = vehicleOps(book, vehicleSeed);
assert(driverActivationIssue(book, independent, car) === null, "approved documents bank and eligible vehicle can activate");

book = setDriverCategory(book, independent, "premium", true, "lena");
assert(driverOps(book, independent).categories.premium, "category eligibility can be enabled");
book = setDriverNote(book, independent, "Call after 14:00", "lena");
assert(driverOps(book, independent).note === "Call after 14:00", "private note persists");
// UI-13: a pasted 3000-character note is capped at 2000 characters.
assert(driverOps(setDriverNote(book, independent, "x".repeat(3000), "lena"), independent).note.length === 2000, "private note is capped at 2000 characters");

const badVehicleBook = updateVehicleOps(book, vehicleSeed, { category: "xl", seats: 4 });
assert(driverActivationIssue(badVehicleBook, independent, vehicleOps(badVehicleBook, vehicleSeed))?.includes("6 seats"), "vehicle rule blocks activation");

// Q11: scheduled rides on or off per driver, the late cancels and the pause by the rule.
const lateRule = { latePause: true, latePauseAfter: 2, latePeriodDays: 7, latePauseDays: 7, driverLateCancelHours: 1 };
const accessNow = Date.parse("2026-10-15T12:00:00Z");
const twoLate = lateCancelsFor("D0006", accessNow);
assert(twoLate.length === 2 && lateCancelsFor("D0001", accessNow).length === 0, "demo late cancels: every 6th driver has 2 this week");
const paused = accessState(undefined, twoLate, lateRule, accessNow);
assert(!paused.allowed && paused.source === "rule" && paused.pausedByRule && paused.lateInPeriod.length === 2, "2 late cancels in 7 days pause scheduled rides");
assert(accessLabel(paused, undefined, lateRule).startsWith("Paused until 2026-10-2") && accessLabel(paused, undefined, lateRule).endsWith("2 late cancels in 7 days"), "the pause says until when and why");
assert(accessState(undefined, twoLate, { ...lateRule, latePause: false }, accessNow).allowed && accessState(undefined, twoLate, { ...lateRule, latePauseAfter: 3 }, accessNow).allowed, "the rule can be off or need more late cancels");
assert(accessState(undefined, lateCancelsFor("D0007", accessNow), lateRule, accessNow).lateInPeriod.length === 0, "a late cancel before the period does not count");
const accessIso = new Date(accessNow).toISOString();
const turnedOn = setAccess(emptyAccessBook(), "D0006", { on: true, period: "days", days: 3, until: "" }, "nora", accessIso);
const onState = accessState(turnedOn.book.drivers.D0006, twoLate, lateRule, accessNow);
assert(!turnedOn.error && onState.allowed && onState.source === "admin" && onState.pausedByRule && turnedOn.book.draftRev === 2 && turnedOn.book.log[0].line === "Scheduled rides on for 3 days", "an admin can turn scheduled rides on over the pause");
assert(accessState(turnedOn.book.drivers.D0006, twoLate, lateRule, accessNow + 4 * 86_400_000).source === "rule", "after the days the rule decides again, and the pause lasts its 7 days");
assert(accessState(undefined, twoLate, lateRule, accessNow + 7 * 86_400_000).allowed, "the pause ends 7 days after the late cancel that reached the limit");
const turnedOff = setAccess(emptyAccessBook(), "D0001", { on: false, period: "always", days: 7, until: "" }, "nora", accessIso).book;
assert(!accessState(turnedOff.drivers.D0001, [], lateRule, accessNow + 400 * 86_400_000).allowed && accessLabel(accessState(turnedOff.drivers.D0001, [], lateRule, accessNow), turnedOff.drivers.D0001, lateRule) === "Off always, set by nora", "off always stays off");
assert(setAccess(emptyAccessBook(), "D0001", { on: false, period: "until", days: 7, until: "2026-10-01" }, "nora", accessIso).error === "The last day must be in the future." && choiceError({ on: true, period: "days", days: 0, until: "" }, accessNow) === "Choose 1 to 365 days.", "the period is checked");
const back = clearAccess(turnedOff, "D0001", "nora", accessIso);
assert(!back.drivers.D0001 && back.log[0].line === "Back to the late-cancel rule" && normalizeAccessBook(null).draftRev === 1, "back to the rule");
// Owner decision 2 (contract v0.4.2): the admin's choice reaches the driver app as Driver.scheduledRides.
assert(JSON.stringify(driverScheduledRides(turnedOff.drivers.D0001, accessNow)) === JSON.stringify({ on: false, until: null }), "off always: no new reservations until an admin turns them on");
assert(JSON.stringify(driverScheduledRides(turnedOn.book.drivers.D0006, accessNow)) === JSON.stringify({ on: true, until: "2026-10-18T12:00:00.000Z" }), "on for 3 days: until when, in UTC");
assert(driverScheduledRides(turnedOn.book.drivers.D0006, accessNow + 4 * 86_400_000) === null && driverScheduledRides(undefined, accessNow) === null, "no choice in force: nothing, the zone switch and the late-cancel rule decide");

console.log("driver ops ok");

// Owner G2 R1 (2026-10-30): a real ULID car id must not crash the Vehicles and driver pages (RangeError Invalid
// time value); live cars show the real end dates of their approved registration and insurance, else nothing.
const ulidCar = { id: "01JBXK7Q2M9V4T8RZ5N3W6Y1CD", status: "pending", year: 2012, seats: 4, fuel: "hybrid", category: "economy", fleetId: "01JBXK7Q2M9V4T8RZ5N3W6Y1FE" };
const ulidProfile = vehicleOps(emptyDriverOpsBook(), ulidCar);
assert(ulidProfile.inspectionExpiresAt === "" && ulidProfile.insuranceExpiresAt === "", "a real car id gets no invented dates");
const liveCar = { ...ulidCar, liveVehicleDocs: { documents: [
  { type: "vehicle_registration", status: "approved", expiresAt: "2027-05-31T00:00:00.000Z" },
  { type: "insurance", status: "in_review", expiresAt: "2027-01-01" },
] } };
const liveProfile = vehicleOps(emptyDriverOpsBook(), liveCar);
assert(liveProfile.inspectionExpiresAt === "2027-05-31", "registration end date from the approved document");
assert(liveProfile.insuranceExpiresAt === "", "an insurance still in review gives no date");
console.log("ULID car ids ok");
