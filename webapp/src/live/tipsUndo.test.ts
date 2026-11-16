import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commandById } from "../commands/registry.ts";
import { reasonFamily } from "../commands/reasons.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { countryRulesOf, type Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { liveHandles } from "./liveCommands.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { TIPS_LAST_SAVE_KEY, lastTipsSave, parseSaveNote, saveNote, savedLine, undoBlocked, unreadLine, type TipsSave } from "./tipsUndo.ts";

/**
 * Live 2026-11-16 (Rules audits/impact/country-undo.md): one "Save tips & limits" publishes several documents (the
 * country's Tips & limits, the rider app document with the tip rules, and the same for each chosen zone with its own),
 * and the page had no Undo for it: the only Undo tile was the pricing one. Tips & limits gets its own Undo. Every
 * publish of one save carries the save's id in its note, so the server's History says which documents one save
 * published together; Undo puts back the version before in each of them, and names them first.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
const rules = (tip: number) => countryRulesOf("SE", "SEK", { tips: [tip], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null);
type Book = { draftRev: number; countries: Record<string, unknown>; zones: Record<string, { tips: Array<{ id?: string; amount: number; enabled?: boolean }> }> };
const SCOPES = ["standard-SE", "Z001", "Z002", "Z003"];

async function open() {
  const server = fakeConfigServer({
    "country_rules:standard-SE": { liveVersion: 1, document: rules(10) },
    "country_rules:Z002": { liveVersion: 3, document: rules(35) },
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
  });
  const settings = createLiveSettings(server.http, () => "2026-11-16T05:18:42Z");
  const read = async (): Promise<Book> => {
    const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book;
    return { ...countries, zones: (await settings.readSlice("countrySettingsZones", {})) as Book["zones"] };
  };
  const save = async (targets: readonly string[], amount: number) => {
    const book = await read();
    const shown = { ...book.zones[targets[0]!]!, tips: [{ id: "t1", amount, enabled: true }] };
    const value = { ...book, draftRev: book.draftRev + 1, zones: { ...book.zones, ...Object.fromEntries(targets.map((id) => [id, shown])) } };
    return settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: targets.join(",") });
  };
  const last = () => settings.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null) as Promise<TipsSave | null>;
  return { server, settings, save, last };
}
const restores = (server: ReturnType<typeof fakeConfigServer>) => server.calls.filter((c) => c.method === "POST" && /\/(restore|use-standard)$/.test(c.path)).map((c) => ({ path: c.path.replace("/admin/config/", ""), ...(c.body as object) }));
const tipOf = (server: ReturnType<typeof fakeConfigServer>, key: string) => ((server.liveDocument(key)?.["tips"] as Array<{ amount: { amountMinor: number } }>)[0]!.amount.amountMinor);

test("the note of a save: its id, and whether the scope used the Standard before", () => {
  assert.deepEqual(parseSaveNote(saveNote("2026-11-16T05:18:42Z/k3x9aa", false)), { saveId: "2026-11-16T05:18:42Z/k3x9aa", wasOnStandard: false });
  assert.deepEqual(parseSaveNote(saveNote("s1", true)), { saveId: "s1", wasOnStandard: true });
  for (const other of [undefined, "", "Pricing update", "Restore version 2", "re-stamped: Z001 went back to the standard", "Undo Tips & limits save s1"]) assert.equal(parseSaveNote(other), null);
});

test("one save records which documents it published together: every publish carries the same save id", async () => {
  const { server, save } = await open();
  await save(["standard-SE", "Z002"], 40);
  const notes = server.calls.filter((c) => c.method === "POST" && c.path.endsWith("/publish")).map((c) => (c.body as { note?: string }).note);
  assert.equal(notes.length, 3);
  const ids = new Set(notes.map((note) => parseSaveNote(note)?.saveId));
  assert.equal(ids.size, 1);
  assert.ok([...ids][0], "each publish names the save");
});

test("Undo last Tips & limits save: names every document of the save, then restores each with country or zoneId", async () => {
  const { server, settings, save, last } = await open();
  await save(["standard-SE", "Z002"], 40);
  assert.equal(tipOf(server, "country_rules:standard-SE"), 4000);

  const found = (await last())!;
  assert.deepEqual(found.documents.map((d) => [d.doc, d.id, d.version, d.back]), [
    ["rider_app_config", "standard-SE", 9, { to: "version", version: 8, expectedVersion: 9 }],
    ["country_rules", "standard-SE", 2, { to: "version", version: 1, expectedVersion: 2 }],
    ["country_rules", "Z002", 4, { to: "version", version: 3, expectedVersion: 4 }],
  ]);
  assert.equal(found.by, "adm_1");
  const lines = found.documents.map(savedLine);
  assert.match(lines[1]!, /Standard.*Tips & limits.*version 2.*version 1/);
  assert.match(lines[2]!, /\(Z002\)/);

  server.calls.length = 0;
  const said = String(await settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" }));
  const note = `Undo Tips & limits save ${found.saveId}`;
  assert.deepEqual(restores(server), [
    { path: "rider_app_config/restore", country: "SE", version: 8, expectedVersion: 9, note },
    { path: "country_rules/restore", country: "SE", version: 1, expectedVersion: 2, note },
    { path: "country_rules/restore", zoneId: "Z002", version: 3, expectedVersion: 4, note },
  ]);
  assert.equal(tipOf(server, "country_rules:standard-SE"), 1000);
  assert.equal(tipOf(server, "country_rules:Z002"), 3500);
  assert.match(said, /3/);
  // The undo itself is not a save: the same save is found, nothing of it can go back, and a second press is refused.
  assert.ok((await last())!.documents.every((d) => d.back.to === "nothing"));
  server.calls.length = 0;
  await assert.rejects(Promise.resolve(settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" })), /Nothing to undo/);
  assert.deepEqual(restores(server), []);
});

test("a zone that used the Standard before the save goes back to the Standard (it had no earlier version of its own)", async () => {
  const { server, settings, save, last } = await open();
  await save(["Z001"], 40);
  assert.ok(server.live("country_rules:Z001") > 0 && server.live("rider_app_config:Z001") > 0);
  const found = (await last())!;
  assert.deepEqual(found.documents.map((d) => [d.doc, d.id, d.back.to]), [["rider_app_config", "Z001", "standard"], ["country_rules", "Z001", "standard"]]);
  assert.match(savedLine(found.documents[1]!), /back to the Standard/);
  server.calls.length = 0;
  await settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" });
  assert.deepEqual(restores(server).map((c) => [c.path, (c as { zoneId?: string }).zoneId]), [["rider_app_config/use-standard", "Z001"], ["country_rules/use-standard", "Z001"]]);
  assert.equal(server.live("country_rules:Z001"), 0);
  assert.equal(server.live("rider_app_config:Z001"), 0);
});

test("a document published again after the save is named as changed and is not touched", async () => {
  const { server, settings, save, last } = await open();
  await save(["standard-SE", "Z002"], 40);
  // Another admin publishes Z002's Tips & limits again.
  const draft = await server.http.json<{ version: number; document: Doc }>("/admin/config/country_rules?zoneId=Z002");
  const put = await server.http.put<{ version: number }>("/admin/config/country_rules", { expectedVersion: draft.version, zoneId: "Z002", document: rules(55) });
  await server.http.post("/admin/config/country_rules/publish", { expectedVersion: put.version, zoneId: "Z002" });

  const found = (await last())!;
  const z002 = found.documents.find((d) => d.id === "Z002")!;
  assert.deepEqual(z002.back, { to: "nothing", why: "changed" });
  assert.match(savedLine(z002), /Not touched/);
  server.calls.length = 0;
  const said = String(await settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" }));
  assert.deepEqual(restores(server).map((c) => (c as { zoneId?: string; country?: string }).zoneId ?? (c as { country?: string }).country), ["SE", "SE"]);
  assert.equal(tipOf(server, "country_rules:Z002"), 5500);
  assert.match(said, /Not undone/);
});

test("the Standard re-stamped by a zone going back to it is still the same save (same document, next version)", async () => {
  const { server, save, last } = await open();
  await save(["standard-SE"], 40);
  const own = await server.http.json<{ version: number }>("/admin/config/country_rules?zoneId=Z002");
  await server.http.post("/admin/config/country_rules/use-standard", { zoneId: "Z002", expectedVersion: own.version });
  const standard = (await last())!.documents.find((d) => d.doc === "country_rules")!;
  assert.deepEqual(standard.back, { to: "version", version: 1, expectedVersion: server.live("country_rules:standard-SE") });
});

test("Undo acts only on the save the admin was shown: a newer save refuses it", async () => {
  const { settings, save, last } = await open();
  await save(["standard-SE"], 40);
  const shown = (await last())!;
  await save(["standard-SE"], 45);
  await assert.rejects(Promise.resolve(settings.command("admin.tipsLimits.undo", { targetId: shown.saveId, scope: "SE" })), /Another Tips & limits save/);
});

test("nothing saved from the panel yet: nothing to undo (a save from before this version carries no id)", async () => {
  const { server, settings, last } = await open();
  assert.equal(await last(), null);
  assert.equal(await lastTipsSave(server.http, SCOPES), null);
  await assert.rejects(Promise.resolve(settings.command("admin.tipsLimits.undo", { targetId: "x", scope: "SE" })), /Nothing to undo/);
});

/**
 * Supervisor MF-A1 (Rules audits/impact/country-undo-supervisor.md): a document of the save must never be left out
 * without being named. Two cases did that: a scope whose History cannot be read, and a save deeper than one page.
 */
