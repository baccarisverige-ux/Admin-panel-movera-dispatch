import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPricingStore, type PricingStore } from "../pricing/zonePricing.ts";
import type { Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { readPricingExtras } from "./livePricingOps.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * Live 2026-11-16 (Rules audits/impact/country-undo.md, cause 2): the admin never asked the history of a country's
 * Standard, because the server took a zone only (404 for standard-SE). The server now takes `country` (commit
 * fad59d5): Pricing › History shows the Standard's published versions, and Restore / Undo name the country.
 */
const pricing = (base: number): Doc => ({ zoneId: "Z001", currency: "SEK", categories: { economy: { base: { amountMinor: base, currency: "SEK" } } } });

function seeded(options: { countryHistory?: boolean } = {}) {
  return fakeConfigServer({ "pricing:standard-SE": { liveVersion: 1, document: pricing(4500) }, "pricing:Z001": { liveVersion: 2, document: pricing(5000) } }, options);
}
async function publishStandard(server: ReturnType<typeof seeded>, base: number) {
  const draft = await server.http.json<{ version: number }>("/admin/config/pricing?country=SE");
  const put = await server.http.put<{ version: number }>("/admin/config/pricing", { expectedVersion: draft.version, country: "SE", document: pricing(base) });
  await server.http.post("/admin/config/pricing/publish", { expectedVersion: put.version, country: "SE" });
}

test("Pricing › History reads a Standard's history with country=<CC>, never zoneId=standard-<CC>", async () => {
  const server = seeded();
  await publishStandard(server, 4700);
  server.calls.length = 0;
  const { store, index } = await readPricingExtras(server.http, emptyPricingStore(), ["standard-SE", "Z001"]);
  const asked = server.calls.filter((c) => c.path.includes("/history")).map((c) => c.path);
  assert.ok(asked.includes("/admin/config/pricing/history?country=SE&limit=20"), asked.join("\n"));
  assert.equal(asked.some((path) => path.includes("zoneId=standard-")), false);
  const standard = store.history.filter((row) => row.zoneIds.includes("standard-SE"));
  assert.deepEqual(standard.map((row) => row.changes[0]), ["Standard · version 2", "Standard · version 1"]);
  assert.deepEqual([...index.values()].filter((row) => row.zoneId === "standard-SE").map((row) => [row.version, row.liveVersion]), [[2, 2], [1, 2]]);
  // A Standard is still not a zone: no surge schedule is asked for it.
  assert.equal(server.calls.some((c) => c.path.includes("/admin/zones/standard-")), false);
});

test("Restore and Undo of a Standard's pricing name the country", async () => {
  const server = seeded();
  await publishStandard(server, 4700);
  const settings = createLiveSettings(server.http, () => "2026-11-16T07:00:00Z");
  const store = (await settings.readSlice("zonePricing", null)) as PricingStore;
  const row = store.history.find((item) => item.zoneIds.includes("standard-SE") && item.changes[0] === "Standard · version 1")!;
  server.calls.length = 0;
  await settings.command("admin.pricing.restore", { targetId: `pricing-rev-${row.rev}`, value: store });
  assert.deepEqual(server.calls.find((c) => c.method === "POST"), { method: "POST", path: "/admin/config/pricing/restore", body: { country: "SE", version: 1, expectedVersion: 2 } });
  assert.equal(server.live("pricing:standard-SE"), 3);
  // The newest publish is now the Standard's (the restore): Undo last pricing publish puts version 2 back, by country.
  const next = (await settings.readSlice("zonePricing", null)) as PricingStore;
  assert.deepEqual(next.history[0]!.zoneIds, ["standard-SE"]);
  server.calls.length = 0;
  await settings.command("admin.pricing.undo", { targetId: `pricing-rev-${next.history[0]!.rev}`, value: next });
  assert.deepEqual(server.calls.find((c) => c.method === "POST")!.body, { country: "SE", version: 2, expectedVersion: 3 });
});

test("a server that does not take a country yet: the page still opens, with the zones' history", async () => {
  const server = seeded({ countryHistory: false });
  const { store } = await readPricingExtras(server.http, emptyPricingStore(), ["standard-SE", "Z001"]);
  assert.deepEqual(store.history.map((row) => row.zoneIds[0]), ["Z001"]);
});
