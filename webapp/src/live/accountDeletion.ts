/**
 * contract v0.18.134 (contract.json#accountDeletion; owner button 2026-11-20 "Accept, keep debt (Rec.)", Rules
 * decisions/session-2026-11-06.md): Riders › "Account deletion requests", the server's list (read only, riders.read,
 * never a phone number), and the country setting CountryRules.accountDeletion on the Standard: eraseEnabled (off by
 * default = the server only counts, nothing is erased) and eraseAfterDays (30..365). Own module (Rule 25).
 * The server part WAITS FOR THE NEW SERVER: an older server answers 404 and the panel says it is not there yet.
 */
import { tr } from "../i18n/index.ts";
import { readDraft, savePublish, type ConfigHttp } from "./configDocs.ts";

export type DeletionMoney = { amountMinor: number; currency: string };
export type DeletionRequest = {
  accountKind: "rider" | "driver";
  accountId: string;
  firstName?: string;
  requestedAt: string;
  eraseDueAt: string;
  status: "requested" | "waiting" | "erased";
  waitingReason?: "erase_off" | "open_trip" | "open_safety_case" | undefined;
  debt?: { amount: DeletionMoney; settled: boolean };
  erasedAt?: string;
};
export type DeletionRequestPage = { items: DeletionRequest[]; dueNow: number };
export type DeletionSetting = { eraseEnabled: boolean; eraseAfterDays: number };

/** contract.json#configDefaults.accountDeletion. */
export const DELETION_DEFAULT: DeletionSetting = { eraseEnabled: false, eraseAfterDays: 30 };
export const ERASE_DAYS_MIN = 30;
export const ERASE_DAYS_MAX = 365;

/** GET /admin/deletion-requests: newest first, at most 200, with the dry-run count. */
export async function readDeletionRequests(client: { json: <T>(path: string) => Promise<T> }): Promise<DeletionRequestPage> {
  const page = await client.json<Partial<DeletionRequestPage> | null>("/admin/deletion-requests");
  const items = Array.isArray(page?.items) ? page.items.filter((x) => x && typeof x.accountId === "string") : [];
  const dueNow = typeof page?.dueNow === "number" && Number.isSafeInteger(page.dueNow) && page.dueNow >= 0 ? page.dueNow : 0;
  return { items, dueNow };
}

export function statusText(row: DeletionRequest): string {
  if (row.status === "erased") return tr("Erased");
  if (row.status === "requested") return tr("Requested");
  if (row.waitingReason === "erase_off") return tr("Waiting: erasing is off (count only)");
  if (row.waitingReason === "open_trip") return tr("Waiting: open trip");
  if (row.waitingReason === "open_safety_case") return tr("Waiting: open safety case");
  return tr("Waiting: next run");
}

/** CountryRules.accountDeletion of a stored document, else the contract default. */
export function deletionSettingOf(document: unknown): DeletionSetting {
  const set = (document && typeof document === "object" ? (document as { accountDeletion?: Partial<DeletionSetting> }).accountDeletion : undefined) ?? {};
  const days = typeof set.eraseAfterDays === "number" && deletionSettingProblem(set.eraseAfterDays) === null ? set.eraseAfterDays : DELETION_DEFAULT.eraseAfterDays;
  return { eraseEnabled: set.eraseEnabled === true, eraseAfterDays: days };
}

export function deletionSettingProblem(days: number): string | null {
  if (!Number.isInteger(days) || days < ERASE_DAYS_MIN || days > ERASE_DAYS_MAX) return tr("Erase after must be whole days from {0} to {1}.", [ERASE_DAYS_MIN, ERASE_DAYS_MAX]);
  return null;
}

/** The Standard's document with only accountDeletion changed (every other key kept as stored). */
export function withDeletionSetting(document: Record<string, unknown>, setting: DeletionSetting): Record<string, unknown> {
  return { ...structuredClone(document), accountDeletion: { eraseEnabled: setting.eraseEnabled, eraseAfterDays: setting.eraseAfterDays } };
}

/** Saves and publishes CountryRules.accountDeletion on the country's Standard (settings.edit on the server). */
export async function saveDeletionSetting(http: ConfigHttp, country: string, setting: DeletionSetting): Promise<void> {
  const problem = deletionSettingProblem(setting.eraseAfterDays);
  if (problem) throw new Error(problem);
  const id = `standard-${country}`;
  const draft = await readDraft(http, "country_rules", id);
  const base = (draft?.document ?? { country }) as Record<string, unknown>;
  await savePublish(http, "country_rules", id, draft, withDeletionSetting(base, setting), "Account deletion setting");
}