test("MF-A1 (a): the Standard cannot be read while a zone is in the save: it is named, and the Undo is blocked", async () => {
  const seed = { "country_rules:standard-SE": { liveVersion: 1, document: rules(10) }, "country_rules:Z002": { liveVersion: 3, document: rules(35) }, "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") } };
  const before = fakeConfigServer(seed);
  const settings = createLiveSettings(before.http, () => "2026-11-16T05:18:42Z");
  const book = { ...((await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book), zones: (await settings.readSlice("countrySettingsZones", {})) as Book["zones"] };
  const shown = { ...book.zones["standard-SE"]!, tips: [{ id: "t1", amount: 40, enabled: true }] };
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value: { ...book, draftRev: 1, zones: { ...book.zones, "standard-SE": shown, Z002: shown } }, scope: "standard-SE,Z002" });
  // The same server, now refusing History for a country (a server without fad59d5 answers 400).
  let refuse = true;
  const json = before.http.json;
  before.http.json = (async (path: string) => {
    if (refuse && path.includes("/history?country=")) throw Object.assign(new Error("invalid_body"), { status: 400 });
    return json(path);
  }) as typeof json;

  const found = (await settings.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null)) as TipsSave;
  assert.deepEqual(found.documents.map((d) => d.id), ["Z002"]);
  assert.deepEqual(found.unreadable.map((d) => `${d.doc}:${d.id}`).sort(), ["country_rules:standard-SE", "rider_app_config:standard-SE"]);
  assert.match(unreadLine(found.unreadable[0]!), /Standard.*could not be read/);
  assert.match(undoBlocked(found) ?? "", /could not be read/);
  before.calls.length = 0;
  await assert.rejects(Promise.resolve(settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" })), /could not be read/);
  assert.deepEqual(restores(before), [], "nothing is restored while a document of the country cannot be read");
  assert.equal(tipOf(before, "country_rules:Z002"), 4000);
  // Readable again: the whole save is named and undone.
  refuse = false;
  const whole = (await settings.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null)) as TipsSave;
  assert.equal(whole.documents.length, 3);
  assert.equal(undoBlocked(whole), null);
});

