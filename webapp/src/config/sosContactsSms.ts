import { tr } from "../i18n/core.ts";

/**
 * BQ-V34 (contract v0.18.101 contract.json#sosContactsSms, CONTRACT.md §92; owner 2026-11-02 Q2 "Use them in SOS
 * (Recommended)", Rules decisions/driver-g14.md:12): the driver's SOS texts his emergency contacts.
 * - CountryRules.sosContactsSms (boolean) of the COUNTRY STANDARD only, like emergencyNumbers; never saved = on
 *   (configDefaults.sosContactsSms). Admin › Pricing › Tips & limits › Emergency numbers card.
 * - Incident.contactsSms { status, contacts, sent?, at }: one line on the SOS case (texts.admin, sv / fr / en).
 */
export const SOS_CONTACTS_SMS_DEFAULT = true;

export const CONTACTS_SMS_STATUSES = ["off", "no_contacts", "not_connected", "queued", "sent", "failed"] as const;
export type ContactsSmsStatus = (typeof CONTACTS_SMS_STATUSES)[number];
export type ContactsSms = { status: ContactsSmsStatus; contacts: number; sent?: number; at: string };

/** The stored switch; anything that is not true / false is the default (the server 400s such a value anyway). */
export function sosContactsSmsOf(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : SOS_CONTACTS_SMS_DEFAULT;
}

const count = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Incident.contactsSms as the server sent it; an unknown status or a bad count is nothing (no line is shown). */
export function contactsSmsOf(raw: unknown): ContactsSms | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!(CONTACTS_SMS_STATUSES as readonly unknown[]).includes(value.status) || !count(value.contacts)) return null;
  return {
    status: value.status as ContactsSmsStatus,
    contacts: value.contacts,
    ...(count(value.sent) ? { sent: value.sent } : {}),
    at: typeof value.at === "string" ? value.at : "",
  };
}

/** The SOS case line (contract texts.admin.<status>; {n} = contacts, {sent} = accepted by the SMS company). */
export function contactsSmsLine(result: ContactsSms): string {
  const vars = { n: result.contacts, sent: result.sent ?? 0 };
  switch (result.status) {
    case "off": return tr("SMS to emergency contacts: off");
    case "no_contacts": return tr("SMS to emergency contacts: the driver has none");
    case "not_connected": return tr("SMS to {n} emergency contacts: not connected (no SMS company yet)", vars);
    case "queued": return tr("SMS to {n} emergency contacts: sending", vars);
    case "sent": return tr("SMS sent to {sent} of {n} emergency contacts", vars);
    case "failed": return tr("SMS to {n} emergency contacts failed", vars);
  }
}

/** The save dialog line when the switch changes. */
export function sosContactsSmsLines(before: boolean, after: boolean): string[] {
  return before === after ? [] : [tr("SMS to the driver's emergency contacts on SOS: {0}", [tr(after ? "on" : "off")])];
}
