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

/**
 * Doc-dates bug (owner 2026-11-24: "admin can't write the dates of issue and expiry"): the date box opens the phone's
 * number pad (inputmode numeric), which has no "/" "-" or "." key, so the admin could only type digits; those never
 * became a date and the box was emptied when he left it. Digits only, and a space or dot as separator, now work.
 */
test("doc dates: digits only (as typed on a phone's number pad) become the day", () => {
  assert.equal(parseDateText("05112026", "en"), "2026-11-05");
  assert.equal(parseDateText("05112026", "fr"), "2026-11-05");
  assert.equal(parseDateText("20261105", "sv"), "2026-11-05");
  assert.equal(parseDateText("20261105", "en"), "2026-11-05", "year first is read as year first in every language");
  assert.equal(parseDateText("31022026", "en"), null);
  assert.equal(parseDateText("0511202", "en"), null, "not yet a whole date");
});

test("doc dates: a dot, space or slash between the parts works in Swedish too (year first)", () => {
  assert.equal(parseDateText("2026.11.05", "sv"), "2026-11-05");
  assert.equal(parseDateText("2026 11 05", "sv"), "2026-11-05");
  assert.equal(parseDateText("2026/11/5", "sv"), "2026-11-05");
  assert.equal(parseDateText("5 11 2026", "en"), "2026-11-05");
});

test("doc dates: the box keeps what the admin typed and says when it is not a date (never empties it)", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./DateInput.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /onBlur=\{[^}]*setText\(formatIsoDate/, "leaving the box must not erase the typed text");
  assert.match(source, /data-testid="date-input-bad"/, "a wrong date is said under the box");
});

test("doc dates: 'today' is the country's own day (Stockholm 00:30 is still yesterday in UTC)", async () => {
  const { dayIn } = await import("./dateText.ts");
  const at = Date.parse("2026-11-23T23:30:00Z");
  assert.equal(dayIn(at, "Europe/Stockholm"), "2026-11-24");
  assert.equal(dayIn(at, "Africa/Tunis"), "2026-11-24");
  assert.equal(dayIn(Date.parse("2026-11-24T22:59:00Z"), "Europe/Stockholm"), "2026-11-24");
  const { readFile } = await import("node:fs/promises");
  const dialog = await readFile(new URL("../live/ui.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dialog, /const today = new Date\(\)\.toISOString\(\)/, "the dialog's today is not the UTC day");
});

test("doc dates (iOS): the calendar is a real date input under the finger, not a hidden 1px one opened by showPicker", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../styles/tokens.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.date-input-native \{[^}]*pointer-events: none/);
  assert.match(css, /input\.date-input-native \{[^}]*inset: 0;[^}]*pointer-events: auto/);
});
