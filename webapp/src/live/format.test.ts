import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { contractJson } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { sv } from "../i18n/sv.ts";
import { adminCan, agentFromAdmin, documentCounts, hasRenewalWaiting, mainDocuments, renewalFor, documentHasFile, documentRows, documentTypeName, errorText, fullName, listQuery, liveBaseUrl, liveMoney, parseMinor, liveRowHealth, placeLabel, registerCountryTypes, ruleProblemText, requiredFor, requiredForVehicle, shortDate, signInErrorText, splitDocuments, tripTimeline, viewableMediaType } from "./format.ts";
import { DOCUMENT_TYPES, FLEET_CODE, ONBOARDING_COUNTRIES, REQUIRED_DOCUMENTS } from "./onboardingContract.ts";
import type { AdminMe, DocumentSummary } from "./types.ts";
import { docState } from "./liveAdminApi.ts";

type Contract = {
  version: string;
  driverOnboarding: {
    documents: { types: typeof DOCUMENT_TYPES; required: typeof REQUIRED_DOCUMENTS };
    countries: typeof ONBOARDING_COUNTRIES;
    fleetCode: { prefix: string; length: number; alphabet: string };
  };
};
const contract = contractJson<Contract>("contract.json");

test("the onboarding constants equal contract.json#driverOnboarding (v0.5.3)", () => {
  assert.equal(contract.version, "0.18.9");
  assert.deepEqual(DOCUMENT_TYPES, contract.driverOnboarding.documents.types);
  assert.deepEqual(REQUIRED_DOCUMENTS, contract.driverOnboarding.documents.required);
  assert.deepEqual(ONBOARDING_COUNTRIES, contract.driverOnboarding.countries);
  assert.deepEqual({ ...FLEET_CODE }, { prefix: contract.driverOnboarding.fleetCode.prefix, length: contract.driverOnboarding.fleetCode.length, alphabet: contract.driverOnboarding.fleetCode.alphabet });
});

test("document type names follow the panel's language and fall back to the id", () => {
  registerDictionary("sv", sv);
  assert.equal(documentTypeName("taxi_driver_license", "en"), "Taxi driver licence");
  assert.equal(documentTypeName("taxi_driver_license", "sv"), "Taxiförarlegitimation");
  assert.equal(documentTypeName("taxi_driver_license", "fr"), "Carte de chauffeur de taxi");
  assert.equal(documentTypeName("taxi_driver_license", "de"), "Taxi driver licence", "an unknown language reads English");
  assert.equal(documentTypeName("some_new_type", "sv"), "some_new_type");
  try {
    setLanguage("sv");
    assert.equal(documentTypeName("driving_license"), "Körkort", "the current language is the default");
  } finally {
    setLanguage("en");
  }
  assert.equal(documentHasFile("driving_license"), true);
  assert.equal(documentHasFile("terms"), false, "the terms are an acceptance, not a file");
  assert.equal(documentHasFile("info_session"), false, "the information session is an admin check");
  assert.equal(documentHasFile("unknown_type"), true, "an unknown type is treated as an upload");
});

const DOCS: DocumentSummary[] = [
  { documentId: "DOC1", type: "driving_license", status: "approved" },
  { documentId: "DOC2", type: "profile_photo", status: "in_review" },
  { documentId: "DOC3", type: "national_id", status: "rejected" },
  { documentId: "DOC4", type: "terms", status: "approved" },
];

test("documentRows: one row per required type in order, missing when nothing was uploaded, extras after", () => {
  const rows = documentRows(REQUIRED_DOCUMENTS.SE!.driver, DOCS);
  assert.deepEqual(rows.map((row) => [row.type, row.status, row.required]), [
    ["terms", "approved", true],
    ["info_session", "missing", true],
    ["driving_license", "approved", true],
    ["profile_photo", "in_review", true],
    ["taxi_driver_license", "missing", true],
    ["national_id", "rejected", false],
  ]);
  assert.equal(rows[1]!.document, null);
  assert.equal(rows[2]!.document?.documentId, "DOC1");
  assert.deepEqual(documentRows(undefined, undefined), []);
  assert.deepEqual(documentRows(["a", "a"], []).map((row) => row.type), ["a"], "a duplicated required type is one row");
});

