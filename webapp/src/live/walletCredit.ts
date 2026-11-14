import { parseMinor } from "./format.ts";

/**
 * BQ-A30b: the amount an admin types in Rider › Movera wallet ("Add money to wallet") in the rider currency's minor
 * units (SEK öre ×100, TND millimes ×1000), or null when it cannot be sent. More decimals than the currency has,
 * "1e3", a sign, zero or text are refused, never rounded (parseMinor, the one converter). Pure, so node --test covers it.
 */
export function walletCreditMinor(amount: string, currency: string): number | null {
  const minor = parseMinor(amount, currency);
  return minor !== null && minor > 0 ? minor : null;
}
