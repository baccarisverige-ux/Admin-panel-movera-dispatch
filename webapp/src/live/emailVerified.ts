import { tr, uiLocale } from "../i18n/index.ts";
import { shortDate } from "./format.ts";

/** The badge after a live rider's / driver's e-mail: Verified (title: the date) or Not verified. */
export type EmailBadge = { tone: "ok" | "muted"; label: string; title?: string };

/**
 * G30 (contract v0.18.76, contract.json#emailVerified.apps.admin; owner 2026-11-12 Q2 "Keep, show Not verified"):
 * Verified when the server sent emailVerifiedAt (never masked, so a masked "a•••@example.com" row carries it too),
 * Not verified when it did not; nothing when there is no e-mail (absent, "—" or the "Not connected yet" placeholder).
 */
export function emailBadge(email: string | undefined, verifiedAt: string | undefined): EmailBadge | null {
  if (!email || !email.includes("@")) return null;
  if (!verifiedAt) return { tone: "muted", label: tr("Not verified") };
  return { tone: "ok", label: tr("Verified"), title: tr("E-mail verified {0}", [shortDate(verifiedAt, uiLocale())]) };
}
