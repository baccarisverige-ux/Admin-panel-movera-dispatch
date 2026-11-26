import { ApiError } from "../api/httpClient.ts";
import type { CommandInput } from "../api/create.ts";
import { tr } from "../i18n/index.ts";
import type { LiveClient } from "./session.ts";
import type { Driver } from "./types.ts";

export type DriverAddress = { street: string; postalCode: string; city: string };

/** v0.18.166 (signupV2.address.shape): trimmed parts; null when one is empty or too long. */
export function cleanAddress(value: unknown): DriverAddress | null {
  const v = (value ?? {}) as Partial<Record<keyof DriverAddress, unknown>>;
  const a = { street: String(v.street ?? "").trim(), postalCode: String(v.postalCode ?? "").trim(), city: String(v.city ?? "").trim() };
  if (!a.street || a.street.length > 200 || !a.postalCode || a.postalCode.length > 20 || !a.city || a.city.length > 100) return null;
  return a;
}

/**
 * v0.18.166 (contract.json#signupV2.address.adminEdit; owner 2026-11-26 "Oui, ajouter l'adresse (Recommandé)"):
 * admin.driver.address reads the driver's version and sends POST /admin/drivers/{id}/address { expectedVersion,
 * address, reason } (the audit, driver.address, keeps the reason only). Nothing is sent without the 3 parts or a reason.
 */
export async function setDriverAddress(client: LiveClient, input: CommandInput, explained: (error: unknown) => never): Promise<Driver | undefined> {
  const address = cleanAddress((input.value as { address?: unknown } | undefined)?.address);
  const reason = (input.reason ?? "").trim();
  if (!address) throw new ApiError(400, tr("Fill in street, postal code and city."), { code: "invalid_request", reason: "invalid_address", retryable: false });
  if (!reason) throw new ApiError(400, tr("Write a reason."), { code: "invalid_request", reason: "reason_required", retryable: false });
  const driver = await client.json<Driver>(`/admin/drivers/${encodeURIComponent(input.targetId)}`);
  return client.post<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/address`, { expectedVersion: driver.version, address, reason: reason.slice(0, 500) }).catch(explained);
}

/** v0.18.166 (contract.json#signupV2): the sign-up details of a Driver for the driver page (only those the server sent). */
export function signUpDetailsOf(driver: Pick<Driver, "address" | "personalNumber" | "taxiLicenseNumber">): Partial<Pick<Driver, "address" | "personalNumber" | "taxiLicenseNumber">> {
  return {
    ...(driver.address ? { address: driver.address } : {}),
    ...(driver.personalNumber ? { personalNumber: driver.personalNumber } : {}),
    ...(driver.taxiLicenseNumber ? { taxiLicenseNumber: driver.taxiLicenseNumber } : {}),
  };
}
