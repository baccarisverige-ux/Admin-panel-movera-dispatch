import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { backoffMs, connectAdminEvents, FALLBACK_POLL_MS, INVALIDATES, keyMatches, liveRefetchMs, parseSseMessages, RECONNECTING_TEXT, showsReconnecting, type AdminLiveEvent, type LiveEventSource, type LiveStreamState } from "./adminEvents.ts";

/** Contract v0.18.22 §46 (BASE job admin live updates, owner L1 "small Reconnecting… badge"). */
const contract = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { adminLiveEvents: { types: Record<string, unknown>; client: { invalidates: Record<string, string[]>; fallbackPollSeconds: number; badgeText: string } } };

class FakeEventSource implements LiveEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string; lastEventId: string }) => void) | null = null;
  onerror: ((info?: { status?: number }) => void) | null = null;
  oncursor: ((id: string) => void) | null = null;
  closed = false;
  readonly lastEventId: string | null;
  constructor(lastEventId: string | null) {
    this.lastEventId = lastEventId;
  }
  close() {
    this.closed = true;
  }
  emit(event: Partial<AdminLiveEvent>) {
    this.onmessage?.({ data: JSON.stringify(event), lastEventId: String(event.sequence ?? "") });
  }
}

function harness() {
  const sources: FakeEventSource[] = [];
  const states: LiveStreamState[] = [];
  const events: AdminLiveEvent[] = [];
  const timers: Array<() => void> = [];
  const waits: number[] = [];
  const stop = connectAdminEvents(
    (lastEventId) => {
      const source = new FakeEventSource(lastEventId);
      sources.push(source);
      return source;
    },
    (event) => events.push(event),
    (state) => states.push(state),
    { random: () => 1, setTimer: (fn, ms) => { waits.push(ms); return timers.push(fn); }, clearTimer: () => undefined },
  );
  return { sources, states, events, timers, waits, stop };
}

test("the panel's event names, lists and fallback equal the contract's", () => {
  assert.deepEqual(Object.keys(INVALIDATES).sort(), Object.keys(contract.adminLiveEvents.types).sort());
  assert.deepEqual(INVALIDATES, contract.adminLiveEvents.client.invalidates);
  assert.equal(FALLBACK_POLL_MS, contract.adminLiveEvents.client.fallbackPollSeconds * 1000);
  assert.equal(RECONNECTING_TEXT, contract.adminLiveEvents.client.badgeText);
});

test("events go out once, in order; a drop shows Reconnecting… and reopens with Last-Event-ID", () => {
  const h = harness();
  assert.deepEqual(h.states, ["connecting"]);
  h.sources[0]!.onopen?.();
  assert.equal(h.states.at(-1), "open");
  h.sources[0]!.emit({ sequence: 4, type: "trip.changed", entityId: "T1", zoneId: "Z001" });
  h.sources[0]!.emit({ sequence: 4, type: "trip.changed", entityId: "T1", zoneId: "Z001" });
  h.sources[0]!.emit({ sequence: 5, type: "ticket.changed", entityId: "K1", zoneId: "Z001" });
  assert.deepEqual(h.events.map((e) => e.sequence), [4, 5]);
  h.sources[0]!.onerror?.();
  assert.equal(h.sources[0]!.closed, true);
  assert.equal(h.states.at(-1), "reconnecting");
  assert.equal(showsReconnecting("reconnecting"), true);
  assert.equal(h.sources.length, 1);
  h.timers.shift()!();
  assert.equal(h.sources[1]!.lastEventId, "5");
  h.sources[1]!.onopen?.();
  assert.equal(h.states.at(-1), "open");
  // A late message from the dropped source is ignored.
  h.sources[0]!.emit({ sequence: 9, type: "trip.changed", entityId: "T9", zoneId: "Z001" });
  h.sources[1]!.emit({ sequence: 6, type: "resync", entityId: "a", zoneId: null });
  assert.deepEqual(h.events.map((e) => e.type), ["trip.changed", "ticket.changed", "resync"]);
  h.stop();
  assert.equal(h.sources[1]!.closed, true);
  assert.equal(h.states.at(-1), "off");
});

test("the badge never shows during the first connect or while open", () => {
  assert.equal(showsReconnecting("connecting"), false);
  assert.equal(showsReconnecting("open"), false);
  assert.equal(showsReconnecting("off"), false);
});

