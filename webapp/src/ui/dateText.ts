import type { AppLanguage } from "../i18n/languages.ts";

/**
 * FIX JOB 7 B-l (contract v0.18.32, contract.json#smallFixes.adminLabels.dates): a native date box shows the
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
  if (language === "sv") return null;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  return dmy ? validDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : null;
}
