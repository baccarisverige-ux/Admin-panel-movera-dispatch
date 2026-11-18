import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countryRulesOf, type Doc } from "./configDocs.ts";
import { fakeConfigServer } from "./fakeConfigServer.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { TIPS_LAST_SAVE_KEY, savedLine, shownDocuments, type TipsSave } from "./tipsUndo.ts";

/**
 * Supervisor round 3, MF-R3-2 (Rules audits/impact/country-undo-supervisor.md): the tab keeps its last read of the
 * newest Tips & limits save for 2 minutes. It was forgotten when a command STARTED, never when it ended, so a read made
 * while a save was still publishing was kept and shown after the save: the dialog listed 1 document and the Undo put
 * back 3. Now the read is also forgotten when every command ends, a read begun during a command is not kept, and the
 * Undo refuses when the documents it would put back are not the ones the dialog listed.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
const rules = (tip: number) => countryRulesOf("SE", "SEK", { tips: [tip], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null);
type Book = { draftRev: number; countries: Record<string, unknown>; zones: Record<string, { tips: Array<{ id?: string; amount: number; enabled?: boolean }> }> };

function setUp(midSave: (settings: ReturnType<typeof createLiveSettings>) => Promise<unknown>) {
  const server = fakeConfigServer({
    "country_rules:standard-SE": { liveVersion: 1, document: rules(10) },
    "country_rules:Z002": { liveVersion: 3, document: rules(35) },
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
  });
  const ref: { settings?: ReturnType<typeof createLiveSettings> } = {};
  let publishes = 0;
  const http = { ...server.http, post: async (path: string, body: unknown, ...rest: unknown[]) => {
    const out = await (server.http.post as (...a: unknown[]) => Promise<unknown>)(path, body, ...rest);
    // The tab is opened again (or the network comes back) after the first publish of the save.
    if (/\/publish$/.test(path) && ++publishes === 1) await midSave(ref.settings!);
    return out;
  } } as typeof server.http;
  const settings = createLiveSettings(http, () => "2026-11-16T05:18:42Z");
  ref.settings = settings;
  const save = async () => {
    const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book;
    const book = { ...countries, zones: (await settings.readSlice("countrySettingsZones", {})) as Book["zones"] };
    const shown = { ...book.zones["standard-SE"]!, tips: [{ id: "t1", amount: 40, enabled: true }] };
    await settings.command("admin.pricing.saveCountry", { targetId: "x", value: { ...book, draftRev: 1, zones: { ...book.zones, "standard-SE": shown, Z002: shown } }, scope: "standard-SE,Z002" });
  };
  const last = () => settings.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null) as Promise<TipsSave>;
  const posts = () => server.calls.filter((c) => c.method === "POST" && /\/(restore|use-standard)$/.test(c.path));
  return { server, settings: () => settings, save, last, posts };
}

test("MF-R3-2: a tab read in the middle of a save is not what the Undo dialog lists after the save", async () => {
  const { server, settings, save, last, posts } = setUp(async (s) => s.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null));
  await save();
  const after = await last();
  server.calls.length = 0;
  await settings().command("admin.tipsLimits.undo", { targetId: after.saveId, scope: "SE", value: { shown: shownDocuments(after) } });
  assert.equal(posts().length, after.documents.filter((d) => d.back.to !== "nothing").length, `the dialog listed ${after.documents.map(savedLine).join(" | ")}; the Undo put back ${posts().length} documents`);
  assert.equal(posts().length, 3);
});

test("MF-R3-2: a read that began while a command ran is not kept, even when it ends after the command", async () => {
  let pending: Promise<unknown> | null = null;
  const { save, last } = setUp(async (s) => { pending = Promise.resolve(s.readSlice(`${TIPS_LAST_SAVE_KEY}:SE`, null)); });
  await save();
  await pending;
  assert.equal((await last()).documents.length, 3, "the tab reads again after the save");
});

test("MF-R3-2: the Undo refuses when the documents it reads are not the ones the dialog listed", async () => {
  const { server, settings, save, last, posts } = setUp(async () => undefined);
  await save();
  const after = await last();
  const fewer = shownDocuments({ ...after, documents: after.documents.slice(0, 1) });
  server.calls.length = 0;
  await assert.rejects(Promise.resolve(settings().command("admin.tipsLimits.undo", { targetId: after.saveId, scope: "SE", value: { shown: fewer } })), /The save changed since you looked/);
  await assert.rejects(Promise.resolve(settings().command("admin.tipsLimits.undo", { targetId: after.saveId, scope: "SE" })), /The save changed since you looked/, "no list shown: nothing is undone");
  assert.equal(posts().length, 0, "nothing was put back");
  await settings().command("admin.tipsLimits.undo", { targetId: after.saveId, scope: "SE", value: { shown: shownDocuments(after) } });
  assert.equal(posts().length, 3);
});

test("MF-R3-2: the Undo button sends the documents its dialog lists", () => {
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  const button = panel.slice(panel.indexOf('command="admin.tipsLimits.undo"'), panel.indexOf("</CommandButton>", panel.indexOf('command="admin.tipsLimits.undo"')));
  assert.match(button, /value=\{lastSave\.value \? \{ shown: shownDocuments\(lastSave\.value\) \}/);
  assert.match(button, /details=\{lastSave\.value \? \[\.\.\.lastSave\.value\.documents\.map\(savedLine\)/);
});
