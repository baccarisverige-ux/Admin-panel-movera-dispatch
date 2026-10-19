import {
  DRIVER_DOCUMENTS,
  activationBlock,
  blankDocuments,
  requiredDocuments,
  type AccountStatus,
  type DocId,
  type DocStatus,
  type Driver,
  type Vehicle,
} from "./gate.ts";
import { NOTE_MAX } from "../domain/labels.ts";

export type DriverDocumentReview = {
  id: DocId;
  status: DocStatus;
  fileName: string;
  fileType: "PDF" | "image";
  uploadedAt: string;
  expiresAt: string;
  reviewerId: string;
  note: string;
};

export type DriverBankReview = {
  status: "needed" | "in_review" | "approved" | "rejected";
  holder: string;
  last4: string;
  reviewerId: string;
  note: string;
};

export type ThreadMessage = {
  from: "admin" | "contact";
  text: string;
  at: string;
  by: string;
};

export type DriverOps = {
  driverId: string;
  messages?: ThreadMessage[];
  documents: Record<DocId, DriverDocumentReview>;
  categories: Record<Vehicle["category"], boolean>;
  bank: DriverBankReview;
  note: string;
  accountReason: string;
  driving: {
    todayMinutes: number;
    weekMinutes: number;
    lastBreakAt: string;
  };
  ratings: {
    stars: number;
    acceptancePct: number;
    cancellationPct: number;
    requests: number;
  };
  activity: string[];
};

export type VehicleOps = {
  vehicleId: string;
  status: "eligible" | "ineligible" | "on_hold";
  year: number;
  seats: number;
  fuel: Vehicle["fuel"];
  category: Vehicle["category"];
  fleetId: string;
  inspectionExpiresAt: string;
  insuranceExpiresAt: string;
  registrationStatus: "in_review" | "approved" | "rejected";
  note: string;
};

export type DriverOpsBook = {
  draftRev: number;
  drivers: Record<string, DriverOps>;
  vehicles: Record<string, VehicleOps>;
};

export type DriverSeed = {
  id: string;
  name: string;
  fleetId?: string | null;
  /** Account status and seeded document state; when given, untouched documents start from them. */
  status?: string;
  kind?: string;
};

export type VehicleSeed = {
  id: string;
  status?: string;
  year?: number;
  seats?: number;
  fuel?: string;
  category?: string;
  fleetId?: string | null;
};

const CATEGORY_IDS: Vehicle["category"][] = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet"];

