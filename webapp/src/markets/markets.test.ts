import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, marketOfZone, marketZoneIds, parseZoneList, zoneGroups } from "./markets.ts";
import { allowedCountries, resolveScope } from "./scope.ts";

test("each country owns its zones and currency", () => {
  assert.equal(marketOfZone("Z001")?.id, "SE");
  assert.equal(marketOfZone("CDG")?.id, "FR");
  assert.equal(marketOfZone("TN-LM")?.id, "TN");
  const all = ["SE", "FR", "TN"].flatMap((id) => marketZoneIds(id as "SE"));
  assert.equal(new Set(all).size, all.length, "zone ids are unique across countries");
  assert.match(formatMoney(123_450, "SE"), /1\s?234,50\s?kr/);
  assert.match(formatMoney(123_450, "FR"), /1\s?234,50\s?€/);
  assert.match(formatMoney(1_234_500, "TN"), /^1 234\.500 DT$/);
  assert.deepEqual(zoneGroups("FR").map((group) => group.label), ["Grand Paris", "Airports"]);
  assert.deepEqual(parseZoneList("Z001, Z002,,Z001"), ["Z001", "Z002"]);
});

test("the top bar picks country first, then zones inside it", () => {
  const everyone = { zones: "all" as const };
  assert.equal(resolveScope(everyone, {}).country, "SE", "Sweden is the default");
  const france = resolveScope(everyone, { country: "FR" });
  assert.equal(france.country, "FR");
  assert.deepEqual(france.effective, marketZoneIds("FR"), "no zone picked means every zone in the country");
  assert.equal(resolveScope(everyone, { country: "FR", remembered: "TN" }).country, "FR", "the URL beats the remembered country");
  assert.equal(resolveScope(everyone, { remembered: "TN" }).country, "TN");
  const two = resolveScope(everyone, { country: "TN", scope: "TN-LM,TN-CAR" });
  assert.deepEqual(two.effective, ["TN-LM", "TN-CAR"]);
  assert.equal(resolveScope(everyone, { scope: "CDG" }).country, "FR", "a zone decides its country");
  assert.equal(resolveScope(everyone, { scope: "Z001,CDG" }).denied, true, "zones cannot mix countries");
});

test("agents only reach the countries and zones they are allowed", () => {
  const tunisia = { zones: "all" as const, countries: ["TN" as const] };
  assert.deepEqual(allowedCountries(tunisia), ["TN"]);
  assert.equal(resolveScope(tunisia, { country: "SE" }).country, "TN", "a forbidden country falls back to an allowed one");
  assert.equal(resolveScope(tunisia, { scope: "Z001" }).denied, true);
  const central = { zones: ["Z001", "Z002"] };
  assert.deepEqual(allowedCountries(central), ["SE"]);
  assert.deepEqual(resolveScope(central, {}).effective, ["Z001", "Z002"]);
  assert.equal(resolveScope(central, { scope: "Z003" }).denied, true);
});
