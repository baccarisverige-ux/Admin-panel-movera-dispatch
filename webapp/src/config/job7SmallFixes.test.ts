import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { OPEN_VALUES } from "./confirm.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { dispatchDocumentOf, rulesOfDispatch } from "../live/configDocs.ts";
import { validSamePoint } from "../dispatch/offerRules.ts";
import { zoneDefault, zoneIssues } from "../dispatch/rules.ts";
import { inboxItems } from "../platform/inbox.ts";
import { liveTabCounts } from "../dashboard/liveCounts.ts";

/** FIX JOB 7 (contract v0.18.32, contract.json#smallFixes). */
const NOW = "2026-11-05T10:00:00Z";

test("Shortest ride (m): default 100 from the contract, sent to both apps, Sweden and France (owner Q9)", () => {
  assert.equal(CONFIG_DEFAULTS.samePointWarnMeters, (contract.configDefaults as unknown as { samePointWarnMeters: number }).samePointWarnMeters);
  assert.equal(zoneDefault("Z001").samePoint?.warnMeters, 100);
  assert.equal(driverAppConfig("Z001", appConfigState({ now: NOW })).booking.samePointWarnMeters, 100);
  assert.equal(riderAppConfig("FR-PC", appConfigState({ now: NOW })).booking.samePointWarnMeters, 100, "France too");
  assert.equal(validSamePoint(0), 0);
  for (const bad of [-1, 1001, 12.5, "100", null]) assert.equal(validSamePoint(bad), null, String(bad));
  assert.ok(zoneIssues({ ...zoneDefault("Z001"), samePoint: { warnMeters: 5000 } }).some((issue) => issue.startsWith("Shortest ride: 0 to 1000 m")));
  const before = { ...zoneDefault("Z001") };
  delete before.samePoint;
  assert.equal(zoneIssues(before).some((issue) => issue.startsWith("Shortest ride")), false, "rules saved before v0.18.32 still load");
});

test("Shortest ride (m) comes back from the live driver document", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  assert.equal(rulesOfDispatch(doc, { booking: { samePointWarnMeters: 250 } }, zone).samePoint?.warnMeters, 250);
  assert.equal(rulesOfDispatch(doc, { booking: { samePointWarnMeters: 5000 } }, zone).samePoint?.warnMeters, 100, "a bad value keeps the default");
});

test("a field the server never reads is read-only 'Not used yet', kept, and not a task (L21)", () => {
  const horizon = OPEN_VALUES.find((item) => item.id === "horizon");
  assert.ok(horizon, "never deleted (owner rule 21)");
  assert.equal(horizon.readOnly, true);
  assert.equal(horizon.today, "Not used yet");
  assert.ok(horizon.note?.includes("Not used yet"));
  const items = inboxItems({ approvals: [], config: { status: "draft", authorId: "a", approverId: null, rev: 1 }, values: OPEN_VALUES, decisions: {}, me: "a", money: String });
  assert.equal(items.some((item) => item.id === "horizon"), false);
});

test("Live tab reads Searching N · Live M (B-k)", () => {
  const trips = [
    { status: "searching", driverId: null },
    { status: "accepted", driverId: "d1" },
    { status: "driver_to_pickup", driverId: "d2" },
    { status: "completed", driverId: "d3" },
  ];
  assert.deepEqual(liveTabCounts(1, trips), { searching: 1, withDriver: 2 });
});
