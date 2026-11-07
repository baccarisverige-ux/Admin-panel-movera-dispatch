/**
 * Contract 0.18.50 sync (owner decisions 2026-11-07, Rules decisions/session-2026-11-06.md): the admin texts that follow
 * the contract and the owner's answers Q2 (#490 destination texts), Q10, Q11, Q13, Q13b, Q14 and lifecycle L6.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WAITING_PARAGRAPHS } from "../content/waitingParagraphs.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { reassignHelp, reassignTarget } from "../trips/present.ts";
import { isHeldBookedRide } from "../live/tripLive.ts";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const FR = fr as Record<string, string>;
const SV = sv as Record<string, string>;
const EN = en as Record<string, string>;

test("the admin pins the contract it carries (0.18.50)", () => {
  assert.equal(C.version, "0.18.50");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("terms paragraphs 3.1–3.5 equal the contract's terms in every language (Q11 « course programmée » there too)", () => {
  for (const country of ["SE", "FR"] as const) for (const language of ["sv", "fr", "en"] as const) {
    const text: string = C.legal.defaults[country].terms.text[language];
    assert.equal(WAITING_PARAGRAPHS[country][language], text.match(/3\.1 [\s\S]*?(?=\n\n4\. )/)![0], `${country} ${language}`);
  }
});

// Owner Q11 edge (2026-11-07): words with another meaning keep « réservé » (booked at a price, reserved for women, rides booked while…).
const OTHER_MEANING = new Set([
  "Women-only rides",
  "For example 2× on a trip booked at 200: at most 400. From {0} to {1}.",
  "What the driver gets of a rider's cancel fee in this zone. Movera keeps the rest. Booked rides keep the share they were booked with.",
  "Rides booked while surge was on.",
  "Rides booked within 7 days by people who opened a message.",
  "Rides booked less than {0} before pickup skip the Home popup.",
]);

test("Q11: a booked ride is « Course programmée » in every French admin text", () => {
  const left = Object.entries(FR).filter(([key, value]) => /[Cc]ourses? réservées?/.test(value) && !OTHER_MEANING.has(key)).map(([key]) => key);
  assert.deepEqual(left, []);
  assert.equal(FR["Booked ride"], C.arrivedWaiting.rules.texts.scheduled.fr);
  assert.equal(FR["Scheduled rides"], "Courses programmées");
});

test("Q13: cash is « Payer à bord » (contract finish.paymentMethods.texts.cash) and no French text pays « dans la voiture »", () => {
  assert.equal(FR["Pay in car"], C.finish.paymentMethods.texts.cash.fr);
  assert.deepEqual(Object.entries(FR).filter(([, value]) => /Payer dans la voiture|pourboire[^.]*dans la voiture/.test(value)).map(([key]) => key), []);
  assert.match(FR["Off: a cash tip is only possible in the car, in the first 5 minutes after the trip."]!, /qu’à bord/);
});

test("Q14: the archive line (row 402) is the owner's sentence", () => {
  assert.equal(FR["{0} older entr{1} archived (more than {2} days old)."], "Archivage de {0} entrée(s) datant de plus de {2} jours.");
});

test("Q13b: the trip map legend uses the status words « Chauffeur en route vers le lieu de prise en charge »", () => {
  assert.equal(FR["Driver to pickup"], "Chauffeur en route vers le lieu de prise en charge");
  assert.ok(FR["{0} Ride {1} Driver to pickup {2} Pickup {3} Stop {4} Drop-off"]!.includes(` ${FR["Driver to pickup"]} `));
});

test("Q2 (#490): destination mode texts say every trip comes and the ones on the way are marked", () => {
  const texts = [
    "Drivers in {0} set a destination. They still get all trips; trips that bring them closer are marked “On your way”. Each part has its own switch; a part that is off has no limit.",
    "Which trips get the “On your way” mark.",
    "Trips that end near the destination are marked.",
    "A trip is marked “On your way” when its drop-off is this close to the driver's road route to the destination and the trip brings the driver closer.",
  ];
  for (const key of texts) {
    assert.equal(EN[key], key);
    assert.ok(SV[key] && FR[key], key);
  }
  for (const old of ["Which trips match a destination.", "Only trips that end near the destination."]) assert.equal(EN[old], undefined, old);
  assert.match(FR[texts[0]!]!, /« Sur votre chemin »/);
  assert.match(SV[texts[0]!]!, /”På vägen”/);
  const rules = readFileSync(new URL("../dispatch/rules/engine.ts", import.meta.url), "utf8");
  assert.ok(rules.includes("a trip is marked On your way (no trip is hidden, owner Q2) when its drop-off is within corridorKm"));
});

test("Q10: the free-change setting speaks of changes only", () => {
  for (const old of ["Free change or cancel", "Free change or cancel until, minutes before pickup"]) assert.equal(EN[old], undefined, old);
  const source = readFileSync(new URL("../dispatch/ReservationSettings.tsx", import.meta.url), "utf8");
  const row = source.split("\n").find((line) => line.includes('tr("Free change")'))!;
  assert.ok(row, "row Free change");
  assert.doesNotMatch(row, /cancel fees apply|Cancel under \(min\)/);
});

test("L6: Reassign on a held booked ride goes back to the Scheduled rides list; the driver may take it again", () => {
  assert.equal(isHeldBookedRide("accepted", "scheduled"), true);
  assert.equal(isHeldBookedRide("driver_to_pickup", "scheduled"), false);
  assert.equal(isHeldBookedRide("accepted", "live"), false);
  assert.equal(reassignTarget("accepted", "scheduled"), "requested");
  assert.equal(reassignTarget("accepted", "live"), "searching");
  assert.equal(reassignTarget("driver_to_pickup", "scheduled"), "searching");
  assert.match(reassignHelp("accepted", "scheduled"), /back in the Scheduled rides list; the driver may take it again/);
  assert.match(reassignHelp("accepted", "live"), /back to dispatch \(searching\)/);
  for (const key of ["Reassign takes this booked ride off its driver and puts it back in the Scheduled rides list; the driver may take it again.", "The booked ride is back in the Scheduled rides list; the driver may take it again."]) {
    assert.ok(SV[key] && FR[key] && EN[key], key);
  }
  const api = readFileSync(new URL("../live/liveAdminApi.ts", import.meta.url), "utf8");
  assert.ok(api.includes('next?.status === "requested") return done("The booked ride is back in the Scheduled rides list; the driver may take it again.")'));
});
