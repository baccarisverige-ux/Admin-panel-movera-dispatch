import type { DocStatus } from "../drivers/gate.ts";
import { statusLabel } from "../domain/labels.ts";
import { tr } from "../i18n/core.ts";

/** Colour a document shows: green valid, orange expiring soon, red missing / wrong / expired, blue waiting review. */
export type DocHealth = "valid" | "expiring" | "invalid" | "review";

/** Used when no country rule is known. Each country sets its own first warning in Drivers › Onboarding › Steps and papers. */
export const EXPIRY_WARNING_DAYS = 30;

export type DocState = { status: DocStatus; expiresAt: string };

/** The document states an admin can set; the words are the contract's (contract.json#statusWords.documentStatus). */
export const DOC_CHOICES: { status: DocStatus; readonly label: string }[] = (["approved", "expiring", "rejected", "needed", "in_review", "expired"] as const)
  .map((status) => ({ status, get label() { return statusLabel(status, "documentStatus"); } }));

const DAY = 86_400_000;

export function daysUntil(date: string, nowMs: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.floor((Date.parse(`${date}T23:59:59Z`) - nowMs) / DAY);
}

/**
 * The colour follows the chosen status, and the expiry date can only make it worse. warnDays: the country's first
 * expiry warning; from then the document shows orange.
 */
export function docHealth(doc: DocState, nowMs: number, warnDays = EXPIRY_WARNING_DAYS): { health: DocHealth; label: string } {
  const days = daysUntil(doc.expiresAt, nowMs);
  const word = (status: DocStatus) => statusLabel(status, "documentStatus");
  if (doc.status === "needed") return { health: "invalid", label: word("needed") };
  if (doc.status === "rejected") return { health: "invalid", label: word("rejected") };
  if (doc.status === "expired" || (days !== null && days < 0)) return { health: "invalid", label: word("expired") };
  if (doc.status === "in_review") return { health: "review", label: word("in_review") };
  if (doc.status === "expiring" || (days !== null && days <= warnDays)) {
    return { health: "expiring", label: days === null ? word("expiring") : days === 1 ? tr("Expires in 1 day") : tr("Expires in {0} days", [days]) };
  }
  return { health: "valid", label: word("approved") };
}

export type HealthCount = Record<DocHealth, number>;

export function countHealth(docs: readonly DocState[], nowMs: number, warnDays = EXPIRY_WARNING_DAYS): HealthCount {
  const counts: HealthCount = { valid: 0, expiring: 0, invalid: 0, review: 0 };
  for (const doc of docs) counts[docHealth(doc, nowMs, warnDays).health] += 1;
  return counts;
}

/** Worst colour across a set of documents. */
export function overallHealth(counts: HealthCount): DocHealth {
  if (counts.invalid) return "invalid";
  if (counts.expiring) return "expiring";
  if (counts.review) return "review";
  return "valid";
}

export const DRIVER_DOC_LABELS: Record<string, string> = {
  terms: "Terms accepted",
  virtual_session: "Training session",
  driver_license: "Driving licence",
  profile_photo: "Profile photo",
  company_registration: "Company registration",
  taxi_driver_license: "Taxi driver licence",
  taxi_traffic_permit: "Taxi traffic permit",
  tax_settings: "Tax settings",
  bank_statement: "Bank statement",
  vehicle_registration: "Vehicle registration",
  vehicle_insurance: "Vehicle insurance",
  operator_license: "Operator licence",
  owner_id: "Owner ID",
  fleet_insurance: "Fleet insurance",
};

export function docLabel(id: string): string {
  return DRIVER_DOC_LABELS[id] ?? id.replaceAll("_", " ");
}
