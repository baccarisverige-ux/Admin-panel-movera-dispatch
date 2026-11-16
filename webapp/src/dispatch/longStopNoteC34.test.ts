import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * Long stop on a frozen fix, round 2 (owner 2026-11-16 "Keep, note at setting (Rec.)", Rules
 * audits/impact/longstop-frozen-fix.md): the driver app re-sends its last fix for up to 10 min when the GPS freezes, so
 * the server notices a frozen phone standing still only when the Long stop time is under 10 minutes. The admin says so
 * at the Long stop setting (Dispatch › Rules › Safety, per zone; and the shared Ride check triggers card). i18n area c34.
 */
const KEY = "A phone whose GPS has frozen is only noticed when this is under 10 minutes.";
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("c34: the long-stop note is in English, Swedish and French", () => {
  for (const lang of ["en", "sv", "fr"]) assert.ok(existsSync(new URL(`../i18n/${lang}/c34-long-stop-note.ts`, import.meta.url)), `${lang}/c34-long-stop-note.ts is missing`);
  assert.equal((en as Record<string, string>)[KEY], KEY);
  assert.equal((sv as Record<string, string>)[KEY], "En telefon vars GPS har fastnat märks bara när detta är under 10 minuter.");
  assert.equal((fr as Record<string, string>)[KEY], "Un téléphone dont le GPS est figé n’est repéré que si cette valeur est inférieure à 10 minutes.");
});

test("c34: the note shows at the Long stop setting (Dispatch › Safety per zone, and the shared Ride check triggers)", () => {
  const card = src("./RideCheckCard.tsx");
  const row = card.slice(card.indexOf('tr("Unexpected long stop")'), card.indexOf('tr("Off the route")'));
  assert.ok(row.includes('tr("Long stop")'), "the Long stop row moved");
  assert.ok(row.includes(`tr("${KEY}")`), "RideCheckCard: no frozen-GPS note at Long stop");
  const shared = src("../safety/RideCheckSettingsCard.tsx");
  assert.ok(shared.includes(`tr("${KEY}")`), "RideCheckSettingsCard: no frozen-GPS note at Unexpected long stop");
});
