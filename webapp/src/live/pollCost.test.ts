import { test } from "node:test";
import assert from "node:assert/strict";
import { batchedInvalidator, noteTripChange, setLiveStreamState, type KeyMatch } from "./adminEvents.ts";
import { createLiveAdminApi, RIDE_CHECK_ALERTS_LIST } from "./liveAdminApi.ts";
import type { LiveClient } from "./session.ts";

/**
 * Admin poll cost (Rules audits/impact/admin-poll-cost.md; Render logs 2026-11-15 14:50:52-53 UTC: dozens of
 * GET /admin/trips/:tripId/offers and GET /admin/ride-checks within one second). One live event for trip X must
 * refresh X only, and the ride-check alerts must not read every alert trip again on every trip.changed.
 */
const TRIPS = Array.from({ length: 25 }, (_, i) => `T${i + 1}`);
/** Per-trip reads a panel can hold open: offers, the trip by id, its money box, its ride checks. */
const perTrip = (id: string): ReadonlyArray<readonly unknown[]> => [["assign-offers", id], ["trip-record", id, "a1"], ["live", "trip", id], ["records", `rideChecksOfTrip:${id}`, "null", "a1"]];

function oneBatch(events: Array<{ type: string; entityId?: string }>) {
  const timers: Array<() => void> = [];
  const calls: KeyMatch[] = [];
  const batch = batchedInvalidator((match) => calls.push(match), { busyGapMs: 0, now: () => 0, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {} });
  for (const event of events) batch.push(event);
  timers.splice(0).forEach((fn) => fn());
  return (key: readonly unknown[]) => calls.some((match) => match(key));
}

test("poll cost: one trip.changed for T7 reloads T7's offers / trip reads only, not all 25 trips (before: 100 reloads)", () => {
  const hit = oneBatch([{ type: "trip.changed", entityId: "T7" }]);
  const reloaded = TRIPS.flatMap(perTrip).filter(hit);
  console.log(`per-trip reloads after one trip.changed (25 trips open): ${reloaded.length}`);
  assert.deepEqual(reloaded, perTrip("T7"));
  // Lists still follow every trip change (safety: the ride-check alerts and the Trips list are not narrowed).
  assert.equal(hit(["records", "rideCheckAlerts", "null", "a1"]), true);
  assert.equal(hit(["records", "trips", "null", "a1"]), true);
});

test("poll cost: a batch of changes for T3 and T9 reloads exactly those two trips", () => {
  const hit = oneBatch([{ type: "trip.changed", entityId: "T3" }, { type: "trip.changed", entityId: "T9" }, { type: "driver.status", entityId: "D1" }]);
  assert.deepEqual(TRIPS.flatMap(perTrip).filter(hit), [...perTrip("T3"), ...perTrip("T9")]);
});

test("poll cost: a trip.changed without an id, or a resync, still reloads every trip (safe fallback)", () => {
  assert.equal(TRIPS.flatMap(perTrip).filter(oneBatch([{ type: "trip.changed" }])).length, 100);
  assert.equal(TRIPS.flatMap(perTrip).filter(oneBatch([{ type: "trip.changed", entityId: "T1" }, { type: "resync" }])).length, 100);
});

function fakeClient(answer: (path: string) => unknown) {
  const reads: string[] = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => { reads.push(path); return answer(path); },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}
const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");
const SHOWN = new Date(Date.now() - 60_000).toISOString();
const row = (tripId: string, answer: string, side = "rider") => ({ tripId, checkId: `c_${tripId}`, side, trigger: "long_stop", answer, zoneId: "z1", shownAt: SHOWN });

