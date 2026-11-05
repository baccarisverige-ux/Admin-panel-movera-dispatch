import assert from "node:assert/strict";
import test from "node:test";
import { datePattern, formatIsoDate, parseDateText } from "./dateText.ts";

/** FIX JOB 7 B-l: admin dates in the admin's language, never the browser's mm/dd/yyyy. */
test("dates show in the admin's language format (sv ISO, fr / en day first)", () => {
  assert.equal(formatIsoDate("2026-11-05", "sv"), "2026-11-05");
  assert.equal(formatIsoDate("2026-11-05", "fr"), "05/11/2026");
  assert.equal(formatIsoDate("2026-11-05", "en"), "05/11/2026");
  assert.equal(formatIsoDate("", "sv"), "");
  assert.equal(formatIsoDate("11/05/2026", "en"), "", "never a month-first value");
  assert.equal(datePattern("sv"), "ÅÅÅÅ-MM-DD");
  assert.equal(datePattern("fr"), "JJ/MM/AAAA");
});

test("typed dates become ISO; impossible days are refused", () => {
  assert.equal(parseDateText("2026-11-05", "sv"), "2026-11-05");
  assert.equal(parseDateText("05/11/2026", "fr"), "2026-11-05");
  assert.equal(parseDateText("5.11.2026", "en"), "2026-11-05");
  assert.equal(parseDateText("2026-11-05", "fr"), "2026-11-05", "ISO works in every language");
  assert.equal(parseDateText("05/11/2026", "sv"), null, "Swedish takes ISO only");
  assert.equal(parseDateText("31/02/2026", "fr"), null);
  assert.equal(parseDateText("2026-13-01", "sv"), null);
  assert.equal(parseDateText("  ", "sv"), "");
});
