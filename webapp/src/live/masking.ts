/**
 * Step 36 (contract v0.18.54 §76, contract.json#adminMasking; owner 2026-11-09 Q40 yes, Q41 yes): the server masks a
 * rider's / driver's phone, e-mail and date of birth (and a fleet's owner e-mail) for an admin without the matching
 * viewSensitive right. Masked shapes: phone = country code + one "•" per hidden digit + the last 2 digits
 * ("+46•••••12", not E.164); e-mail = first character + "•••@" + domain ("a•••@example.com"); date of birth = the
 * year only ("1990"). Built BEFORE the server masks (expand-then-contract): every helper accepts both shapes, so the
 * panel works with full and masked values alike. Demo mode never sees a masked value.
 */

const MASK = "•";

/** True for the server's masked phone ("+46•••••12"); false for an E.164 number or an empty string. */
export function isMaskedPhone(value: string | null | undefined): boolean {
  return typeof value === "string" && value.includes(MASK);
}

/** True for the server's masked e-mail ("a•••@example.com"); false for a real address or an empty string. */
export function isMaskedEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && value.includes(MASK);
}

/** True for a year-only date of birth ("1990"), the masked shape; false for YYYY-MM-DD or an empty string. */
export function isYearOnlyDate(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{4}$/.test(value.trim());
}

/** The tel: link for a phone, or null when the number is masked (a masked phone is shown as text, never dialled). */
export function phoneHref(value: string | null | undefined): string | null {
  if (!value || isMaskedPhone(value)) return null;
  const digits = value.replace(/[^+\d]/g, "");
  return digits.length ? `tel:${digits}` : null;
}

/**
 * The text of a date of birth: a year-only value shows the year as sent; a full date is formatted for the admin's
 * locale; anything else (empty, unparsable) is the dash so no page ever prints "Invalid Date" or NaN.
 */
export function dateOfBirthText(value: string | null | undefined, locale: string, dash = "—"): string {
  if (!value) return dash;
  const trimmed = value.trim();
  if (isYearOnlyDate(trimmed)) return trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return dash;
  const at = Date.parse(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(at)) return dash;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(at);
}

/** The age in whole years from a full date of birth; null for a year-only (masked) value, so no page shows a wrong age. */
export function ageFromDateOfBirth(value: string | null | undefined, now: number): number | null {
  if (!value || isYearOnlyDate(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const [year, month, day] = value.trim().split("-").map(Number);
  const today = new Date(now);
  let age = today.getUTCFullYear() - year!;
  if (today.getUTCMonth() + 1 < month! || (today.getUTCMonth() + 1 === month! && today.getUTCDate() < day!)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export type RevealKind = "rider" | "driver" | "fleet";

/** POST /admin/{riders|drivers|fleets}/{id}/reveal { reason } (§76): the full values, once, audited with the reason. */
export function revealPath(kind: RevealKind, id: string): string {
  const list = kind === "rider" ? "riders" : kind === "driver" ? "drivers" : "fleets";
  return `/admin/${list}/${encodeURIComponent(id)}/reveal`;
}

/** The union of the three reveal answers (RevealedRider / RevealedDriver / RevealedFleet). */
export type Revealed = { phone?: string | null; email?: string | null; dateOfBirth?: string | null; ownerEmail?: string | null; revealedAt: string };

export const REVEAL_REASON_MIN = 3;
export const REVEAL_REASON_MAX = 200;

/** §76: reason 3–200 characters after trimming, else the server answers 400 reason_required; the dialog waits. */
export function revealReasonOk(reason: string): boolean {
  const length = reason.trim().length;
  return length >= REVEAL_REASON_MIN && length <= REVEAL_REASON_MAX;
}

/** POST /admin/incidents/{incidentId}/reveal-contacts { reason? } (§76, owner Q41): both phones of an OPEN case. */
export function incidentRevealPath(incidentId: string): string {
  return `/admin/incidents/${encodeURIComponent(incidentId)}/reveal-contacts`;
}

export type RevealedIncidentContacts = { incidentId: string; rider: { phone: string | null } | null; driver: { phone: string | null } | null; revealedAt: string };

/** §76: the SOS reveal works only while the case is open (status open or investigating); else 409 incident_closed. */
export function incidentRevealAllowed(status: string | null | undefined): boolean {
  return status === "open" || status === "investigating";
}
