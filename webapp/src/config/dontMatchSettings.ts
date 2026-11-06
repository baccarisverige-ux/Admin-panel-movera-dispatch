import { tr } from "../i18n/core.ts";

/**
 * v0.18.40 §64 (fix job 10, contract.json#blockedPairs.settings; owner G16 Q16-4): CountryRules.dontMatchAgain of a
 * country. Admin › Pricing › Tips & limits › Don't match again. The rider and driver apps show the tick
 * "Don't match me with this driver/rider again" only at atStars stars or fewer while on. Saved with Save tips & limits.
 */
export type DontMatchSettings = { on: boolean; atStars: number };
export const DONT_MATCH_DEFAULTS: DontMatchSettings = { on: true, atStars: 1 };
export const DONT_MATCH_STARS = [1, 2] as const;

const okStars = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= DONT_MATCH_STARS[0] && v <= DONT_MATCH_STARS[1];

/** A stored block (or nothing) as settings; anything missing or out of range reads as the default. */
export function dontMatchOf(raw: unknown): DontMatchSettings {
  const v = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return { on: typeof v["on"] === "boolean" ? v["on"] : DONT_MATCH_DEFAULTS.on, atStars: okStars(v["atStars"]) ? v["atStars"] : DONT_MATCH_DEFAULTS.atStars };
}

export function dontMatchIssues(name: string, s: DontMatchSettings): string[] {
  return okStars(s.atStars) ? [] : [tr("{0}: \"Don't match again\" can be offered at 1 or 2 stars.", [name])];
}

const starsText = (n: number) => (n === 1 ? tr("1 star or fewer") : tr("{0} stars or fewer", [n]));
export function dontMatchLines(before: DontMatchSettings, after: DontMatchSettings): string[] {
  const lines: string[] = [];
  if (before.on !== after.on) lines.push(tr("Don't match again: {0} → {1}", [before.on ? tr("On") : tr("Off"), after.on ? tr("On") : tr("Off")]));
  if (before.atStars !== after.atStars) lines.push(tr("Don't match again offered at: {0} → {1}", [starsText(before.atStars), starsText(after.atStars)]));
  return lines;
}
export { starsText as dontMatchStarsText };
