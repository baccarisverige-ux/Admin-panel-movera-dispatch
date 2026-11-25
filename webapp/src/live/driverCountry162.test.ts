/**
 * Contract v0.18.162 (contract.json#driverCountryFirst; owner 2026-11-25 "Yes"): the driver page's Country field is the
 * only admin change (admin.driver.country → POST /admin/drivers/{id}/country { expectedVersion, country, reason }), a
 * driver with no country is a red error, and the server alert driver_no_country opens the driver page.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { commandById } from "../commands/registry.ts";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { LIVE_COMMANDS } from "./liveCommands.ts";
import type { LiveClient } from "./session.ts";
import { kindDef } from "../alerts/engine.ts";
import { LIVE_KIND_SOURCE } from "../alerts/reads.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC63DriverCountry } from "../i18n/en/c63-driver-country.ts";

const contract = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { version: string; driverCountryFirst: { adminSet: { route: string } }; alertDesk: { kindGroups: Record<string, string> } };

function fakeClient() {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ driverId: "drv_1", version: 7, zoneIds: [], accountStatus: "pending", documents: [] }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return { driverId: "drv_1", version: 8, country: "FR", zoneIds: ["FR-PC"] }; },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}
const base = { before: "", after: "" };

test("admin.driver.country is live, needs a reason and drivers.activate, as the contract says", () => {
  assert.ok(contract.driverCountryFirst.adminSet.route.includes("drivers.activate"));
  assert.ok(LIVE_COMMANDS.has("admin.driver.country"));
  const spec = commandById("admin.driver.country");
  assert.equal(spec?.permission, "drivers.activate");
  assert.equal(spec?.reason, true);
});

test("Save country: POST /admin/drivers/{id}/country with the read version, the country and the trimmed reason", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  await api.command({ ...base, action: "admin.driver.country", targetId: "drv_1", reason: " Works in Paris ", value: { country: "FR" } });
  assert.deepEqual(posts, [{ path: "/admin/drivers/drv_1/country", body: { expectedVersion: 7, country: "FR", reason: "Works in Paris" } }]);
  await assert.rejects(api.command({ ...base, action: "admin.driver.country", targetId: "drv_1", reason: " ", value: { country: "FR" } }));
  await assert.rejects(api.command({ ...base, action: "admin.driver.country", targetId: "drv_1", reason: "x", value: {} }));
  assert.equal(posts.length, 1, "nothing sent without a reason or a country");
});

test("the alert driver_no_country is a server kind of group system", () => {
  assert.equal(contract.alertDesk.kindGroups.driver_no_country, "system");
  assert.equal(kindDef("driver_no_country")?.group, "system");
  assert.equal(LIVE_KIND_SOURCE.driver_no_country, "server");
});

test("every new text is in en, sv and fr", () => {
  for (const key of Object.keys(enC63DriverCountry)) {
    for (const [lang, dict] of Object.entries({ en, sv, fr })) assert.ok((dict as Record<string, string>)[key], `${lang}: ${key}`);
  }
});
