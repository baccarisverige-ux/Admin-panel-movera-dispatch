import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { FEATURE_INDEX, featureTarget, searchFeatures } from "./featureIndex.ts";

test("Q40: one list, unique ids, every row has a place to go", () => {
  const ids = FEATURE_INDEX.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of FEATURE_INDEX) {
    const target = featureTarget(entry, "Z001");
    assert.ok(target.startsWith("/"), entry.id);
    assert.ok(entry.phrase.length > 3 && entry.phrase.length <= 60, `${entry.id} is a short phrase`);
  }
});

test("Q40: a Dispatch row opens its tab in a zone and names the card", () => {
  const stops = FEATURE_INDEX.find((entry) => entry.id === "stops")!;
  assert.equal(featureTarget(stops, "Z001"), "/dispatch?tab=rides&zone=Z001&card=Stops");
  const activity = FEATURE_INDEX.find((entry) => entry.id === "my-activity")!;
  assert.equal(featureTarget(activity, "Z001"), "/dispatch?view=activity");
  assert.equal(featureTarget(FEATURE_INDEX.find((entry) => entry.id === "refund-second-admin")!, ""), "/settings#refunds");
});

test("Q40: every Dispatch card named in the list exists, so a click lands on it", () => {
  const dir = new URL("./", import.meta.url).pathname;
  const sources = readdirSync(dir).filter((name) => name.endsWith(".tsx")).map((name) => readFileSync(`${dir}${name}`, "utf8")).join("\n");
  for (const entry of FEATURE_INDEX) {
    if ("path" in entry || !entry.dispatch.card) continue;
    // The card titles are translated (round 4): the English text is the key of tr().
    assert.ok(sources.includes(`Card title={tr(${JSON.stringify(entry.dispatch.card)})}`), `${entry.id}: card "${entry.dispatch.card}" exists`);
  }
});

test("Q40: the search box matches phrase, section and keywords, every word", () => {
  assert.ok(searchFeatures("max stops").some((entry) => entry.id === "stops"));
  assert.ok(searchFeatures("surge").some((entry) => entry.id === "surge"));
  assert.ok(searchFeatures("second admin").some((entry) => entry.id === "refund-second-admin"));
  assert.equal(searchFeatures("zzzz-nothing").length, 0);
  assert.equal(searchFeatures("").length, FEATURE_INDEX.length);
});

test("Round 2: every new per-country and zone setting is in All features and opens its section", () => {
  const target = (id: string) => featureTarget(FEATURE_INDEX.find((entry) => entry.id === id)!, "Z001");
  assert.equal(target("tips"), "/pricing?tab=extras&section=tips");
  assert.equal(target("raise-steps"), "/pricing?tab=extras&section=raise-steps");
  assert.equal(target("promo-cap"), "/pricing?tab=extras&section=promo-cap");
  assert.equal(target("driver-bonus-limit"), "/pricing?tab=extras&section=driver-bonus");
  assert.equal(target("payment-methods"), "/settings#country-apps");
  assert.equal(target("languages"), "/settings#country-apps");
  assert.equal(target("pickup-move"), "/dispatch?tab=rides&zone=Z001&card=Pickup+move+after+accept");
  assert.equal(target("no-show-share"), "/dispatch?tab=rides&zone=Z001&card=Waiting+at+pickup");
  assert.equal(target("waiting-per-category"), "/pricing?tab=prices");
  assert.ok(searchFeatures("missed exclusive").some((entry) => entry.id === "auto-offline"));
  assert.ok(searchFeatures("apple pay").some((entry) => entry.id === "payment-methods"));
  assert.ok(searchFeatures("promo cap").some((entry) => entry.id === "promo-cap"));
  // The Pricing sections the rows open exist in the Tips & limits tab.
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  for (const id of ["tips", "raise-steps", "promo-cap", "driver-bonus"]) assert.ok(panel.includes(`id="extras-${id}"`), `section ${id} exists`);
});
