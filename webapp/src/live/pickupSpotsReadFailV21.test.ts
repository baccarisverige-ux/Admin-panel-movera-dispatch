import { test } from "node:test";
import assert from "node:assert/strict";
import { setLiveMarketZones } from "../markets/markets.ts";
import { DISPATCH_KEY, liveRules, publish, zoneDefault, type DispatchBook } from "../dispatch/rules.ts";
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import { OWNED, dispatchDocumentOf, dispatchOwnedFor, keepPaths, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * S10 admin rebase over V21 (supervisor, Rules audits/impact/s10-share-trip-supervisor.md "Ship heads", admin): the
 * zone's pickup entrance chips switch (V21, booking.pickupSpots) lives in the same rider document as Share trip. The
 * SF-A1 rule now covers it too: when the rider read failed, the page shows only the browser's own value (default on),
 * so the next Dispatch publish of that zone must not write booking.pickupSpots, and a book that changes it is refused.
 * Test first: fails on the V21 + S10 merge before the fix (pickupSpots was still published after a failed read).
 */
const ZONE = "Z900";
const NOW = "2026-11-16T19:00:00Z";
type Row = { version: number; liveVersion: number; usesStandard: boolean; document: Doc };

function server(rows: Record<string, Row>) {
  const state = { riderReadFails: false, puts: [] as string[] };
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const notFound = () => Object.assign(new Error("not found"), { status: 404, reason: "zone_not_found" });
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      if (!path.startsWith("/admin/config/") || path.includes("/history")) throw notFound();
      const key = keyOf(path);
      if (state.riderReadFails && key === `rider_app_config:${ZONE}`) throw Object.assign(new Error("unavailable"), { status: 503 });
      const row = rows[key];
      if (!row) throw notFound();
      return structuredClone(row) as T;
    },
    put: async <T,>(path: string, body: unknown) => {
      const { document, expectedVersion } = body as { document: Doc; expectedVersion: number };
      const key = `${path.split("/")[3]}:${(body as { zoneId?: string }).zoneId}`;
      const row = rows[key]!;
      if (row.version !== expectedVersion) throw Object.assign(new Error("changed"), { status: 409 });
      state.puts.push(key);
      rows[key] = { ...row, version: row.version + 1, usesStandard: false, document: structuredClone(document) };
      return { version: rows[key].version } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      const key = `${path.split("/")[3]}:${(body as { zoneId?: string }).zoneId}`;
      const row = rows[key]!;
      rows[key] = { ...row, version: row.version + 1, liveVersion: row.liveVersion + 1 };
      return { version: rows[key].version } as T;
    },
  };
  return { http, rows, state };
}

/** The zone on the server: pickup entrance chips switched OFF in its rider document. */
function zoneOff() {
  setLiveMarketZones([{ id: ZONE, name: "Testzone", city: "Testzone", kind: "operating", center: [0, 0], country: "SE" }]);
  const zone = zoneDefault(ZONE);
  const state = appConfigState({ now: NOW, dispatch: { live: { [ZONE]: { ...zone, pickupSpots: { on: false } } } } as never });
  const row = (document: Doc): Row => ({ version: 3, liveVersion: 3, usesStandard: false, document });
  return server({
    [`dispatch:${ZONE}`]: row(dispatchDocumentOf(zone, ZONE, null)),
    [`driver_app_config:${ZONE}`]: row(driverAppConfig(ZONE, state) as unknown as Doc),
    [`rider_app_config:${ZONE}`]: row(riderAppConfig(ZONE, state) as unknown as Doc),
  });
}

const bookingOf = (rows: Record<string, Row>) => rows[`rider_app_config:${ZONE}`]!.document["booking"] as { pickupSpots?: { on: boolean }; maxStops?: number };

