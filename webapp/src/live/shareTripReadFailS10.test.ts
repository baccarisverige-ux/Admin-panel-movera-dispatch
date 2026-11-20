import { test } from "node:test";
import assert from "node:assert/strict";
import { setLiveMarketZones } from "../markets/markets.ts";
import { DISPATCH_KEY, liveRules, publish, zoneDefault, type DispatchBook } from "../dispatch/rules.ts";
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import { OWNED, dispatchDocumentOf, dispatchOwnedFor, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * BQ-S10 round 2, supervisor SF-A1 (audits/impact/s10-share-trip-supervisor.md "Admin + rider"): the zone's Share trip
 * switch lives in the rider document. When that read fails, the page shows the browser's own value (default on). A
 * Dispatch publish of that zone must then leave `shareTrip` out, so a zone switched off cannot come back on.
 */
const ZONE = "Z900";
const NOW = "2026-11-16T09:00:00Z";
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

/** The zone on the server: Share trip switched OFF in its rider document. */
function zoneOff() {
  setLiveMarketZones([{ id: ZONE, name: "Testzone", city: "Testzone", kind: "operating", center: [0, 0], country: "SE" }]);
  const zone = zoneDefault(ZONE);
  const state = appConfigState({ now: NOW, dispatch: { live: { [ZONE]: { ...zone, shareTrip: { on: false } } } } as never });
  const row = (document: Doc): Row => ({ version: 3, liveVersion: 3, usesStandard: false, document });
  return server({
    [`dispatch:${ZONE}`]: row(dispatchDocumentOf(zone, ZONE, null)),
    [`driver_app_config:${ZONE}`]: row(driverAppConfig(ZONE, state) as unknown as Doc),
    [`rider_app_config:${ZONE}`]: row(riderAppConfig(ZONE, state) as unknown as Doc),
  });
}

const shareOf = (rows: Record<string, Row>) => rows[`rider_app_config:${ZONE}`]!.document["shareTrip"];

function edited(book: DispatchBook, patch: (zone: ReturnType<typeof liveRules>) => ReturnType<typeof liveRules>): DispatchBook {
  const done = publish(book, { [ZONE]: patch(liveRules(book, ZONE)) }, {}, [ZONE], "nora", NOW, "");
  assert.ok(!done.error, done.error ?? "");
  return done.book;
}

test("the Dispatch publish keys leave shareTrip out when the rider document was not read", () => {
  assert.deepEqual(dispatchOwnedFor(true), OWNED.dispatch);
  assert.ok(!dispatchOwnedFor(false).rider.includes("shareTrip"));
  // v0.18.144: Live location lives in the same rider document, so it is left out too.
  assert.deepEqual(dispatchOwnedFor(false).rider, OWNED.dispatch.rider.filter((key) => key !== "shareTrip" && key !== "liveLocation"));
  assert.deepEqual(dispatchOwnedFor(false).driver, OWNED.dispatch.driver);
});

test("read ok: the page shows off, and an unrelated publish leaves the switch off", async () => {
  const { http, rows } = zoneOff();
  try {
    const settings = createLiveSettings(http, () => NOW);
    const book = (await settings.readSlice(DISPATCH_KEY, null)) as DispatchBook;
    assert.deepEqual(liveRules(book, ZONE).shareTrip, { on: false });
    const next = edited(book, (zone) => ({ ...zone, longTripKm: zone.longTripKm + 5 }));
    assert.equal(await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: next }), "Published.");
    assert.deepEqual(shareOf(rows), { on: false });
  } finally {
    setLiveMarketZones(null);
  }
});

test("read failed: the page's guess (on) is never published — a switched-off zone stays off", async () => {
  const { http, rows, state } = zoneOff();
  try {
    state.riderReadFails = true;
    const settings = createLiveSettings(http, () => NOW);
    const book = (await settings.readSlice(DISPATCH_KEY, null)) as DispatchBook;
    state.riderReadFails = false;
    assert.equal(liveRules(book, ZONE).shareTrip?.on ?? true, true, "the browser's own value (default on) is shown");
    // An unrelated change: nothing about Share trip is written.
    const next = edited(book, (zone) => ({ ...zone, longTripKm: zone.longTripKm + 5 }));
    assert.equal(await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: next }), "Published.");
    assert.deepEqual(shareOf(rows), { on: false }, "unrelated publish");
    // A book whose Share trip differs from what was shown (an older draft, a toggle on a value that was a guess): the
    // publish is refused with a clear message and nothing is written.
    const toggled = edited(next, (zone) => ({ ...zone, shareTrip: { on: !(zone.shareTrip?.on ?? true) } }));
    state.puts.length = 0;
    await assert.rejects(async () => settings.command("admin.dispatch.publish", { targetId: "dispatch", value: toggled }), /Share trip could not be read/);
    assert.deepEqual(state.puts, [], "nothing is written");
    assert.deepEqual(shareOf(rows), { on: false });
    // After a read that worked the switch is the server's (off) and the admin can turn it on.
    const read = (await settings.readSlice(DISPATCH_KEY, next)) as DispatchBook;
    assert.deepEqual(liveRules(read, ZONE).shareTrip, { on: false });
    const on = edited(read, (zone) => ({ ...zone, shareTrip: { on: true } }));
    assert.equal(await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: on }), "Published.");
    assert.deepEqual(shareOf(rows), { on: true });
  } finally {
    setLiveMarketZones(null);
  }
});
