import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/** Owner 2026-11-18: the Zone settings row reads "Heading to the pickup (%)", the contract's headingCheck.setting wording (0.18.106). */
const src = readFileSync(new URL("./ZoneSettings.tsx", import.meta.url), "utf8");
const langs = ["en", "sv", "fr"] as const;

test("the heading row label is the contract wording", () => {
  assert.match(src, /<Row info="dispatch\.zone\.headingToThePickupAtLeast" label=\{tr\("Heading to the pickup \(%\)"\)\}/);
  assert.ok(!src.includes("Heading to the pickup = at least"));
});

test("en/sv/fr translate the new label and drop the old one", () => {
  const want = { en: "Heading to the pickup (%)", sv: "Kör mot upphämtningen (%)", fr: "Se dirige vers la prise en charge (%)" };
  for (const l of langs) {
    const t = readFileSync(new URL(`../i18n/${l}/b4-radar-exclusive-reservations.ts`, import.meta.url), "utf8");
    assert.ok(t.includes(`"Heading to the pickup (%)": "${want[l]}"`), l);
    assert.ok(!t.includes("Heading to the pickup = at least"), l);
  }
});
