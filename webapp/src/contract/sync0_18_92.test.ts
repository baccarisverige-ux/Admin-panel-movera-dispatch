/**
 * Contract 0.18.92 copy (movera-contracts v0.18.92 7c3aea9 #135), taken with BQ-M24/M22 (owner 2026-11-13 23:42 UTC
 * "Movera commission is how much movera keep"): the admin's "Movera commission" row is TripProjection.moveraKeepsNow,
 * "Paid to the driver who lost the trip" is TripProjection.lostDriverPaid, payout cards show Payout.summary.
 * 0.18.89 to 0.18.91 come with it. Copied with movera-contracts scripts/sync.sh (never by hand). Rule 36.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.160)", () => {
  assert.equal(C.version, "0.18.175");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("0.18.92 commissionRow.fieldAdmin0_18_92: the admin row is moveraKeepsNow", () => {
  assert.ok(C.moneyBase.commissionRow.fieldAdmin0_18_92);
  assert.match(OPENAPI, /moveraKeepsNow/);
});

test("0.18.90/0.18.92 lostDriverPaid and 0.18.89 payoutSummary are in the copy", () => {
  assert.ok(C.moneyBase.lostDriverPaid.tripField);
  assert.match(OPENAPI, /lostDriverPaid/);
  assert.ok(C.priceDisplay.payoutSummary.texts);
});

test("the lost-driver line is the contract text in en/sv/fr", () => {
  const t = C.finish.debt.texts.lostDriverLine;
  const key = t.en as keyof typeof en;
  assert.equal(en[key], t.en);
  assert.equal((sv as Record<string, string>)[key], t.sv);
  assert.equal((fr as Record<string, string>)[key], t.fr);
});