test("required documents: the server's lists win, the contract fills in; company documents for fleet accounts only", () => {
  assert.deepEqual(requiredFor({ country: "SE", accountType: "driver" }), { person: [...REQUIRED_DOCUMENTS.SE!.driver], company: [] });
  assert.deepEqual(requiredFor({ country: "FR", accountType: "fleet" }), { person: [...REQUIRED_DOCUMENTS.FR!.driver], company: [...REQUIRED_DOCUMENTS.FR!.fleet] });
  assert.deepEqual(requiredFor({ country: "SE", accountType: "fleet", requiredDocuments: ["terms"], requiredFleetDocuments: ["bank_statement"] }), { person: ["terms"], company: ["bank_statement"] });
  assert.deepEqual(requiredFor({ accountType: "driver" }), { person: [], company: [] }, "no country yet: nothing is required");
  assert.deepEqual(requiredForVehicle({ requiredDocuments: ["insurance"] }), ["insurance"]);
  assert.deepEqual(requiredForVehicle({}, "FR"), ["vehicle_registration", "insurance", "vtc_sticker"]);
  assert.deepEqual(requiredForVehicle({}), []);
});

test("splitDocuments: company uploads go to the company table, shared types (national_id in France) to both", () => {
  const docs: DocumentSummary[] = [
    { documentId: "1", type: "terms", status: "approved" },
    { documentId: "2", type: "company_registration", status: "in_review" },
    { documentId: "3", type: "national_id", status: "approved" },
    { documentId: "4", type: "some_extra", status: "in_review" },
  ];
  const fr = splitDocuments(docs, { person: [...REQUIRED_DOCUMENTS.FR!.driver], company: [...REQUIRED_DOCUMENTS.FR!.fleet] });
  assert.deepEqual(fr.person.map((d) => d.type), ["terms", "national_id", "some_extra"]);
  assert.deepEqual(fr.company.map((d) => d.type), ["company_registration", "national_id"]);
  const none = splitDocuments(docs, { person: ["terms"], company: [] });
  assert.equal(none.person.length, 4);
  assert.equal(none.company.length, 0);
});

test("documentCounts: approved over required, person and company together", () => {
  assert.deepEqual(documentCounts({ documents: DOCS, country: "SE", accountType: "driver" }), { approved: 2, required: 5 });
  assert.deepEqual(documentCounts({ documents: DOCS, requiredDocuments: ["terms", "driving_license"], requiredFleetDocuments: ["bank_statement"], accountType: "fleet" }), { approved: 2, required: 3 });
  assert.deepEqual(documentCounts({ documents: [], accountType: "driver" }), { approved: 0, required: 0 });
});

test("names, places, query strings and dates", () => {
  assert.equal(fullName("Anna", "Berg"), "Anna Berg");
  assert.equal(fullName("Anna", undefined), "Anna");
  assert.equal(fullName(" ", "", "D0042"), "D0042");
  assert.equal(placeLabel("SE", "stockholm_lan"), "Stockholm län, SE");
  assert.equal(placeLabel("FR", "paris"), "Paris, FR");
  assert.equal(placeLabel("SE", "unknown_city"), "unknown_city, SE");
  assert.equal(placeLabel(undefined, undefined), "");
  assert.equal(listQuery({ accountStatus: "on_hold", q: "", cursor: null, limit: 50, zoneId: undefined }), "?accountStatus=on_hold&limit=50");
  assert.equal(listQuery({ q: "" }), "");
  assert.equal(listQuery({ q: "anna berg" }), "?q=anna+berg");
  assert.equal(shortDate("1990-05-17", "en-GB"), "17 May 1990", "a date of birth keeps its day in every time zone");
  assert.equal(shortDate(undefined, "en-GB"), "");
  assert.equal(shortDate("not a date", "en-GB"), "not a date");
  assert.equal(viewableMediaType("image/jpeg"), "image");
  assert.equal(viewableMediaType("application/pdf"), "pdf");
  assert.equal(viewableMediaType("image/heic"), "download");
});

