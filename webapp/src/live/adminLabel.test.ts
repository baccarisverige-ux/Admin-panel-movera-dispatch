import assert from "node:assert/strict";
import test from "node:test";
import { adminLabel } from "./format.ts";

// v0.18.18 (owner 2026-11-03 "Real name from Team"): the first name, else "Admin"; an e-mail is never a name.
test("admin names: first name, else Admin, never an e-mail", () => {
  assert.equal(adminLabel("Nora"), "Nora");
  assert.equal(adminLabel(" Nora "), "Nora");
  assert.equal(adminLabel(undefined), "Admin");
  assert.equal(adminLabel(""), "Admin");
  assert.equal(adminLabel("owner@movera.se"), "Admin");
});
