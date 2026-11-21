import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines, copyParts } from "../dispatch/rules/changes.ts";
import { DISPATCH_ZONE_INFO } from "../ui/settingInfo/dispatchZone.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * L20 stream backup (contract v0.18.150, contract.json#driverOneStreamFallback; owner 2026-11-21 08:10 "Switch to old two
 * (Rec.)": "when first down we can use second as backup"): Dispatch › Drivers, under "One live connection per driver
 * phone", "Backup after failed tries" (1-10, default 3) and "Try the one connection again after (minutes)" (1-60, default
 * 10), published as the driver document's realtime.oneStreamFallback. Rule 36: fails on main (no oneStreamFallback).
 */
const NOW = "2026-11-21T08:00:00Z";
type Fallback = { failuresInARow: number; retryOneAfterMinutes: number };
type DriverDoc = { realtime?: { oneStream: boolean; oneStreamFallback?: Fallback } };
const driver = (zoneId: string, fallback?: Fallback, on = true) => {
  const zone = zoneDefault(zoneId);
  const state = appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, oneStream: { on }, ...(fallback ? { oneStreamFallback: fallback } : {}) } } } as never });
  return driverAppConfig(zoneId, state) as unknown as DriverDoc & Doc;
};

test("defaults 3 / 10 (contract configDefaults.driverOneStreamFallback) in the rules and the driver document of every country", () => {
  assert.deepEqual(CONFIG_DEFAULTS.driverOneStreamFallback, { failuresInARow: 3, retryOneAfterMinutes: 10 });
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).oneStreamFallback, { failuresInARow: 3, retryOneAfterMinutes: 10 }, zoneId);
    const doc = driverAppConfig(zoneId, appConfigState({ now: NOW })) as unknown as DriverDoc;
    assert.deepEqual(doc.realtime, { oneStream: false, oneStreamFallback: { failuresInARow: 3, retryOneAfterMinutes: 10 } }, zoneId);
  }
});

test("save: the two numbers go into realtime.oneStreamFallback; the switch and other realtime keys are kept", () => {
  const before = driver("Z001");
  const after = driver("Z001", { failuresInARow: 5, retryOneAfterMinutes: 30 });
  assert.deepEqual(after.realtime, { oneStream: true, oneStreamFallback: { failuresInARow: 5, retryOneAfterMinutes: 30 } });
  const server: Doc = { zoneId: "Z001", realtime: { oneStream: true, oneStreamFallback: { failuresInARow: 3, retryOneAfterMinutes: 10 }, laterKey: "kept" }, texts: ["server"] };
  const sent = patchChanged(server, before, after, OWNED.dispatch.driver);
  assert.deepEqual(sent["realtime"], { oneStream: true, oneStreamFallback: { failuresInARow: 5, retryOneAfterMinutes: 30 }, laterKey: "kept" });
  assert.deepEqual(sent["texts"], ["server"]);
  assert.equal(patchChanged({ zoneId: "Z001" }, before, before, OWNED.dispatch.driver)["realtime"], undefined, "nothing changed = nothing written");
});

test("change lines name both fields; Copy to other zones › Drivers carries them", () => {
  const zone = zoneDefault("Z001");
  const lines = changeLines(zone, { ...zone, oneStreamFallback: { failuresInARow: 4, retryOneAfterMinutes: 15 } });
  assert.deepEqual(lines, ["Backup after failed tries: 3 → 4", "Try the one connection again after (minutes): 10 → 15"]);
  assert.deepEqual(copyParts({ ...zone, oneStreamFallback: { failuresInARow: 7, retryOneAfterMinutes: 45 } }, zoneDefault("FR-PC"), ["drivers"]).oneStreamFallback, { failuresInARow: 7, retryOneAfterMinutes: 45 });
});

test("read back as the server serves it: values, else defaults (missing or out of range); no driver document keeps the rules' value", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (driverDoc: Doc | null, start = zone) => rulesOfDispatch(doc, driverDoc, start).oneStreamFallback;
  assert.deepEqual(read({ realtime: { oneStream: true, oneStreamFallback: { failuresInARow: 1, retryOneAfterMinutes: 60 } } }), { failuresInARow: 1, retryOneAfterMinutes: 60 });
  assert.deepEqual(read({ realtime: { oneStream: true } }, { ...zone, oneStreamFallback: { failuresInARow: 9, retryOneAfterMinutes: 9 } }), { failuresInARow: 3, retryOneAfterMinutes: 10 }, "published before v0.18.150");
  assert.deepEqual(read({ realtime: { oneStreamFallback: { failuresInARow: 0, retryOneAfterMinutes: 2.5 } } }), { failuresInARow: 3, retryOneAfterMinutes: 10 });
  assert.deepEqual(read(null, { ...zone, oneStreamFallback: { failuresInARow: 9, retryOneAfterMinutes: 9 } }), { failuresInARow: 9, retryOneAfterMinutes: 9 });
});

test("labels, help lines and the unit are in en, sv and fr; the two 'i' texts have the six parts with ranges and defaults", () => {
  const keys = ["Backup after failed tries", "Try the one connection again after (minutes)", "tries"];
  const help = Object.keys(en).filter((k) => k.includes("driver Ali's phone fails the one connection") || k.includes("Ali's phone tries the one connection again"));
  assert.equal(help.length, 2, help.join(" | "));
  for (const key of [...keys, ...help]) {
    assert.ok(key in en, `en: ${key}`);
    assert.ok((sv as Record<string, string>)[key], `sv: ${key}`);
    assert.ok((fr as Record<string, string>)[key], `fr: ${key}`);
  }
  const tries = DISPATCH_ZONE_INFO["dispatch.zone.oneStreamBackupAfterFailedTries"]!;
  assert.match(tries.range, /1 to 10/);
  assert.equal(tries.default, "3.");
  assert.match(tries.example, /Ali/);
  const minutes = DISPATCH_ZONE_INFO["dispatch.zone.oneStreamTryAgainAfterMinutes"]!;
  assert.match(minutes.range, /1 to 60/);
  assert.equal(minutes.default, "10.");
  assert.match(minutes.example, /Ali/);
  for (const info of [tries, minutes]) for (const part of ["what", "where", "range", "default", "example", "extremes"] as const) assert.ok(info[part].length > 0, part);
});
