import assert from "node:assert/strict";
import test from "node:test";
import { DONT_MATCH_DEFAULTS, dontMatchIssues, dontMatchLines, dontMatchOf } from "./dontMatchSettings.ts";
import { PRICING_FIELDS, completeCountrySettings, defaultCountrySettings } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { blockPairCall, blockedPairsPath, pairByText, readBlockedPairs, unblockPath, type BlockedPair } from "../live/blockedPairs.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

// v0.18.40 §64 (fix job 10, owner G16 Q16-4; G15 2026-11-05 "Never told", "No, only Support"): Admin › Trips ›
// Block this pair, rider and driver pages › Blocked pairs with Undo, Pricing › Tips & limits › Don't match again.
// Rule 36: fails on main (none of these modules exist, CountryRules has no dontMatchAgain).

test("job 10: CountryRules.dontMatchAgain defaults on at 1 star; saved with Save tips & limits", () => {
  assert.deepEqual(DONT_MATCH_DEFAULTS, { on: true, atStars: 1 });
  assert.deepEqual(dontMatchOf(undefined), DONT_MATCH_DEFAULTS);
  assert.deepEqual(dontMatchOf({ on: false, atStars: 2 }), { on: false, atStars: 2 });
  assert.deepEqual(dontMatchOf({ atStars: 5 }), DONT_MATCH_DEFAULTS, "out of range reads as the default");
  assert.deepEqual(defaultCountrySettings("SE").dontMatchAgain, DONT_MATCH_DEFAULTS);
  assert.ok((PRICING_FIELDS as readonly string[]).includes("dontMatchAgain"));
  assert.deepEqual(completeCountrySettings("FR", { dontMatchAgain: { atStars: 2 } }).dontMatchAgain, { on: true, atStars: 2 });
  assert.deepEqual(dontMatchIssues("Sweden", DONT_MATCH_DEFAULTS), []);
  assert.equal(dontMatchIssues("Sweden", { on: true, atStars: 3 }).length, 1);
  assert.deepEqual(dontMatchLines(DONT_MATCH_DEFAULTS, { on: true, atStars: 2 }), ["Don't match again offered at: 1 star or fewer → 2 stars or fewer"]);
});

test("job 10: Save writes CountryRules.dontMatchAgain and keeps a stored block when the panel has none", () => {
  const input = { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 } };
  assert.equal(countryRulesOf("SE", "SEK", input, null)["dontMatchAgain"], undefined);
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, dontMatchAgain: { on: false, atStars: 1 } }, null)["dontMatchAgain"], { on: false, atStars: 1 });
  assert.deepEqual(countryRulesOf("SE", "SEK", input, { dontMatchAgain: { on: true, atStars: 2 } })["dontMatchAgain"], { on: true, atStars: 2 });
});

test("job 10: Block this pair, the pair lists and Support's undo call the server routes", async () => {
  assert.deepEqual(blockPairCall("T 1", " Rude "), { path: "/admin/trips/T%201/block-pair", body: { reason: "Rude" } });
  assert.deepEqual(blockPairCall("T1", "  "), { path: "/admin/trips/T1/block-pair", body: {} });
  assert.equal(unblockPath("bpr_1"), "/admin/blocked-pairs/bpr_1");
  assert.equal(blockedPairsPath({ riderId: "R1" }), "/admin/blocked-pairs?riderId=R1");
  assert.equal(blockedPairsPath({ driverId: "D1" }), "/admin/blocked-pairs?driverId=D1");
  const items: BlockedPair[] = [{ pairId: "bpr_1", riderId: "R1", driverId: "D1", by: "rider", at: "2026-11-06T10:00:00Z", tripId: "T1" }];
  const asked: string[] = [];
  assert.deepEqual(await readBlockedPairs(async (path) => { asked.push(path); return { items }; }, { riderId: "R1" }), items);
  assert.deepEqual(asked, ["/admin/blocked-pairs?riderId=R1"]);
  assert.equal(pairByText("rider"), "Blocked by the rider (1-star rating)");
  assert.equal(pairByText("driver"), "Blocked by the driver (1-star rating)");
  assert.equal(pairByText("admin"), "Blocked by Support");
});

test("job 10: every new admin text has sv and fr", () => {
  for (const key of ["Block this pair", "Never match this rider and driver again", "Blocked pairs", "No blocked pairs.", "Undo", "Blocked by the rider (1-star rating)", "Blocked by the driver (1-star rating)", "Blocked by Support", "Don't match again", "Offer the tick at", "Neither side is ever told. Only Support can undo a block.", "Pair blocked. Neither side is told.", "Block removed."]) {
    assert.ok((sv as Record<string, string>)[key], `sv: ${key}`);
    assert.ok((fr as Record<string, string>)[key], `fr: ${key}`);
  }
});
