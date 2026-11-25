/**
 * v0.18.159 fleet needs a car (contract.json#fleetNeedsCar; owner 2026-11-24 "No but in sheet must see that it's missing to
 * add car", mockup PROPOSAL-fleet-add-car-2026-11-24.html part C): the fleet review sheet's Cars line, Approve locked while
 * the fleet has no car and the country's setting is on, the 409 fleet_has_no_car text, the per-country setting (default
 * on) and its texts in sv / fr. Rule 36: written before the code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { contractJson } from "../contract/load.ts";
import { defaultDoc, normalizeSettingsBook, wireDocument, emptySettingsBook, type SettingsDoc } from "../drivers/onboardingSettings.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { fleetCarLine } from "./fleetNeedsCar.ts";
import { errorText } from "./format.ts";

test("v0.18.159: the server's approvalBlockedReason fleet_has_no_car → '✕ Car missing: no car added', Approve locked with the reason", () => {
  assert.deepEqual(fleetCarLine(0, "fleet_has_no_car"), { tone: "bad", text: "✕ Car missing: no car added", locked: true, lockText: "Approve is locked until the owner adds at least 1 car." });
});

test("v0.18.159: cars → '✓ N cars', never locked; setting off (no reason from the server) → still shown missing, never locked", () => {
  assert.deepEqual(fleetCarLine(1, undefined), { tone: "ok", text: "✓ 1 car", locked: false });
  assert.deepEqual(fleetCarLine(3, undefined), { tone: "ok", text: "✓ 3 cars", locked: false });
  assert.deepEqual(fleetCarLine(0, undefined), { tone: "bad", text: "✕ Car missing: no car added", locked: false });
});

test("v0.18.159: the sheet never reads the onboarding draft (no settings.read needed; a draft never decides)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./LiveCompanyReview.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("/admin/config/onboarding"), "no read of the onboarding document");
  assert.ok(src.includes("fleet.approvalBlockedReason"), "the server's reason decides");
});

test("v0.18.159: a 409 fleet_has_no_car says why", () => {
  const error = new ApiError(409, "Conflict", { code: "invalid_transition", reason: "fleet_has_no_car" });
  assert.equal(errorText(error), "Approve is locked until the owner adds at least 1 car.");
});

test("v0.18.159: the onboarding setting is on by default per country, survives an old saved book (missing = on) and is sent", () => {
  for (const country of ["SE", "FR", "TN"] as const) assert.equal(defaultDoc(country).fleetNeedsCarForApproval, true, `${country} default on`);
  const old = emptySettingsBook();
  for (const country of ["SE", "FR", "TN"] as const) delete (old.countries[country].document as Partial<SettingsDoc>).fleetNeedsCarForApproval;
  const read = normalizeSettingsBook(old);
  assert.equal(read.countries.SE.document.fleetNeedsCarForApproval, true, "missing = on");
  const off: SettingsDoc = { ...read.countries.SE.document, fleetNeedsCarForApproval: false };
  assert.equal(normalizeSettingsBook({ ...read, countries: { ...read.countries, SE: { ...read.countries.SE, document: off } } }).countries.SE.document.fleetNeedsCarForApproval, false, "a saved OFF stays off");
  assert.equal(wireDocument(off).fleetNeedsCarForApproval, false, "PUT sends it");
  const c = contractJson<{ driverOnboarding: { settings: { defaults: Record<string, { fleetNeedsCarForApproval: boolean }> } } }>("contract.json");
  assert.equal(c.driverOnboarding.settings.defaults.SE.fleetNeedsCarForApproval, true, "the contract default");
});

test("v0.18.159: every new text has Swedish and French", () => {
  const keys = ["✕ Car missing: no car added", "Approve is locked until the owner adds at least 1 car.", "✓ {0} car", "✓ {0} cars", "Cars", "Fleet needs at least 1 car before approval", "On: Movera cannot approve a fleet until its owner has added at least one car.", "Fleet approval"];
  for (const key of keys) {
    assert.ok(key in en, `en ${key}`);
    assert.ok(sv[key as keyof typeof sv] && sv[key as keyof typeof sv] !== key, `sv ${key}`);
    assert.ok(fr[key as keyof typeof fr] && fr[key as keyof typeof fr] !== key, `fr ${key}`);
  }
});

test("v0.18.159: Fleet owners › Activate refused with 409 fleet_has_no_car shows the admin's own text", async () => {
  const { createLiveAdminApi } = await import("./liveAdminApi.ts");
  const fleet = { fleetId: "F9", name: "Lind Taxi AB", orgNumber: "559000-0009", country: "SE", cityId: "stockholm_lan", ownerDriverId: "D2001", ownerName: "Sara Lind", status: "pending", driverCount: 1, vehicleCount: 0, createdAt: "2026-11-24T00:00:00Z", version: 1 };
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ items: [fleet], nextCursor: null }),
    post: async () => { throw new ApiError(409, "Conflict", { code: "invalid_transition", reason: "fleet_has_no_car" }); },
    put: async () => ({}),
    del: async () => ({}),
  } as never;
  const api = createLiveAdminApi(client);
  await assert.rejects(api.command({ before: "", after: "", action: "admin.fleetOwner.activate", targetId: "D2001", reason: "Papers checked" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.reason, "fleet_has_no_car");
    assert.equal(error.message, "Approve is locked until the owner adds at least 1 car.");
    return true;
  });
});