test("MF-A1 (a): nothing found and a scope unreadable: no save is claimed, the scope is named", async () => {
  const server = fakeConfigServer({ "country_rules:standard-SE": { liveVersion: 1, document: rules(10) } }, { countryHistory: false });
  const found = (await lastTipsSave(server.http, SCOPES))!;
  assert.deepEqual(found.documents, []);
  assert.deepEqual(found.unreadable.map((d) => d.id), ["standard-SE", "standard-SE"]);
  assert.match(undoBlocked(found) ?? "", /could not be read/);
});

test("MF-A1 (b): more than 10 newer entries above the save (11 zones re-stamped the Standard): still found and undone", async () => {
  const { server, settings, save, last } = await open();
  await save(["standard-SE"], 40);
  const saved = server.live("country_rules:standard-SE");
  // 11 zones with Tips & limits of their own go back to the Standard: each re-stamps the Standard one version up.
  const zones = ["ARN", "BMA", "Z001", "Z002", "Z003", "Z004", "Z005", "Z006", "Z007", "Z008", "Z009"];
  for (const zone of zones) {
    const at = { zoneId: zone };
    const put = await server.http.put<{ version: number }>("/admin/config/country_rules", { expectedVersion: zone === "Z002" ? 4 : 1, ...at, document: rules(35) });
    await server.http.post("/admin/config/country_rules/publish", { expectedVersion: put.version, ...at });
    const own = await server.http.json<{ version: number }>(`/admin/config/country_rules?zoneId=${zone}`);
    await server.http.post("/admin/config/country_rules/use-standard", { ...at, expectedVersion: own.version });
  }
  assert.ok(server.history("country_rules:standard-SE").length >= 13);
  const found = (await last())!;
  const standard = found.documents.find((d) => d.doc === "country_rules" && d.id === "standard-SE")!;
  assert.ok(standard, "the Standard is still a document of the save");
  assert.equal(standard.version, saved);
  assert.deepEqual(standard.back, { to: "version", version: 1, expectedVersion: server.live("country_rules:standard-SE") });
  await settings.command("admin.tipsLimits.undo", { targetId: found.saveId, scope: "SE" });
  assert.equal(tipOf(server, "country_rules:standard-SE"), 1000);
});

