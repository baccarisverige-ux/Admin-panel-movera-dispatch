import { test } from "node:test";
import assert from "node:assert/strict";
import type { KindId } from "./engine.ts";
import { OPEN_INCIDENTS_LIST } from "../live/incidents.ts";

/**
 * Q132 follow-ups (Rules plan/REMINDERS.md row 139; audits/impact/s7-q132-supervisor.md "Round 2 heads" SF-A, SF-B).
 * SF-A: the two hook lines of useAlerts that carry the SOS behaviour are now pure functions of the bar's plan:
 *   X1 the warm read of the open cases (alertBarIncidentsRead) and X2 the bar's `loading` (alertBarLoading).
 * SF-B: an alert row reads the open cases only for a role with incidents.read (alertRowReadsIncidents).
 */
type Reads = typeof import("./reads.ts");
async function reads(): Promise<Reads> {
  return import("./reads.ts");
}

const safety = { canSafety: true, canRideCheck: true };
const dispatcher = { canSafety: false, canRideCheck: true };
const open = (kind: string) => ({ kind: kind as KindId, state: "open" as const });

test("SF-A X1: live, an open SOS / car-lost / ride-check / SOS-slow alert keeps the open cases warm, on the row's own cache entry", async () => {
  const mod = await reads();
  assert.equal(typeof mod.alertBarIncidentsRead, "function", "alertBarIncidentsRead is missing: the warm read is not pinned");
  for (const kind of ["sos", "car_lost", "ride_check", "sos_slow"]) {
    const read = mod.alertBarIncidentsRead({ live: true, ...safety, found: [open(kind)] });
    assert.equal(read.options.enabled, true, `${kind}: the open cases must stay read while the alert is open`);
    // Same list and options as the row's read (useAlertIncidents): one cache entry, the buttons are drawn at once.
    assert.deepEqual(read, mod.alertIncidentsRead(true, true));
    assert.equal(read.list, OPEN_INCIDENTS_LIST);
  }
});

test("SF-A X1: live, no open safety alert, a solved one, or a role without incidents.read: no warm read", async () => {
  const mod = await reads();
  assert.equal(mod.alertBarIncidentsRead({ live: true, ...safety, found: [open("payment_failed")] }).options.enabled, false);
  assert.equal(mod.alertBarIncidentsRead({ live: true, ...safety, found: [{ kind: "sos", state: "solved" }] }).options.enabled, false);
  assert.equal(mod.alertBarIncidentsRead({ live: true, ...safety, found: undefined }).options.enabled, false);
  assert.equal(mod.alertBarIncidentsRead({ live: true, ...dispatcher, found: [open("sos"), open("ride_check")] }).options.enabled, false);
});

test("SF-A X1: demo, the bar keeps reading every case for its own engine, as before", async () => {
  const mod = await reads();
  assert.deepEqual(mod.alertBarIncidentsRead({ live: false, ...dispatcher, found: [] }), mod.alertIncidentsRead(false, true));
});

test("SF-A X2: live, the bar's loading is the alert list only; the warm read never holds back the alert sound", async () => {
  const mod = await reads();
  assert.equal(typeof mod.alertBarLoading, "function", "alertBarLoading is missing: the bar's loading is not pinned");
  const input = { live: true, ...safety, found: [open("sos")] };
  assert.equal(mod.alertBarLoading(input, { alerts: false, incidents: true, trips: true }), false);
  assert.equal(mod.alertBarLoading(input, { alerts: true, incidents: false, trips: false }), true);
  assert.equal(mod.alertBarLoading({ ...input, found: [] }, { alerts: false, incidents: true, trips: true }), false);
});

test("SF-A X2: demo, the engine waits for the alert list, the cases and the trips, as before", async () => {
  const mod = await reads();
  const input = { live: false, ...safety, found: [] };
  assert.equal(mod.alertBarLoading(input, { alerts: false, incidents: false, trips: false }), false);
  assert.equal(mod.alertBarLoading(input, { alerts: true, incidents: false, trips: false }), true);
  assert.equal(mod.alertBarLoading(input, { alerts: false, incidents: true, trips: false }), true);
  assert.equal(mod.alertBarLoading(input, { alerts: false, incidents: false, trips: true }), true);
});

test("SF-B: a ride-check / SOS row reads the open cases only for a role with incidents.read (no refused read for a dispatcher)", async () => {
  const mod = await reads();
  assert.equal(typeof mod.alertRowReadsIncidents, "function", "alertRowReadsIncidents is missing: the row reads cases for every role");
  for (const kind of ["sos", "car_lost", "ride_check", "sos_slow"] as KindId[]) {
    assert.equal(mod.alertRowReadsIncidents({ kind, incidentId: "inc-1" }, true), true, `${kind}, safety team`);
    assert.equal(mod.alertRowReadsIncidents({ kind, incidentId: "inc-1" }, false), false, `${kind}, dispatcher`);
    assert.equal(mod.alertRowReadsIncidents({ kind }, true), false, `${kind} without a case`);
  }
  assert.equal(mod.alertRowReadsIncidents({ kind: "long_wait", incidentId: "inc-1" }, true), false);
});
