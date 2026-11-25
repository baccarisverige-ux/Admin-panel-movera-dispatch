import { ApiError } from "../api/httpClient.ts";
import type { CommandInput } from "../api/create.ts";
import { tr } from "../i18n/index.ts";
import type { LiveClient } from "./session.ts";
import type { Driver } from "./types.ts";

/**
 * v0.18.162 (contract.json#driverCountryFirst.adminSet; owner 2026-11-25 "Yes"): admin.driver.country reads the
 * driver's version and sends POST /admin/drivers/{id}/country { expectedVersion, country, reason } (the reason is kept
 * in the audit, driver.country). Nothing is sent without a country or a reason. Split out of liveAdminApi.ts (Rule 25).
 */
export async function setDriverCountry(client: LiveClient, input: CommandInput, explained: (error: unknown) => never): Promise<Driver | undefined> {
  const country = String(((input.value ?? {}) as { country?: unknown }).country ?? "");
  const reason = (input.reason ?? "").trim();
  if (!/^[A-Z]{2}$/.test(country)) throw new ApiError(400, tr("Choose a country."), { code: "invalid_request", retryable: false });
  if (!reason) throw new ApiError(400, tr("Write a reason."), { code: "invalid_request", reason: "reason_required", retryable: false });
  const driver = await client.json<Driver>(`/admin/drivers/${encodeURIComponent(input.targetId)}`);
  return client.post<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/country`, { expectedVersion: driver.version, country, reason: reason.slice(0, 500) }).catch(explained);
}
