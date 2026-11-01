import assert from "node:assert/strict";
import test from "node:test";
import { rideCheckRecords } from "./rideChecks.ts";
import { reasonText } from "../safety/rideCheck.ts";
import { answerTimeText, liveAnswerLabel } from "../safety/cases.ts";

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

test("G7 live fix: the measured value of a server check (not 0), and none for an app check", () => {
  const base = { tripId: "T5", zoneId: "Z001", origin: "server" as const, shownAt: "2026-11-01T18:10:00Z" };
  const [stop] = rideCheckRecords([{ ...base, checkId: "a", side: "rider" as const, trigger: "long_stop", measured: { value: 3, unit: "min" } }], () => undefined);
  assert.equal(stop!.value, 3);
  const [route] = rideCheckRecords([{ ...base, checkId: "b", side: "driver" as const, trigger: "off_route", measured: { value: 2.7, unit: "km" } }], () => undefined);
  assert.equal(route!.value, 2.7);
  const [far] = rideCheckRecords([{ ...base, checkId: "c", side: "rider" as const, trigger: "dropped_far", measured: { value: 820, unit: "m" } }], () => undefined);
  assert.equal(far!.value, 820);
  const [app] = rideCheckRecords([{ ...base, origin: "app" as const, checkId: "d", side: "rider" as const, trigger: "long_stop" }], () => undefined);
  assert.equal(app!.value, null);
  assert.equal(reasonText({ trigger: "stop", value: 3, place: "" }), "Stopped for 3 min");
  assert.equal(reasonText({ trigger: "route", value: null, place: "" }), "Off the route");
});

test("G7 live fix: the case text uses the zone's answer time", () => {
  assert.equal(liveAnswerLabel({ checkId: "x", trigger: "off_route", by: "rider", answer: "no_answer", answerSeconds: 150 }), "No answer in 150 s");
  assert.equal(liveAnswerLabel({ checkId: "x", trigger: "off_route", by: "rider", answer: "no_answer", answerSeconds: 120 }), "No answer in 2 min");
  assert.equal(answerTimeText(90), "90 s");
});
