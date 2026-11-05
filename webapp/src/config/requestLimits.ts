import contract from "../../../contracts/contract.json" with { type: "json" };

/**
 * Contract v0.18.24 (owner 2026-11-04 "Yes, admin setting", contract.json#rateLimit): the general write limit per
 * country, in CountryRules.limits of the country's Standard (standard-XX). The server reads it within about a minute;
 * its env value stays the floor (staging keeps its higher limits).
 */
export const REQUEST_LIMIT_FIELDS = ["writesPerUserPerMinute", "writesPerAddressPerMinute"] as const;
export type RequestLimitField = (typeof REQUEST_LIMIT_FIELDS)[number];
export type RequestLimits = Record<RequestLimitField, number>;

const SPEC = (contract as unknown as { countryLimits: { defaults: Record<string, number>; ranges: Record<string, [number, number]> } }).countryLimits;
export const REQUEST_LIMIT_DEFAULTS: RequestLimits = { writesPerUserPerMinute: SPEC.defaults.writesPerUserPerMinute!, writesPerAddressPerMinute: SPEC.defaults.writesPerAddressPerMinute! };
export const REQUEST_LIMIT_RANGES: Record<RequestLimitField, [number, number]> = { writesPerUserPerMinute: SPEC.ranges.writesPerUserPerMinute!, writesPerAddressPerMinute: SPEC.ranges.writesPerAddressPerMinute! };

export const REQUEST_LIMIT_LABEL: Record<RequestLimitField, string> = {
  writesPerUserPerMinute: "Changes per signed-in user per minute",
  writesPerAddressPerMinute: "Changes per internet address per minute (not signed in)",
};

type Doc = Record<string, unknown>;

/** The limits in a CountryRules document; a missing or out-of-range value reads as the contract default. */
export function requestLimitsOf(document: Doc | null | undefined): RequestLimits {
  const raw = ((document?.["limits"] ?? {}) as Record<string, unknown>) ?? {};
  const out = { ...REQUEST_LIMIT_DEFAULTS };
  for (const field of REQUEST_LIMIT_FIELDS) {
    const value = raw[field];
    if (requestLimitIssue(field, value) === null) out[field] = value as number;
  }
  return out;
}

/** Why a value cannot be saved (an English text for tr), or null when it can. */
export function requestLimitIssue(field: RequestLimitField, value: unknown): string | null {
  const [min, max] = REQUEST_LIMIT_RANGES[field];
  if (typeof value !== "number" || !Number.isInteger(value)) return "Enter a whole number.";
  if (value < min || value > max) return `Between ${min} and ${max}.`;
  return null;
}

/** The Standard's document with these limits; every other field and every other limit stays as the server has it. */
export function withRequestLimits(document: Doc, limits: RequestLimits): Doc {
  const current = (document["limits"] && typeof document["limits"] === "object" ? document["limits"] : {}) as Doc;
  return { ...document, limits: { ...current, ...limits } };
}
