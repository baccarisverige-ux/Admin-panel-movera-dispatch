import assert from "node:assert/strict";
import test from "node:test";
import { emptyDispatchBook, normalizeDispatchBook, type RadarZone, type RadarZoneRule } from "./rules.ts";
import {
  blankRadarRule, blankRadarZone, driversInRadarZone, pointInRing, radarRuleError, radarRuleFor, radarZoneError, radarZonesOf,
  withoutRadarRule, withoutRadarZone, withRadarRule, withRadarZone,
} from "./radarZones.ts";

// A square over Södermalm and a bigger one over the city centre that contains it: radar zones may overlap.
const soder: [number, number][] = [[59.31, 18.05], [59.31, 18.09], [59.33, 18.09], [59.33, 18.05]];
const city: [number, number][] = [[59.30, 18.02], [59.30, 18.12], [59.36, 18.12], [59.36, 18.02]];

function zone(id: string, name: string, ring: [number, number][]): RadarZone {
  return { ...blankRadarZone("SE", "Z001", id, "2026-10-21T10:00:00Z"), name, ring };
}

test("a point is inside its radar zone, and radar zones may overlap", () => {
  assert.ok(pointInRing([59.32, 18.07], soder));
  assert.ok(pointInRing([59.32, 18.07], city), "the same point is in the bigger zone too");
  assert.ok(!pointInRing([59.35, 18.03], soder));
  assert.ok(!pointInRing([59.32, 18.07], []), "no ring, nobody inside");
  const drivers = [{ id: "a", lat: 59.32, lng: 18.07 }, { id: "b", lat: 59.35, lng: 18.03 }, { id: "c", lat: 59.5, lng: 18.0 }];
  assert.deepEqual(driversInRadarZone(zone("R1", "Södermalm", soder), drivers).map((item) => item.id), ["a"]);
  assert.deepEqual(driversInRadarZone(zone("R2", "City", city), drivers).map((item) => item.id), ["a", "b"]);
});

test("radar zones are saved to the book like driver groups, listed per market zone, and removed cleanly", () => {
  let book = emptyDispatchBook();
  book = withRadarZone(book, zone("R1", " Södermalm ", soder));
  book = withRadarZone(book, zone("R2", "City", city));
  book = withRadarZone(book, { ...zone("R3", "Arlanda", city), zoneId: "Z002" });
  assert.equal(book.draftRev, 4);
  assert.deepEqual(radarZonesOf(book, "Z001").map((item) => item.name), ["Södermalm", "City"], "trimmed and per zone");
  book = withRadarZone(book, { ...zone("R1", "Söder", soder) });
  assert.equal(radarZonesOf(book, "Z001")[0].name, "Söder", "saving again changes it in place");
  const rule: RadarZoneRule = { ...blankRadarRule("SE", "RR1"), name: "Tight", radarZoneIds: ["R1", "R2"] };
  book = withRadarRule(book, rule);
  book = withoutRadarZone(book, "R1");
  assert.deepEqual(radarZonesOf(book, "Z001").map((item) => item.id), ["R2"]);
  assert.deepEqual(book.radarZoneRules[0].radarZoneIds, ["R2"], "a removed zone leaves the rules that named it");
  assert.equal(normalizeDispatchBook(JSON.parse(JSON.stringify(book))).radarZones.length, 2, "it survives a save");
  assert.deepEqual(normalizeDispatchBook({}).radarZones, [], "older saves have none");
});

test("a rule naming the radar zone wins over the rule for all radar zones; no rule means the zone's normal radar", () => {
  let book = emptyDispatchBook();
  book = withRadarZone(book, zone("R1", "Söder", soder));
  book = withRadarZone(book, zone("R2", "City", city));
  assert.equal(radarRuleFor(book, "R1", "SE"), null);
  book = withRadarRule(book, { ...blankRadarRule("SE", "ALL"), name: "Everywhere", radarZoneIds: "all", seconds: 30, maxDrivers: 8 });
  assert.equal(radarRuleFor(book, "R1", "SE")?.id, "ALL");
  book = withRadarRule(book, { ...blankRadarRule("SE", "ONE"), name: "Söder only", radarZoneIds: ["R1"], seconds: 15, maxDrivers: 4 });
  assert.equal(radarRuleFor(book, "R1", "SE")?.id, "ONE", "the specific rule wins");
  assert.equal(radarRuleFor(book, "R2", "SE")?.id, "ALL", "the other zone keeps the default");
  assert.equal(radarRuleFor(book, "R1", "FR"), null, "rules are per country");
  book = withoutRadarRule(book, "ONE");
  assert.equal(radarRuleFor(book, "R1", "SE")?.id, "ALL");
});

test("a radar zone and a rule say what is missing before they can be saved", () => {
  const others = [zone("R1", "Söder", soder)];
  assert.equal(radarZoneError(zone("R2", "", soder), others), "Give the radar zone a name.");
  assert.equal(radarZoneError(zone("R2", "City", []), others), "Draw the radar zone on the map.");
  assert.equal(radarZoneError(zone("R2", "söder", city), others), "Another radar zone in this zone has that name.");
  assert.equal(radarZoneError({ ...zone("R2", "söder", city), zoneId: "Z002" }, others), null, "the same name in another market zone is fine");
  assert.equal(radarZoneError(zone("R2", "City", city), others), null);
  const rules = [{ ...blankRadarRule("SE", "A"), name: "Night" }];
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "" }, rules), "Give the rule a name.");
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "Day", radarZoneIds: [] }, rules), "Pick at least one radar zone, or all of them.");
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "Day", maxDrivers: 11 }, rules), "Most drivers must be 1 to 10.");
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "Day", seconds: 2 }, rules), "The radar time must be 5 to 120 seconds.");
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "night" }, rules), "Another rule has that name.");
  assert.equal(radarRuleError({ ...blankRadarRule("SE", "B"), name: "Day" }, rules), null);
});
