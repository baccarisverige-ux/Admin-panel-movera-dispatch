import { tr } from "../i18n/core.ts";

/**
 * G7 live fix: the stop price per minute from Pricing (stopWaitPerMin, per car type), as an amount: one price, or the
 * lowest to the highest when car types differ. "Price per minute: Pricing" only when Pricing has none for this zone.
 */
export function stopPriceText(rows: readonly { stopPerMin?: number }[], money: (value: number) => string): string {
  const prices = rows.map((row) => row.stopPerMin).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!prices.length) return tr("Price per minute: Pricing");
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return tr("Price per minute: {0}", [low === high ? money(low) : `${money(low)} – ${money(high)}`]);
}
