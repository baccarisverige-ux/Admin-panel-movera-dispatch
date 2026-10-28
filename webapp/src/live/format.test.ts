import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { contractJson } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { sv } from "../i18n/sv.ts";
import { adminCan, agentFromAdmin, documentCounts, documentHasFile, documentRows, documentTypeName, errorText, fullName, listQuery, liveBaseUrl, liveMoney, parseMinor, placeLabel, requiredFor, requiredForVehicle, shortDate, signInErrorText, splitDocuments, tripTimeline, viewableMediaType } from "./format.ts";
import { DOCUMENT_TYPES, FLEET_CODE, ONBOARDING_COUNTRIES, REQUIRED_DOCUMENTS } from "./onboardingContract.ts";
import type { AdminMe, DocumentSummary } from "./types.ts";

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
  assert.equal(contract.version, "0.7.2");
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
