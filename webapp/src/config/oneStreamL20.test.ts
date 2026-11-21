import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines, copyParts } from "../dispatch/rules/changes.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * L20 stream (contract v0.18.122, contract.json#driverOneStream; owner 2026-11-17 "Yes, with switch (Rec.)", Rules
 * audits/load/l20-1-design.md §3): Dispatch › Drivers "One live connection per driver phone", per zone, default off,
 * published as the driver document's realtime.oneStream. Rule 36: fails on main (no oneStream anywhere).
 */
const NOW = "2026-11-17T08:00:00Z";
type DriverDoc = { realtime?: { oneStream: boolean; oneStreamFallback?: { failuresInARow: number; retryOneAfterMinutes: number } } };
const driver = (zoneId: string, on?: boolean) => {
  const zone = zoneDefault(zoneId);
  const state = on === undefined ? appConfigState({ now: NOW }) : appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, oneStream: { on } } } } as never });
  return driverAppConfig(zoneId, state) as unknown as DriverDoc & Doc;
};

test("default off: the Dispatch rules and the driver document of every country carry realtime.oneStream false", () => {
  assert.equal(CONFIG_DEFAULTS.driverOneStream, false);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).oneStream, { on: false }, zoneId);
    assert.deepEqual(driver(zoneId).realtime, { oneStream: false, oneStreamFallback: { failuresInARow: 3, retryOneAfterMinutes: 10 } }, zoneId); // v0.18.150: with the backup numbers
  }
});

test("the rider document gets no realtime (the rider app is not affected)", () => {
  assert.equal((riderAppConfig("Z001", appConfigState({ now: NOW })) as unknown as Doc)["realtime"], undefined);
  assert.ok(!OWNED.dispatch.rider.includes("realtime"));
});

test("save: on for one zone is published as the driver document's realtime.oneStream; nothing changed = nothing written", () => {
  assert.ok(OWNED.dispatch.driver.includes("realtime"), "Dispatch owns the driver document's realtime");
  assert.ok(!OWNED.settings.driver.includes("realtime"));
  const before = driver("Z001", false);
  const after = driver("Z001", true);
  assert.deepEqual(after.realtime, { oneStream: true, oneStreamFallback: { failuresInARow: 3, retryOneAfterMinutes: 10 } }); // v0.18.150: with the backup numbers
  const server: Doc = { zoneId: "Z001", features: { pin: false }, texts: ["server"] };
  const sent = patchChanged(server, before, after, OWNED.dispatch.driver);
  assert.deepEqual(sent["realtime"], { oneStream: true }, "a document saved before v0.18.122 gets the switch (v0.18.150: unchanged backup numbers are not written)");
  assert.deepEqual(sent["texts"], ["server"]);
  assert.equal(patchChanged({ zoneId: "Z001" }, before, before, OWNED.dispatch.driver)["realtime"], undefined);
  const lines = changeLines({ ...zoneDefault("Z001"), oneStream: { on: false } }, { ...zoneDefault("Z001"), oneStream: { on: true } });
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("One live connection per driver phone: "), lines[0]);
  // "Copy to other zones" › Drivers carries the switch.
  assert.deepEqual(copyParts({ ...zoneDefault("Z001"), oneStream: { on: true } }, zoneDefault("FR-PC"), ["drivers"]).oneStream, { on: true });
});

test("read back from the driver document as the server serves it (missing = off)", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (driverDoc: Doc | null, start = zone) => rulesOfDispatch(doc, driverDoc, start).oneStream;
  assert.deepEqual(read({ realtime: { oneStream: true } }), { on: true });
  assert.deepEqual(read({ realtime: { oneStream: false } }, { ...zone, oneStream: { on: true } }), { on: false });
  assert.deepEqual(read({}, { ...zone, oneStream: { on: true } }), { on: false }, "a document published before v0.18.122 is served off");
  assert.deepEqual(read(null, { ...zone, oneStream: { on: true } }), { on: true }, "no driver document read: the rules keep their value");
});

test("the switch and its 'i' text (six parts) are in en, sv and fr", () => {
  const keys = Object.keys(en).filter((k) => k === "Live connection" || k.startsWith("One live connection") || k.startsWith("What it does: one live connection"));
  assert.equal(keys.length, 3, keys.join(" | "));
  const info = keys.find((k) => k.startsWith("What it does"))!;
  for (const part of ["What it does:", "Who and where:", "Range:", "Default:", "Example:", "Extremes:"]) assert.ok(info.includes(part), part);
  for (const key of keys) {
    assert.ok((sv as Record<string, string>)[key], `sv: ${key}`);
    assert.ok((fr as Record<string, string>)[key], `fr: ${key}`);
  }
});
