import assert from "node:assert/strict";
import test from "node:test";
import { displayPhone, WAITLIST_REFRESH_MS, waitlistCounts, waitlistPath, type WaitlistEntry } from "./waitlist.ts";

/** Contract v0.15.0 §24, owner 2026-10-29 decision 5: the admin sees the sign-in waiting list, live. */

test("the list asks the contract's endpoint, newest first, one app or both", () => {
  assert.equal(waitlistPath("all"), "/admin/waitlist?limit=200");
  assert.equal(waitlistPath("driver"), "/admin/waitlist?limit=200&app=driver");
  assert.equal(waitlistPath("rider"), "/admin/waitlist?limit=200&app=rider");
});

test("it is read again every 15 s", () => {
  assert.equal(WAITLIST_REFRESH_MS, 15_000);
});

test("numbers read as the apps show them", () => {
  assert.equal(displayPhone("+46701740605"), "+46 70 174 06 05");
  assert.equal(displayPhone("+33612345678"), "+33 6 12 34 56 78");
  assert.equal(displayPhone("+12025550123"), "+12025550123");
});

test("counts per app", () => {
  const at = "2026-10-29T10:00:00Z";
  const items: WaitlistEntry[] = [
    { phone: "+46700000001", app: "rider", firstAt: at, lastAt: at, count: 1 },
    { phone: "+46700000002", app: "driver", firstAt: at, lastAt: at, count: 3 },
    { phone: "+46700000003", app: "driver", firstAt: at, lastAt: at, count: 1 },
  ];
  assert.deepEqual(waitlistCounts(items), { all: 3, rider: 1, driver: 2 });
});
