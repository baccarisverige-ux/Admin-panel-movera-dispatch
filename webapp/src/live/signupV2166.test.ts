/**
 * Contract v0.18.166 (contract.json#signupV2; owner 2026-11-26 "Oui, tout construire", "Oui, ajouter l'adresse
 * (Recommandé)"): Drivers › Onboarding has the sign-up fields and a "Recto verso" switch per document type (defaults as
 * the contract), and the driver page changes the home address (admin.driver.address → POST /admin/drivers/{id}/address
 * { expectedVersion, address, reason }).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { commandById } from "../commands/registry.ts";
import { SIGNUP_FIELDS, SIGNUP_FIELD_DEFAULTS, TWO_SIDED_DEFAULTS, signUpFieldsOf, twoSidedOf } from "../drivers/onboardingSettings.ts";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { LIVE_COMMANDS } from "./liveCommands.ts";
import type { LiveClient } from "./session.ts";
import { cleanAddress } from "./driverAddress.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC67SignupV2 } from "../i18n/en/c67-signup-v2.ts";

type SV = { signUpFields: { fields: string[]; defaults: Record<string, unknown> }; twoSided: { defaults: Record<string, string[]> }; address: { adminEdit: string } };
const contract = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8")) as { version: string; signupV2: SV };

test("the admin defaults equal the contract's (sign-up fields and recto verso)", () => {
  const sv2 = contract.signupV2;
  assert.deepEqual([...SIGNUP_FIELDS], sv2.signUpFields.fields);
  assert.deepEqual(SIGNUP_FIELD_DEFAULTS, sv2.signUpFields.defaults);
  assert.deepEqual(TWO_SIDED_DEFAULTS, sv2.twoSided.defaults);
  assert.deepEqual(signUpFieldsOf({ country: "SE", signUpFields: { address: { on: false, required: false } } }).address, { on: false, required: false });
  assert.deepEqual(twoSidedOf({ country: "FR" }), ["national_id", "driving_license", "vtc_card"]);
  assert.deepEqual(twoSidedOf({ country: "FR", twoSidedTypes: [] }), []);
});

test("admin.driver.address: live, drivers.activate with a reason; sends the read version, the trimmed address and reason", async () => {
  assert.ok(contract.signupV2.address.adminEdit.includes("drivers.activate"));
  assert.ok(LIVE_COMMANDS.has("admin.driver.address"));
  assert.equal(commandById("admin.driver.address")?.permission, "drivers.activate");
  assert.equal(commandById("admin.driver.address")?.reason, true);
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test", state: () => ({ accessToken: "a" }), admin: () => ({ adminId: "adm_1" }), subscribe: () => () => undefined,
    json: async () => ({ driverId: "drv_1", version: 4, zoneIds: [], accountStatus: "pending", documents: [] }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return { driverId: "drv_1", version: 5, zoneIds: [] }; },
    put: async () => ({}), del: async () => ({}),
  } as unknown as LiveClient;
  const api = createLiveAdminApi(client);
  const base = { before: "", after: "" };
  await api.command({ ...base, action: "admin.driver.address", targetId: "drv_1", reason: " Moved ", value: { address: { street: " 2 rue de Rivoli ", postalCode: "75004", city: "Paris" } } });
  assert.deepEqual(posts, [{ path: "/admin/drivers/drv_1/address", body: { expectedVersion: 4, address: { street: "2 rue de Rivoli", postalCode: "75004", city: "Paris" }, reason: "Moved" } }]);
  await assert.rejects(api.command({ ...base, action: "admin.driver.address", targetId: "drv_1", reason: "x", value: { address: { street: "a", postalCode: "", city: "b" } } }));
  await assert.rejects(api.command({ ...base, action: "admin.driver.address", targetId: "drv_1", reason: " ", value: { address: { street: "a", postalCode: "1", city: "b" } } }));
  assert.equal(posts.length, 1);
  assert.equal(cleanAddress({ street: "x".repeat(201), postalCode: "1", city: "c" }), null);
});

test("every c67 text exists in en, fr and sv", () => {
  for (const key of Object.keys(enC67SignupV2)) for (const dict of [en, fr, sv] as Array<Record<string, string>>) assert.ok(dict[key], key);
  assert.equal((sv as Record<string, string>)["Personal identity number"], "Personnummer");
});
