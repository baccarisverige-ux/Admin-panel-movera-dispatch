/**
 * Step 36 (contract v0.18.54 §76, contract.json#adminMasking): the panel accepts the server's masked shapes as well as
 * the full values (expand-then-contract: built before the server masks). Rule 36 / 45: fail-before recorded in Rules
 * audits/screens-2026-11-09/admin-masking-reveal/fail-before.txt.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ageFromDateOfBirth, dateOfBirthText, incidentRevealAllowed, incidentRevealPath, isMaskedEmail, isMaskedPhone, isYearOnlyDate, phoneHref, revealPath, revealReasonOk } from "./masking.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the contract copy carries §76 (contract.json#adminMasking) with the shapes this module reads", () => {
  assert.ok(C.adminMasking, "adminMasking is in the copy");
  assert.match(C.adminMasking.shapes.phone, /\+46•••••••12/); // v0.18.60: one dot per hidden digit (7 for +46701234512)
  assert.match(C.adminMasking.shapes.email, /a•••@example\.com/);
  assert.match(C.adminMasking.shapes.dateOfBirth, /1990/);
  assert.match(C.adminMasking.reveal.rider, /\/admin\/riders\/\{riderId\}\/reveal/);
  assert.match(C.adminMasking.sosReveal.route, /\/admin\/incidents\/\{incidentId\}\/reveal-contacts/);
});

test("a masked phone is recognised; an E.164 number and an empty string are not", () => {
  assert.equal(isMaskedPhone("+46•••••12"), true);
  assert.equal(isMaskedPhone("+216•12"), true);
  assert.equal(isMaskedPhone("+46701234512"), false);
  assert.equal(isMaskedPhone(""), false);
  assert.equal(isMaskedPhone(undefined), false);
});

test("a masked phone is shown as text: no tel: link; a full number keeps its link", () => {
  assert.equal(phoneHref("+46•••••12"), null);
  assert.equal(phoneHref("+46 70 123 45 12"), "tel:+46701234512");
  assert.equal(phoneHref(""), null);
  assert.equal(phoneHref(null), null);
});

test("a masked e-mail is recognised; a real address is not", () => {
  assert.equal(isMaskedEmail("a•••@example.com"), true);
  assert.equal(isMaskedEmail("anna@example.com"), false);
  assert.equal(isMaskedEmail(undefined), false);
});

test("a year-only date of birth shows the year, no age and never 'Invalid Date'", () => {
  assert.equal(isYearOnlyDate("1990"), true);
  assert.equal(isYearOnlyDate("1990-05-17"), false);
  assert.equal(dateOfBirthText("1990", "en-GB"), "1990");
  assert.equal(dateOfBirthText("1990-05-17", "en-GB"), "17 May 1990");
  assert.equal(dateOfBirthText("", "en-GB"), "—");
  assert.equal(dateOfBirthText("not a date", "sv-SE"), "—");
  assert.doesNotMatch(dateOfBirthText("1990", "fr-FR"), /Invalid|NaN/);
  const now = Date.parse("2026-11-09T10:00:00Z");
  assert.equal(ageFromDateOfBirth("1990", now), null);
  assert.equal(ageFromDateOfBirth("1990-05-17", now), 36);
  assert.equal(ageFromDateOfBirth("1990-12-01", now), 35);
  assert.equal(ageFromDateOfBirth(undefined, now), null);
});

test("the reveal routes and the reason rule (3–200 characters) follow §76", () => {
  assert.equal(revealPath("rider", "R501"), "/admin/riders/R501/reveal");
  assert.equal(revealPath("driver", "D1001"), "/admin/drivers/D1001/reveal");
  assert.equal(revealPath("fleet", "F 1"), "/admin/fleets/F%201/reveal");
  assert.equal(incidentRevealPath("inc_1"), "/admin/incidents/inc_1/reveal-contacts");
  assert.equal(revealReasonOk("Hi"), false);
  assert.equal(revealReasonOk("  ab "), false);
  assert.equal(revealReasonOk("Rider asked for a callback"), true);
  assert.equal(revealReasonOk("x".repeat(200)), true);
  assert.equal(revealReasonOk("x".repeat(201)), false);
});

test("the SOS reveal is offered only on an open case (open or investigating)", () => {
  assert.equal(incidentRevealAllowed("open"), true);
  assert.equal(incidentRevealAllowed("investigating"), true);
  assert.equal(incidentRevealAllowed("resolved"), false);
  assert.equal(incidentRevealAllowed("dismissed"), false);
  assert.equal(incidentRevealAllowed(undefined), false);
});

test("REMINDERS 14c: a Call button never dials a masked phone nor shows without viewSensitive", async () => {
  const { callHref } = await import("./masking.ts");
  assert.equal(callHref("+46•••••••12", true), null);
  assert.equal(callHref("+46 70 123 45 12", false), null);
  assert.equal(callHref("", true), null);
  assert.equal(callHref("+46 70 123 45 12", true), "tel:+46701234512");
  const driverPage = readFileSync(new URL("../pages/DriverDetailPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(driverPage, /tel:\$\{driver\.phone/, "the driver page never builds tel: from the raw phone");
  assert.match(driverPage, /driverCallHref \? <CommandButton/, "the driver Call button is hidden without a dialable number");
  const contact = readFileSync(new URL("../fleet/ui.tsx", import.meta.url), "utf8");
  assert.match(contact, /href \? <CommandButton/, "the rider/driver contact Call button is hidden without a dialable number");
});
