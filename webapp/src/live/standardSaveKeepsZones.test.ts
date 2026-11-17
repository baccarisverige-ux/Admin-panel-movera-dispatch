import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishTargets, resolveScope } from "../markets/scope.ts";
import { countryRulesOf, type Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * Live 2026-11-16 (Rules audits/impact/country-undo.md): the owner ticked "Standard for Sweden" beside "All zones" and
 * saved Tips & limits. The top bar then names the Standard AND every zone ("all,standard-SE"), and the save wrote a
 * country_rules document of its own into each of the 11 zones (audit 2791-2812). A zone that uses the Standard gets
 * the Standard's values by using it; a copy of its own detaches it, so a later change of the Standard never reaches
 * it. Saving the Standard must not detach the zones.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
const rules = (tip: number) => countryRulesOf("SE", "SEK", { tips: [tip], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null);
type Book = { draftRev: number; countries: Record<string, unknown>; zones: Record<string, { tips: Array<{ id?: string; amount: number; enabled?: boolean }> }> };

async function open() {
  const server = fakeConfigServer({
    "country_rules:standard-SE": { liveVersion: 1, document: rules(10) },
    // Z002 has Tips & limits of its own; every other zone of Sweden uses the Standard.
    "country_rules:Z002": { liveVersion: 3, document: rules(35) },
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
  });
  const settings = createLiveSettings(server.http, () => "2026-11-16T05:18:42Z");
  const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book;
  const zones = (await settings.readSlice("countrySettingsZones", {})) as Book["zones"];
  server.calls.length = 0;
  return { server, settings, book: { ...countries, zones } };
}

const withTip = (book: Book, targets: readonly string[], amount: number): Book => {
  const shown = { ...book.zones["standard-SE"]!, tips: [{ id: "t1", amount, enabled: true }] };
  return { ...book, draftRev: book.draftRev + 1, zones: { ...book.zones, ...Object.fromEntries(targets.map((id) => [id, shown])) } };
};

test("the Standard beside \"All zones\": the save writes the Standard, not a copy into every zone that uses it", async () => {
  const { server, settings, book } = await open();
  const targets = publishTargets(resolveScope({ zones: "all" }, { scope: "all,standard-SE" }));
  assert.ok(targets.includes("standard-SE") && targets.includes("Z001") && targets.includes("ARN"), "the top bar names the Standard and every zone");

  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: withTip(book, targets, 40), scope: targets.join(",") });

  const written = [...new Set(server.calls.filter((c) => c.method === "PUT" && c.path.endsWith("/country_rules")).map((c) => (c.body as { zoneId?: string; country?: string }).zoneId ?? `standard-${(c.body as { country?: string }).country}`))];
  // The Standard, and Z002 (its own document would not get the Standard's change otherwise). No zone that uses the Standard.
  assert.deepEqual(written.sort(), ["Z002", "standard-SE"]);
  for (const zone of ["Z001", "Z003", "ARN", "BMA"]) assert.equal(server.live(`country_rules:${zone}`), 0, `${zone} still has no Tips & limits of its own`);
  assert.equal((await server.http.json<{ usesStandard: boolean }>("/admin/config/country_rules?zoneId=Z001")).usesStandard, true);
  // The same for the tip rules in the rider app document: no zone got a rider document of its own.
  assert.deepEqual(server.calls.filter((c) => c.method === "PUT" && c.path.endsWith("/rider_app_config")).map((c) => (c.body as { zoneId?: string }).zoneId).filter(Boolean), []);
});

test("only the Standard chosen: only the Standard is written", async () => {
  const { server, settings, book } = await open();
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: withTip(book, ["standard-SE"], 40), scope: "standard-SE" });
  assert.ok(server.writes().length > 0);
  assert.ok(server.writes().every((line) => line.endsWith("country=SE")), server.writes().join("\n"));
});

test("zones chosen WITHOUT the Standard still get their own (owner 2026-10-28): that is how a zone is made different", async () => {
  const { server, settings, book } = await open();
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: withTip(book, ["Z001"], 40), scope: "Z001" });
  assert.ok(server.live("country_rules:Z001") > 0);
  assert.equal(server.live("country_rules:standard-SE"), 1);
});

test("the Standard is written before the zones, whatever the order at the top", async () => {
  const { server, settings, book } = await open();
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: withTip(book, ["Z002", "standard-SE"], 40), scope: "Z002,standard-SE" });
  const order = server.calls.filter((c) => c.method === "PUT" && c.path.endsWith("/country_rules")).map((c) => (c.body as { zoneId?: string }).zoneId ?? "standard");
  assert.deepEqual(order, ["standard", "Z002"]);
});

test("the answer says which chosen zones got it through the Standard", async () => {
  const { settings, book } = await open();
  const said = await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: withTip(book, ["standard-SE", "Z001", "Z002"], 40), scope: "standard-SE,Z001,Z002" });
  assert.match(String(said), /use the Standard/);
  assert.match(String(said), /Norrmalm/);
});
