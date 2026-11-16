import { test } from "node:test";
import assert from "node:assert/strict";
import { alertFacts, type AlertFactsInput } from "./facts.ts";
import { computeAlerts, emptyAlertBook } from "./engine.ts";
import { market } from "../markets/markets.ts";
import { emptySafety } from "../safety/ops.ts";
import { emptyIncidentOps } from "../safety/cases.ts";
import { emptyDispatchBook } from "../dispatch/rules.ts";
import { emptyDriverOpsBook } from "../drivers/ops.ts";

// Q132 round 3 (CI fix; e2e alerts.spec.ts:45 and :112 timed out waiting for the demo row "licence has expired"):
// inside useAlerts the online drivers were named `live` and shadowed the live / demo flag, so `liveData = live` was a
// drivers array (always truthy) and the demo built its facts as on live (no documents, ratings, riders, system health).
// The facts are now built by the pure alertFacts(input) with input.live, tested here.
const SE = market("SE");
const zone = SE.zones[0]!;
// A seeded active driver whose number ends in 4 starts with an expired taxi driver licence (drivers/ops.ts seededDocuments).
const driver = { id: "D004", name: "Test Driver", phone: "", zoneId: zone.id, status: "active" };

function input(live: boolean): AlertFactsInput {
  return {
    live, now: Date.now(), demo: false, market: SE, zones: [{ id: zone.id, name: zone.name }],
    drivers: [driver], vehicles: [], trips: [], incidents: [], reservations: [], payments: [], payouts: [], tickets: [], zoneSupply: [],
    riderRows: [], safety: emptySafety(), incidentOps: emptyIncidentOps(), dispatchBook: emptyDispatchBook(), driverOps: emptyDriverOpsBook(),
    rideChecks: [], money: (major) => `${major} kr`,
  };
}

test("Q132 R3: demo facts keep the demo-only inputs; the demo engine raises the expired-licence alert", () => {
  const facts = alertFacts(input(false));
  assert.ok(facts.documents.some((doc) => doc.driverId === "D004" && doc.days <= 0), "demo: the expired document is a fact");
  assert.equal(facts.system.length, 4, "demo: system health rows");
  assert.equal(facts.ratings[0]?.driverId, "D004", "demo: the driver's demo rating");
  const titles = computeAlerts(facts, emptyAlertBook().settings, []).map((alert) => alert.title);
  assert.ok(titles.some((title) => /licence has expired/.test(title)), titles.join(" | "));
});

test("Q132 R3: live facts carry none of the demo-only inputs (the server finds those alerts)", () => {
  const facts = alertFacts(input(true));
  assert.deepEqual(facts.documents, []);
  assert.deepEqual(facts.system, []);
  assert.deepEqual(facts.riders, []);
  assert.deepEqual(facts.offline, []);
});
