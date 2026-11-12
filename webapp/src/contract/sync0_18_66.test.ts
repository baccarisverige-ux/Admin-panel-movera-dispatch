/**
 * Contract 0.18.66 sync (movera-contracts v0.18.66): carries §87 (owner answers 2026-11-11 evening): the in-app call
 * connect timeout is an admin setting (CountryRules.calls.connectTimeoutSeconds, 10–60, default 25), and the admin's
 * trip chat shows the original text and, under it, the kept translations (Message.translations, admin reads only).
 * Pins the copy; the admin part of §87 is checked in src/config/callConnect87.test.ts. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const M = readFileSync(new URL("../../../contracts/CONTRACT.md", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.77; §87 landed in 0.18.66)", () => {
  assert.equal(C.version, "0.18.77");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§87 is in the copy: connect timeout 10–60, default 25; admin chat view carries translations", () => {
  assert.match(M, /## 87\. Call connect time/);
  assert.equal(C.configDefaults.calls.connectTimeoutSeconds, 25);
  assert.deepEqual(C.inAppCalls.settings.ranges.connectTimeoutSeconds, [10, 60]);
  assert.match(C.chat.autoTranslate.adminView, /Message\.translations/);
  assert.match(C.chat.autoTranslate.adminView, /Translation \(EN\)/);
});
