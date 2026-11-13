/**
 * Contract 0.18.64 sync (movera-contracts v0.18.64): carries §83 (v0.18.61 payment read), §84 (v0.18.62 sign-in unlock),
 * the v0.18.63 stream note and §85 (v0.18.64, owner 2026-11-11: chat messages arrive translated, "See original").
 * Pins the copy; the admin part of §85 (the Chat settings switch) is checked in src/live/chatG92.test.ts. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const M = readFileSync(new URL("../../../contracts/CONTRACT.md", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.81; §85 landed in 0.18.64)", () => {
  assert.equal(C.version, "0.18.81");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§83–§85 are in the copy; §85 autoTranslate defaults to on", () => {
  for (const head of [/## 83\. /, /## 84\. /, /## 85\. Chat messages arrive translated/]) assert.match(M, head);
  assert.equal(C.configDefaults.chat.autoTranslate, true);
  assert.ok(C.chat.autoTranslate.rule && C.chat.autoTranslate.admin);
});
