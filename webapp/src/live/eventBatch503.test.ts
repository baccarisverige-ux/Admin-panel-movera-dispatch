import assert from "node:assert/strict";
import test from "node:test";
import { batchedInvalidator, connectAdminEvents, type AdminLiveEvent, type KeyMatch, type LiveEventSource } from "./adminEvents.ts";
// Finder D3 (stream silence watchdog): its own file, run with this one (no package.json change).
import "./streamWatchdog.test.ts";

/**
 * 503 proof 2026-11-06 (Rules plan/FIX-503-ADMIN-BURST-2026-11-06.md): GET /admin/events without a cursor sent 5571 events in
 * 5 s on staging (resync 1, trip.changed 3503, driver.status 781, zone.supply 781, alert.changed 469, incident.changed 36), and
 * the panel reloaded lists for EACH event (507 alerts reads in 60 s, 1200+ payments reads in 25 s): the DB pool filled -> 503.
 */
class Src implements LiveEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string; lastEventId: string }) => void) | null = null;
  onerror: ((info?: { status?: number }) => void) | null = null;
  close() {}
}
const STAGING_MIX: Array<[string, number]> = [["trip.changed", 3503], ["driver.status", 781], ["zone.supply", 781], ["alert.changed", 469], ["incident.changed", 36]];
const KEYS: readonly (readonly unknown[])[] = [["records", "trips"], ["records", "payments"], ["slice", "alertOps"], ["records", "incidents"], ["records", "drivers"], ["records", "tickets"], ["live", "legal", "SE"]];

function replay(withResync: boolean) {
  const timers: Array<() => void> = [];
  const calls: KeyMatch[] = [];
  const batch = batchedInvalidator((match) => calls.push(match), { setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {} });
  let src: Src | null = null;
  connectAdminEvents(() => (src = new Src()), batch.push, () => {});
  let seq = 0;
  const send = (type: string) => { seq += 1; const e: AdminLiveEvent = { sequence: seq, type, entityId: "x", zoneId: "Z001", occurredAt: "", serverTime: "" }; src!.onmessage?.({ data: JSON.stringify(e), lastEventId: String(seq) }); };
  if (withResync) src!.onmessage?.({ data: JSON.stringify({ sequence: 0, type: "resync", entityId: "a", zoneId: null, occurredAt: "", serverTime: "" }), lastEventId: "0" });
  for (const [type, n] of STAGING_MIX) for (let i = 0; i < n; i++) send(type);
  const before = calls.length;
  timers.splice(0).forEach((fn) => fn());
  return { before, calls, seq, batch };
}

test("503: a replay of 5571 events reloads each changed list once, not once per event", () => {
  const { before, calls, seq } = replay(false);
  assert.equal(seq, 5570);
  assert.equal(before, 0, "nothing is reloaded while the batch is still collecting");
  assert.equal(calls.length, 1, `one reload per batch, got ${calls.length}`);
  const hit = KEYS.filter((key) => calls[0](key)).map((key) => key.join("/"));
  assert.deepEqual(hit, ["records/trips", "records/payments", "slice/alertOps", "records/incidents", "records/drivers"]);
});

test("503: a resync inside the replay reloads every live list once", () => {
  const { calls } = replay(true);
  assert.equal(calls.length, 1);
  assert.equal(KEYS.every((key) => calls[0](key)), true);
});

test("503: events after a batch start a new batch; stop drops a pending one", () => {
  const timers: Array<() => void> = [];
  const calls: KeyMatch[] = [];
  const batch = batchedInvalidator((match) => calls.push(match), { setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => timers.splice(0) });
  batch.push({ type: "ticket.changed" });
  timers.splice(0).forEach((fn) => fn());
  batch.push({ type: "approval.changed" });
  batch.push({ type: "unknown.type" });
  timers.splice(0).forEach((fn) => fn());
  assert.equal(calls.length, 2);
  assert.equal(calls[1](["records", "approvals"]), true);
  assert.equal(calls[1](["records", "tickets"]), false);
  batch.push({ type: "trip.changed" });
  batch.stop();
  timers.splice(0).forEach((fn) => fn());
  assert.equal(calls.length, 2, "a stopped batch reloads nothing");
});
