import { market, type MarketId } from "../markets/markets.ts";

/**
 * A1 (contract v0.18.85 waitingPriceShown; owner 2026-11-02 "Show price incl. fee (Recommended)", Rules
 * decisions/driver-g6.md:96): the price of one waiting minute as the rider pays it. The fare adds the app fee on top of
 * the waiting (contract §3.5), so a minute costs perMin × (1 + appFeePct / 100), half-up to a whole minor unit — the
 * same number the server sends as terms.waitPerMinShown. The admin still types perMin (the driver's price, 100 % his).
 */
export function riderPerMinMinor(perMinMinor: number, appFeePct: number): number {
  const scale = 10_000n;
  const pct = BigInt(Math.round(appFeePct * Number(scale)));
  const n = BigInt(Math.round(perMinMinor)) * (100n * scale + pct);
  const d = 100n * scale;
  // floor(n / d + 1/2): a tie goes up (contract.json#pricing.halfUp).
  const twice = 2n * n + d;
  const den = 2n * d;
  const q = twice / den;
  return Number(twice % den < 0n ? q - 1n : q);
}

/** The same in major units (12.26 kr -> 13.49 kr) for a market's prices as the Pricing page holds them. */
export function riderPerMin(perMin: number, appFeePct: number, id: MarketId): number {
  const units = market(id).minorUnits;
  return riderPerMinMinor(Math.round(perMin * units), appFeePct) / units;
}
