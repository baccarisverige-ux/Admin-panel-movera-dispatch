/**
 * G30 admin (contract v0.18.76 / v0.18.77, contract.json#emailVerified; owner 2026-11-12 Q2 "Keep, show Not verified",
 * Q4 "Yes, Verified", Q6 "Add the setting, off"): the rider and driver detail show a Verified / Not verified badge after
 * the e-mail (masked rows too), and a 409 email_not_verified on approval says why. Rule 36: written before the code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { contractJson } from "../contract/load.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { emailBadge } from "./emailVerified.ts";
import { errorText } from "./format.ts";
import { driverRecord, riderRecord } from "./liveAdminApi.ts";

const AT = "2026-11-12T10:15:00Z";
const RIDER = { riderId: "R1", firstName: "Ida", phone: "+46700000001", status: "active", version: 1, outstanding: null };
const DRIVER = { driverId: "D1", accountStatus: "pending", onlineStatus: "offline", firstName: "Anna", lastName: "Berg", zoneIds: ["Z001"], categoryIds: [] };

test("G30: a live rider with emailVerifiedAt shows Verified with the date; without it Not verified; no e-mail = no badge", () => {
  const verified = riderRecord({ ...RIDER, email: "ida@example.com", emailVerifiedAt: AT } as never);
  assert.equal(verified.emailVerifiedAt, AT, "riderRecord keeps the server's emailVerifiedAt");
  const badge = emailBadge(verified.email, verified.emailVerifiedAt);
  assert.equal(badge?.tone, "ok");
  assert.equal(badge?.label, "Verified");
  assert.match(badge?.title ?? "", /^E-mail verified .*2026/);

  const notVerified = riderRecord({ ...RIDER, email: "ida@example.com" } as never);
  assert.equal(notVerified.emailVerifiedAt, undefined);
  assert.deepEqual(emailBadge(notVerified.email, notVerified.emailVerifiedAt), { tone: "muted", label: "Not verified" });

  const none = riderRecord({ ...RIDER } as never);
  assert.equal(emailBadge(none.email, none.emailVerifiedAt), null, "no e-mail: no badge");
  assert.equal(emailBadge("—", AT), null, "the dash placeholder is not an e-mail");
  assert.equal(emailBadge("Not connected yet", undefined), null, "the not-connected placeholder is not an e-mail");
});

test("G30: a live driver carries emailVerifiedAt too, and masked rows (a•••@example.com) still show the badge", () => {
  const verified = driverRecord({ ...DRIVER, email: "anna@example.com", emailVerifiedAt: AT } as never);
  assert.equal(verified.emailVerifiedAt, AT, "driverRecord keeps the server's emailVerifiedAt");
  assert.equal(emailBadge(verified.email, verified.emailVerifiedAt)?.label, "Verified");

  const masked = driverRecord({ ...DRIVER, email: "a•••@example.com", sensitiveMasked: true, emailVerifiedAt: AT } as never);
  assert.equal(masked.liveSensitiveMasked, true);
  assert.equal(masked.emailVerifiedAt, AT, "never masked: the masked row keeps the date");
  assert.equal(emailBadge(masked.email, masked.emailVerifiedAt)?.label, "Verified");

  const maskedRider = riderRecord({ ...RIDER, phone: "+46•••••01", email: "i•••@example.com", sensitiveMasked: true } as never);
  assert.deepEqual(emailBadge(maskedRider.email, maskedRider.emailVerifiedAt), { tone: "muted", label: "Not verified" });
});

test("G30: 409 invalid_transition email_not_verified on approval says 'The driver's e-mail is not verified yet.'", () => {
  const refused = new ApiError(409, "Conflict", { code: "invalid_transition", reason: "email_not_verified" });
  assert.equal(errorText(refused), "The driver's e-mail is not verified yet.");
});

test("G30: the admin texts are the contract's texts (contract.json#emailVerified.texts) in en, fr and sv", () => {
  type Texts = Record<"verified" | "notVerified" | "verifiedOn" | "approvalSetting" | "approvalRefused", { en: string; fr: string; sv: string }>;
  const texts = contractJson<{ emailVerified: { texts: Texts } }>("contract.json").emailVerified.texts;
  const dictionaries = { en, fr, sv } as Record<"en" | "fr" | "sv", Record<string, string>>;
  for (const key of ["verified", "notVerified", "verifiedOn", "approvalSetting", "approvalRefused"] as const) {
    const source = texts[key].en;
    for (const lang of ["en", "fr", "sv"] as const) assert.equal(dictionaries[lang][source], texts[key][lang], `${lang} "${source}"`);
  }
});

test("G30: Activate refused with 409 email_not_verified shows the admin's own text (not the server's message), keeps the reason", async () => {
  const { createLiveAdminApi } = await import("./liveAdminApi.ts");
  const driver = { ...DRIVER, accountStatus: "pending", version: 3, email: "anna@example.com" };
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => driver,
    post: async () => { throw new ApiError(409, "Conflict", { code: "invalid_transition", reason: "email_not_verified", projection: driver }); },
    put: async () => ({}),
    del: async () => ({}),
  } as never;
  const api = createLiveAdminApi(client);
  await assert.rejects(api.command({ before: "", after: "", action: "admin.driver.activate", targetId: "D1", reason: "Approved" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.reason, "email_not_verified");
    assert.equal(error.message, "The driver's e-mail is not verified yet.");
    return true;
  });
});