test("the dialog lists EVERY document (no \"and N more\") in plain words, and blocks Confirm when one cannot be read", () => {
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  const button = panel.slice(panel.indexOf('command="admin.tipsLimits.undo"'));
  const props = button.slice(0, button.indexOf("</CommandButton>"));
  assert.ok(/details=\{[^}]*savedLine/.test(props) && props.includes("unreadLine"));
  assert.ok(props.includes("blockedReason={"));
  assert.equal(props.includes("largeChanges="), false, "not the \"changes by more than 50%\" wording");
  const dialog = readFileSync(new URL("../ui/CommandButton.tsx", import.meta.url), "utf8");
  assert.ok(dialog.includes('data-testid="command-details"') && dialog.includes('data-testid="command-blocked"'));
  assert.ok(/disabled=\{!confirmed \|\| Boolean\(blockedReason\)/.test(dialog));
});

test("the button: its own command, asks for a reason and confirmation, names the documents, in sv / fr / en", () => {
  const spec = commandById("admin.tipsLimits.undo")!;
  assert.ok(spec.reason && spec.permission === "settings.publish");
  assert.equal(reasonFamily("admin.tipsLimits.undo"), "rollback");
  assert.ok(liveHandles("admin.tipsLimits.undo"));
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  const button = panel.slice(panel.indexOf('command="admin.tipsLimits.undo"'));
  const props = button.slice(0, button.indexOf("</CommandButton>"));
  assert.ok(props.includes('tr("Undo last Tips & limits save")'));
  assert.ok(props.includes("sure"), "the dialog waits for \"Yes, I'm sure\"");
  assert.ok(props.includes("summary="));
  assert.equal(fr["Undo last Tips & limits save"], "Annuler le dernier enregistrement des pourboires et limites");
  assert.equal(sv["Undo last Tips & limits save"], "Ångra senaste sparningen av dricks och gränser");
});
