import { test } from "node:test";
import assert from "node:assert/strict";
import { contractJson } from "../contract/load.ts";
import { minFieldIssue, minFieldsIssues, minVersionFieldsOf, withMinVersion } from "./appUpdateMin.ts";

/** Contract v0.18.154 P16c (contract.json#appUpdate): the admin's Minimum app version card. Fails on main (no card). */
const contract = contractJson<{ configDefaults: { appUpdate: { minVersion: unknown } }; appUpdate: { adminTexts: { warning: { en: string } } } }>("contract.json");

test("reads the server's document: null or missing is empty (off)", () => {
  assert.deepEqual(minVersionFieldsOf(null), { minVersion: { android: "", ios: "" }, storeUrls: { android: "", ios: "" } });
  assert.deepEqual(minVersionFieldsOf({ appUpdate: { minimumVersion: "1.0.0", minVersion: { android: "1.4.0", ios: null } } }).minVersion, { android: "1.4.0", ios: "" });
});

test("checks x.y.z and https links; empty is off", () => {
  for (const ok of ["", "1.4.0", "0.0.1", "10.20.30"]) assert.equal(minFieldIssue("minVersion", ok), null, ok);
  for (const bad of ["1.4", "v1.4.0", "1.04.0", "1.4.0-beta", "1.4.0+5"]) assert.notEqual(minFieldIssue("minVersion", bad), null, bad);
  assert.equal(minFieldIssue("storeUrls", "https://play.google.com/store/apps/details?id=example.fake"), null);
  assert.notEqual(minFieldIssue("storeUrls", "http://example.fake"), null);
  assert.deepEqual(minFieldsIssues({ minVersion: { android: "1.4", ios: "" }, storeUrls: { android: "", ios: "" } }).length, 1);
});

test("the save writes only minVersion and storeUrls; empty is null; the rest stays the server's", () => {
  const server = { zoneId: "Z001", version: 3, usesStandard: true, features: { wallet: true }, appUpdate: { minimumVersion: "1.0.0", latestVersion: "1.2.0", byPlatform: { ios: { enabled: true } } } };
  const next = withMinVersion(server, { minVersion: { android: " 1.4.0 ", ios: "" }, storeUrls: { android: "", ios: "https://apps.apple.com/app/example-fake" } });
  assert.deepEqual(next["appUpdate"], { minimumVersion: "1.0.0", latestVersion: "1.2.0", byPlatform: { ios: { enabled: true } }, minVersion: { android: "1.4.0", ios: null }, storeUrls: { android: null, ios: "https://apps.apple.com/app/example-fake" } });
  assert.deepEqual(next["features"], { wallet: true });
  assert.equal("usesStandard" in next, false);
  assert.equal(server.appUpdate.minimumVersion, "1.0.0", "the server's document is not changed");
});

test("the contract's default is off and its warning is the card's", () => {
  assert.deepEqual(contract.configDefaults.appUpdate.minVersion, { android: null, ios: null });
  assert.equal(contract.appUpdate.adminTexts.warning.en, "Phones below this version must update before they can book or go online.");
});
