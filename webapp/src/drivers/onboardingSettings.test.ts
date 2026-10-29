import assert from "node:assert/strict";
import test from "node:test";
import { contractJson } from "../contract/load.ts";
import { createLiveSettings } from "../live/liveSettings.ts";
import { documentTypeName, isAdminCheck, registerCountryTypes } from "../live/format.ts";
import { emptyOnboardingRules, withSettings } from "./onboarding.ts";
import { emptyVehicleRules, withVehicleSettings } from "../vehicles/rules.ts";
import {
  ONBOARDING_SETTINGS_KEY,
  PHOTO_TYPES,
  LIMITS,
  STEP_IDS,
  addCustomType,
  addToList,
  addableTypes,
  contractDefaults,
  contractTypeOf,
  defaultDoc,
  editType,
  emptySettingsBook,
  normalizeSettingsBook,
  prepareSettings,
  removeFromList,
  settingsProblem,
  stagePublish,
  typeInfo,
  wireDocument,
  type SettingsDoc,
} from "./onboardingSettings.ts";

type Contract = { driverOnboarding: { settings: { defaults: unknown; stepIds: string[]; photoTypes: string[]; limits: unknown; customTypes: { idPattern: string } } } };
const contract = contractJson<Contract>("contract.json").driverOnboarding.settings;
const text = (word: string) => ({ sv: `${word} sv`, fr: `${word} fr`, en: `${word} en` });

test("decisions 10, 11, 12, 15: the admin's defaults equal contract.json#driverOnboarding.settings.defaults (SE, FR, TN closed)", () => {
  assert.deepEqual(contractDefaults(), contract.defaults);
  assert.deepEqual([...STEP_IDS], contract.stepIds);
  assert.deepEqual([...PHOTO_TYPES], contract.photoTypes);
  assert.deepEqual(JSON.parse(JSON.stringify(LIMITS)), contract.limits);
  assert.equal(contract.customTypes.idPattern, "^custom_[a-z0-9]{10}$");
  assert.deepEqual(defaultDoc("TN").documents, { driver: [], fleet: [], vehicle: [] }, "Tunisia shown but closed");
  assert.equal(settingsProblem(defaultDoc("TN")), null, "a closed country needs no driving licence");
  assert.equal(defaultDoc("SE").vehicles.categories[0]!.minYear, 2015);
  assert.equal(defaultDoc("FR").vehicles.categories[0]!.minYear, 2016, "item 12: FR vehicle base year 2016");
});

test("decision 15 (SE) and 14 (FR): which documents expire", () => {
  assert.deepEqual(defaultDoc("SE").expiringTypes, ["driving_license", "taxi_driver_license", "taxi_traffic_permit", "vehicle_registration", "insurance"]);
  for (const type of ["terms", "info_session", "profile_photo", "company_registration", "tax_settings", "bank_statement"]) assert.equal(typeInfo(defaultDoc("SE"), type)?.expires, false, `SE ${type} does not expire`);
  assert.deepEqual(defaultDoc("FR").expiringTypes, ["driving_license", "national_id", "vtc_card", "vehicle_registration", "insurance", "rc_pro_insurance", "urssaf_certificate", "vtc_sticker", "vtc_register_certificate"]);
  for (const type of ["terms", "info_session", "profile_photo", "company_registration", "bank_statement"]) assert.equal(typeInfo(defaultDoc("FR"), type)?.expires, false, `FR ${type} does not expire`);
  assert.deepEqual(defaultDoc("FR").documents.driver, ["terms", "info_session", "vtc_card", "driving_license", "national_id", "profile_photo"], "item 12/13: FR docs with the info session");
});

