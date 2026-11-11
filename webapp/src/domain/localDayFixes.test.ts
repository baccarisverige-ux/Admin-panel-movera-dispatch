import { test } from "node:test";
import assert from "node:assert/strict";
import { addLocalDays, localDay } from "../dashboard/time.ts";
import { daysUntil, docHealth } from "../fleet/documents.ts";
import { newBonus } from "../drivers/bonus.ts";

// 2026-11-12 00:30 in Stockholm (CET, UTC+1) is still 2026-11-11 23:30 in UTC.
const NOW = Date.parse("2026-11-11T23:30:00Z");
const TZ = "Europe/Stockholm";

test("fake clock at 00:30 Stockholm: the local day is the next day, not the UTC one", () => {
  assert.equal(new Date(NOW).toISOString().slice(0, 10), "2026-11-11");
  assert.equal(localDay(NOW, TZ), "2026-11-12");
  assert.equal(addLocalDays(localDay(NOW, TZ), 1), "2026-11-13", "event 'tomorrow' default");
});

test("document expiry uses the local day", () => {
  assert.equal(daysUntil("2026-11-11", NOW, TZ), -1);
  assert.equal(docHealth({ status: "approved", expiresAt: "2026-11-11" }, NOW, 30, TZ).health, "invalid", "expired yesterday locally");
  assert.equal(daysUntil("2026-11-12", NOW, TZ), 0);
  assert.equal(docHealth({ status: "approved", expiresAt: "2026-11-12" }, NOW, 30, TZ).health, "expiring", "expires today: still usable");
  assert.equal(daysUntil("2026-12-12", NOW, TZ), 30);
});

test("new bonus starts on the market's local day", () => {
  assert.equal(newBonus("rides", "SE", "nora", NOW).from, "2026-11-12");
  // Tunis (UTC+1) also already on the 12th; a time before midnight everywhere stays on the 11th.
  assert.equal(newBonus("rides", "TN", "nora", NOW).from, "2026-11-12");
  assert.equal(newBonus("rides", "SE", "nora", Date.parse("2026-11-11T20:00:00Z")).from, "2026-11-11");
});
