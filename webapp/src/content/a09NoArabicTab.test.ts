import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { DRIVER_TEXT_KEYS, TEXT_LANGS, driverAppTexts, emptyTexts, normalizeDriverTextBook, saveTexts } from "./driverTexts.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * BQ-A09 (plan/NEXT-NONMONEY-2026-11-15.md row 9; owner 2026-11-02 Q7 "Make it real, sv/fr/en (Recommended)" => "Arabic
 * tab removed", Rules decisions/driver-g14.md): Content › Driver app texts has Swedish, French and English only. Rule 21:
 * the removed Arabic tab is kept in content/archive/driverTexts-ar-2026-11-15.ts, and Arabic texts a saved book still
 * holds are kept aside (archivedAr), never published to the driver app and never thrown away.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("A09: the driver texts languages are English, Swedish and French; no Arabic tab", () => {
  assert.deepEqual(TEXT_LANGS.map((item) => item.id), ["en", "sv", "fr"]);
  assert.deepEqual(Object.keys(emptyTexts()).sort(), ["en", "fr", "sv"]);
  assert.ok(!read("./DriverTexts.tsx").includes('"ar"'), "no right-to-left Arabic branch left in the editor");
});

test("A09: the Content page says sv/fr/en, not Arabic, in every panel language", () => {
  const page = read("../pages/ContentPage.tsx");
  const key = "Island, offer and button texts in the driver app, in Swedish, French and English.";
  assert.ok(page.includes(`tr("${key}")`));
  assert.ok(!page.includes("French and Arabic."));
  assert.equal(en[key], key);
  assert.ok(sv[key] && sv[key] !== key && !/arabiska/i.test(sv[key]));
  assert.ok(fr[key] && fr[key] !== key && !/arabe/i.test(fr[key]));
});

test("A09 + Rule 21: Arabic texts a saved book holds are kept aside, not published and not lost on save", () => {
  const book = normalizeDriverTextBook({ draftRev: 3, texts: { sv: { "island.online": "Radar på" }, ar: { "trip.arrived": "وصلت", "no.key": "x", "trip.start": " " } }, log: [] });
  assert.equal((book.texts as Record<string, unknown>).ar, undefined);
  assert.deepEqual(book.archivedAr, { "trip.arrived": "وصلت" });
  assert.equal((driverAppTexts(book).byLanguage as Record<string, unknown>).ar, undefined, "the driver app gets sv/fr/en only");
  const saved = saveTexts(book, { ...book.texts, fr: { "island.online": "Radar en ligne" } }, "nora", "2026-11-15T10:00:00Z");
  assert.equal(saved.error, undefined);
  assert.deepEqual(saved.book.archivedAr, { "trip.arrived": "وصلت" }, "saving keeps the archived Arabic texts");
  assert.equal(normalizeDriverTextBook({ texts: {} }).archivedAr, undefined, "no archive when there were none");
});

test("A09 + Rule 21: the removed Arabic tab is archived in content/archive with a note", async () => {
  const url = new URL("./archive/driverTexts-ar-2026-11-15.ts", import.meta.url);
  assert.ok(existsSync(url));
  const text = readFileSync(url, "utf8");
  assert.match(text, /Rule 21/);
  assert.match(text, /driver-g14\.md/);
  const archive = await import("./archive/driverTexts-ar-2026-11-15.ts");
  assert.deepEqual(archive.ARCHIVED_ARABIC_TAB, { id: "ar", label: "Arabic", rtl: true });
  assert.equal(archive.ARCHIVED_ARABIC_KEYS, DRIVER_TEXT_KEYS.length, "every one of the 67 keys had an (empty) Arabic slot");
  assert.deepEqual(archive.ARCHIVED_ARABIC_TEXTS, {}, "the code held no Arabic driver texts: the defaults were empty");
});
