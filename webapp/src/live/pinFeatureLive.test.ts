import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, publish } from "../dispatch/rules.ts";
import { dispatchDocumentOf, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { emptyConfig } from "../config/book.ts";

/**
 * G2 (Rules audits/impact/trip-pin-check-2026-11-27.md; Fable NO-GO on Admin #408 at 1f66b5ad): on live, every Dispatch
 * and Settings publish writes the rider document's features.pin from the zone's pickupPin.required, also when it did
 * not change, so a stale server value is corrected. Fails before: no publish ever wrote features.pin (Dispatch does
 * not own `features`, and a Settings publish only writes changed leaves).
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
type Call = { method: string; path: string; body?: unknown };

function server(riderPin: boolean, driverPinRequired: boolean, options: { riderReadFailsOnce?: boolean } = {}) {
  const rider = { ...sample("rider_app_config"), zoneId: "Z002", features: { ...(sample("rider_app_config")["features"] as Doc), pin: riderPin } };
  const driverBase = sample("driver_app_config");
  const driver = { ...driverBase, zoneId: "Z002", pickupPin: { required: driverPinRequired, maxAttempts: 5, lockMinutes: 5 } };
  const drafts: Record<string, { version: number; liveVersion: number; usesStandard: boolean; document: Doc }> = {
    "dispatch:Z002": { version: 2, liveVersion: 2, usesStandard: false, document: dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z002"), "Z002", null) },
    "rider_app_config:Z002": { version: 3, liveVersion: 3, usesStandard: false, document: rider },
    "driver_app_config:Z002": { version: 3, liveVersion: 3, usesStandard: false, document: driver },
  };
  const calls: Call[] = [];
  let riderFails = options.riderReadFailsOnce ? 1 : 0;
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]!}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const key = keyOf(path);
      if (key === "rider_app_config:Z002" && riderFails > 0) { riderFails -= 1; throw Object.assign(new Error("down"), { status: 503 }); }
      const found = drafts[key];
      if (!found) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(found) as T;
    },
    put: async <T,>(_path: string, body: unknown) => { calls.push({ method: "PUT", path: _path, body }); return { version: (body as { expectedVersion: number }).expectedVersion + 1 } as T; },
    post: async <T,>(path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return { version: 7 } as T; },
  };
  return { http, calls };
}

const riderPut = (calls: Call[]) => (calls.find((c) => c.method === "PUT" && c.path.endsWith("/rider_app_config"))?.body as { document: Doc } | undefined)?.document;
const pinOf = (doc: Doc | undefined) => (doc?.["features"] as { pin?: boolean } | undefined)?.pin;

async function dispatchPublish(s: ReturnType<typeof server>, edit: (zone: ReturnType<typeof liveRules>) => ReturnType<typeof liveRules>) {
  const settings = createLiveSettings(s.http, () => "2026-11-28T10:00:00Z");
  const book = (await settings.readSlice(DISPATCH_KEY, emptyDispatchBook())) as ReturnType<typeof emptyDispatchBook>;
  const working = { Z002: edit(liveRules(book, "Z002")) };
  const published = publish({ ...book, draft: working }, working, {}, ["Z002"], "A1", "2026-11-28T10:00:00Z", "test", { direct: true }).book;
  s.calls.length = 0;
  await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: published });
  return riderPut(s.calls);
}

test("G2 live (a): Dispatch › Safety PIN on → the rider document's features.pin is published true", async () => {
  const s = server(false, false);
  const doc = await dispatchPublish(s, (zone) => ({ ...zone, pickupPin: { ...zone.pickupPin, required: true } }));
  assert.equal(pinOf(doc), true);
});

test("G2 live (b): the server holds a stale features.pin true, the PIN is off → a Dispatch publish writes false", async () => {
  const s = server(true, false);
  const doc = await dispatchPublish(s, (zone) => ({ ...zone, stops: { ...zone.stops, on: true, max: 4 } }));
  assert.equal(pinOf(doc), false);
});

test("G2 live (b'): the server holds a stale features.pin true, the PIN is off → a Settings publish writes false", async () => {
  const s = server(true, false);
  const settings = createLiveSettings(s.http, () => "2026-11-28T10:00:00Z");
  const start = emptyConfig();
  await settings.readSlice(DISPATCH_KEY, emptyDispatchBook());
  await settings.readSlice("config", start);
  const value = { ...start, published: { ...start.published, switches: start.published.switches.map((item) => (item.app === "rider" && item.id === "wallet" ? { ...item, on: false } : item)) } };
  s.calls.length = 0;
  await settings.command("admin.config.publish", { targetId: "configuration", value, scope: "Z002" });
  assert.equal(pinOf(riderPut(s.calls)), false);
});

test("G2 live: the rider read failed → the publish still writes features.pin from the driver document's pickupPin", async () => {
  const s = server(true, false, { riderReadFailsOnce: true });
  const doc = await dispatchPublish(s, (zone) => ({ ...zone, stops: { ...zone.stops, on: true, max: 4 } }));
  assert.equal(pinOf(doc), false);
});
