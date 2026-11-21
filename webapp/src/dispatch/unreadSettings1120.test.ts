import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Owner 2026-11-20 (tolls button): "Remove if its safe" -> the Tolls switch is hidden in the UI only;
 * `pricing.fees.tollsPassThrough` stays in the stored document and the contract (no tolls are priced, CONTRACT.md:261).
 * Contract CONTRACT.md:267/513: `dispatch.rulesFrom` is kept but ignored; the pickup zone's document governs,
 * so "Whose rules" shows that and cannot be changed.
 */
const fees = readFileSync(new URL("../pricing/FeesPanel.tsx", import.meta.url), "utf8");
const zone = readFileSync(new URL("./ZoneSettings.tsx", import.meta.url), "utf8");
const langs = ["en", "sv", "fr"] as const;

test("the Tolls switch is not shown, and nothing writes tollsPassThrough", () => {
  assert.ok(!fees.includes('aria-label={tr("Add tolls to the fare")}'));
  assert.ok(!fees.includes("onChange({ tollsPassThrough"));
});

test("Whose rules says the pickup zone governs and is locked", () => {
  assert.ok(zone.includes('tr("The pickup zone\'s rules always apply")'));
  assert.ok(!zone.includes("onChange={(rulesFrom) => set({ rulesFrom })}"));
});

test("en/sv/fr have the new text", () => {
  const want = { en: "The pickup zone's rules always apply", sv: "Upphämtningszonens regler gäller alltid", fr: "Les règles de la zone de prise en charge s'appliquent toujours" };
  for (const l of langs) {
    const t = readFileSync(new URL(`../i18n/${l}/a7-q-r.ts`, import.meta.url), "utf8");
    assert.ok(t.includes(`"The pickup zone's rules always apply": "${want[l]}"`), l);
  }
});

test("the Whose rules help says the pickup zone always applies", () => {
  const info = readFileSync(new URL("../ui/settingInfo/dispatchZone.ts", import.meta.url), "utf8");
  assert.ok(info.includes("the pickup zone's rules always apply"));
  assert.ok(!info.includes("Driver's zone: the driver's home rules decide"));
});
