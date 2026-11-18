import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * Live 2026-11-16 (Rules audits/impact/country-undo.md): the owner saved Tips & limits for Sweden, then pressed the
 * "Undo last publish" tile on the same page. The tile undoes the newest PRICING publish of any zone (it restored
 * Z001's pricing version 2), never Tips & limits. It must say that it is the pricing, and which publish it undoes.
 */
const source = readFileSync(new URL("../pages/PricingPage.tsx", import.meta.url), "utf8");
const tile = source.slice(source.indexOf('command="admin.pricing.undo"'));
const label = tile.slice(0, tile.indexOf("</CommandButton>"));

test("the Undo tile of the Pricing page says it undoes the pricing", () => {
  assert.ok(label.includes('tr("Undo last pricing publish")'), "the tile's label names the pricing");
  assert.equal(label.includes('tr("Undo last publish")'), false);
});

test("the Undo tile names the publish it undoes (zone and version)", () => {
  assert.ok(label.includes("store.history[0].changes[0]"), "the zone and version of the newest pricing publish");
});

test("the label is translated", () => {
  assert.equal(fr["Undo last pricing publish"], "Annuler la dernière publication des tarifs");
  assert.ok(sv["Undo last pricing publish"]);
});
