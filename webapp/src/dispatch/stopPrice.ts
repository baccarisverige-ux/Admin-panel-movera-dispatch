import { tr } from "../i18n/core.ts";
import { riderPerMinMinor } from "../pricing/waitingShown.ts";

/**
 * G7 live fix: the stop price per minute from Pricing (stopWaitPerMin, per car type), as an amount: one price, or the
 * lowest to the highest when car types differ. "Price per minute: Pricing" only when Pricing has none for this zone.
 */
export function stopPriceText(rows: readonly { stopPerMin?: number; appFeePct?: number }[], money: (value: number) => string, minorUnits = 100): string {
  const priced = rows.filter((row): row is { stopPerMin: number; appFeePct?: number } => typeof row.stopPerMin === "number" && Number.isFinite(row.stopPerMin));
  if (!priced.length) return tr("Price per minute: Pricing");
  const span = (values: number[]) => {
    const low = Math.min(...values);
    const high = Math.max(...values);
    return low === high ? money(low) : `${money(low)} – ${money(high)}`;
  };
  const driver = tr("Price per minute: {0}", [span(priced.map((row) => row.stopPerMin))]);
  // A1 (v0.18.85 waitingPriceShown, owner 2026-11-02 driver-g6.md:96): the rider pays it with the app fee, half-up to
  // the market's minor unit (minorUnits: 100, TND 1000) like the server.
  if (!priced.every((row) => typeof row.appFeePct === "number" && Number.isFinite(row.appFeePct))) return driver;
  const rider = priced.map((row) => riderPerMinMinor(Math.round(row.stopPerMin * minorUnits), row.appFeePct!) / minorUnits);
  return tr("{0} · rider pays {1} (incl. app fee)", [driver, span(rider)]);
}

/** A1 (owner 2026-11-02 driver-g6.md:96 "Show price incl. fee"): the driver's price and what the rider pays with the app fee. */
export function waitPerMinCell(row: { base: { perMin: number }; appFeePct?: number; minorUnits?: number }, money: (value: number) => string): string {
  if (typeof row.appFeePct !== "number" || !Number.isFinite(row.appFeePct)) return money(row.base.perMin);
  const units = row.minorUnits ?? 100;
  return tr("{0} · rider pays {1}", [money(row.base.perMin), money(riderPerMinMinor(Math.round(row.base.perMin * units), row.appFeePct) / units)]);
}
