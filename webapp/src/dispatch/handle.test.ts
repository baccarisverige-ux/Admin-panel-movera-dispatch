import assert from "node:assert/strict";
import test from "node:test";
import { actionKindFor, defaultTarget, driversInTarget, handledOf, radarRuleFor, radarTimerFor, radarZonesFor, recordLiveAction, targetName, zoneChoicesFor } from "./handle.ts";
import { emptyDispatchBook, type DispatchBook, type RadarZone, type RadarZoneRule } from "./rules.ts";

const ring = (lat: number, lng: number, d = 0.01): [number, number][] => [[lat - d, lng - d], [lat - d, lng + d], [lat + d, lng + d], [lat + d, lng - d]];

const zones: RadarZone[] = [
  { id: "RZ1", country: "SE", zoneId: "Z002", name: "Södermalm west", ring: ring(59.314, 18.05), createdAt: "2026-10-01T00:00:00Z" },
  { id: "RZ2", country: "SE", zoneId: "Z002", name: "Södermalm east", ring: ring(59.314, 18.09), createdAt: "2026-10-01T00:00:00Z" },
  { id: "RZ3", country: "SE", zoneId: "Z001", name: "Norrmalm centre", ring: ring(59.334, 18.063), createdAt: "2026-10-01T00:00:00Z" },
  { id: "RZ9", country: "SE", zoneId: "Z009", name: "Södertälje", ring: ring(59.195, 17.628), createdAt: "2026-10-01T00:00:00Z" },
];

const rules: RadarZoneRule[] = [
  { id: "R-all", country: "SE", name: "Default", radarZoneIds: "all", seconds: 40, maxDrivers: 6, repeat: false },
  { id: "R-east", country: "SE", name: "East fast", radarZoneIds: ["RZ2"], seconds: 20, maxDrivers: 3, repeat: true },
];

function book(): DispatchBook {
  return { ...emptyDispatchBook(), radarZones: zones, radarZoneRules: rules, groups: [{ id: "G1", country: "SE", name: "Night team", driverIds: ["D1", "D9"] }] };
}

const driver = (id: string, zoneId: string, lat: number, lng: number) => ({ driver: { id, zoneId, lat, lng } });

test("a rule naming the radar zone wins over the rule for all radar zones", () => {
  assert.equal(radarRuleFor(rules, "RZ2")?.id, "R-east");
  assert.equal(radarRuleFor(rules, "RZ1")?.id, "R-all");
  assert.equal(radarRuleFor([rules[1]], "RZ1"), null, "no default rule → nothing");
});

test("radar zones are offered for the pickup zone, or with the zones around it", () => {
  assert.deepEqual(radarZonesFor(zones, "Z002", "zone").map((zone) => zone.id), ["RZ2", "RZ1"]);
  const around = radarZonesFor(zones, "Z002", "around").map((zone) => zone.id);
  assert.ok(around.includes("RZ3"), "Norrmalm is next to Södermalm");
  assert.ok(!around.includes("RZ9"), "Södertälje is too far to be around");
  assert.equal(around[0], "RZ2", "the pickup zone's own radar zones come first");
});

test("zone choices start with the pickup zone, then the zones near it", () => {
  const choices = zoneChoicesFor("Z002");
  assert.equal(choices[0].id, "Z002");
  assert.ok(choices.slice(1).some((zone) => zone.near));
  assert.equal(choices.find((zone) => zone.id === "Z009")?.near, false);
  assert.deepEqual(zoneChoicesFor("nowhere"), []);
});

test("the radar timer follows the rule of the radar zone the ride is sent to, else the pickup zone's radar", () => {
  const own = book();
  assert.deepEqual(radarTimerFor(own, { kind: "radar_zone", id: "RZ2" }, "Z002"), { seconds: 20, maxDrivers: 3, ruleName: "East fast" });
  assert.deepEqual(radarTimerFor(own, { kind: "radar_zone", id: "RZ1" }, "Z002"), { seconds: 40, maxDrivers: 6, ruleName: "Default" });
  const zone = radarTimerFor(own, { kind: "zone", ids: ["Z002"] }, "Z002");
  assert.equal(zone.ruleName, null);
  assert.ok(zone.seconds > 0 && zone.maxDrivers >= 1 && zone.maxDrivers <= 10);
  const none = radarTimerFor({ ...own, radarZoneRules: [] }, { kind: "radar_zone", id: "RZ1" }, "Z002");
  assert.equal(none.ruleName, null, "without any rule the zone's radar settings apply");
});

test("a radar reaches the free drivers inside the target, nearest first, at most the maximum", () => {
  const own = book();
  const candidates = [
    driver("D1", "Z002", 59.314, 18.05), // inside RZ1
    driver("D2", "Z002", 59.316, 18.052), // inside RZ1
    driver("D3", "Z002", 59.314, 18.09), // inside RZ2
    driver("D4", "Z001", 59.334, 18.063), // Norrmalm
    driver("D9", "Z003", 59.338, 18.088),
  ];
  assert.deepEqual(driversInTarget({ kind: "radar_zone", id: "RZ1" }, candidates, own).map((item) => item.driver.id), ["D1", "D2"]);
  assert.deepEqual(driversInTarget({ kind: "radar_zone", id: "RZ1" }, candidates, own, 1).map((item) => item.driver.id), ["D1"], "the maximum caps the list");
  assert.deepEqual(driversInTarget({ kind: "zone", ids: ["Z001", "Z003"] }, candidates, own).map((item) => item.driver.id), ["D4", "D9"]);
  assert.deepEqual(driversInTarget({ kind: "group", id: "G1" }, candidates, own).map((item) => item.driver.id), ["D1", "D9"]);
  assert.deepEqual(driversInTarget({ kind: "group", id: "none" }, candidates, own), []);
  assert.deepEqual(driversInTarget({ kind: "radar_zone", id: "gone" }, candidates, own), []);
});

test("targets have names and a live action kind; the default is the first radar zone of the pickup zone", () => {
  const own = book();
  assert.equal(targetName({ kind: "radar_zone", id: "RZ2" }, own), "Södermalm east");
  assert.equal(targetName({ kind: "zone", ids: ["Z001", "Z003"] }, own), "Norrmalm + Östermalm");
  assert.equal(targetName({ kind: "group", id: "G1" }, own), "Night team");
  assert.equal(actionKindFor({ kind: "radar_zone", id: "RZ2" }), "radar_zone");
  assert.equal(actionKindFor({ kind: "zone", ids: ["Z001"] }), "radar_group");
  assert.equal(actionKindFor({ kind: "group", id: "G1" }), "group");
  assert.deepEqual(defaultTarget(own, "Z002"), { kind: "radar_zone", id: "RZ2" });
  assert.deepEqual(defaultTarget(own, "Z005"), { kind: "zone", ids: ["Z005"] }, "no radar zone yet → the whole zone");
});

test("a recorded live action is the newest first and marks the ride as handled everywhere", () => {
  let own = book();
  assert.equal(handledOf(own, "T1"), undefined);
  own = recordLiveAction(own, { tripId: "T1", kind: "radar_zone", target: "radar Södermalm east", by: "nora", at: "2026-10-21T10:00:00Z" });
  own = recordLiveAction(own, { tripId: "T2", kind: "cancel", target: "cancel", by: "nora", at: "2026-10-21T10:01:00Z" });
  assert.equal(own.draftRev, 3);
  assert.equal(own.liveActions[0].tripId, "T2");
  assert.equal(handledOf(own, "T1")?.kind, "radar_zone");
  assert.equal(handledOf(own, "T2")?.kind, "cancel");
});
