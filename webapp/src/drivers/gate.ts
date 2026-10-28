export const DRIVER_DOCUMENTS = [
  "terms",
  "virtual_session",
  "driver_license",
  "profile_photo",
  "company_registration",
  "taxi_driver_license",
  "taxi_traffic_permit",
  "tax_settings",
  "bank_statement",
  "vehicle_registration",
  "vehicle_insurance",
] as const;

export type DocId = (typeof DRIVER_DOCUMENTS)[number];
export type DocStatus = "needed" | "rejected" | "expired" | "in_review" | "approved" | "expiring";
export type AccountStatus = "pending" | "active" | "on_hold" | "suspended";

export type Vehicle = {
  year: number;
  seats: number;
  fuel: "petrol" | "diesel" | "electric" | "hybrid";
  category: "economy" | "comfort" | "premium" | "priority" | "xl" | "electric" | "pet";
};

export type Driver = {
  id: string;
  name: string;
  fleet: boolean;
  status: AccountStatus;
  documents: Record<DocId, DocStatus>;
  vehicle: Vehicle;
};

export function blankDocuments(): Record<DocId, DocStatus> {
  return Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, "needed"])) as Record<DocId, DocStatus>;
}

export function reviewDocument(driver: Driver, id: DocId, status: DocStatus): Driver {
  return { ...driver, documents: { ...driver.documents, [id]: status } };
}

export function approveRemaining(driver: Driver): Driver {
  const documents = { ...driver.documents };
  for (const id of requiredDocuments(driver)) {
    if (documents[id] !== "approved" && documents[id] !== "expiring") documents[id] = "approved";
  }
  return { ...driver, documents };
}

export function requiredDocuments(driver: Driver): DocId[] {
  return DRIVER_DOCUMENTS.filter((id) => !(driver.fleet && id === "company_registration"));
}

export function activationBlock(driver: Driver): string | null {
  const waiting = requiredDocuments(driver).filter((id) => {
    const status = driver.documents[id];
    return status !== "approved" && status !== "expiring";
  });
  if (waiting.length > 0) return `Still needed: ${waiting.join(", ")}`;
  const vehicle = vehicleBlock(driver.vehicle);
  if (vehicle) return vehicle;
  return null;
}

export function activate(driver: Driver): { driver: Driver; error?: string } {
  const block = activationBlock(driver);
  if (block) return { driver, error: block };
  return { driver: { ...driver, status: "active" } };
}

export function vehicleBlock(vehicle: Vehicle): string | null {
  if (vehicle.category === "electric" && vehicle.fuel !== "electric") return "Electric category requires an electric vehicle.";
  if (vehicle.category === "xl" && vehicle.seats < 6) return "Movera XL requires at least 6 seats.";
  if (vehicle.year < 2015) return "Vehicle is older than the minimum year.";
  return null;
}

export function setAccount(driver: Driver, status: AccountStatus, reason: string): { driver: Driver; error?: string } {
  if (!reason.trim()) return { driver, error: "A reason is required." };
  if (status === "active") return activate(driver);
  return { driver: { ...driver, status } };
}
