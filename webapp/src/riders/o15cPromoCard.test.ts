import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { formatMoney } from "../markets/markets.ts";
import { promoCapText, promoDealText, promoMinFareText, typedMoneyText } from "./care.ts";

/**
 * BQ-O15c (owner s06:1275-1276: the right decimals on every money display): the promotion ticket card (riders/ui.tsx)
 * and the flyer (riders/PromoFlyer.tsx) write a fixed deal, the per-ride cap and the minimum fare with the shared money
 * formatter ("50,00 kr", "12,50 €", "12,500 DT"), never "50 kr". The texts take one formatted amount, in en, sv and fr.
 */

test("O15c deal: fixed amounts in the shared formatter, SE / FR / TN; percent unchanged", () => {
  assert.equal(promoDealText({ kind: "fixed", value: 50, country: "SE" }), formatMoney(5_000, "SE"));
  assert.match(promoDealText({ kind: "fixed", value: 50, country: "SE" }), /^50,00\s*kr$/u);
  assert.equal(promoDealText({ kind: "fixed", value: 12.5, country: "FR" }), formatMoney(1_250, "FR"));
  assert.equal(promoDealText({ kind: "fixed", value: 12.5, country: "TN" }), formatMoney(12_500, "TN"));
  assert.match(promoDealText({ kind: "fixed", value: 12.5, country: "TN" }), /12[.,]500/u, "dinar keeps 3 decimals");
  assert.equal(promoDealText({ kind: "percent", value: 25, country: "SE" }), "25%");
});

test("O15c per-ride cap and minimum fare: shared formatter", () => {
  assert.equal(promoCapText({ maxPerRide: 50, country: "SE" }), typedMoneyText(50, "SE"));
  assert.equal(promoCapText({ maxPerRide: 7.5, country: "TN" }), formatMoney(7_500, "TN"));
  assert.equal(promoMinFareText({ minFare: 80, country: "FR" }), formatMoney(8_000, "FR"));
});

test("O15c texts take one formatted amount (no separate symbol) in en, sv and fr", () => {
  const keys = [
    ["{0} off your next {1} ride{2} · max {3} per ride", "{3}", "{4}"],
    [" · up to {0} per ride", "{0}", "{1}"],
    [" · min fare {0}", "{0}", "{1}"],
  ] as const;
  for (const [key, amount, symbol] of keys) {
    for (const [lang, dictionary] of Object.entries({ en, sv, fr }) as [string, Record<string, string>][]) {
      const text = dictionary[key];
      assert.ok(text, `${lang} has "${key}"`);
      assert.ok(text.includes(amount) && !text.includes(symbol), `${lang} "${key}" → "${text}"`);
    }
  }
});
