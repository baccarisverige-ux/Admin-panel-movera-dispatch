/**
 * S5 J9 (contract v0.18.84 debtModel.driverOwes.adminList + paidMovera; owner Q-S5-1a "Both", 2026-11-13 14:54 /
 * 14:59, decisions/session-2026-11-06.md:1240-1250): the admin's list of drivers who owe Movera and the "Driver paid
 * Movera" correction. Its own module: liveAdminApi.ts does not grow (Rule 25).
 * owed = what he owes Movera now (his next payout worked out now + the rest carried from payouts below 0), per currency.
 */
import { ApiError } from "../api/httpClient.ts";
import { tr } from "../i18n/index.ts";
import type { LiveClient } from "./session.ts";

export type OwingMoney = { amountMinor: number; currency: string };
/** contract OwingDriver: one driver who owes Movera, in one currency (limit null = the owes-limit is off). */
export type OwingDriver = { driverId: string; driverName?: string; zoneId?: string; country?: string; owed: OwingMoney; limit: OwingMoney | null; overLimit: boolean; lastPaidMoveraAt?: string };
export type OwingDriverList = { items: OwingDriver[]; nextCursor: string | null; total?: number };

/** One page of the list ("50 of N · Load more"). */
export const OWING_PAGE = 50;
/** contract.json#debtModel.driverOwes.reasonMax. */
export const PAID_MOVERA_REASON_MAX = 300;

/** GET /admin/drivers-owing (finance.read): largest owed first; the zone filter of the top bar; total on the first page. */
export async function readOwingDrivers(client: LiveClient, zoneParams: readonly (readonly [string, string])[], cursor: string | null): Promise<OwingDriverList> {
  const params = new URLSearchParams([["limit", String(OWING_PAGE)], ...zoneParams.map(([key, value]) => [key, value] as [string, string])]);
  if (cursor) params.set("cursor", cursor);
  const page = await client.json<OwingDriverList>(`/admin/drivers-owing?${params.toString()}`);
  return { items: Array.isArray(page?.items) ? page.items : [], nextCursor: page?.nextCursor ?? null, ...(typeof page?.total === "number" && Number.isSafeInteger(page.total) && page.total >= 0 ? { total: page.total } : {}) };
}

/**
 * The reads to refresh after "Driver paid Movera" (J9 r2, server J8b live): the owing list, and the payouts, because the
 * server settles the open payouts below 0 oldest first and marks one it covers in full as paid.
 */
export function afterPaidMoveraKeys(zoneQuery: string): readonly (readonly unknown[])[] {
  return [["live", "drivers-owing", zoneQuery], ["live", "payouts"]];
}

/** What stops the "Driver paid Movera" form before any call; null = it can be sent. */
export function paidMoveraProblem(owedMinor: number, amountMinor: number | null, reason: string): string | null {
  if (amountMinor === null || !Number.isSafeInteger(amountMinor)) return tr("Type the amount the driver paid.");
  if (amountMinor <= 0) return tr("Enter an amount above 0.");
  if (amountMinor > owedMinor) return tr("That is more than the driver owes Movera.");
  const text = reason.trim();
  if (!text) return tr("Write a reason.");
  if (text.length > PAID_MOVERA_REASON_MAX) return tr("The reason can be at most {0} characters.", [PAID_MOVERA_REASON_MAX]);
  return null;
}

/** The fresh OwingDriver the server sends with 409 owed_changed (its projection), if it is one. */
function freshOf(error: unknown): OwingDriver | null {
  if (!(error instanceof ApiError && error.status === 409 && error.reason === "owed_changed")) return null;
  const row = error.projection as OwingDriver | null | undefined;
  return row && typeof row.driverId === "string" && row.owed && typeof row.owed.amountMinor === "number" ? row : null;
}

/**
 * POST /admin/drivers/{driverId}/paid-movera { expectedOwed, amount, reason } (finance.edit, Idempotency-Key from the
 * client): expectedOwed is the owed the admin saw. ok = written, with the fresh row; 409 owed_changed = nothing written,
 * with the fresh row to check again (a second click adds nothing). Any other error is thrown (the dialog's error line).
 */
export async function payMovera(client: LiveClient, row: OwingDriver, amountMinor: number, reason: string): Promise<{ ok: boolean; row: OwingDriver }> {
  const body = { expectedOwed: { amountMinor: row.owed.amountMinor, currency: row.owed.currency }, amount: { amountMinor, currency: row.owed.currency }, reason: reason.trim() };
  try {
    return { ok: true, row: await client.post<OwingDriver>(`/admin/drivers/${encodeURIComponent(row.driverId)}/paid-movera`, body) };
  } catch (error) {
    const fresh = freshOf(error);
    if (fresh) return { ok: false, row: fresh };
    throw error;
  }
}
