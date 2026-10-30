import assert from "node:assert/strict";
import test from "node:test";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { askedTimes, displayPhone, numbersCount, WAITLIST_REFRESH_MS, waitlistCounts, waitlistPath, type WaitlistEntry } from "./waitlist.ts";

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

// Owner G1-B6 (2026-10-30, "Fix all three (Recommended)"): "1 gång / N gånger", "1 fois", "1 time / N times".
test("G1-B6: asked once reads 1 gång / 1 fois / 1 time, never 1 gånger or 1 times", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  try {
    setLanguage("sv");
    assert.equal(askedTimes(1), "1 gång");
    assert.equal(askedTimes(3), "3 gånger");
    assert.equal(numbersCount(1), "1 nummer");
    setLanguage("fr");
    assert.equal(askedTimes(1), "1 fois");
    assert.equal(askedTimes(4), "4 fois");
    assert.equal(numbersCount(1), "1 numéro");
    assert.equal(numbersCount(2), "2 numéros");
    setLanguage("en");
    assert.equal(askedTimes(1), "1 time");
    assert.equal(askedTimes(2), "2 times");
    assert.equal(numbersCount(1), "1 number");
    assert.equal(numbersCount(5), "5 numbers");
  } finally {
    setLanguage("en");
  }
});
