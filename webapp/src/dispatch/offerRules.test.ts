import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import { dispatchDocumentOf, rulesOfDispatch } from "../live/configDocs.ts";
import { numberInputError } from "../pricing/numberInput.ts";
import { AUTO_OFFLINE_COUNTS, AUTO_OFFLINE_DEFAULT, autoOfflineText, CANCEL_AFTER_ARRIVED_DEFAULT, cancelAfterArrivedText, PICKUP_MOVE_DEFAULT, PICKUP_MOVE_RANGE, pickupMoveField, RAISE_FACTOR_RANGE, RAISE_FACTOR_STEP, RAISE_MAX_FACTOR_DEFAULT, raiseFactorField, raiseFactorLabel, RIDER_RATING_DEFAULT, validPickupMove, validRaiseFactor } from "./offerRules.ts";
import { defaultZone, emptyDispatchBook, rulesFile, zoneIssues } from "./rules.ts";

/**
 * Driver group 4, admin parts (contract v0.18.6, Rules decisions/driver-g4.md): E4 rider raise limit per zone, decision 3
 * rider rating switch per zone, E2/E3 auto-offline limit 10 with hand-sent offers counting, E7 no "why you" reasons.
 */

const zone = () => defaultZone({ id: "Z001", kind: "operating" });
const NOW = "2026-10-31T10:00:00Z";

test("G4-E4: the rider raise limit is 2× by default, from 1× to 3×, as the contract says", () => {
  assert.equal(RAISE_MAX_FACTOR_DEFAULT, 2);
  assert.deepEqual(RAISE_FACTOR_RANGE, [1, 3]);
  assert.equal(contract.configDefaults.raiseMaxFactor, RAISE_MAX_FACTOR_DEFAULT);
  assert.equal(zone().raisePrice.maxFactor, 2);
  assert.equal(validRaiseFactor(1.5), 1.5);
  for (const bad of [0.9, 3.1, Number.NaN, "2", null]) assert.equal(validRaiseFactor(bad), null, String(bad));
  assert.equal(raiseFactorLabel(2), "2×");
  assert.equal(raiseFactorLabel(1.5), "1.5×");
});

test("G4-E4: a limit outside 1–3 stops the publish (the server answers invalid_document)", () => {
  assert.deepEqual(zoneIssues(zone()).filter((line) => line.startsWith("Rider raise limit")), []);
  for (const maxFactor of [0.5, 3.5]) {
    assert.ok(zoneIssues({ ...zone(), raisePrice: { maxFactor } }).includes("Rider raise limit: must be 1× to 3× the booked price."), String(maxFactor));
  }
});

test("G4-E4: the dispatch document carries raisePrice.maxFactor and reads it back from the server", () => {
  const sent = dispatchDocumentOf({ ...zone(), raisePrice: { maxFactor: 1.5 } }, "Z001", null);
  assert.deepEqual(sent["raisePrice"], { maxFactor: 1.5 });
  assert.equal(rulesOfDispatch({ ...sent }, null, zone()).raisePrice.maxFactor, 1.5);
  // A missing or out-of-range value on the server keeps the contract default.
  assert.equal(rulesOfDispatch({ raisePrice: { maxFactor: 9 } }, null, zone()).raisePrice.maxFactor, 2);
  assert.equal(rulesOfDispatch({}, null, zone()).raisePrice.maxFactor, 2);
  // FR (a Paris zone) works the same.
  const paris = dispatchDocumentOf({ ...defaultZone({ id: "FR-PC", kind: "operating" }), zoneId: "FR-PC", raisePrice: { maxFactor: 2.5 } }, "FR-PC", null);
  assert.deepEqual(paris["raisePrice"], { maxFactor: 2.5 });
});

test("G4-E4: the rider app document has the zone's raise limit (contract sample shape)", () => {
  const state = appConfigState({ now: NOW });
  const rider = riderAppConfig("Z001", state) as unknown as { raisePrice: { maxFactor: number } };
  assert.deepEqual(rider.raisePrice, { maxFactor: 2 });
  assert.deepEqual(rider.raisePrice, contract.configDefaults.dispatch.zone.raisePrice);
});

test("decision 3: Show rider rating on offers is on by default and the live switch is read from the driver document", () => {
  assert.equal(RIDER_RATING_DEFAULT, true);
  assert.equal(zone().offerCard.riderRating, true);
  const off = rulesOfDispatch(null, { offers: { offerCard: { riderRating: false } } }, zone());
  assert.equal(off.offerCard.riderRating, false);
  // The other switches stay as they were.
  assert.equal(off.offerCard.pickupAddress, true);
  const state = appConfigState({ dispatch: { ...emptyDispatchBook(), live: { Z001: off } }, now: NOW });
  const driver = driverAppConfig("Z001", state);
  assert.equal(driver.offers.offerCard.riderRating, false);
});

test("G4-E7: the driver app document and the rules file have no 'why you' reasons any more", () => {
  const driver = driverAppConfig("Z001", appConfigState({ now: NOW }));
  assert.ok(!("exclusiveReasons" in driver.offers));
  assert.ok(!("exclusiveReasons" in rulesFile(emptyDispatchBook(), "SE", "now").driverApp));
});

