import assert from "node:assert/strict";
import test from "node:test";
import { rideCheckRecords } from "./rideChecks.ts";

test("v0.18.9 (G7): GET /admin/ride-checks rows become one check per trip with both answers", () => {
  const rows = [
    { tripId: "T1", zoneId: "Z001", checkId: "srv_off_route_1", side: "rider" as const, trigger: "off_route", origin: "server" as const, shownAt: "2026-11-02T10:00:00Z", answer: "ok" as const, answeredAt: "2026-11-02T10:00:20Z" },
    { tripId: "T1", zoneId: "Z001", checkId: "srv_off_route_1", side: "driver" as const, trigger: "off_route", origin: "server" as const, shownAt: "2026-11-02T10:00:00Z", answer: "no_answer" as const, incidentId: "I9" },
    { tripId: "T2", zoneId: "FR-PC", checkId: "srv_long_stop_2", side: "rider" as const, trigger: "long_stop", origin: "server" as const, shownAt: "2026-11-02T11:00:00Z", answer: "need_help" as const },
    { tripId: "T3", checkId: "x", side: "rider" as const, trigger: "unknown", origin: "app" as const },
  ];
  const checks = rideCheckRecords(rows, (id) => (id === "T1" ? { riderId: "R1", driverId: "D1", riderName: "Anna" } : undefined));
  assert.equal(checks.length, 2);
  assert.deepEqual(checks.map((c) => [c.tripId, c.trigger, c.status]), [["T2", "stop", "help"], ["T1", "route", "none"]]);
  const t1 = checks[1]!;
  assert.equal(t1.rider?.choice, "ok");
  assert.equal(t1.driver, null);
  assert.equal(t1.incidentId, "I9");
  assert.equal(t1.name, "Anna");
  assert.equal(checks[0]!.rider?.choice, "unsafe", "need_help is a red answer");
});
