import { CURRENCIES, type CurrencyCode } from "../domain/money";
import type { CategoryPrice } from "../pricing/zonePricing";
import type { MarketId } from "../markets/markets";

/** contract PricingDocument (GET/PUT /admin/config/pricing): only the parts the live Pricing page edits are typed. */
type WireMoney = { amountMinor: number; currency: string };
export type WireCategory = {
  enabled: boolean;
  base: WireMoney;
  perKm: WireMoney;
  perMin: WireMoney;
  minimum: WireMoney;
  maximum: WireMoney;
  appFeePct: number;
  extraStopFee: WireMoney;
  stopWaitPerMin: WireMoney;
  babySeatFee: WireMoney;
  childSeatFee: WireMoney;
  waiting: { freeWaitMin: number; perMin: WireMoney; noShowAfterMin: number; noShowFee: WireMoney };
  [other: string]: unknown;
};
export type PricingDocument = { zoneId: string; currency: string; country: string; categories: Record<string, WireCategory>; [other: string]: unknown };
export type ConfigDraft<T> = { doc: string; zoneId: string; version: number; liveVersion: number; document: T; updatedAt: string; updatedBy?: string };

const exponent = (currency: string) => (currency in CURRENCIES ? CURRENCIES[currency as CurrencyCode].exponent : 2);
const major = (money: WireMoney) => money.amountMinor / 10 ** exponent(money.currency);
const minor = (value: number, currency: string): WireMoney => ({ amountMinor: Math.round(value * 10 ** exponent(currency)), currency });

export function marketOf(doc: PricingDocument): MarketId {
  return doc.country === "FR" || doc.country === "TN" ? doc.country : "SE";
}

/** The server document as the demo PriceTable's rows (major units, VAT included). */
export function pricesOf(doc: PricingDocument): Record<string, CategoryPrice> {
  const out: Record<string, CategoryPrice> = {};
  for (const [id, c] of Object.entries(doc.categories)) {
    out[id] = {
      enabled: c.enabled,
      base: major(c.base),
      perKm: major(c.perKm),
      perMin: major(c.perMin),
      freeWaitMin: c.waiting.freeWaitMin,
      waitPerMin: major(c.waiting.perMin),
      stopWaitPerMin: major(c.stopWaitPerMin),
      noShowFee: major(c.waiting.noShowFee),
      extraStopFee: major(c.extraStopFee),
      babySeatFee: major(c.babySeatFee),
      childSeatFee: major(c.childSeatFee),
      minimum: major(c.minimum),
      maximum: major(c.maximum),
      appFeePct: c.appFeePct,
    };
  }
  return out;
}

/** Writes edited rows back into the document; every field the page does not show is kept as the server sent it. */
export function withPrices(doc: PricingDocument, prices: Record<string, CategoryPrice>): PricingDocument {
  const cur = doc.currency;
  const categories: Record<string, WireCategory> = {};
  for (const [id, c] of Object.entries(doc.categories)) {
    const p = prices[id];
    if (!p) {
      categories[id] = c;
      continue;
    }
    categories[id] = {
      ...c,
      enabled: p.enabled,
      base: minor(p.base, cur),
      perKm: minor(p.perKm, cur),
      perMin: minor(p.perMin, cur),
      minimum: minor(p.minimum, cur),
      maximum: minor(p.maximum, cur),
      appFeePct: p.appFeePct,
      extraStopFee: minor(p.extraStopFee, cur),
      stopWaitPerMin: minor(p.stopWaitPerMin, cur),
      babySeatFee: minor(p.babySeatFee, cur),
      childSeatFee: minor(p.childSeatFee, cur),
      // Owner Q41: the no-show button appears when the free wait ends, so noShowAfterMin follows freeWaitMin.
      waiting: { ...c.waiting, freeWaitMin: p.freeWaitMin, noShowAfterMin: p.freeWaitMin, perMin: minor(p.waitPerMin, cur), noShowFee: minor(p.noShowFee, cur) },
    };
  }
  return { ...doc, categories };
}

/** "Economy · No-show fee: 65 → 70" lines between two row sets. */
export function priceChanges(before: Record<string, CategoryPrice>, after: Record<string, CategoryPrice>, label: (categoryId: string, field: keyof CategoryPrice) => string): string[] {
  const lines: string[] = [];
  for (const [id, next] of Object.entries(after)) {
    const prev = before[id];
    if (!prev) continue;
    for (const field of Object.keys(next) as (keyof CategoryPrice)[]) {
      if (prev[field] !== next[field]) lines.push(`${label(id, field)}: ${String(prev[field])} → ${String(next[field])}`);
    }
  }
  return lines;
}
