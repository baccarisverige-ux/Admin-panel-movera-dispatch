import contract from "../../../contracts/contract.json" with { type: "json" };
import { currentLanguage, trx } from "../i18n/core.ts";
import type { AppLanguage } from "../config/zoneDefaults.ts";

/**
 * Status words: ONE STATUS WORD LIST (contract v0.10.4 §20, contract.json#statusWords, owner 2026-10-28 and #16
 * "the server's words everywhere in the admin"). The admin, rider and driver apps show the same sv/fr/en word for
 * a code; the panel has no words of its own for contract codes. labels.test.ts fails when a code lacks a word.
 */
export type StatusWord = Readonly<Record<AppLanguage, string>>;
export const STATUS_WORDS = contract.statusWords.families as unknown as Readonly<Record<string, Readonly<Record<string, StatusWord>>>>;
export type StatusFamily = keyof typeof contract.statusWords.families;

/** The family whose word a bare code takes when the caller does not say (the first family that has the code). */
const FAMILY_ORDER: readonly StatusFamily[] = [
  "tripStatus", "driverAccountStatus", "driverOnlineStatus", "paymentStatus", "payoutStatus", "feeStatus",
  "documentStatus", "vehicleReviewStatus", "ticketStatus", "offerStatus", "ratingStatus", "incidentStatus",
];

/** Panel-only codes that are not contract statuses (queue, outbox, approvals, bank details); English keys of i18n. */
const OTHER_LABELS: Record<string, string> = {
  inactive: "Inactive",
  blocked: "Blocked",
  queued: "Queued",
  waiting: "Waiting",
  booked: "Booked",
  assigned: "Assigned",
  cancelled: "Cancelled",
  sent: "Sent",
  delivered: "Delivered",
  committed: "Committed",
  denied: "Denied",
  conflict: "Conflict",
  pending_approval: "Pending approval",
};

export type StatusTone = "green" | "amber" | "red" | "muted";

const STATUS_TONES: Record<string, StatusTone> = {
  completed: "green",
  captured: "green",
  active: "green",
  online: "green",
  approved: "green",
  resolved: "green",
  delivered: "green",
  committed: "green",

  draft: "muted",
  quoted: "muted",
  offline: "muted",
  inactive: "muted",
  refunded: "muted",

  requested: "amber",
  searching: "amber",
  offered: "amber",
  accepted: "amber",
  driver_to_pickup: "amber",
  arrived: "amber",
  rider_onboard: "amber",
  in_trip: "amber",
  approaching_dropoff: "amber",
  pending: "amber",
  authorized: "amber",
  going_online: "amber",
  on_hold: "amber",
  in_review: "amber",
  needed: "amber",
  expiring: "amber",
  queued: "amber",
  waiting: "amber",
  booked: "amber",
  assigned: "amber",
  sent: "amber",
  pending_approval: "amber",

  cancelled_by_rider: "red",
  cancelled_by_driver: "red",
  cancelled_by_admin: "red",
  cancelled_by_system: "red",
  no_show: "red",
  expired: "red",
  failed: "red",
  suspended: "red",
  rejected: "red",
  blocked: "red",
  missing: "muted",
  cancelled: "red",
  denied: "red",
  conflict: "red",
};

/**
 * The contract word of a status in the admin's language. Give the family when the record is not a trip
 * (a document's "expired" is "Utgånget", a trip's is "Utgången"); an unknown code is shown with spaces.
 */
export function statusLabel(code: string, family?: StatusFamily): string {
  const word = (family ? STATUS_WORDS[family]?.[code] : undefined) ?? FAMILY_ORDER.map((name) => STATUS_WORDS[name][code]).find(Boolean);
  if (word) return word[currentLanguage()] || word.en;
  return trx(OTHER_LABELS[code] ?? code.replaceAll("_", " "));
}

export function statusPresentation(code: string, family?: StatusFamily): { label: string; tone: StatusTone } | null {
  const tone = STATUS_TONES[code];
  if (!tone) return null;
  return { label: statusLabel(code, family), tone };
}

export const ACTION_REASONS = [
  "Safety review",
  "Wrong document",
  "Name does not match",
  "Blurry",
  "Expired",
  "Cut off",
  "Other",
] as const;

/** Longest private note on a driver or rider, in characters (UI-13). */
export const NOTE_MAX = 2000;
