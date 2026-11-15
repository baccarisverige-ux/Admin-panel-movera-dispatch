import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "../markets/markets.ts";
import { promoMessage, typedMoneyText, type PromoTicket } from "./care.ts";

/**
 * BQ-O15b (owner s06:1275-1276: the right decimals on every money display; found by the V45 builder): the promotion
 * message writes a fixed amount with the shared money formatter, in the currency's decimals and symbol, never "50 kr".
 */

type MessageTicket = Pick<PromoTicket, "title" | "kind" | "value" | "rides" | "maxPerRide" | "code" | "validTo" | "country">;
const base: MessageTicket = { title: "Welcome", kind: "fixed", value: 50, rides: 2, maxPerRide: 50, code: "CITY25", validTo: "", country: "SE" };

test("O15b fixed promotion SE: 50 kr is written 50,00 kr (shared formatter)", () => {
  const text = promoMessage(base, "sv-SE");
  assert.ok(text.includes(`${typedMoneyText(50, "SE")} off`), text);
  assert.equal(typedMoneyText(50, "SE"), formatMoney(5_000, "SE"));
  assert.ok(!/\b50 kr\b/u.test(text), `no "50 kr" without decimals: ${text}`);
});

test("O15b fixed promotion FR: 12.5 € is written 12,50 €", () => {
  const text = promoMessage({ ...base, value: 12.5, country: "FR" }, "fr-FR");
  assert.ok(text.includes(`${formatMoney(1_250, "FR")} off`), text);
  assert.ok(!text.includes("12.5 €"), text);
});

test("O15b fixed promotion TN: 12.5 DT keeps 3 decimals", () => {
  const text = promoMessage({ ...base, value: 12.5, country: "TN" }, "fr-TN");
  assert.ok(text.includes(`${formatMoney(12_500, "TN")} off`), text);
  assert.match(text, /12[.,]500/u, "dinar keeps 3 decimals");
  assert.ok(!text.includes("12.5 DT"), text);
});

test("O15b percent promotion is unchanged: 25%", () => {
  const text = promoMessage({ ...base, kind: "percent", value: 25 }, "sv-SE");
  assert.ok(text.includes("Welcome: 25% off your next 2 rides with Movera. Use code CITY25."), text);
});
