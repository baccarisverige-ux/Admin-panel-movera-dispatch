import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { deletionSettingOf, deletionSettingProblem, readDeletionRequests, saveDeletionSetting, statusText, withDeletionSetting } from "./accountDeletion.ts";

/**
 * contract v0.18.134 (contract.json#accountDeletion; owner button 2026-11-20 "Accept, keep debt (Rec.)"): Riders ›
 * "Account deletion requests" (GET /admin/deletion-requests, read only) and the country setting
 * CountryRules.accountDeletion { eraseEnabled (off = count only), eraseAfterDays (30..365) } on the Standard.
 */
const C = contract as unknown as { version: string; accountDeletion: { adminStatus: string[] }; configDefaults: { accountDeletion: { eraseEnabled: boolean; eraseAfterDays: number } } };

test("the contract copy is 0.18.134 or later with the deletion rules", () => {
  const [a, b, c] = C.version.split(".").map(Number);
  assert.ok(a! > 0 || b! > 18 || (b === 18 && c! >= 134), C.version);
  assert.deepEqual(C.accountDeletion.adminStatus, ["requested", "waiting", "erased"]);
  assert.deepEqual(C.configDefaults.accountDeletion, { eraseEnabled: false, eraseAfterDays: 30 });
});

test("the list: GET /admin/deletion-requests, items and the dry-run count, never a phone", async () => {
  const asked: string[] = [];
  const client = { json: async (path: string) => { asked.push(path); return { items: [{ accountKind: "rider", accountId: "rdr_1", firstName: "Sara", requestedAt: "2026-11-20T10:00:00Z", eraseDueAt: "2026-12-20T10:00:00Z", status: "waiting", waitingReason: "erase_off", debt: { amount: { amountMinor: 6500, currency: "SEK" }, settled: false } }], dueNow: 1 }; } };
  const page = await readDeletionRequests(client as never);
  assert.deepEqual(asked, ["/admin/deletion-requests"]);
  assert.equal(page.items.length, 1);
  assert.equal(page.dueNow, 1);
  assert.equal(statusText(page.items[0]!), "Waiting: erasing is off (count only)");
  assert.equal(statusText({ ...page.items[0]!, status: "requested", waitingReason: undefined }), "Requested");
  assert.equal(statusText({ ...page.items[0]!, status: "erased", waitingReason: undefined }), "Erased");
  assert.equal(statusText({ ...page.items[0]!, waitingReason: "open_trip" }), "Waiting: open trip");
});

test("a bad answer is an empty list, not a crash", async () => {
  const page = await readDeletionRequests({ json: async () => null } as never);
  assert.deepEqual(page, { items: [], dueNow: 0 });
});

test("the setting: defaults off / 30, bounds 30..365", () => {
  assert.deepEqual(deletionSettingOf({}), { eraseEnabled: false, eraseAfterDays: 30 });
  assert.deepEqual(deletionSettingOf({ accountDeletion: { eraseEnabled: true, eraseAfterDays: 45 } }), { eraseEnabled: true, eraseAfterDays: 45 });
  assert.equal(deletionSettingProblem(30), null);
  assert.equal(deletionSettingProblem(365), null);
  assert.ok(deletionSettingProblem(29));
  assert.ok(deletionSettingProblem(366));
  assert.ok(deletionSettingProblem(30.5));
});

test("saving keeps every other key of the Standard's document and publishes it", async () => {
  const calls: Array<[string, string, unknown]> = [];
  const draft = { version: 4, liveVersion: 3, usesStandard: false, document: { country: "SE", maxRiderDebt: { amountMinor: 20000, currency: "SEK" }, calls: { adminCallRoles: ["super"] } } };
  const http = {
    json: async (path: string) => { calls.push(["GET", path, null]); return draft; },
    put: async (path: string, body: unknown) => { calls.push(["PUT", path, body]); return { version: 5 }; },
    post: async (path: string, body: unknown) => { calls.push(["POST", path, body]); return { version: 4 }; },
  };
  await saveDeletionSetting(http as never, "SE", { eraseEnabled: true, eraseAfterDays: 30 });
  const put = calls.find((c) => c[0] === "PUT")!;
  assert.equal(put[1], "/admin/config/country_rules");
  const doc = (put[2] as { document: Record<string, unknown> }).document;
  assert.deepEqual(doc, withDeletionSetting(draft.document, { eraseEnabled: true, eraseAfterDays: 30 }));
  assert.deepEqual(doc["maxRiderDebt"], draft.document.maxRiderDebt);
  assert.deepEqual(doc["calls"], draft.document.calls);
  assert.deepEqual(doc["accountDeletion"], { eraseEnabled: true, eraseAfterDays: 30 });
  assert.ok(calls.some((c) => c[0] === "POST" && c[1] === "/admin/config/country_rules/publish"));
  await assert.rejects(saveDeletionSetting(http as never, "SE", { eraseEnabled: true, eraseAfterDays: 10 }));
});