function isoDate(offsetDays: number): string {
  const base = new Date("2026-10-06T00:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function documentDefaults(): Record<DocId, DriverDocumentReview> {
  return Object.fromEntries(
    DRIVER_DOCUMENTS.map((id, index) => [
      id,
      {
        id,
        status: "needed",
        fileName: `${id.replaceAll("_", "-")}.${index % 3 === 0 ? "pdf" : "jpg"}`,
        fileType: index % 3 === 0 ? "PDF" : "image",
        uploadedAt: "2026-10-05T12:00:00.000Z",
        expiresAt: ["terms", "virtual_session", "profile_photo", "tax_settings", "bank_statement"].includes(id) ? "" : isoDate(120 + index * 15),
        reviewerId: "",
        note: "",
      } satisfies DriverDocumentReview,
    ]),
  ) as Record<DocId, DriverDocumentReview>;
}

export function emptyDriverOpsBook(): DriverOpsBook {
  return { draftRev: 1, drivers: {}, vehicles: {} };
}

/**
 * Starting documents for a seeded driver: pending drivers still have everything to upload;
 * drivers already on the platform start approved, with the seeded document problem applied.
 */
function seededDocuments(driver: DriverSeed): Record<DocId, DriverDocumentReview> {
  const documents = documentDefaults();
  if (!driver.status || driver.status === "pending") return documents;
  for (const id of DRIVER_DOCUMENTS) documents[id] = { ...documents[id], status: "approved", reviewerId: "nora" };
  const set = (id: DocId, patch: Partial<DriverDocumentReview>) => { documents[id] = { ...documents[id], ...patch }; };
  // About four in ten drivers have one document to look at; the rest are clean.
  const problem = (Number(driver.id.replace(/\D/g, "")) || 0) % 10;
  if (problem === 2 || problem === 7) set("vehicle_insurance", { status: "expiring", expiresAt: isoDate(18) });
  if (problem === 4) set("taxi_driver_license", { status: "expired", expiresAt: isoDate(-9) });
  if (problem === 5) set("vehicle_registration", { status: "rejected", note: "Photo is blurry, upload again" });
  if (problem === 9) set("profile_photo", { status: "in_review", reviewerId: "" });
  if (driver.status === "on_hold") set("vehicle_insurance", { status: "expired", expiresAt: isoDate(-3) });
  return documents;
}

export function driverOps(book: DriverOpsBook, driver: DriverSeed): DriverOps {
  const stored = book.drivers[driver.id];
  if (stored) return stored;
  const suffix = Number(driver.id.replace(/\D/g, "")) || 1;
  return {
    driverId: driver.id,
    documents: seededDocuments(driver),
    categories: {
      economy: true,
      comfort: suffix % 2 === 0,
      premium: false,
      priority: true,
      xl: false,
      electric: false,
      pet: true,
    },
    bank: {
      status: "approved",
      holder: driver.name,
      last4: String(4100 + (suffix % 800)).slice(-4),
      reviewerId: "",
      note: "",
    },
    note: "",
    accountReason: "",
    driving: {
      todayMinutes: 145 + (suffix % 120),
      weekMinutes: 680 + (suffix % 520),
      lastBreakAt: "2026-10-05T20:15:00.000Z",
    },
    ratings: {
      stars: Number((4.72 + (suffix % 20) / 100).toFixed(2)),
      acceptancePct: 82 + (suffix % 16),
      cancellationPct: 2 + (suffix % 6),
      requests: 100,
    },
    activity: ["Application created", "Identity imported into onboarding"],
  };
}

export function vehicleOps(book: DriverOpsBook, vehicle: VehicleSeed): VehicleOps {
  const stored = book.vehicles[vehicle.id];
  if (stored) return stored;
  const suffix = Number(vehicle.id.replace(/\D/g, "")) || 1;
  const category = CATEGORY_IDS.includes(vehicle.category as Vehicle["category"])
    ? vehicle.category as Vehicle["category"]
    : suffix % 7 === 0
      ? "xl"
      : suffix % 5 === 0
        ? "electric"
        : "economy";
  const fuel: Vehicle["fuel"] =
    vehicle.fuel === "petrol" || vehicle.fuel === "diesel" || vehicle.fuel === "electric" || vehicle.fuel === "hybrid"
      ? vehicle.fuel
      : category === "electric"
        ? "electric"
        : "hybrid";
  return {
    vehicleId: vehicle.id,
    status: vehicle.status === "ineligible" ? "ineligible" : vehicle.status === "on_hold" ? "on_hold" : "eligible",
    year: vehicle.year ?? 2020 + (suffix % 5),
    seats: vehicle.seats ?? (category === "xl" ? 6 : 4),
    fuel,
    category,
    fleetId: vehicle.fleetId ?? "",
    inspectionExpiresAt: isoDate(90 + suffix),
    insuranceExpiresAt: isoDate(180 + suffix),
    registrationStatus: "approved",
    note: "",
  };
}

function nextBook(book: DriverOpsBook): DriverOpsBook {
  return { ...book, draftRev: book.draftRev + 1 };
}

export function reviewDriverDocument(
  book: DriverOpsBook,
  driver: DriverSeed,
  id: DocId,
  status: DocStatus,
  actorId: string,
  note: string,
): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    documents: {
      ...current.documents,
      [id]: {
        ...current.documents[id],
        status,
        reviewerId: actorId,
        note: note.trim(),
      },
    },
    activity: [`${id}: ${status} by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

export function approveRequiredDocuments(book: DriverOpsBook, driver: DriverSeed, actorId: string): DriverOpsBook {
  let next = book;
  const ops = driverOps(book, driver);
  const gate: Driver = {
    id: driver.id,
    name: driver.name,
    fleet: Boolean(driver.fleetId),
    status: "pending",
    documents: Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, ops.documents[id].status])) as Record<DocId, DocStatus>,
    vehicle: { year: 2022, seats: 4, fuel: "electric", category: "economy" },
  };
  for (const id of requiredDocuments(gate)) {
    const state = driverOps(next, driver).documents[id].status;
    if (state !== "approved" && state !== "expiring") {
      next = reviewDriverDocument(next, driver, id, "approved", actorId, "Approved in batch review");
    }
  }
  return next;
}

export function requestDriverInfo(
  book: DriverOpsBook,
  driver: DriverSeed,
  id: DocId,
  actorId: string,
  note: string,
): DriverOpsBook {
  return reviewDriverDocument(book, driver, id, "needed", actorId, note || "More information requested");
}

export function setDriverCategory(
  book: DriverOpsBook,
  driver: DriverSeed,
  category: Vehicle["category"],
  enabled: boolean,
  actorId: string,
): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    categories: { ...current.categories, [category]: enabled },
    activity: [`${category} eligibility ${enabled ? "enabled" : "disabled"} by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

export function setBankReview(
  book: DriverOpsBook,
  driver: DriverSeed,
  status: DriverBankReview["status"],
  actorId: string,
  note: string,
): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    bank: { ...current.bank, status, reviewerId: actorId, note: note.trim() },
    activity: [`Bank details ${status} by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

/** Change a document's expiry date; an empty value clears it. */
export function setDocumentExpiry(book: DriverOpsBook, driver: DriverSeed, id: DocId, expiresAt: string, actorId: string): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    documents: { ...current.documents, [id]: { ...current.documents[id], expiresAt } },
    activity: [`${id}: expiry ${expiresAt || "cleared"} by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

/** Add a message from the admin to the driver's thread. */
export function sendDriverMessage(book: DriverOpsBook, driver: DriverSeed, text: string, actorId: string, at: string): DriverOpsBook {
  const current = driverOps(book, driver);
  const message: ThreadMessage = { from: "admin", text: text.trim(), at, by: actorId };
  const updated: DriverOps = {
    ...current,
    messages: [...(current.messages ?? []), message].slice(-100),
    activity: [`Message sent by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

export function setDriverNote(book: DriverOpsBook, driver: DriverSeed, note: string, actorId: string): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    note: note.trim().slice(0, NOTE_MAX),
    activity: [`Private note updated by ${actorId}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

export function setAccountReason(
  book: DriverOpsBook,
  driver: DriverSeed,
  status: AccountStatus,
  reason: string,
  actorId: string,
): DriverOpsBook {
  const current = driverOps(book, driver);
  const updated: DriverOps = {
    ...current,
    accountReason: reason.trim(),
    activity: [`Account ${status} by ${actorId}: ${reason.trim()}`, ...current.activity].slice(0, 30),
  };
  return { ...nextBook(book), drivers: { ...book.drivers, [driver.id]: updated } };
}

export function updateVehicleOps(
  book: DriverOpsBook,
  vehicle: VehicleSeed,
  patch: Partial<Omit<VehicleOps, "vehicleId">>,
): DriverOpsBook {
  const current = vehicleOps(book, vehicle);
  const updated = { ...current, ...patch, vehicleId: current.vehicleId };
  return { ...nextBook(book), vehicles: { ...book.vehicles, [vehicle.id]: updated } };
}

export function driverActivationIssue(
  book: DriverOpsBook,
  driver: DriverSeed,
  vehicle: VehicleOps | null,
): string | null {
  if (!vehicle) return "A linked vehicle is required.";
  const ops = driverOps(book, driver);
  const gate: Driver = {
    id: driver.id,
    name: driver.name,
    fleet: Boolean(driver.fleetId),
    status: "pending",
    documents: Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, ops.documents[id].status])) as Record<DocId, DocStatus>,
    vehicle: {
      year: vehicle.year,
      seats: vehicle.seats,
      fuel: vehicle.fuel,
      category: vehicle.category,
    },
  };
  const block = activationBlock(gate);
  if (block) return block;
  if (vehicle.status !== "eligible") return `Vehicle is ${vehicle.status}.`;
  if (vehicle.registrationStatus !== "approved") return "Vehicle registration must be approved.";
  if (ops.bank.status !== "approved") return "Bank details must be approved.";
  return null;
}

export function documentStatusMap(ops: DriverOps): Record<DocId, DocStatus> {
  return Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, ops.documents[id].status])) as Record<DocId, DocStatus>;
}

export function blankDriverGate(driver: DriverSeed, vehicle: VehicleOps): Driver {
  return {
    id: driver.id,
    name: driver.name,
    fleet: Boolean(driver.fleetId),
    status: "pending",
    documents: blankDocuments(),
    vehicle: { year: vehicle.year, seats: vehicle.seats, fuel: vehicle.fuel, category: vehicle.category },
  };
}
