import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, publish } from "../dispatch/rules.ts";
import { dispatchDocumentOf, type Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * Owner 2026-11-16, button "Stay on Standard (Rec.)" (Rules audits/impact/country-undo-supervisor.md section 7):
 * in Settings and Dispatch, when the Standard is published together with its zones, a zone that uses the Standard
 * stays on it and gets the change through it; only a zone with settings of its own is written directly. Before, every
 * chosen zone got a copy of its own (the pattern that detached the 11 Sweden zones in Tips & limits).
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
const wrote = (server: ReturnType<typeof fakeConfigServer>, doc: string) => [...new Set(server.calls.filter((c) => c.method === "PUT" && c.path.endsWith(`/${doc}`)).map((c) => (c.body as { zoneId?: string; country?: string }).zoneId ?? `standard-${(c.body as { country?: string }).country}`))].sort();

function settingsServer() {
  return fakeConfigServer({
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
    "driver_app_config:standard-SE": { liveVersion: 5, document: sample("driver_app_config") },
    // Z003 has app settings of its own; Z001 and Z002 use the Standard.
    "rider_app_config:Z003": { liveVersion: 9, document: { ...sample("rider_app_config"), zoneId: "Z003", marker: "own" } },
    "driver_app_config:Z003": { liveVersion: 6, document: { ...sample("driver_app_config"), zoneId: "Z003", marker: "own" } },
  });
}

test("Settings › Publish with the Standard and its zones: a zone on the Standard is not given a copy", async () => {
  const server = settingsServer();
  const settings = createLiveSettings(server.http, () => "2026-11-16T09:00:00Z");
  const said = String(await settings.command("admin.config.publish", { targetId: "configuration", value: null, scope: "standard-SE,Z001,Z002,Z003" }));
  for (const doc of ["rider_app_config", "driver_app_config"]) {
    assert.ok(wrote(server, doc).includes("standard-SE"), `${doc}: the Standard is written`);
    assert.equal(wrote(server, doc).includes("Z001"), false, `${doc}: Z001 uses the Standard, no copy`);
    assert.equal(wrote(server, doc).includes("Z002"), false, `${doc}: Z002 uses the Standard, no copy`);
    assert.equal(server.live(`${doc}:Z001`), 0);
  }
  assert.match(said, /use the Standard/);
  assert.match(said, /Norrmalm/);
});

test("Settings › Publish to zones WITHOUT the Standard still gives each its own (how a zone is made different)", async () => {
  const server = settingsServer();
  const settings = createLiveSettings(server.http, () => "2026-11-16T09:00:00Z");
  await settings.command("admin.config.publish", { targetId: "configuration", value: null, scope: "Z001" });
  assert.deepEqual(wrote(server, "driver_app_config"), ["Z001"]);
  assert.ok(server.live("driver_app_config:Z001") > 0);
});

test("Dispatch › Publish with the Standard and a zone on it holding the SAME rules: the zone stays on the Standard", async () => {
  const book0 = emptyDispatchBook();
  const rules = (id: string) => dispatchDocumentOf(liveRules(book0, id), id, null);
  const server = fakeConfigServer({
    "dispatch:standard-SE": { liveVersion: 1, document: rules("standard-SE") },
    "dispatch:Z003": { liveVersion: 2, document: rules("Z003") },
  });
  const settings = createLiveSettings(server.http, () => "2026-11-16T09:00:00Z");
  const book = (await settings.readSlice(DISPATCH_KEY, emptyDispatchBook())) as ReturnType<typeof emptyDispatchBook>;
  const edit = (id: string) => ({ ...liveRules(book, id), radar: { ...liveRules(book, id).radar, seconds: 33 } });
  // The same change in the Standard, in Z001 (uses the Standard) and in Z003 (its own rules).
  const working = { "standard-SE": edit("standard-SE"), Z001: edit("standard-SE"), Z003: edit("Z003") };
  const published = publish({ ...book, draft: working }, working, {}, ["standard-SE", "Z001", "Z003"], "A1", "2026-11-16T09:00:00Z", "test", { direct: true }).book;
  server.calls.length = 0;
  const said = String(await settings.command("admin.dispatch.publish", { targetId: "dispatch rules", value: published }));
  assert.deepEqual(wrote(server, "dispatch"), ["Z003", "standard-SE"]);
  assert.equal(server.live("dispatch:Z001"), 0, "Z001 still uses the Standard");
  assert.match(said, /use the Standard/);
});

test("Dispatch › Publish: a zone on the Standard whose rules DIFFER from the Standard's still gets its own", async () => {
  const book0 = emptyDispatchBook();
  const server = fakeConfigServer({ "dispatch:standard-SE": { liveVersion: 1, document: dispatchDocumentOf(liveRules(book0, "standard-SE"), "standard-SE", null) } });
  const settings = createLiveSettings(server.http, () => "2026-11-16T09:00:00Z");
  const book = (await settings.readSlice(DISPATCH_KEY, emptyDispatchBook())) as ReturnType<typeof emptyDispatchBook>;
  const edit = (seconds: number) => ({ ...liveRules(book, "standard-SE"), radar: { ...liveRules(book, "standard-SE").radar, seconds } });
  const working = { "standard-SE": edit(33), Z001: edit(44) };
  const published = publish({ ...book, draft: working }, working, {}, ["standard-SE", "Z001"], "A1", "2026-11-16T09:00:00Z", "test", { direct: true }).book;
  server.calls.length = 0;
  await settings.command("admin.dispatch.publish", { targetId: "dispatch rules", value: published });
  assert.deepEqual(wrote(server, "dispatch"), ["Z001", "standard-SE"]);
});
