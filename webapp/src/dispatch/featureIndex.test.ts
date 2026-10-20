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
    assert.ok(sources.includes(`Card title="${entry.dispatch.card}"`), `${entry.id}: card "${entry.dispatch.card}" exists`);
  }
});

test("Q40: the search box matches phrase, section and keywords, every word", () => {
  assert.ok(searchFeatures("max stops").some((entry) => entry.id === "stops"));
  assert.ok(searchFeatures("surge").some((entry) => entry.id === "surge"));
  assert.ok(searchFeatures("second admin").some((entry) => entry.id === "refund-second-admin"));
  assert.equal(searchFeatures("zzzz-nothing").length, 0);
  assert.equal(searchFeatures("").length, FEATURE_INDEX.length);
});