test("timers: none while the stream is open, every minute while reconnecting, the page's own in the demo and for map positions", () => {
  assert.equal(liveRefetchMs("open", "trips", 15_000), false);
  assert.equal(liveRefetchMs("reconnecting", "trips", 15_000), 60_000);
  assert.equal(liveRefetchMs("connecting", "incidents", 10_000), 60_000);
  assert.equal(liveRefetchMs("off", "trips", 15_000), 15_000);
  assert.equal(liveRefetchMs("open", "drivers", 30_000, true), 30_000);
  assert.equal(liveRefetchMs("open", "rideChecks", 10_000), 10_000);
  assert.equal(liveRefetchMs("open", "trips", undefined), undefined);
});

test("each event reloads only its lists", () => {
  const trip = { type: "trip.changed" };
  assert.equal(keyMatches(trip, ["records", "trips", "{}", "a1"]), true);
  assert.equal(keyMatches(trip, ["live", "reservations"]), true);
  assert.equal(keyMatches(trip, ["records", "payments", "{}", "a1"]), true);
  assert.equal(keyMatches(trip, ["records", "tickets", "{}", "a1"]), false);
  assert.equal(keyMatches({ type: "ticket.changed" }, ["live", "tickets", "open"]), true);
  assert.equal(keyMatches({ type: "approval.changed" }, ["approvals"]), true);
  assert.equal(keyMatches({ type: "alert.changed" }, ["slice", "alertOps", "a1"]), true);
  assert.equal(keyMatches({ type: "zone.supply" }, ["records", "zoneSupply", "{}", "a1"]), true);
  assert.equal(keyMatches({ type: "resync" }, ["anything"]), true);
  assert.equal(keyMatches({ type: "made_up" }, ["records", "trips"]), false);
});

test("the SSE text is split into messages with their ids", () => {
  const parsed = parseSseMessages(": stream open\n\nid: 7\ndata: {\"sequence\":7}\n\nid: 9\n\nid: 10\ndata: {\"seq");
  assert.deepEqual(parsed.messages, [{ data: "{\"sequence\":7}", lastEventId: "7" }]);
  assert.equal(parsed.lastId, "9");
  assert.equal(parsed.rest, "id: 10\ndata: {\"seq");
});

test("reconnect: jittered backoff 1 s doubling, capped at 30 s, back to 1 s once open", () => {
  assert.equal(backoffMs(0, () => 1), 1000);
  assert.equal(backoffMs(3, () => 1), 8000);
  assert.equal(backoffMs(10, () => 1), 30_000);
  assert.equal(backoffMs(50, () => 0.5), 15_000);
  assert.equal(backoffMs(2, () => 0), 0);
  const h = harness();
  for (let i = 0; i < 7; i += 1) {
    h.sources.at(-1)!.onerror?.();
    h.timers.shift()!();
  }
  assert.deepEqual(h.waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  h.sources.at(-1)!.onopen?.();
  h.sources.at(-1)!.onerror?.();
  assert.equal(h.waits.at(-1), 1000);
  h.stop();
});

test("a 401 (session gone, signed out) stops: no retry, no badge", () => {
  const h = harness();
  h.sources[0]!.onerror?.({ status: 401 });
  assert.equal(h.timers.length, 0);
  assert.equal(h.states.at(-1), "off");
  assert.equal(h.sources.length, 1);
});

test("id-only lines move the cursor: the reconnect starts after them", () => {
  const h = harness();
  h.sources[0]!.emit({ sequence: 3, type: "trip.changed", entityId: "T", zoneId: "Z001" });
  h.sources[0]!.oncursor?.("12");
  h.sources[0]!.onerror?.();
  h.timers.shift()!();
  assert.equal(h.sources[1]!.lastEventId, "12");
  h.stop();
});

// Supervisor S7 R5 (2026-11-07): the Reservations warnings (no driver, may be late, not started, overdue) are set by the
// server on the clock and its trips trigger does not fire on trips.reservation / scheduled_at, so no trip.changed comes.
test("R5: Reservations keeps its 30 s refetch while the stream is open; other streamed lists still wait for events", () => {
  assert.equal(liveRefetchMs("open", "reservations", 30_000), 30_000);
  assert.equal(liveRefetchMs("reconnecting", "reservations", 30_000), 30_000);
  assert.equal(liveRefetchMs("off", "reservations", 30_000), 30_000);
  assert.equal(liveRefetchMs("open", "trips", 30_000), false);
  assert.equal(liveRefetchMs("reconnecting", "trips", 30_000), FALLBACK_POLL_MS);
});
