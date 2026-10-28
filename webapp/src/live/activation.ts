/**
 * Contract v0.10.1 (driverOnboarding.activation, owner decision 2026-10-28): an account is activated only when its
 * required documents are approved: a driver in a fleet his own (Driver.requiredDocuments), a fleet owner also the
 * company's (Driver.requiredFleetDocuments). No car is needed. A car is picked or driven only when every
 * Vehicle.requiredDocuments type is approved. Pure helpers, covered by src/live/activation.test.ts.
 */
import { REQUIRED_DOCUMENTS } from "./onboardingContract.ts";
import type { DocumentSummary, Driver, Vehicle } from "./types.ts";

export const DOCUMENTS_NOT_APPROVED = "documents_not_approved";

export type MissingGroups = { driver: string[]; fleet: string[]; vehicle: string[] };

/** The 409 details ("driver:terms", "fleet:company_registration", "vehicle:insurance") grouped by scope. */
export function groupMissing(details: readonly string[]): MissingGroups {
  const groups: MissingGroups = { driver: [], fleet: [], vehicle: [] };
  for (const item of details) {
    const at = item.indexOf(":");
    const scope = at > 0 ? item.slice(0, at) : "driver";
    const type = at > 0 ? item.slice(at + 1) : item;
    if (!type) continue;
    const list = scope === "fleet" ? groups.fleet : scope === "vehicle" ? groups.vehicle : groups.driver;
    if (!list.includes(type)) list.push(type);
  }
  return groups;
}

function notApproved(required: readonly string[], documents: readonly DocumentSummary[] | undefined): string[] {
  const approved = new Set((documents ?? []).filter((doc) => doc.status === "approved").map((doc) => doc.type));
  return required.filter((type) => !approved.has(type));
}

/** What still holds a driver's activation back, as the server would list it (same "<scope>:<type>" items). */
export function activationMissing(driver: Pick<Driver, "documents" | "requiredDocuments" | "requiredFleetDocuments" | "accountType" | "country">): string[] {
  const country = driver.country ? REQUIRED_DOCUMENTS[driver.country] : undefined;
  const own = driver.requiredDocuments ?? [...(country?.driver ?? [])];
  const company = driver.accountType === "fleet" ? driver.requiredFleetDocuments ?? [...(country?.fleet ?? [])] : [];
  return [...notApproved(own, driver.documents).map((type) => `driver:${type}`), ...notApproved(company, driver.documents).map((type) => `fleet:${type}`)];
}

/** The car's required types that are not approved; empty means it can be picked and driven (when approved itself). */
export function vehicleMissing(vehicle: Pick<Vehicle, "documents" | "requiredDocuments">, country?: string): string[] {
  const required = vehicle.requiredDocuments ?? [...((country && REQUIRED_DOCUMENTS[country]?.vehicle) ?? [])];
  return notApproved(required, vehicle.documents);
}

export type FunnelStep = { id: "signed_up" | "uploaded" | "approved" | "active"; count: number };

/**
 * The live onboarding funnel from the server's driver rows only: signed up, every required document uploaded, every
 * required document approved, account active. A step is left out when no row reached it (nothing to show).
 */
export function liveFunnel(drivers: readonly (Pick<Driver, "documents" | "requiredDocuments" | "requiredFleetDocuments" | "accountType" | "country"> & { accountStatus: string })[]): FunnelStep[] {
  let uploaded = 0;
  let approved = 0;
  let active = 0;
  for (const driver of drivers) {
    const missing = activationMissing(driver);
    const have = new Set(driver.documents.filter((doc) => doc.status !== "missing" && doc.status !== "rejected").map((doc) => doc.type));
    if (missing.every((item) => have.has(item.slice(item.indexOf(":") + 1)))) uploaded += 1;
    if (missing.length === 0) approved += 1;
    if (driver.accountStatus === "active") active += 1;
  }
  const steps: FunnelStep[] = [{ id: "signed_up", count: drivers.length }, { id: "uploaded", count: uploaded }, { id: "approved", count: approved }, { id: "active", count: active }];
  return steps.filter((step) => step.count > 0);
}
