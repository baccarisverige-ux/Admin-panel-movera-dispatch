import assert from "node:assert/strict";
import test from "node:test";
import { contractJson } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { auditRow, driverRecord } from "./liveAdminApi.ts";
import { OFFLINE_REASONS, auditDetailText, offlineReasonText } from "./offlineReason.ts";

/**
 * BQ-A07 (plan/NEXT-NONMONEY-2026-11-15.md row 9; owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md):
 * one admin formatter for every Driver.offlineReason the server sends (contract.json#driverHome.setOffline.offlineReasons,
 * server src/db/schema/drivers.ts:59) plus app_restart (set by the driver app only), in sv / fr / en.
 */
type SetOffline = { offlineReasons: string[]; reasons: Record<string, unknown> };
const SET_OFFLINE = contractJson<{ driverHome: { setOffline: SetOffline } }>("contract.json").driverHome.setOffline;
registerDictionary("sv", sv);
registerDictionary("fr", fr);

test("A07: the formatter knows every reason of the contract (and app_restart), no more, no less", () => {
  assert.deepEqual([...OFFLINE_REASONS].sort(), [...new Set([...SET_OFFLINE.offlineReasons, ...Object.keys(SET_OFFLINE.reasons)])].sort());
  assert.ok(OFFLINE_REASONS.includes("app_restart"));
});

test("A07: every reason has its own clear text in en, sv and fr; numbers and the admin's note are filled in", () => {
  const extra = { minutes: 5, count: 10, note: "Broken light" };
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    try {
      const texts = OFFLINE_REASONS.map((reason) => offlineReasonText(reason, extra));
      assert.equal(new Set(texts).size, texts.length, `${lang}: two reasons read the same`);
      for (const [index, text] of texts.entries()) {
        assert.ok(text.length > 8, `${lang} ${OFFLINE_REASONS[index]}: "${text}"`);
        assert.ok(!/[{}]/.test(text), `${lang} ${OFFLINE_REASONS[index]}: a place-holder is left: "${text}"`);
        assert.ok(!text.includes(OFFLINE_REASONS[index]!), `${lang}: the raw code shows: "${text}"`);
      }
      assert.ok(offlineReasonText("no_position", extra).includes("5"));
      assert.ok(offlineReasonText("missed_offers", extra).includes("10"));
      assert.ok(offlineReasonText("vehicle_blocked", extra).includes("Broken light"));
      if (lang !== "en") for (const reason of OFFLINE_REASONS) {
        setLanguage("en");
        const english = offlineReasonText(reason, extra);
        setLanguage(lang);
        assert.notEqual(offlineReasonText(reason, extra), english, `${lang} ${reason} is not translated`);
      }
    } finally {
      setLanguage("en");
    }
  }
  assert.equal(offlineReasonText("no_position"), en["No position"]);
  assert.equal(offlineReasonText("missed_offers"), "Let Exclusive offers run out in a row"); // owner 2026-11-16: declines never count
  assert.equal(offlineReasonText("vehicle_blocked"), "Car blocked or rejected by an admin");
  assert.equal(offlineReasonText("some_new_reason"), "Set offline by the server (some_new_reason)", "a reason this panel does not know yet still shows");
});

test("A07: the Audit page reads every reason of driver.auto_offline, not only no_position", () => {
  const row = (after: Record<string, unknown>) => auditRow({ auditId: "a1", at: "2026-11-15T10:00:00Z", actor: "system", actorId: "system", action: "driver.auto_offline", targetType: "driver", targetId: "drv_1", result: "committed", requestId: "r1", after });
  assert.equal(auditDetailText(row({ reason: "no_position", minutes: 5 })), "No position for 5 min");
  assert.equal(auditDetailText(row({ minutes: 7 })), "No position for 7 min", "old rows without reason are no_position");
  assert.equal(auditDetailText(row({ reason: "missed_offers", count: 10 })), "Let 10 Exclusive offers run out in a row");
  assert.equal(auditDetailText(row({ reason: "documents_expired" })), "A required document has expired");
  setLanguage("sv");
  try {
    assert.equal(auditDetailText(row({ reason: "missed_offers", count: 10 })), "Lät 10 Exklusiva erbjudanden gå ut i rad");
  } finally {
    setLanguage("en");
  }
});

test("A07: the driver page gets Driver.offlineReason, offlineNote and offlineAt from GET /admin/drivers/{driverId}", () => {
  const driver = { driverId: "drv_1", accountStatus: "active", onlineStatus: "offline", firstName: "Ali", zoneIds: ["Z001"], categoryIds: [], documents: [], offlineReason: "vehicle_blocked", offlineNote: "Broken light", offlineAt: "2026-11-15T09:00:00Z" };
  const record = driverRecord(driver as never) as unknown as { liveDriver: { offlineReason?: string; offlineNote?: string; offlineAt?: string } };
  assert.equal(record.liveDriver.offlineReason, "vehicle_blocked");
  assert.equal(record.liveDriver.offlineNote, "Broken light");
  assert.equal(record.liveDriver.offlineAt, "2026-11-15T09:00:00Z");
  const online = driverRecord({ ...driver, onlineStatus: "online" } as never) as unknown as { liveDriver: Record<string, unknown> };
  assert.equal(online.liveDriver.offlineReason, undefined, "only while offline");
});