for (const country of ["SE", "FR"] as const) {
  test(`decisions 14 and 15 (${country}): add a NEW document type, rename one, remove one, and the server gives the id`, () => {
    let doc = defaultDoc(country);
    const before = doc.documents.driver.length;
    doc = addCustomType(doc, { owner: "driver", kind: "file", expires: true, name: text("Medical certificate"), help: text("Doctor's stamp visible") }, "k1");
    assert.equal(doc.documents.driver.length, before + 1, "if there is 5 can add more");
    assert.equal(doc.documents.driver.at(-1), "draft:k1");
    assert.ok(doc.expiringTypes.includes("draft:k1"));
    assert.equal(typeInfo(doc, "draft:k1")?.name.sv, "Medical certificate sv");
    assert.equal(settingsProblem(doc), null);
    const fleetType = addCustomType(doc, { owner: "fleet", kind: "admin_check", expires: false, name: text("Office visit"), help: text("Held at the office") }, "k2");
    assert.equal(fleetType.documents.fleet.at(-1), "draft:k2");
    // The server's prepare step (and the demo's): ids custom_ + 10, lists swapped, draftKey dropped.
    const ready = prepareSettings(fleetType, (key) => (key === "k1" ? "aaaaaaaaaa" : "bbbbbbbbbb"));
    assert.equal(ready.documents.driver.at(-1), "custom_aaaaaaaaaa");
    assert.equal(ready.documents.fleet.at(-1), "custom_bbbbbbbbbb");
    assert.ok(ready.expiringTypes.includes("custom_aaaaaaaaaa") && !ready.expiringTypes.includes("custom_bbbbbbbbbb"));
    assert.ok((ready.customTypes ?? []).every((item) => item.draftKey === undefined && /^custom_[a-z0-9]{10}$/.test(item.id ?? "")));
    // Rename a contract type and change its help text: texts[type].
    const renamed = editType(ready, "profile_photo", { name: text("Face photo"), help: text("No sunglasses"), expires: false });
    assert.equal(typeInfo(renamed, "profile_photo")?.name.fr, "Face photo fr");
    assert.equal(renamed.texts?.["profile_photo"]?.help?.en, "No sunglasses en");
    // Delete: a custom type leaves the country; a contract type leaves the list.
    const deleted = removeFromList(renamed, "driver", "custom_aaaaaaaaaa");
    assert.ok(!deleted.documents.driver.includes("custom_aaaaaaaaaa") && !(deleted.customTypes ?? []).some((item) => item.id === "custom_aaaaaaaaaa") && !deleted.expiringTypes.includes("custom_aaaaaaaaaa"));
    const noPhoto = removeFromList(deleted, "driver", "profile_photo");
    assert.ok(!noPhoto.documents.driver.includes("profile_photo"));
    assert.ok(addableTypes(noPhoto, "driver").includes("profile_photo"), "a removed type can be added back");
    assert.deepEqual(addToList(noPhoto, "driver", "profile_photo").documents.driver.at(-1), "profile_photo");
    assert.equal(settingsProblem(removeFromList(noPhoto, "driver", "driving_license")), "The driving licence is always needed.");
    assert.equal(settingsProblem(addCustomType(noPhoto, { owner: "vehicle", kind: "file", expires: false, name: { sv: "x", fr: "", en: "x" }, help: text("h") }, "k3")), "Every new document needs a name and a help text in Swedish, French and English.");
    assert.ok(!addableTypes(noPhoto, "vehicle").some((type) => type.startsWith("vehicle_photo_")), "the car photos come with photosNeeded");
  });
}

test("decisions 11 and note check: limits of steps, reminders, warnings and car rules", () => {
  const doc = defaultDoc("SE");
  assert.equal(settingsProblem({ ...doc, expiry: { ...doc.expiry, warnDays: [7, 30] } }), "Document warnings: each warning must come after the one before (fewer days).");
  assert.equal(settingsProblem({ ...doc, signUpReminders: { ...doc.signUpReminders, everyDays: 31 } }), "Remind every 1 to 30 days.");
  assert.equal(settingsProblem({ ...doc, vehicles: { ...doc.vehicles, categories: doc.vehicles.categories.map((rule) => (rule.category === "xl" ? { ...rule, fuels: [] } : rule)) } }), "A category that is on needs at least one fuel.");
  assert.equal(settingsProblem({ ...doc, vehicles: { ...doc.vehicles, categories: doc.vehicles.categories.map((rule) => ({ ...rule, minYear: 1980 })) } }), "Car year: 1990 to 2030.");
});

test("demo publish = live publish: the slice gets a new version and the new type its id on read", () => {
  const book = emptySettingsBook();
  const doc = addCustomType(defaultDoc("FR"), { owner: "vehicle", kind: "file", expires: true, name: text("Crit'Air"), help: text("Sticker") }, "k9");
  const staged = stagePublish(book, "FR", doc, "2026-10-29T12:00:00.000Z");
  assert.equal(staged.countries.FR.liveVersion, 1);
  assert.equal(staged.countries.FR.document.publishedAt, "2026-10-29T12:00:00.000Z");
  assert.equal(staged.countries.SE, book.countries.SE, "only the chosen country changes");
  const read = normalizeSettingsBook(staged);
  const id = read.countries.FR.document.documents.vehicle.at(-1)!;
  assert.match(id, /^custom_[a-z0-9]{10}$/);
  assert.equal(normalizeSettingsBook(read).countries.FR.document.documents.vehicle.at(-1), id, "the same id on every read");
  assert.ok(read.countries.FR.document.expiringTypes.includes(id));
  assert.equal("documentTypes" in wireDocument({ ...doc, documentTypes: {} } as SettingsDoc), false, "documentTypes is read-only");
});

type Call = { method: string; path: string; body?: unknown };
function fakeServer(docs: Record<string, SettingsDoc>) {
  const calls: Call[] = [];
  const versions: Record<string, { version: number; liveVersion: number }> = {};
  const http = {
    json: async <T,>(path: string): Promise<T> => {
      calls.push({ method: "GET", path });
      const country = /country=([A-Z]{2})/.exec(path)?.[1];
      if (!path.startsWith("/admin/config/onboarding") || !country || !docs[country]) throw Object.assign(new Error("not found"), { status: 404, reason: "zone_not_found" });
      const v = versions[country] ?? { version: 1, liveVersion: 0 };
      return { version: v.version, liveVersion: v.liveVersion, document: docs[country] } as T;
    },
    put: async <T,>(path: string, body: unknown): Promise<T> => {
      calls.push({ method: "PUT", path, body });
      const { country, document } = body as { country: string; document: SettingsDoc };
      docs[country] = prepareSettings(document, () => "zzzzzzzzzz");
      const v = versions[country] ?? { version: 1, liveVersion: 0 };
      versions[country] = { ...v, version: v.version + 1 };
      return { version: v.version + 1 } as T;
    },
    post: async <T,>(path: string, body: unknown): Promise<T> => {
      calls.push({ method: "POST", path, body });
      const { country } = body as { country: string };
      versions[country] = { version: versions[country]!.version, liveVersion: (versions[country]!.liveVersion ?? 0) + 1 };
      return { version: versions[country]!.liveVersion } as T;
    },
  };
  return { http, calls, docs };
}

