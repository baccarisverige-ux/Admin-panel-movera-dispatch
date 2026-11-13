/**
 * Contract 0.18.77 sync (movera-contracts v0.18.77, 1a59afb): carries G30 (v0.18.76 e-mail verified: emailVerifiedAt,
 * the per-country approval setting, the driver's Home reminder; v0.18.77 at most 10 e-mail code starts per hour).
 * Pins the copy; the admin part of G30 is checked in src/live/emailVerified.test.ts and
 * src/drivers/onboardingSettings.test.ts. 0.18.67–0.18.75 carry no admin change (server / app wording only). Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.81; G30 landed in 0.18.76/77)", () => {
  assert.equal(C.version, "0.18.81");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("G30 is in the copy: emailVerified texts, approval setting default off in SE / FR / TN, the email_not_verified reminder", () => {
  for (const key of ["verified", "notVerified", "verifiedOn", "codeNotSentYet", "approvalSetting", "approvalRefused"]) {
    for (const lang of ["en", "fr", "sv"]) assert.equal(typeof C.emailVerified.texts[key][lang], "string", `${key}.${lang}`);
  }
  for (const country of ["SE", "FR", "TN"]) assert.equal(C.driverOnboarding.settings.defaults[country].emailVerifiedForApproval, false, country);
  assert.ok(C.driverOnboarding.reminders.kinds.email_not_verified, "reminder kind email_not_verified");
  assert.match(C.emailVerified.approvalSetting, /email_not_verified/);
});