test("G4-E2/E3: the limit is 10 and the rule text says hand-sent offers count, in sv, fr and en", () => {
  assert.equal(AUTO_OFFLINE_DEFAULT, 10);
  assert.equal(zone().autoOffline.after, 10);
  assert.equal(driverAppConfig("Z001", appConfigState({ now: NOW })).offers.autoOffline.missedExclusive, 10);
  assert.deepEqual([...AUTO_OFFLINE_COUNTS], ["exclusive", "assigned"]);
  assert.equal(autoOfflineText(10, "en"), "The driver goes offline after 10 missed or declined Exclusive or hand-sent offers in a row (Radar does not count).");
  assert.equal(autoOfflineText(10, "sv"), "Föraren går offline efter 10 missade eller nekade Exklusiva eller manuellt skickade erbjudanden i rad (Radar räknas inte).");
  assert.equal(autoOfflineText(7, "fr"), "Le chauffeur passe hors ligne après 7 offres Exclusives ou envoyées à la main manquées ou refusées d’affilée (le Radar ne compte pas).");
  // The rules file for the backend team says the same: hand-sent offers count, offers during a trip do not.
  const glossary = rulesFile(emptyDispatchBook(), "SE", "now").glossary.autoOffline;
  assert.ok(glossary.includes("hand-sent") && glossary.includes("during a trip never count"));
});

test("G4 live fix: the Rider raise limit box carries the contract's min, max and step and refuses a value outside them before any send", () => {
  assert.deepEqual(raiseFactorField(), { min: contract.dispatch.ranges["raisePrice.maxFactor"][0], max: contract.dispatch.ranges["raisePrice.maxFactor"][1], step: RAISE_FACTOR_STEP });
  assert.deepEqual([raiseFactorField().min, raiseFactorField().max], [1, 3]);
  const card = readFileSync(new URL("./OfferSettings.tsx", import.meta.url), "utf8");
  assert.ok(card.includes("raiseFactorField()") && card.includes("min={low} max={high} step={step}"), "the card's Num field takes the contract's bounds");
  assert.ok(!card.includes("step={0.1}"), "no step written by hand");
  const field = readFileSync(new URL("../pricing/NumberField.tsx", import.meta.url), "utf8");
  for (const attribute of ["min={min}", "max={max}", "step={step}"]) assert.ok(field.includes(attribute), `the input has ${attribute}`);
  // Typed out of range: the box says so and the value is not passed on (numberInputError), like the other rule cards.
  assert.equal(numberInputError("0.5", 1, 3, "×"), "Min 1 ×.");
  assert.equal(numberInputError("4", 1, 3, "×"), "Max 3 ×.");
  assert.equal(numberInputError("2,5", 1, 3, "×"), null);
  for (const maxFactor of [0.9, 3.1]) assert.ok(zoneIssues({ ...zone(), raisePrice: { maxFactor } }).includes("Rider raise limit: must be 1× to 3× the booked price."));
});

/* ---------- Driver group 5 (contract v0.18.7, Rules decisions/driver-g5.md) ---------- */

test("G5 item 4: the pickup move limit is 200 m by default, 0–2000 in steps of 10, as the contract says; the exporter writes it", () => {
  assert.equal(PICKUP_MOVE_DEFAULT, 200);
  assert.deepEqual(PICKUP_MOVE_RANGE, [0, 2000]);
  assert.equal(contract.configDefaults.maxPickupMoveMeters, PICKUP_MOVE_DEFAULT);
  assert.deepEqual(pickupMoveField(), { min: 0, max: 2000, step: 10 });
  assert.equal(zone().pickupMove.maxMeters, 200);
  assert.equal(validPickupMove(350), 350);
  for (const bad of [-1, 2001, 12.5, Number.NaN, "200", null]) assert.equal(validPickupMove(bad), null, String(bad));
  assert.ok(zoneIssues({ ...zone(), pickupMove: { maxMeters: 2500 } }).some((issue) => issue.startsWith("Pickup move after accept: 0 to 2000 m")));
  assert.equal(driverAppConfig("Z001", appConfigState({ now: NOW })).booking.maxPickupMoveMeters, 200);
  assert.equal(riderAppConfig("FR-PC", appConfigState({ now: NOW })).booking.maxPickupMoveMeters, 200, "France too");
});

test("G5 Q2: 'Cancel after the driver arrived counts as a no-show' is on by default, with the contract's words in sv, fr and en, and goes out with the driver document", () => {
  assert.equal(CANCEL_AFTER_ARRIVED_DEFAULT, true);
  assert.equal(contract.configDefaults.cancelAfterArrivedIsNoShow, true);
  assert.equal(zone().pickupWait.cancelAfterArrivedIsNoShow, true);
  const texts = contract.pickupWaiting.servedConfig.cancelAfterArrivedIsNoShow.adminText;
  assert.equal(cancelAfterArrivedText("sv"), texts.sv);
  assert.equal(cancelAfterArrivedText("fr"), texts.fr);
  assert.equal(cancelAfterArrivedText("en"), texts.en);
  assert.ok(texts.sv !== texts.en && texts.fr !== texts.en, "three languages");
  const driver = driverAppConfig("Z001", appConfigState({ now: NOW }));
  assert.equal(driver.waiting.cancelAfterArrivedIsNoShow, true);
  assert.equal(riderAppConfig("Z001", appConfigState({ now: NOW })).waiting.cancelAfterArrivedIsNoShow, true, "the rider document carries the same switch (the server copies the driver zone's value when serving)");
});
