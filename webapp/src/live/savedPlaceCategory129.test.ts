import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixedCategoryOf } from "./emergencyContacts.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * v0.18.129 (owner 2026-11-18 "Build", Rules decisions/session-2026-11-18-saved-places-design.md steps 4-7): the rider
 * profile's read-only Saved places shows each place's fixed ride category (contract.json#phoneDataToServer.riderPlaces
 * .preferredCategory.admin). Before this change the list showed only the name and address.
 */

test("a place's fixed category is shown by name; none when null or absent (older servers)", () => {
  assert.equal(fixedCategoryOf({ preferredCategoryId: "child_seat" }), "Child seat");
  assert.equal(fixedCategoryOf({ preferredCategoryId: null }), null);
  assert.equal(fixedCategoryOf({}), null);
});

test("the profile list uses it, with the text in en / sv / fr", () => {
  const src = readFileSync(new URL("./LiveProfileData.tsx", import.meta.url), "utf8");
  assert.match(src, /tr\("Fixed category: \{0\}", \[fixedCategoryOf\(p\)\]\)/);
  const key = "Fixed category: {0}";
  assert.equal((en as Record<string, string>)[key], "Fixed category: {0}");
  assert.equal((sv as Record<string, string>)[key], "Fast kategori: {0}");
  assert.equal((fr as Record<string, string>)[key], "Catégorie fixe : {0}");
});

test("the contract copy carries SavedPlace.preferredCategoryId (nullable CategoryId)", () => {
  const c = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
  assert.ok(c.phoneDataToServer.riderPlaces.preferredCategory.admin.includes("fixed category"));
  const spec = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
  assert.match(spec, /preferredCategoryId:/);
});
