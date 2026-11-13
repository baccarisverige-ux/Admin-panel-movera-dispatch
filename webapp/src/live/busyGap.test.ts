import assert from "node:assert/strict";
import test from "node:test";
import * as events from "./adminEvents.ts";
import { batchedInvalidator, type KeyMatch } from "./adminEvents.ts";

/**
 * Admin fix A1 (SUP3 P4, audits/fix-plan-2026-11-13/sup3-admin.md; owner 2026-11-13 "5 seconds (Rec.)"): at the G34 2k
 * rate (trip.changed ~4/s per admin) every tab reloaded Trips, Payments, KPIs and the drivers lists about once a second
 * (measured in the real build: 53 reads/min each). Busy types now reload their busy lists at most once per 5 s.
 * GM condition (gm/safety-review.md A1): the ride-check lists, SOS / incidents, the open trip page and the assign panel
 * still reload within 1 s of their event.
 */
function clock() {
  let at = 0;
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => at,
    setTimer: (fn: () => void, ms: number) => (due.set(++id, { at: at + ms, fn }), id),
    clearTimer: (handle: unknown) => void due.delete(handle as number),
    /** Runs every timer due up to `to`, in time order. */
    advance(to: number) {
      for (;;) {
        const next = [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > to) break;
        due.delete(next[0]);
        at = next[1].at;
        next[1].fn();
      }
      at = to;
    },
  };
}

type Push = (type: string, entityId?: string) => void;
/** Busy load: trip.changed 4/s (for trip "T1"), driver.status and zone.supply 2/s. */
function run(busyGapMs: number | undefined, seconds: number, extra: (push: Push, at: number) => void = () => {}, open: (tripId: string) => boolean = () => false) {
  const c = clock();
  const reloads: Array<{ at: number; match: KeyMatch }> = [];
  const busyTrips: number[] = [];
  const batch = batchedInvalidator((match) => reloads.push({ at: c.now(), match }), { ...(busyGapMs === undefined ? {} : { busyGapMs }), isOpenTrip: open, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer } as Parameters<typeof batchedInvalidator>[1]);
  const push: Push = (type, entityId = "x") => batch.push({ type, entityId } as { type: string });
  for (let ms = 0; ms < seconds * 1000; ms += 250) {
    c.advance(ms);
    push("trip.changed", "T1");
    busyTrips.push(ms);
    if (ms % 500 === 0) push("driver.status", "D1");
    if (ms % 500 === 0) push("zone.supply", "Z001");
    extra(push, ms);
  }
  c.advance(seconds * 1000 + 10_000);
  const of = (key: readonly unknown[]) => reloads.filter((r) => r.match(key));
  return { reloads, of, busyTrips };
}

/** Every event at `times` is followed by a reload of `key` within 1 s (after it, at most 1 000 ms later). */
function reloadedWithin1s(of: (key: readonly unknown[]) => Array<{ at: number }>, key: readonly unknown[], times: readonly number[]) {
  const at = of(key).map((r) => r.at);
  for (const t of times) assert.ok(at.some((r) => r > t && r - t <= 1_000), `${JSON.stringify(key)}: no reload within 1 s of the event at ${t} ms`);
}

/** The busy lists (owner A1): Trips, Payments, KPIs, drivers + live drivers, dispatch, zone supply. */
const BUSY_LISTS: ReadonlyArray<readonly unknown[]> = [["records", "trips", "null", "a1"], ["records", "payments", "null", "a1"], ["live", "kpis"], ["records", "drivers", "null", "a1"], ["live", "drivers"], ["live", "dispatch-control"], ["records", "zoneSupply"]];

test("A1 busy gap: Trips, Payments and the drivers / live lists reload at most every 5 s (59-60 a minute before, <= 13 now)", () => {
  const before = run(0, 60);
  const after = run(undefined, 60);
  for (const key of BUSY_LISTS) {
    const was = before.of(key);
    const now = after.of(key);
    assert.ok(was.length >= 59, `${JSON.stringify(key)} with 1 s batches (as before): ${was.length}`);
    assert.ok(now.length <= 13, `${JSON.stringify(key)} with the 5 s gap: ${now.length} reloads a minute`);
    for (let i = 1; i < now.length; i++) assert.ok(now[i]!.at - now[i - 1]!.at >= 5_000, `${JSON.stringify(key)}: never two reloads within 5 s`);
    assert.equal(now[0]!.at, 1_000, "the first change after a quiet spell still reloads after 1 s");
  }
  assert.equal(events.EVENT_BUSY_GAP_MS, 5_000, "owner: 5 seconds");
});

