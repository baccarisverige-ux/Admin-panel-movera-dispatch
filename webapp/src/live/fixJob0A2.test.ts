import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import type { LiveClient } from "./session.ts";
import { countryRulesOf } from "./configDocs.ts";

/**
 * Fix job 0 (A2, contract v0.18.39, owner answers 2026-11-05): A2-2 Mark as paid with a reason (no "Ask rider to pay"),
 * A2-3 a manual payout run is approved only with a reason, A2-1 the wallet limit is one value per country.
 */
function fakeClient() {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ items: [], nextCursor: null }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return { riderId: "rdr_1", version: 2 }; },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}
const base = { before: "", after: "" };

test("A2-2: Mark as paid posts the owed fee of that trip with the admin's reason; no reason, no call", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  await assert.rejects(api.command({ ...base, action: "admin.rider.feeMarkPaid", targetId: "trp_9", reason: " ", value: { riderId: "rdr_1" } }));
  assert.equal(posts.length, 0);
  await api.command({ ...base, action: "admin.rider.feeMarkPaid", targetId: "trp_9", reason: "Paid by Swish", value: { riderId: "rdr_1" } });
  assert.deepEqual(posts, [{ path: "/admin/riders/rdr_1/fees/trp_9/mark-paid", body: { reason: "Paid by Swish" } }]);
});

test("A2-3: Approve run sends the reason; an empty reason is refused before any call", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  const value = { country: "FR", periodEnd: "2026-11-02T07:00:00.000Z" };
  await assert.rejects(api.command({ ...base, action: "admin.payout.approveRun", targetId: "FR", reason: "", value }));
  assert.equal(posts.length, 0);
  await api.command({ ...base, action: "admin.payout.approveRun", targetId: "FR", reason: "Bank file checked", value });
  assert.deepEqual(posts, [{ path: "/admin/payouts/runs/approve", body: { ...value, reason: "Bank file checked" } }]);
});

test("A2-1: the wallet limit is written in the country's own money (SE kr, FR €)", () => {
  assert.deepEqual(countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 }, walletCreditMax: 2900 }, null)["walletCreditMax"], { amountMinor: 290_000, currency: "SEK" });
  assert.deepEqual(countryRulesOf("FR", "EUR", { tips: [1], raiseSteps: [2], driverBonus: { defaultLimit: 20, hardMax: 95 }, walletCreditMax: 250 }, null)["walletCreditMax"], { amountMinor: 25_000, currency: "EUR" });
});