for (const country of ["SE", "FR"] as const) {
  test(`live (${country}): the settings are read per country and published with PUT + publish { country }, the new type gets the server's id`, async () => {
    const server = fakeServer({ SE: defaultDoc("SE"), FR: defaultDoc("FR") });
    const live = createLiveSettings(server.http);
    const book = normalizeSettingsBook(await live.readSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook()));
    assert.ok(server.calls.some((call) => call.path === `/admin/config/onboarding?country=${country}`));
    assert.ok(!server.calls.some((call) => call.path.includes("zoneId")), "per country only (scope_country_only)");
    const doc = addCustomType(book.countries[country].document, { owner: "driver", kind: "admin_check", expires: false, name: text("Road test"), help: text("Booked with Movera") }, "rt");
    const message = await live.command("admin.onboarding.publishSettings", { targetId: country, value: stagePublish(book, country, doc, "2026-10-29T00:00:00Z") });
    assert.equal(message, "Published.");
    const put = server.calls.find((call) => call.method === "PUT")!;
    assert.equal(put.path, "/admin/config/onboarding");
    const sent = put.body as { country: string; expectedVersion: number; document: SettingsDoc };
    assert.equal(sent.country, country);
    assert.equal(sent.expectedVersion, 1);
    assert.equal(sent.document.customTypes?.[0]?.draftKey, "rt", "the server, not the panel, makes the id");
    assert.ok(sent.document.documents.driver.includes("draft:rt"));
    const publish = server.calls.find((call) => call.method === "POST")!;
    assert.deepEqual(publish, { method: "POST", path: "/admin/config/onboarding/publish", body: { expectedVersion: 2, country } });
    const after = normalizeSettingsBook(await live.readSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook()));
    assert.ok(after.countries[country].document.documents.driver.includes("custom_zzzzzzzzzz"));
    assert.equal(documentTypeName("custom_zzzzzzzzzz", "sv", country), "Road test sv", "the panel shows the admin's name");
    assert.equal(isAdminCheck("custom_zzzzzzzzzz"), true, "an admin_check type is marked held");
  });
}

test("decisions 8 and 13: the info session is an admin check in SE and FR; renamed types show the admin's name", () => {
  assert.equal(isAdminCheck("info_session"), true);
  assert.equal(isAdminCheck("driving_license"), false);
  assert.equal(contractTypeOf("virtual_session"), "info_session");
  assert.equal(typeInfo(defaultDoc("SE"), "info_session")?.kind, "admin_check");
  assert.equal(typeInfo(defaultDoc("FR"), "info_session")?.kind, "admin_check");
  registerCountryTypes("SE", { texts: { vtc_card: { name: { sv: "Yrkeskort", fr: "Carte", en: "Card" } } } });
  assert.equal(documentTypeName("vtc_card", "sv", "SE"), "Yrkeskort");
  assert.equal(documentTypeName("vtc_card", "sv", "FR"), "VTC-yrkeskort", "another country keeps the contract name");
});

test("note check: the demo board and car pages follow the published settings (steps, reminders, warnings, car rules)", () => {
  const book = emptySettingsBook();
  const se = { ...book.countries.SE.document, signUpReminders: { on: false, everyDays: 5, stuckAfterDays: 12 }, expiry: { warnDays: [45, 10], blockAtExpiry: false } };
  const fr = { ...book.countries.FR.document, vehicles: { ...book.countries.FR.document.vehicles, warnDays: 60, categories: book.countries.FR.document.vehicles.categories.map((rule) => (rule.category === "economy" ? { ...rule, minYear: 2018 } : rule)) } };
  const next = { ...book, countries: { ...book.countries, SE: { ...book.countries.SE, document: se }, FR: { ...book.countries.FR, document: fr } } };
  const rules = withSettings(emptyOnboardingRules(), next);
  assert.equal(rules.countries.SE.reminders, false);
  assert.equal(rules.countries.SE.stuckAfterDays, 12);
  assert.deepEqual(rules.countries.SE.docWarnDays, [45, 10]);
  assert.equal(rules.countries.SE.blockAtExpiry, false);
  const cars = withVehicleSettings(emptyVehicleRules(), next);
  assert.equal(cars.countries.FR.warnDays, 60);
  assert.equal(cars.countries.FR.categories.find((rule) => rule.category === "economy")?.minYear, 2018);
});