test("A1 safety: ride checks, the open trip page and the assign panel still reload within 1 s of every trip.changed", () => {
  const { of, busyTrips } = run(undefined, 60);
  const fast: ReadonlyArray<readonly unknown[]> = [
    ["records", "rideCheckAlerts", "null", "a1"], // Safety desk ride-check alert rows
    ["records", "rideChecks", "null", "a1"], // Safety desk full ride-check log
    ["records", "rideChecksOfTrip:T1", "null", "a1"], // the open trip page's ride checks
    ["trip-record", "T1", "a1"], // the open trip page (a trip read by id)
    ["live", "trip", "T1"], // the open trip page's money / refund boxes
    ["assign-offers", "T1"], // the assign panel and the trip page's offers
  ];
  for (const key of fast) reloadedWithin1s(of, key, busyTrips);
});

test("A1 safety: SOS, incidents and alerts during a held busy spell still reload within 1 s", () => {
  const sos = [2_250, 7_500, 13_000, 21_750];
  const { of } = run(undefined, 30, (push, at) => {
    if (sos.includes(at)) {
      push("incident.changed", `I${at}`);
      push("alert.changed", `A${at}`);
    }
  });
  const safety: ReadonlyArray<readonly unknown[]> = [["records", "openIncidents", "null", "a1"], ["records", "incidents", "null", "a1"], ["records", "everyIncident"], ["records", "incidentsOfTrip:T1"], ["slice", "safetyOps"], ["slice", "incidentOps"], ["slice", "alertOps"], ["records", "rideCheckAlerts", "null", "a1"]];
  for (const key of safety) reloadedWithin1s(of, key, sos);
  const incident = of(["records", "openIncidents"]);
  assert.equal(incident.length, sos.length, "one reload per SOS, no extra");
  assert.ok(incident[0]!.at <= 2_250 + 1_000, "within 1 s of the event, not held to the busy gap");
});

test("A1 safety: a change of the trip that is open on the trip page / assign panel reloads its Trips list within 1 s", () => {
  const changes = [2_250, 3_500, 6_750, 12_000];
  const { of } = run(undefined, 20, (push, at) => {
    if (changes.includes(at)) push("trip.changed", "T-open");
  }, (tripId) => tripId === "T-open");
  // The trip page and the assign panel read the trip from useTrips(null) = ["records", "trips", "null", agent].
  reloadedWithin1s(of, ["records", "trips", "null", "a1"], changes);
  // Other trips' changes stay behind the gap: only the open trip's 4 changes add reloads to the <= 5 s pace.
  assert.ok(of(["records", "trips"]).length <= 4 + 5, `Trips reloads in 20 s: ${of(["records", "trips"]).length}`);
});

test("A1: openTrip marks a trip open while a screen shows it (two screens: open until both close)", () => {
  assert.equal(typeof events.openTrip, "function");
  const closePage = events.openTrip("T9");
  const closePanel = events.openTrip("T9");
  assert.equal(events.isOpenTrip("T9"), true);
  closePage();
  closePage();
  assert.equal(events.isOpenTrip("T9"), true, "the assign panel still shows it");
  closePanel();
  assert.equal(events.isOpenTrip("T9"), false);
  assert.equal(events.isOpenTrip("T1"), false);
});

test("A1: the held reload does not reload the fast lists a second time", () => {
  const { reloads } = run(undefined, 10);
  const release = reloads.filter((r) => r.match(["records", "trips"]) && r.at > 1_000);
  assert.ok(release.length >= 1);
  for (const r of release) assert.equal(r.match(["records", "rideCheckAlerts"]), false);
});

test("busy gap: a resync reloads everything at once and clears what was held", () => {
  const { of } = run(undefined, 4, (push, at) => {
    if (at === 2_000) push("resync", "admin");
  });
  const all = of(["live", "legal", "SE"]);
  assert.equal(all.length, 1);
  assert.equal(all[0]!.at, 3_000, "1 s after the resync, not held to the busy gap");
});

test("busy gap: stop drops a held reload", () => {
  const c = clock();
  const reloads: KeyMatch[] = [];
  const batch = batchedInvalidator((match) => reloads.push(match), { now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer } as Parameters<typeof batchedInvalidator>[1]);
  batch.push({ type: "trip.changed" });
  c.advance(1_000);
  batch.push({ type: "trip.changed" });
  c.advance(2_000);
  batch.stop();
  c.advance(20_000);
  assert.equal(reloads.filter((match) => match(["records", "trips"])).length, 1);
});
