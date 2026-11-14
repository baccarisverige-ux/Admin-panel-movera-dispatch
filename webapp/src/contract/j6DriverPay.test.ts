/**
 * S5 J6a (contract v0.18.82 #124, contract.json#moneyBase.adminFare; owner Q-M7 2026-11-12 "If admin increase fare it's
 * only for the driver side !! The rider pay same amount when booked"; Q-S5-8 2026-11-13 "Admin types driver pay",
 * "No, without tip", "The change", "32 DT, keep change"). The trip page's adjust field is "Driver pay": the admin types
 * the driver's new pay, the panel sends driverPay (never the old fare), and says the rider pays the same. Rule 36:
 * written before the code. Ships in the same hour as server J6 (server first).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { createLiveAdminApi } from "../live/liveAdminApi.ts";
import { errorText } from "../live/format.ts";
import { driverPayAdjustBody } from "../live/moneyGuard.ts";
import type { LiveClient } from "../live/session.ts";
import { COMMANDS, COLLECTION_WRITES } from "../commands/registry.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const TRIP = { tripId: "trp_1", version: 7, status: "rider_onboard", fare: { amountMinor: 30_000, currency: "TND" }, zoneId: "TN-TC" };

function fakeClient() {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async (path: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        posts.push({ path, body: JSON.parse(init.body ?? "{}") });
        return { ...TRIP, version: TRIP.version + 1 };
      }
      return TRIP;
    },
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return { ...TRIP, version: TRIP.version + 1 }; },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}

test("the contract says the admin types the driver's pay and the old fare is refused", () => {
  const text = String(C.moneyBase.adminFare);
  assert.match(text, /driverPay/);
  assert.match(text, /fare_is_driver_pay/);
  assert.match(text, /'Driver pay'/);
});

test("J6a: the adjust body carries driverPay in the trip currency and the version the page shows; never fare", () => {
  const body = driverPayAdjustBody(TRIP, 32_000, " Long detour ");
  assert.deepEqual(body, { expectedVersion: 7, driverPay: { amountMinor: 32_000, currency: "TND" }, reason: "Long detour" });
  assert.equal("fare" in body, false);
});

test("J6a: the live adjust command posts driverPay (32 DT), not the rider's price", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  await api.command({ before: "30,000 DT", after: "32,000 DT", action: "admin.trip.adjust", targetId: "trp_1", reason: "Long detour", patch: { driverPayMinor: 32_000 } });
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.path, "/admin/trips/trp_1/adjust");
  assert.deepEqual(posts[0]!.body, { expectedVersion: 7, driverPay: { amountMinor: 32_000, currency: "TND" }, reason: "Long detour" });
});

test("J6a: no pay typed (or below 0) is refused in the panel; nothing is sent", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  for (const driverPayMinor of [null, "", -1, 1.5]) {
    await assert.rejects(api.command({ before: "", after: "", action: "admin.trip.adjust", targetId: "trp_1", reason: "x", patch: { driverPayMinor } }), (error: unknown) => error instanceof ApiError && error.status === 400);
  }
  assert.equal(posts.length, 0);
});

test("J6a: the command is named Driver pay and patches the driver's pay, never the fare", () => {
  assert.equal(COMMANDS.find((c) => c.id === "admin.trip.adjust")?.label, "Driver pay");
  assert.deepEqual(COLLECTION_WRITES["admin.trip.adjust"], { trips: ["driverPayMinor"] });
});

test("J6a: the server's refusals read in the admin's words", () => {
  const refusal = (reason: string) => errorText(new ApiError(400, "server text", { code: "invalid_request", reason }));
  assert.equal(refusal("fare_is_driver_pay"), "Type the driver's pay. The rider's price cannot be changed.");
  assert.equal(refusal("driver_pay_above_max"), "The change to the driver's pay is above this country's limit (Pricing › Tips & limits).");
  assert.equal(refusal("driver_pay_below_zero"), "The driver's pay cannot go below 0.");
});

const TEXTS = [
  "Driver pay",
  "Save driver pay",
  "Driver's pay now: {0}",
  "The rider pays the same price as booked. The tip stays on top. Waiting or stops added later are added to this pay.",
  "Type the driver's pay.",
  "Driver pay saved. The rider pays the same.",
  "Type the driver's pay. The rider's price cannot be changed.",
  "The change to the driver's pay is above this country's limit (Pricing › Tips & limits).",
  "The driver's pay cannot go below 0.",
  "The driver's pay cannot be changed while the trip is {0}.",
  "Trip adjusted (driver pay, waiting or fee)",
];

// BQ-A28 (owner 2026-11-14, one wording): sv "Förarlön" became "Förarersättning", fr "Rémunération chauffeur" became
// "Rémunération du chauffeur", the same word as the after-the-end "Change the driver's pay" box.
test("J6a: every new text is in sv, fr and en (the field is \"Driver pay\" / \"Förarersättning\" / \"Rémunération du chauffeur\")", () => {
  for (const [lang, dictionary] of [["en", en], ["fr", fr], ["sv", sv]] as const) {
    for (const key of TEXTS) assert.ok((dictionary as Record<string, string>)[key], `${lang}: ${key}`);
  }
  assert.equal((sv as Record<string, string>)["Driver pay"], "Förarersättning");
  assert.equal((fr as Record<string, string>)["Driver pay"], "Rémunération du chauffeur");
});
