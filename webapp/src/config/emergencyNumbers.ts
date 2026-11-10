import { tr } from "../i18n/core.ts";
import type { MarketId } from "../markets/markets.ts";

/**
 * v0.18.57 §79 (contract.json#emergencyNumbers, owner 2026-11-10, Rule 0): CountryRules.emergencyNumbers of a country
 * (the country standard only). Admin › Pricing › Tips & limits › Emergency numbers; saved with Save tips & limits.
 * The rider and driver apps show one "Call {label} {number}" button per row; the safety case page shows the list.
 * `emergencyNumbers.test.ts` keeps the defaults equal to contract.json#configDefaults.emergencyNumbers.
 */
export const EMERGENCY_KINDS = ["police", "ambulance", "fire", "general"] as const;
export type EmergencyKind = (typeof EMERGENCY_KINDS)[number];
export type EmergencyLabel = { sv: string; fr: string; en: string };
export type EmergencyNumber = { kind: EmergencyKind; number: string; label: EmergencyLabel };
export const EMERGENCY_MAX_ROWS = 6;
export const EMERGENCY_NUMBER_PATTERN = /^\+?[0-9]{2,15}$/;
const LANGS = ["sv", "fr", "en"] as const;

const general: EmergencyNumber = { kind: "general", number: "112", label: { sv: "Nödnummer", fr: "Numéro d’urgence", en: "Emergency number" } };
export const EMERGENCY_DEFAULTS: Record<MarketId, EmergencyNumber[]> = {
  SE: [general],
  FR: [general],
  TN: [
    { kind: "police", number: "197", label: { sv: "Polis", fr: "Police", en: "Police" } },
    { kind: "ambulance", number: "190", label: { sv: "Ambulans (SAMU)", fr: "SAMU (ambulance)", en: "Ambulance (SAMU)" } },
  ],
};

export const KIND_LABEL = { police: "Police", ambulance: "Ambulance", fire: "Fire", general: "General" } as const satisfies Record<EmergencyKind, string>;

const copy = (rows: EmergencyNumber[]) => rows.map((row) => ({ ...row, label: { ...row.label } }));
export const emergencyDefaults = (country: MarketId): EmergencyNumber[] => copy(EMERGENCY_DEFAULTS[country] ?? [general]);

/** A stored list (or nothing) as rows; anything not a list of rows reads as the country default. Rows are kept as stored for the checks. */
export function emergencyNumbersOf(raw: unknown, country: MarketId): EmergencyNumber[] {
  if (!Array.isArray(raw) || raw.length === 0) return emergencyDefaults(country);
  return raw.map((item) => {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = (r["label"] && typeof r["label"] === "object" ? r["label"] : {}) as Record<string, unknown>;
    const text = (lang: (typeof LANGS)[number]) => (typeof label[lang] === "string" ? (label[lang] as string) : "");
    return { kind: (EMERGENCY_KINDS as readonly unknown[]).includes(r["kind"]) ? (r["kind"] as EmergencyKind) : "general", number: typeof r["number"] === "string" ? r["number"] : "", label: { sv: text("sv"), fr: text("fr"), en: text("en") } };
  });
}

/** What is wrong with the list (the server answers 400 invalid_emergency_numbers for the same). */
export function emergencyNumbersIssues(name: string, rows: EmergencyNumber[]): string[] {
  if (rows.length < 1) return [tr("{0}: keep at least one emergency number.", [name])];
  if (rows.length > EMERGENCY_MAX_ROWS) return [tr("{0}: at most 6 emergency numbers.", [name])];
  for (const [index, row] of rows.entries()) {
    if (!EMERGENCY_NUMBER_PATTERN.test(row.number)) return [tr("{0}: emergency number {1} must be 2 to 15 digits (a + first is allowed).", [name, index + 1])];
    if (LANGS.some((lang) => !row.label[lang].trim() || row.label[lang].length > 40)) return [tr("{0}: emergency number {1} needs a name in Swedish, French and English (1 to 40 characters).", [name, index + 1])];
  }
  return [];
}

/** The row label in the admin's language (sv / fr / en). */
export function emergencyLabel(row: EmergencyNumber, language: string): string {
  const lang = (LANGS as readonly string[]).includes(language) ? (language as (typeof LANGS)[number]) : "en";
  return row.label[lang] || row.label.en;
}

const listText = (rows: EmergencyNumber[]) => rows.map((row) => `${row.label.en} ${row.number}`).join(", ");
export function emergencyNumbersLines(before: EmergencyNumber[], after: EmergencyNumber[]): string[] {
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [tr("Emergency numbers: {0} → {1}", [listText(before), listText(after)])];
}
