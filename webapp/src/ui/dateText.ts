import type { AppLanguage } from "../i18n/languages.ts";

/**
 * FIX JOB 7 B-l (contract v0.18.30, contract.json#smallFixes.adminLabels.dates): a native date box shows the
 * BROWSER's format (mm/dd/yyyy on an English browser) even when the admin works in Swedish. Admin date boxes show
 * and take dates in the admin's language instead: sv YYYY-MM-DD, fr DD/MM/YYYY, en (en-GB) DD/MM/YYYY. The value
 * the page and the server use stays ISO YYYY-MM-DD.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The pattern shown as a hint in an empty box. */
export function datePattern(language: AppLanguage): string {
  if (language === "sv") return "ÅÅÅÅ-MM-DD";
  if (language === "fr") return "JJ/MM/AAAA";
  return "DD/MM/YYYY";
}

/** An ISO day in the admin's language format; "" for an empty or broken value. */
export function formatIsoDate(iso: string, language: AppLanguage): string {
  const match = ISO.exec(iso);
  if (!match) return "";
  const [, y, m, d] = match;
  return language === "sv" ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}

function validDay(y: number, m: number, d: number): string | null {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * What the admin typed, as an ISO day: the language format (sv YYYY-MM-DD; fr / en D/M/YYYY with / . or -), or ISO
 * in any language. "" for an empty box; null for anything that is not one real day.
 */
export function parseDateText(text: string, language: AppLanguage): string | null {
  const value = text.trim();
  if (value === "") return "";
  const iso = ISO.exec(value);
  if (iso) return validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // Doc-dates bug (2026-11-24): the phone's number pad has no separator key, so 8 digits are a whole day; year
  // first (20261105) in every language, else the language's order (sv year first, fr / en day first).
  const digits = /^(\d{8})$/.exec(value)?.[1];
  if (digits) {
    const yearFirst = validDay(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6)));
    if (language === "sv" || (yearFirst && Number(digits.slice(0, 2)) >= 19)) return yearFirst;
    return validDay(Number(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
  }
  // Year first with any separator (2026.11.05, 2026 11 05, 2026/11/5), in every language.
  const ymd = /^(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})$/.exec(value);
  if (ymd) return validDay(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  if (language === "sv") return null;
  const dmy = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(value);
  return dmy ? validDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : null;
}

/** Doc dates (2026-11-24): the calendar day of a moment in a time zone (the country's own today), YYYY-MM-DD. */
export function dayIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