test("error texts: 403 is one sentence, 409 version_mismatch says reloaded, 429 says the wait, unexpected errors carry the request id", () => {
  assert.equal(errorText(new ApiError(403, "Forbidden by server", { code: "forbidden" })), "Your role cannot do that.");
  assert.equal(errorText(new ApiError(401, "x", { code: "unauthenticated" })), "Sign in again.");
  assert.equal(errorText(new ApiError(409, "Stale", { code: "version_mismatch", requestId: "r1" })), "Someone else changed this record. It was reloaded; check it and try again.");
  assert.equal(errorText(new ApiError(409, "Driver is on a trip", { code: "invalid_transition", reason: "on_trip" })), "The driver is on a trip. Try again when the trip has ended.");
  assert.equal(errorText(new ApiError(409, "Already approved", { code: "invalid_transition" })), "Already approved", "the server's message is shown");
  assert.equal(errorText(new ApiError(409, "Expired", { code: "invalid_transition", reason: "invitation_expired" })), "This invitation has expired.");
  assert.equal(errorText(new ApiError(409, "Closed", { code: "invalid_transition", reason: "invitation_closed" })), "This invitation was already answered or withdrawn.");
  assert.equal(errorText(new ApiError(409, "No account", { code: "invalid_transition", reason: "driver_not_signed_up" })), "That number has no account yet. Accept is possible once it signs up.");
  assert.equal(errorText(new ApiError(409, "In a fleet", { code: "conflict", reason: "already_in_fleet" })), "The driver is already in a fleet.");
  assert.equal(errorText(new ApiError(404, "No such invitation", { code: "not_found", reason: "invitation_not_found" })), "This invitation is no longer on the fleet.");
  assert.equal(errorText(new ApiError(400, "note is required", { code: "invalid_request", requestId: "r2" })), "note is required");
  assert.equal(errorText(new ApiError(429, "Slow down", { code: "rate_limited", retryAfterSeconds: 30 })), "Too many attempts. Wait 30 s.");
  assert.equal(errorText(new ApiError(500, "Boom", { code: "internal", requestId: "req-9" })), "Boom (request req-9)");
  assert.equal(errorText(new ApiError(503, "The service is unavailable.", { code: "unavailable", requestId: "req-10" })), "The service is unavailable. (request req-10)");
  assert.equal(errorText(new Error("plain")), "plain");
  assert.equal(errorText("?"), "Something failed.");
  assert.equal(signInErrorText(new ApiError(401, "Unauthenticated", { code: "unauthenticated", reason: "invalid_credentials" })), "Wrong e-mail or password.");
  assert.equal(signInErrorText(new ApiError(429, "Locked", { code: "rate_limited", retryAfterSeconds: 120 })), "Too many attempts. Wait 120 s.");
  assert.equal(signInErrorText(new ApiError(429, "Locked", { code: "rate_limited" })), "Too many attempts. Wait.");
  assert.equal(signInErrorText(new ApiError(0, "Offline. Nothing was saved.")), "Offline. Nothing was saved.");
});

const ME: AdminMe = {
  adminId: "A1",
  email: "owner@movera.se",
  name: "Nora Lind",
  role: "compliance",
  permissions: ["overview.read", "drivers.read", "drivers.activate", "documents.approve"],
  scope: { zones: ["Z001", "FR-PC"], countries: ["SE", "FR", "XX"], fleetPartnerId: "F1" },
  language: "sv",
  idleTimeoutSeconds: 900,
  approvalExempt: false,
};

test("agentFromAdmin maps AdminMe onto the shell's Agent; adminCan reads the server's list, not the role tables", () => {
  const agent = agentFromAdmin(ME);
  assert.equal(agent.id, "A1");
  assert.equal(agent.name, "Nora Lind");
  assert.equal(agent.role, "compliance");
  assert.equal(agent.active, true);
  assert.equal(agent.password, "", "no secret is kept in the agent object");
  assert.deepEqual(agent.scope, { zones: ["Z001", "FR-PC"], market: "SE-STO", countries: ["SE", "FR"], fleetPartnerId: "F1" });
  assert.equal(agent.language, "sv");
  const all = agentFromAdmin({ ...ME, scope: { zones: "all" }, language: "xx" });
  assert.deepEqual(all.scope, { zones: "all", market: "SE-STO" });
  assert.equal(all.language, undefined, "an unknown language is left to the country default");
  assert.equal(adminCan(ME, "drivers.activate"), true);
  assert.equal(adminCan(ME, "vehicles.edit"), false, "compliance would have it in the role table; the server's list decides");
  assert.equal(adminCan(null, "drivers.read"), false);
});