/** 25 trips with a rider check still waiting; `answered` trips' rider sides have answered (out of the waiting read). */
function alertServer(answered: Set<string> = new Set()) {
  return fakeClient((path) => {
    if (!path.startsWith("/admin/ride-checks")) return { items: [], nextCursor: null };
    const q = params(path);
    if (q.get("answer") === "waiting") return { items: TRIPS.map((id) => row(id, "waiting")).concat(TRIPS.filter((id) => answered.has(id)).map((id) => row(id, "waiting", "driver"))).filter((item) => !(answered.has(item.tripId) && item.side === "rider")), nextCursor: null };
    if (q.get("answer")) return { items: [], nextCursor: null };
    const id = q.get("tripId");
    return { items: id ? [row(id, "waiting"), row(id, "ok", "driver")] : [], nextCursor: null };
  });
}
const checkReads = (reads: string[]) => reads.filter((path) => path.startsWith("/admin/ride-checks")).length;

test("poll cost: ride-check alerts with 25 open checks re-read only the trip that changed (before: 3 + 25 on every reload)", async () => {
  setLiveStreamState("open");
  try {
    const { client, reads } = alertServer();
    const api = createLiveAdminApi(client);
    const first = await api.list(RIDE_CHECK_ALERTS_LIST, null);
    const firstReads = checkReads(reads);
    assert.equal(firstReads, 3 + 25, "the first read reads both sides of each alert trip");
    reads.length = 0;
    noteTripChange("T7");
    const second = await api.list(RIDE_CHECK_ALERTS_LIST, null);
    console.log(`ride-check reads: first ${firstReads}, after one trip.changed ${checkReads(reads)}`);
    assert.equal(checkReads(reads), 3 + 1);
    assert.deepEqual(reads.filter((path) => params(path).get("tripId")).map((path) => params(path).get("tripId")), ["T7"]);
    assert.equal(second.length, first.length, "the same rows (both sides of every alert trip)");
  } finally {
    setLiveStreamState("off");
  }
});

test("poll cost: an alert trip whose answers moved (no trip event) is read again, and only that trip", async () => {
  setLiveStreamState("open");
  try {
    const answered = new Set<string>();
    const { client, reads } = alertServer(answered);
    const api = createLiveAdminApi(client);
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    reads.length = 0;
    answered.add("T12");
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    assert.deepEqual(reads.filter((path) => params(path).get("tripId")).map((path) => params(path).get("tripId")), ["T12"]);
  } finally {
    setLiveStreamState("off");
  }
});

test("poll cost: while the stream is not open, every alert trip is read again (no events to say what changed)", async () => {
  setLiveStreamState("reconnecting");
  try {
    const { client, reads } = alertServer();
    const api = createLiveAdminApi(client);
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    reads.length = 0;
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    assert.equal(checkReads(reads), 3 + 25);
  } finally {
    setLiveStreamState("off");
  }
});

test("poll cost: a resync (or a change with no trip id) re-reads every alert trip", async () => {
  setLiveStreamState("open");
  try {
    const { client, reads } = alertServer();
    const api = createLiveAdminApi(client);
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    reads.length = 0;
    noteTripChange(null);
    await api.list(RIDE_CHECK_ALERTS_LIST, null);
    assert.equal(checkReads(reads), 3 + 25);
  } finally {
    setLiveStreamState("off");
  }
});

test("poll cost: the Trips list with 25 trips reads no offers and no ride checks", async () => {
  const trip = (id: string) => ({ tripId: id, status: "searching", riderId: "R1", zoneId: "Z001", fare: { amountMinor: 100, currency: "SEK" }, pickup: { address: "", lat: 0, lng: 0 }, dropoff: { address: "", lat: 0, lng: 0 }, stops: [], createdAt: "2026-11-15T10:00:00Z" });
  const { client, reads } = fakeClient((path) => (path.startsWith("/admin/trips") ? { items: TRIPS.map(trip), nextCursor: null } : { items: [], nextCursor: null }));
  await createLiveAdminApi(client).list("trips", null);
  assert.equal(reads.filter((path) => path.includes("/offers")).length, 0);
  assert.equal(reads.filter((path) => path.startsWith("/admin/ride-checks")).length, 0);
});
