import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as countrySettings from "../config/countrySettings.ts";
import { countrySettingsLines, zoneSettingsOf, zoneValuesForSave, type CountrySettings, type CountrySettingsBook } from "../config/countrySettings.ts";
import { countryRulesOf, type Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * Live bug found 2026-11-19 (Rules audits/impact/admin-tipslimits-reset.md): Pricing › Tips & limits saved for several
 * scopes with a ZONE shown and the country Standard also chosen. The panel sends the SHOWN scope's values to every
 * chosen scope. The values that belong to the Standard alone (emergency numbers, SOS SMS, largest Add money, Max rider
 * debt, driver owes-limit) are locked on a zone, and what the zone "has" for them is what the admin read from the
 * ZONE's own document: the default emergency numbers and SOS SMS on (a zone's document never carries them). So the
 * Standard was sent the defaults, with no line in the confirm.
 *
 * The test goes through the panel's own two expressions (read from its source, so it follows the panel) and the real
 * save path against the in-memory server.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
const CUSTOM_NUMBERS = [{ kind: "police", number: "11414", label: { sv: "Polis", fr: "Police", en: "Police" } }];
const SEK = (kr: number) => ({ amountMinor: kr * 100, currency: "SEK" });

/** The Standard of Sweden with its own emergency number, SOS SMS off, and its own three money limits. */
const standardRules = () => countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 }, walletCreditMax: 5000, maxRiderDebt: 300, driverOwesLimit: { enabled: true, max: 800 }, emergencyNumbers: CUSTOM_NUMBERS, sosContactsSms: false }, null);
/** A zone's own Tips & limits: the server never stores the Standard-only keys on a zone. */
const zoneRules = () => countryRulesOf("SE", "SEK", { tips: [35], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null, { standard: false });

type Book = CountrySettingsBook & { zones: Record<string, CountrySettings> };

async function open(z002: Doc = zoneRules()) {
  const server = fakeConfigServer({
    "country_rules:standard-SE": { liveVersion: 1, document: standardRules() },
    // Z002 has Tips & limits of its own; every other zone of Sweden uses the Standard.
    "country_rules:Z002": { liveVersion: 3, document: z002 },
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
  });
  const settings = createLiveSettings(server.http, () => "2026-11-19T10:00:00Z");
  const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as CountrySettingsBook;
  const zones = (await settings.readSlice("countrySettingsZones", {})) as Book["zones"];
  server.calls.length = 0;
  return { server, settings, book: { ...countries, zones } as Book };
}

/** The function the panel reads the shown scope's settings with (`const first = zoneId ? X(zoneBook, country, zoneId) : …`). */
function shownOf(book: Book, shownId: string): CountrySettings {
  const name = /const first = zoneId \? (\w+)\(zoneBook, country, zoneId\) : countrySettingsOf\(book, country\);/.exec(panel)?.[1];
  assert.ok(name, "the panel reads the shown scope's settings in one place");
  const read = (countrySettings as unknown as Record<string, (book: Book, country: "SE", zoneId: string) => CountrySettings>)[name];
  assert.equal(typeof read, "function", `${name} is exported by config/countrySettings.ts`);
  return read(book, "SE", shownId);
}

/** What the panel's Save sends for `targets` with `shownId` on screen, after the admin's `edit` (CountryExtrasPanel `value=`). */
function panelSave(book: Book, targets: readonly string[], shownId: string, edit: Partial<CountrySettings>) {
  assert.match(panel, /zones: \{ \.\.\.zoneRules\.value, \.\.\.zoneValuesForSave\(shown, targets, \(id\) => zoneSettingsOf\(zoneBook, country, id\)/);
  const saved = shownOf(book, shownId);
  const shown: CountrySettings = { ...saved, ...edit };
  const value = { ...book, draftRev: book.draftRev + 1, zones: { ...book.zones, ...zoneValuesForSave(shown, targets, (id) => zoneSettingsOf(book, "SE", id)) } };
  return { value, lines: countrySettingsLines("SE", saved, shown), saved, shown };
}

const NEW_TIP = { tips: [{ id: "t1", amount: 40, enabled: true }] };
const save = (settings: Awaited<ReturnType<typeof open>>["settings"], value: unknown, targets: readonly string[]) => settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: targets.join(",") });
const liveStandard = (server: Awaited<ReturnType<typeof open>>["server"]) => server.liveDocument("country_rules:standard-SE") as Doc;

test("SAFETY: a zone shown + the Standard also chosen: the Standard keeps its emergency numbers and its SOS SMS switch", async () => {
  const { server, settings, book } = await open();
  const targets = ["standard-SE", "Z002"];
  const { value, lines } = panelSave(book, targets, "Z002", NEW_TIP);
  // The confirm lists one change: the tip. Nothing about emergency numbers or SOS SMS.
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.match(lines[0]!, /^Tips/);

  await save(settings, value, targets);

  const standard = liveStandard(server);
  assert.equal(server.live("country_rules:standard-SE"), 2, "the Standard was saved (the tip)");
  assert.deepEqual((standard["tips"] as Array<{ amount: unknown }>).map((tip) => tip.amount), [SEK(40)], "the edited tip reached the Standard");
  assert.deepEqual(standard["emergencyNumbers"], CUSTOM_NUMBERS, "the Standard's emergency numbers are not reset to the default");
  assert.equal(standard["sosContactsSms"], false, "the Standard's SOS SMS switch is not set back to on");
});

test("MONEY, the usual state (the zone's document has no money limit of its own): the Standard's three limits stay", async () => {
  const { server, settings, book } = await open();
  const targets = ["standard-SE", "Z002"];
  await save(settings, panelSave(book, targets, "Z002", NEW_TIP).value, targets);
  const standard = liveStandard(server);
  assert.deepEqual(standard["walletCreditMax"], SEK(5000));
  assert.deepEqual(standard["maxRiderDebt"], SEK(300));
  assert.deepEqual(standard["driverOwesLimit"], { enabled: true, max: SEK(800) });
});

test("MONEY, a zone document that carries money limits of its own (old or hand-written): they never reach the Standard", async () => {
  // The server ignores these on a zone; no admin or server code writes them there today. If one is there all the same,
  // the panel read it as "the zone's" value, and the save for both scopes sent it to the Standard.
  const stale = { ...zoneRules(), walletCreditMax: SEK(250), maxRiderDebt: SEK(50), driverOwesLimit: { enabled: false, max: null } };
  const { server, settings, book } = await open(stale);
  const targets = ["standard-SE", "Z002"];
  const { value, lines, shown } = panelSave(book, targets, "Z002", NEW_TIP);
  assert.equal(lines.length, 1, lines.join(" | "));
  // The locked fields on the zone show the country's values (the text beside them says "One limit per country").
  assert.equal(shown.walletCreditMax, 5000);
  assert.equal(shown.maxRiderDebt, 300);

  await save(settings, value, targets);

  const standard = liveStandard(server);
  assert.deepEqual(standard["walletCreditMax"], SEK(5000), "largest Add money stays");
  assert.deepEqual(standard["maxRiderDebt"], SEK(300), "Max rider debt stays");
  assert.deepEqual(standard["driverOwesLimit"], { enabled: true, max: SEK(800) }, "driver owes-limit stays");
});

test("the Standard shown: what the admin sets there is what the Standard gets, and a zone never gets a Standard-only key", async () => {
  const { server, settings, book } = await open();
  const targets = ["standard-SE", "Z002"];
  const numbers = [{ kind: "police" as const, number: "112", label: { sv: "Polis", fr: "Police", en: "Police" } }];
  const { value, lines } = panelSave(book, targets, "standard-SE", { emergencyNumbers: numbers, sosContactsSms: true, walletCreditMax: 6000, maxRiderDebt: 400, driverOwesLimit: { enabled: true, max: 900 } });
  // Emergency numbers, SOS SMS, Max rider debt and the owes-limit each have a line (largest Add money has none on main: a follow-up).
  assert.equal(lines.length, 4, lines.join(" | "));

  await save(settings, value, targets);

  const standard = liveStandard(server);
  assert.deepEqual(standard["emergencyNumbers"], numbers);
  assert.equal(standard["sosContactsSms"], true);
  assert.deepEqual(standard["walletCreditMax"], SEK(6000));
  assert.deepEqual(standard["maxRiderDebt"], SEK(400));
  assert.deepEqual(standard["driverOwesLimit"], { enabled: true, max: SEK(900) });
  const zone = server.liveDocument("country_rules:Z002") as Doc;
  for (const key of ["emergencyNumbers", "sosContactsSms", "walletCreditMax", "maxRiderDebt", "driverOwesLimit"]) assert.equal(key in zone, false, `Z002 has no ${key}`);
});

test("a zone that uses the Standard shown + the Standard chosen: nothing of the Standard is reset", async () => {
  const { server, settings, book } = await open();
  const targets = ["standard-SE", "Z001"];
  await save(settings, panelSave(book, targets, "Z001", NEW_TIP).value, targets);
  const standard = liveStandard(server);
  assert.deepEqual(standard["emergencyNumbers"], CUSTOM_NUMBERS);
  assert.equal(standard["sosContactsSms"], false);
  assert.deepEqual(standard["maxRiderDebt"], SEK(300));
  assert.equal(server.live("country_rules:Z001"), 0, "Z001 still uses the Standard");
});

test("the Standard-only list is the five settings the server takes from the Standard alone", () => {
  assert.deepEqual([...countrySettings.STANDARD_ONLY_FIELDS], ["walletCreditMax", "maxRiderDebt", "driverOwesLimit", "emergencyNumbers", "sosContactsSms"]);
  // The save sends exactly these on the Standard only (live/liveSettings.ts saveCountries).
  const saveLine = readFileSync(new URL("./liveSettings.ts", import.meta.url), "utf8").split("\n").find((line) => line.includes("id === standardKey(market.id) ? {")) ?? "";
  for (const field of countrySettings.STANDARD_ONLY_FIELDS) assert.ok(saveLine.includes(`${field}: next.${field}`), field);
});

test("only the zone chosen: the Standard is not written at all", async () => {
  const { server, settings, book } = await open();
  await save(settings, panelSave(book, ["Z002"], "Z002", NEW_TIP).value, ["Z002"]);
  assert.equal(server.live("country_rules:standard-SE"), 1);
  assert.ok(server.writes().every((line) => !line.endsWith("country=SE")), server.writes().join("\n"));
});