test("liveBaseUrl: 'http' means same origin; a URL loses its trailing slash", () => {
  assert.equal(liveBaseUrl("http"), "");
  assert.equal(liveBaseUrl(undefined), "");
  assert.equal(liveBaseUrl("http://127.0.0.1:8080/"), "http://127.0.0.1:8080");
  assert.equal(liveBaseUrl("https://api.movera.se"), "https://api.movera.se");
});

test("trip money, typed amounts and the timeline (audit phase 5)", () => {
  assert.equal(liveMoney({ amountMinor: 52000, currency: "SEK" }), "520,00 kr");
  assert.equal(liveMoney(null), "—");
  assert.equal(parseMinor("120,50", "SEK"), 12050);
  assert.equal(parseMinor("120.5", "SEK"), 12050);
  assert.equal(parseMinor("12.345", "TND"), 12345);
  assert.equal(parseMinor("1.234", "SEK"), null);
  assert.equal(parseMinor("abc", "SEK"), null);
  const rows = tripTimeline({ createdAt: "2026-10-26T07:00:00Z", updatedAt: "2026-10-26T07:04:00Z", cancellation: { at: "2026-10-26T07:04:00Z" } });
  assert.deepEqual(rows.map((row) => row.label), ["Created", "Cancelled"]);
});

test("G2 R5: a document's name follows the country (nameByCountry), the admin's own text still wins", () => {
  assert.equal(documentTypeName("bank_statement", "fr", "SE"), "Relevé bancaire de l’entreprise");
  assert.equal(documentTypeName("bank_statement", "fr", "FR"), "RIB de la société");
  assert.equal(documentTypeName("bank_statement", "sv", "FR"), "Företagets bankuppgifter (RIB)");
  assert.equal(documentTypeName("driving_license", "fr", "SE"), "Permis de conduire", "no country name: the type's name");
  registerCountryTypes("SE", { texts: { bank_statement: { name: { sv: "Eget namn", fr: "Nom propre", en: "Own name" } } } });
  try {
    assert.equal(documentTypeName("bank_statement", "fr", "SE"), "Nom propre");
  } finally {
    registerCountryTypes("SE", {});
  }
});

test("G2 R2: a car breaking the rules is explained (Vehicle.ruleProblems, 409 vehicle_rules_not_met), sv/fr/en", () => {
  assert.equal(ruleProblemText("child_seat:year_too_old"), "Child seat: the car is too old");
  assert.equal(ruleProblemText("car:year_too_old"), "Car: the car is too old");
  assert.equal(ruleProblemText("child_seat:extra_needs_ride"), "Child seat: an extra needs a ride category too");
  const refused = new ApiError(409, "x", { code: "invalid_transition", reason: "vehicle_rules_not_met", details: ["economy:year_too_old"] });
  assert.equal(errorText(refused), "The car does not meet the country's car rules: Movera: the car is too old.");
  registerDictionary("sv", sv);
  try {
    setLanguage("sv");
    assert.match(errorText(refused), /^Bilen uppfyller inte landets bilregler: .*bilen är för gammal\.$/);
  } finally {
    setLanguage("en");
  }
});

test("G2 R10: the live driver page's expiring list comes from the server's end dates", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  assert.equal(liveRowHealth({ status: "approved", document: { expiresAt: "2026-11-10T00:00:00Z" } }, now, 30), "expiring");
  assert.equal(liveRowHealth({ status: "approved", document: { expiresAt: "2027-06-01T00:00:00Z" } }, now, 30), "valid");
  assert.equal(liveRowHealth({ status: "approved", document: { expiresAt: "2026-10-01T00:00:00Z" } }, now, 30), "invalid");
  assert.equal(liveRowHealth({ status: "approved", document: {} }, now, 30), "valid");
  assert.equal(liveRowHealth({ status: "in_review", document: null }, now, 30), "review");
  assert.equal(liveRowHealth({ status: "missing", document: null }, now, 30), "invalid");
});

