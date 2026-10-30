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

// Q11 (per-driver scheduled rides) was removed by owner G3-R3: see the G3-R3 block at the end of this file.
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

// Owner G3-R3 (2026-10-30, contract v0.18.4): "Remove the switch". The per-driver "Scheduled driver access" card, its
// demo late cancels and its command are gone; every driver can take booked rides (the zone's reservations.on decides).
{
  const { existsSync, readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { commandById, SLICE_WRITERS } = await import("../commands/registry.ts");
  const { en } = await import("../i18n/en.ts");
  const src = fileURLToPath(new URL("..", import.meta.url));
  assert(commandById("admin.driver.scheduledAccess") === undefined && !("scheduledAccess" in SLICE_WRITERS), "G3-R3: no command writes per-driver scheduled access");
  assert(!existsSync(join(src, "drivers", "ScheduledAccess.tsx")) && !existsSync(join(src, "drivers", "scheduledAccess.ts")), "G3-R3: the card and its demo late cancels are removed");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
  const users = walk(src).filter((file) => /\.tsx?$/.test(file) && !file.endsWith("ops.test.ts") && /ScheduledAccessCard|scheduledAccess["']|lateCancelsFor/.test(readFileSync(file, "utf8")));
  assert(users.length === 0, `G3-R3: nothing uses the per-driver switch any more: ${users.join(", ")}`);
  assert(!("Drivers' access to scheduled rides" in en), "G3-R3: its texts are removed");
  console.log("G3-R3 ok");
}
