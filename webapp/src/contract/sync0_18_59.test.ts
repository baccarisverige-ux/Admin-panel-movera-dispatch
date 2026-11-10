/**
 * Contract 0.18.59 sync (movera-contracts v0.18.59, the latest tag): carries §78 (v0.18.56, G9 part 2 chat & calls), §79
 * (v0.18.57 emergency numbers), §80 (v0.18.58 counts-as-arrived distance) and §81–§82 (v0.18.59). Pins the copy; the
 * admin part of §78 is checked in src/live/chatG92.test.ts. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const M = readFileSync(new URL("../../../contracts/CONTRACT.md", import.meta.url), "utf8");
const O = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.59)", () => {
  assert.equal(C.version, "0.18.59");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§78 is in the copy: chat settings, admin chat list and admin Message", () => {
  assert.match(M, /## 78\. Chat & calls, G9 part 2/);
  assert.ok(C.configDefaults.chat && C.chat.settings && C.chat.adminChats && C.chat.adminMessage);
  for (const route of ["/admin/chats:", "/admin/drivers/{driverId}/message:", "/admin/riders/{riderId}/message:"]) assert.ok(O.includes(route), route);
});

test("§79–§82 are in the copy", () => {
  for (const head of [/## 79\. /, /## 80\. /, /## 81\. /, /## 82\. /]) assert.match(M, head);
});
