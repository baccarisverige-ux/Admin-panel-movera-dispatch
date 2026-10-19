import { test } from "node:test";
import assert from "node:assert/strict";
import { AFTER_TERMINAL_KINDS, EVENT_KINDS, TripEventGate, TripEventGates, type TripEvent } from "../domain/realtime.ts";
import { contractJson } from "./load.ts";

type Cases = { cases: { id: string; events: (TripEvent & { expect: string })[] }[] };
const contract = contractJson<{ realtime: { kinds: string[]; afterTerminal: string[] } }>("contract.json");

test("event kinds equal contract.json#realtime", () => {
  assert.deepEqual([...EVENT_KINDS], contract.realtime.kinds);
  assert.deepEqual([...AFTER_TERMINAL_KINDS], contract.realtime.afterTerminal);
});

test("fixtures/events.json replays identically through a fresh gate per case", () => {
  for (const item of contractJson<Cases>("fixtures/events.json").cases) {
    const gate = new TripEventGate();
    for (const event of item.events) assert.equal(gate.offer(event).disposition, event.expect, `${item.id} ${event.eventId}`);
  }
});

test("a gap asks for a resync, location never replaces the projection, many trips keep their own sequence", () => {
  const gate = new TripEventGate();
  gate.offer({ eventId: "a", tripId: "T", sequence: 1, version: 1, kind: "trip_projection", projection: { status: "accepted", fare: 1 } });
  gate.offer({ eventId: "b", tripId: "T", sequence: 2, version: 1, kind: "location", projection: { status: "completed" } });
  assert.equal(gate.projection?.status, "accepted");
  assert.equal(gate.terminal, false);
  assert.deepEqual(gate.offer({ eventId: "c", tripId: "T", sequence: 5, version: 2, kind: "trip_projection", status: "arrived" }), { disposition: "accepted_with_gap", resync: true });
  const gates = new TripEventGates();
  assert.equal(gates.offer({ eventId: "x1", tripId: "A", sequence: 1, version: 1, kind: "location" }).disposition, "accepted");
  assert.equal(gates.offer({ eventId: "y1", tripId: "B", sequence: 1, version: 1, kind: "location" }).disposition, "accepted");
});
