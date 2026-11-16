import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * S4 B1.16 Q-B13 (owner W1 Q78 "Do not count it", 2026-11-11; contract v0.18.120 contract.json#autoOffline.outage): an
 * Exclusive or hand-sent offer that ran out while the server's live link was down does not count toward "Go offline
 * automatically". The server counts (and the Dispatch "Missed in a row" fact follows it); the admin setting's help
 * line says so, in sv / fr / en. No new setting (the owner answered yes / no, not a number). Fails before: the help
 * line named only offers sent during a trip, and no dictionary had the line.
 */
const KEY = "Offers that ran out while the server's live link was down do not count either.";

test("Q-B13: the auto-offline help line says offers that ran out during a server link outage do not count", () => {
  const source = readFileSync(new URL("./OfferSections.tsx", import.meta.url), "utf8");
  const row = source.slice(source.indexOf('label={tr("After offers not accepted in a row")}'));
  assert.ok(row.length > 0, "the auto-offline row is there");
  const help = row.slice(0, row.indexOf("</Row>"));
  assert.ok(help.includes(`tr(${JSON.stringify(KEY)})`), "the help line carries the outage sentence");
});

test("Q-B13: the line is translated in sv and fr, and English is the key", () => {
  const dict = (d: object) => d as Record<string, string>;
  assert.equal(dict(en)[KEY], KEY);
  assert.equal(dict(sv)[KEY], "Erbjudanden som gick ut medan serverns direktlänk låg nere räknas inte heller.");
  assert.equal(dict(fr)[KEY], "Les offres expirées pendant une coupure du lien direct du serveur ne comptent pas non plus.");
});
