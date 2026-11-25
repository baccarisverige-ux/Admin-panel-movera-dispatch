import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "../config/appConfigs.ts";
import { CONFIG_DEFAULTS } from "../config/zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, dispatchOwnedFor, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";
import { kindDef } from "../alerts/engine.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { createDemoErrors, ERROR_KINDS, errorReportsPath, errorsPath, kindLabelKey, type ErrorKind } from "./errors.ts";

/**
 * Contract v0.18.158 (contract.json#crashCatcher; owner 2026-11-24 "Add to admin all kind of crash"): the Crashes &
 * errors page filters by kind and opens a group's kept reports (stack, breadcrumbs, device); Dispatch › Safety has one
 * crash reports switch per app (crashReports.on in both app documents, default on); Alerts has the app_crash kind.
 * Rule 36: fails on main — no kind filter, no reports read, no crashReports, no app_crash kind.
 */
const C = contract as unknown as { version: string; telemetry: { crashReport: { kinds: string[] } }; configDefaults: { crashReportsOn?: boolean }; alertDesk: { kindGroups: Record<string, string>; serverDetection: { kindDefaults: Record<string, { level: string; limits: Record<string, number | null> }> } } };
const NOW = "2026-11-24T08:00:00Z";
type CrashDoc = { crashReports?: { on: boolean } };
const docs = (zoneId: string, crashReports?: { rider: boolean; driver: boolean }) => {
  const zone = zoneDefault(zoneId);
  const state = crashReports === undefined ? appConfigState({ now: NOW }) : appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, crashReports } } } as never });
  return { rider: riderAppConfig(zoneId, state) as unknown as CrashDoc & Doc, driver: driverAppConfig(zoneId, state) as unknown as CrashDoc & Doc };
};

test("the kinds are the contract's; the list asks ?kind= and a group's reports", () => {
  assert.deepEqual([...ERROR_KINDS], C.telemetry.crashReport.kinds);
  assert.equal(errorsPath({ kind: "native_crash" }), "/admin/errors?limit=200&kind=native_crash");
  assert.equal(errorsPath({ app: "rider", kind: "freeze", status: "open" }), "/admin/errors?limit=200&app=rider&status=open&kind=freeze");
  assert.equal(errorReportsPath("err_01ABC"), "/admin/errors/err_01ABC/reports?limit=20");
  assert.equal(errorReportsPath("a/b"), "/admin/errors/a%2Fb/reports?limit=20");
});

test("every kind has a label in en, sv and fr", () => {
  for (const kind of ERROR_KINDS) {
    const key = kindLabelKey(kind as ErrorKind);
    for (const [name, dict] of [["en", en], ["sv", sv], ["fr", fr]] as const) assert.ok((dict as Record<string, string>)[key], `${name}: ${key}`);
  }
  assert.ok((sv as Record<string, string>)["Native crash"] && (sv as Record<string, string>)["Native crash"] !== "Native crash", "sv is translated");
});

test("the demo build filters by kind and answers a group's reports with stack and breadcrumbs", () => {
  const demo = createDemoErrors(Date.parse(NOW));
  const natives = demo.list({ kind: "native_crash" }).items;
  assert.ok(natives.length >= 1 && natives.every((g) => g.kind === "native_crash"));
  const reports = demo.reports(natives[0]!.id).items;
  assert.ok(reports.length >= 1);
  assert.ok(reports[0]!.breadcrumbs.length >= 1 && reports[0]!.nativeReason?.name, "breadcrumbs and native reason");
  assert.throws(() => demo.reports("ERR-none"));
});

test("crash reports switch: default on in both app documents; off per app and zone", () => {
  assert.equal(C.configDefaults.crashReportsOn, true);
  assert.equal(CONFIG_DEFAULTS.crashReportsOn, true);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).crashReports, { rider: true, driver: true }, zoneId);
    assert.deepEqual(docs(zoneId).rider.crashReports, { on: true }, zoneId);
    assert.deepEqual(docs(zoneId).driver.crashReports, { on: true }, zoneId);
  }
  const off = docs("Z001", { rider: false, driver: true });
  assert.deepEqual(off.rider.crashReports, { on: false });
  assert.deepEqual(off.driver.crashReports, { on: true });
  assert.ok(OWNED.dispatch.rider.includes("crashReports") && OWNED.dispatch.driver.includes("crashReports"), "Dispatch owns both");
  assert.ok(!dispatchOwnedFor(false).rider.includes("crashReports"), "rider document not read: the rider switch is not written");
  const sent = patchChanged({ zoneId: "Z001" }, docs("Z001").rider, off.rider, OWNED.dispatch.rider);
  assert.deepEqual(sent["crashReports"], { on: false });
  const lines = changeLines({ ...zoneDefault("Z001") }, { ...zoneDefault("Z001"), crashReports: { rider: false, driver: true } });
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("Rider app sends crash reports: "), lines[0]);
});

test("read back from the documents as the server serves them; missing = on", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (rider: Doc | null, driver: Doc | null, start = zone) => rulesOfDispatch(doc, driver, start, rider).crashReports;
  assert.deepEqual(read({ crashReports: { on: false } }, { crashReports: { on: true } }), { rider: false, driver: true });
  assert.deepEqual(read({}, { crashReports: { on: false } }), { rider: true, driver: false });
  assert.deepEqual(read(null, null, { ...zone, crashReports: { rider: false, driver: false } }), { rider: false, driver: false }, "nothing read: the rules keep their value");
});

test("Alerts: the app_crash kind (group system, limits 1 / 20 from the contract)", () => {
  const kind = kindDef("app_crash");
  assert.ok(kind, "app_crash kind");
  assert.equal(kind.group, C.alertDesk.kindGroups["app_crash"]);
  assert.equal(kind.mode, "limits");
  assert.equal(kind.direction, "up");
  assert.deepEqual(kind.limits, C.alertDesk.serverDetection.kindDefaults["app_crash"]!.limits);
  assert.equal(kind.path, "/errors");
  for (const t of ["New crash in the {0} app ({1}): {2}", "{0} reports from {1} devices"]) {
    for (const [name, dict] of [["en", en], ["sv", sv], ["fr", fr]] as const) assert.ok((dict as Record<string, string>)[t], `${name}: ${t}`);
  }
});
