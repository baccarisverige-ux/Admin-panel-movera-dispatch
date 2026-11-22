/**
 * v0.18.148 SOS by press time (contract.json#sosPressTime.incident / .admin; Rules LAUNCH-RULE.md "Queued (after
 * freeze)" item 1): Incident.pressedAt reaches the SOS case, which shows the press time beside the received time and
 * the delay when it is over a minute. No admin setting (contract: one fixed safety rule, the same in every zone).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { incidentRecord } from "./incidents.ts";
import { caseOf, emptyIncidentOps } from "../safety/cases.ts";
import { pressedAtOf, pressTimeLines } from "../safety/pressTime.ts";

const PRESSED = "2026-11-20T10:25:00.000Z";
const RECEIVED = "2026-11-20T10:40:00.000Z";
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const server = { incidentId: "inc_1", kind: "sos", severity: "critical", status: "open" as const, openedAt: RECEIVED, zoneId: "Z001", raisedBy: "driver" as const, pressedAt: PRESSED };

test("Incident.pressedAt is read from the server and reaches the case; a missing or bad one is nothing", () => {
  const record = incidentRecord(server);
  assert.equal(record.livePressedAt, PRESSED);
  assert.equal("livePressedAt" in incidentRecord({ ...server, pressedAt: undefined }), false);
  assert.equal(pressedAtOf("not a time"), null);
  assert.equal(pressedAtOf(12), null);
  const item = caseOf(record, { draftRev: 1, policies: {}, incidents: {} }, emptyIncidentOps(), Date.parse(RECEIVED));
  assert.equal(item.pressedAt, Date.parse(PRESSED));
  assert.equal(item.openedAt, Date.parse(RECEIVED));
});

test("the case lines: pressed vs received, and the delay over a minute only", () => {
  setLanguage("en");
  assert.deepEqual(pressTimeLines(Date.parse(PRESSED), Date.parse(RECEIVED), hhmm), [
    "SOS pressed 10:25 · received by Movera 10:40",
    "Reached Movera 15 min after the press (the phone had no network).",
  ]);
  assert.deepEqual(pressTimeLines(Date.parse(RECEIVED) - 30_000, Date.parse(RECEIVED), hhmm), ["SOS pressed 10:39 · received by Movera 10:40"]);
  assert.deepEqual(pressTimeLines(undefined, Date.parse(RECEIVED), hhmm), []);
});

test("sv / fr words exist for every new key (owner to confirm)", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  for (const key of ["SOS pressed {0} · received by Movera {1}", "Reached Movera {0} min after the press (the phone had no network)."] as const) {
    assert.equal(en[key], key);
    assert.ok(sv[key] && sv[key] !== key, `sv ${key}`);
    assert.ok(fr[key] && fr[key] !== key, `fr ${key}`);
  }
  setLanguage("sv");
  assert.equal(pressTimeLines(Date.parse(PRESSED), Date.parse(RECEIVED), hhmm)[0], "SOS trycktes 10:25 · mottaget av Movera 10:40");
  setLanguage("en");
});

test("the SOS case shows the lines next to the SMS line", () => {
  const page = readFileSync(new URL("../pages/SafetyPage.tsx", import.meta.url), "utf8");
  assert.match(page, /pressTimeLines\(item\.pressedAt, item\.openedAt, time\)/);
  assert.match(page, /data-testid="sos-press-time-line"/);
});