function edited(book: DispatchBook, patch: (zone: ReturnType<typeof liveRules>) => ReturnType<typeof liveRules>): DispatchBook {
  const done = publish(book, { [ZONE]: patch(liveRules(book, ZONE)) }, {}, [ZONE], "nora", NOW, "");
  assert.ok(!done.error, done.error ?? "");
  return done.book;
}

test("the Dispatch publish leaves booking.pickupSpots out when the rider document was not read (the rest of booking stays)", () => {
  // G2: every Dispatch publish also writes the rider features.pin (from pickupPin.required).
  assert.deepEqual(dispatchOwnedFor(true), { ...OWNED.dispatch, riderAlways: ["features.pin"] });
  assert.deepEqual(dispatchOwnedFor(false).riderAlways, ["features.pin"]);
  const unread = dispatchOwnedFor(false);
  assert.ok(unread.rider.includes("booking"), "the other booking parts (stops, pickup move, shortest ride) are still published");
  assert.deepEqual(unread.riderServerKeeps, ["booking.pickupSpots"]);
  assert.ok(!unread.rider.includes("shareTrip"), "S10 SF-A1 unchanged");
  assert.deepEqual(unread.driver, OWNED.dispatch.driver);
});

test("read failed: the page's guess (on) is never published — a zone with the chips off stays off", async () => {
  const { http, rows, state } = zoneOff();
  try {
    state.riderReadFails = true;
    const settings = createLiveSettings(http, () => NOW);
    const book = (await settings.readSlice(DISPATCH_KEY, null)) as DispatchBook;
    state.riderReadFails = false;
    assert.equal(liveRules(book, ZONE).pickupSpots?.on ?? true, true, "the browser's own value (default on) is shown");
    // An unrelated booking change is published; the chips switch is not written.
    const next = edited(book, (zone) => ({ ...zone, stops: { ...zone.stops, max: zone.stops.max === 2 ? 3 : 2 } }));
    assert.equal(await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: next }), "Published.");
    assert.equal(bookingOf(rows).maxStops, liveRules(next, ZONE).stops.max, "the rest of booking is published");
    assert.deepEqual(bookingOf(rows).pickupSpots, { on: false }, "unrelated publish");
    // A book whose chips switch differs from what was shown: refused, nothing written.
    const toggled = edited(next, (zone) => ({ ...zone, pickupSpots: { on: !(zone.pickupSpots?.on ?? true) } }));
    state.puts.length = 0;
    await assert.rejects(async () => settings.command("admin.dispatch.publish", { targetId: "dispatch", value: toggled }), /Pickup entrance chips could not be read/);
    assert.deepEqual(state.puts, [], "nothing is written");
    assert.deepEqual(bookingOf(rows).pickupSpots, { on: false });
    // After a read that worked the switch is the server's (off) and the admin can turn it on.
    const read = (await settings.readSlice(DISPATCH_KEY, next)) as DispatchBook;
    assert.deepEqual(liveRules(read, ZONE).pickupSpots, { on: false });
    const on = edited(read, (zone) => ({ ...zone, pickupSpots: { on: true } }));
    assert.equal(await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: on }), "Published.");
    assert.deepEqual(bookingOf(rows).pickupSpots, { on: true });
  } finally {
    setLiveMarketZones(null);
  }
});

test("keepPaths: a kept path takes the value before the edit; with no document before it is left out", () => {
  const after: Doc = { booking: { maxStops: 2, pickupSpots: { on: true } }, tips: [1] };
  assert.deepEqual(keepPaths(after, { booking: { maxStops: 3, pickupSpots: { on: false } } }, ["booking.pickupSpots"]), { booking: { maxStops: 2, pickupSpots: { on: false } }, tips: [1] });
  assert.deepEqual(keepPaths(after, null, ["booking.pickupSpots"]), { booking: { maxStops: 2 }, tips: [1] });
  assert.deepEqual(after, { booking: { maxStops: 2, pickupSpots: { on: true } }, tips: [1] }, "the input is not changed");
});