test("G3-R1: an automatic set offline (driver.auto_offline) reads in sv, fr and en; the actor is Movera, not an admin", async () => {
  const { auditActionText, auditDetailText, auditActorText } = await import("./format.ts");
  const { auditRow } = await import("./liveAdminApi.ts");
  const { fr } = await import("../i18n/fr.ts");
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  const row = auditRow({ auditId: "a1", at: "2026-10-30T10:00:00Z", actor: "system", actorId: "system", action: "driver.auto_offline", targetType: "driver", targetId: "drv_1", reason: "no_position", result: "committed", requestId: "r1", after: { reason: "no_position", lastFixAt: "2026-10-30T09:54:00Z", minutes: 5 } });
  assert.equal(row.targetId, "drv_1");
  assert.equal(auditActionText(row.action), "Set offline automatically");
  assert.equal(auditDetailText(row), "No position for 5 min");
  assert.equal(auditActorText(row.actorId), "Movera (automatic)");
  try {
    setLanguage("sv");
    assert.equal(auditActionText(row.action), "Satt offline automatiskt");
    assert.equal(auditDetailText(row), "Ingen position på 5 min");
    setLanguage("fr");
    assert.equal(auditActionText(row.action), "Mis hors ligne automatiquement");
    assert.equal(auditDetailText(row), "Aucune position depuis 5 min");
  } finally {
    setLanguage("en");
  }
  assert.equal(auditActionText("trip.refund"), "trip.refund", "other actions keep their name");
  assert.equal(auditActorText("adm_1"), "adm_1");
});

// Owner G2-D1 (2026-10-30, "Keep old until new approved (Recommended)", contract v0.18.5 documentRenewal): the
// approved document stays the row's document; the new upload is its renewal, never the row itself.
test("G2-D1: a renewal never replaces the approved document in the documents table", () => {
  const documents: DocumentSummary[] = [
    { documentId: "D1", type: "driving_license", status: "approved", expiresAt: "2026-11-20T00:00:00Z" },
    { documentId: "R1", type: "driving_license", status: "in_review", expiresAt: "2036-11-20T00:00:00Z", renewalOf: "D1" },
    { documentId: "D2", type: "terms", status: "approved" },
  ];
  const rows = documentRows(["terms", "driving_license"], documents);
  assert.equal(rows.length, 2);
  const licence = rows.find((row) => row.type === "driving_license")!;
  assert.equal(licence.status, "approved");
  assert.equal(licence.document?.documentId, "D1");
  assert.equal(licence.renewal?.documentId, "R1");
  assert.equal(rows.find((row) => row.type === "terms")!.renewal, null);
  assert.deepEqual(mainDocuments(documents).map((doc) => doc.documentId), ["D1", "D2"]);
  assert.equal(renewalFor(documents, "D1")?.documentId, "R1");
  assert.equal(hasRenewalWaiting(documents), true);
  assert.equal(hasRenewalWaiting([{ ...documents[1]!, status: "rejected" }]), false);
  // The approved count is not lowered by a renewal waiting.
  assert.deepEqual(documentCounts({ documents, requiredDocuments: ["terms", "driving_license"], accountType: "driver", country: "SE" }), { approved: 2, required: 2 });
});

test("G2-D1: a rejected renewal leaves the driver's document state approved", () => {
  const documents: DocumentSummary[] = [
    { documentId: "D1", type: "driving_license", status: "approved" },
    { documentId: "R1", type: "driving_license", status: "rejected", renewalOf: "D1" },
  ];
  assert.equal(docState(documents, ["driving_license"]), "approved");
  assert.equal(docState([{ documentId: "D1", type: "driving_license", status: "rejected" }], ["driving_license"]), "rejected");
});

// Owner G2-D5.7 / D5.8 (2026-10-30): a reason for every rejection, an end date at most 15 years ahead.
test("G2-D5.7 / D5.8 / D5.3: the server's refusals are said in the admin's words", () => {
  const refuse = (reason: string) => new ApiError(400, "x", { code: "invalid_request", reason, details: [], requestId: "r", retryable: false });
  assert.equal(errorText(refuse("note_required")), "Write why: the driver sees the reason.");
  assert.equal(errorText(refuse("expiry_too_far")), "Check the end date");
  assert.equal(errorText(refuse("categories_required")), "Give the car at least one ride category.");
  registerDictionary("sv", sv);
  setLanguage("sv");
  try {
    assert.equal(errorText(refuse("expiry_too_far")), "Kontrollera slutdatumet");
  } finally {
    setLanguage("en");
  }
});
