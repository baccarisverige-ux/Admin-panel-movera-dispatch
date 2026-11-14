import { parseMinor } from "./format.ts";

/**
 * BQ-A30b: the amount an admin types in Rider › Movera wallet ("Add money to wallet") in the rider currency's minor
 * units (SEK öre ×100, TND millimes ×1000), or null when it cannot be sent. More decimals than the currency has,
 * "1e3", a sign, zero or text are refused, never rounded (parseMinor, the one converter). SF1: no known rider currency
 * → null, never "SEK" (the same rule as S2 for booked rides). Pure, so node --test covers it.
 */
export function walletCreditMinor(amount: string, currency: string | null): number | null {
  if (currency === null) return null;
  const minor = parseMinor(amount, currency);
  return minor !== null && minor > 0 ? minor : null;
}

/** Why the wallet button is off (English key, the box translates it), or null when the amount can be sent. */
export function walletCreditProblem(amount: string, currency: string | null): "The rider's currency is not known." | "Enter an amount above 0." | null {
  if (currency === null) return "The rider's currency is not known.";
  return walletCreditMinor(amount, currency) === null ? "Enter an amount above 0." : null;
}
