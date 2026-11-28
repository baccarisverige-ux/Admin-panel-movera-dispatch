import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DISPATCH_KEY, emptyDispatchBook } from "../dispatch/rules.ts";
import { dispatchDocumentOf, type ConfigHttp, type Doc } from "./configDocs.ts";
import { liveRules } from "../dispatch/rules.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { emptyConfig } from "../config/book.ts";

/**
 * G2 follow-up (reviewer NO-GO on Admin #408 at a74b69dc): a Settings publish wrote the rider features.pin from the
 * Dispatch state even when that state was not loaded (or its driver read failed), so the default `false` overwrote a
 * zone whose PIN is on. When pickupPin.required is not known, features.pin must stay the server's.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
type Call = { method: string; path: string; body?: unknown };

function server(options: { driverReadFails?: boolean } = {}) {
  const rider = { ...sample("rider_app_config"), zoneId: "Z002", features: { ...(sample("rider_app_config")["features"] as Doc), pin: true } };
  const driver = { ...sample("driver_app_config"), zoneId: "Z002", pickupPin: { required: true, maxAttempts: 5, lockMinutes: 5 } };
  const drafts: Record<string, { version: number; liveVersion: number; usesStandard: boolean; document: Doc }> = {
    "dispatch:Z002": { version: 2, liveVersion: 2, usesStandard: false, document: dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z002"), "Z002", null) },
    "rider_app_config:Z002": { version: 3, liveVersion: 3, usesStandard: false, document: rider },
    "driver_app_config:Z002": { version: 3, liveVersion: 3, usesStandard: false, document: driver },
  };
  const calls: Call[] = [];
  let driverFails = options.driverReadFails ? 1 : 0;
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]!}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const key = keyOf(path);
      if (key === "driver_app_config:Z002" && driverFails > 0) { driverFails -= 1; throw Object.assign(new Error("down"), { status: 503 }); }
      const found = drafts[key];
      if (!found) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(found) as T;
    },
    put: async <T,>(path: string, body: unknown) => { calls.push({ method: "PUT", path, body }); return { version: (body as { expectedVersion: number }).expectedVersion + 1 } as T; },
    post: async <T,>(path: string, body: unknown) => { calls.push({ method: "POST", path, body }); return { version: 7 } as T; },
  };
  return { http, calls };
}

const riderPut = (calls: Call[]) => (calls.find((c) => c.method === "PUT" && c.path.endsWith("/rider_app_config"))?.body as { document: Doc } | undefined)?.document;
const pinOf = (doc: Doc | undefined) => (doc?.["features"] as { pin?: boolean } | undefined)?.pin;

async function settingsPublish(s: ReturnType<typeof server>, readDispatch: boolean) {
  const settings = createLiveSettings(s.http, () => "2026-11-28T10:00:00Z");
  const start = emptyConfig();
  if (readDispatch) await settings.readSlice(DISPATCH_KEY, emptyDispatchBook()).catch(() => undefined);
  await settings.readSlice("config", start);
  const value = { ...start, published: { ...start.published, switches: start.published.switches.map((item) => (item.app === "rider" && item.id === "wallet" ? { ...item, on: false } : item)) } };
  s.calls.length = 0;
  await settings.command("admin.config.publish", { targetId: "configuration", value, scope: "Z002" });
  return riderPut(s.calls);
}

test("G2 NO-GO: Dispatch state never loaded → a Settings publish leaves the server's features.pin true", async () => {
  const doc = await settingsPublish(server(), false);
  assert.ok(doc, "the rider document is published");
  assert.equal(pinOf(doc), true);
});

test("G2 NO-GO: the Dispatch driver read failed → a Settings publish leaves the server's features.pin true", async () => {
  const doc = await settingsPublish(server({ driverReadFails: true }), true);
  assert.ok(doc, "the rider document is published");
  assert.equal(pinOf(doc), true);
});

test("G2: Dispatch state loaded with PIN on → a Settings publish keeps features.pin true", async () => {
  const doc = await settingsPublish(server(), true);
  assert.equal(pinOf(doc), true);
});
