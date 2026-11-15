import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { errorText } from "./format.ts";

/**
 * Contract v0.18.109 (server BQ-FLEETCUR, owner 2026-11-15 "a fleet = one country = one currency"): the admin's Accept on a
 * fleet invitation (LiveFleetPanel) gets 409 conflict `fleet_other_country` when the driver works in another country. The
 * dialog shows errorText(error): a clear text in en / sv / fr, never the server's English message.
 */
const refused = () => new ApiError(409, "A driver can join only a fleet of his own country.", { code: "conflict", reason: "fleet_other_country" });

test("fleet invitation accept: 409 fleet_other_country has its own text in en / sv / fr", () => {
  setLanguage("en");
  assert.equal(errorText(refused()), "This driver works in another country. A fleet works in one country only.");
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  try {
    setLanguage("sv");
    assert.equal(errorText(refused()), "Föraren arbetar i ett annat land. Ett åkeri arbetar bara i ett land.");
    setLanguage("fr");
    assert.equal(errorText(refused()), "Ce chauffeur travaille dans un autre pays. Une flotte travaille dans un seul pays.");
  } finally {
    setLanguage("en");
  }
});

test("fleet invitation accept: already_in_fleet keeps its own text", () => {
  setLanguage("en");
  assert.equal(errorText(new ApiError(409, "In a fleet", { code: "conflict", reason: "already_in_fleet" })), "The driver is already in a fleet.");
});
