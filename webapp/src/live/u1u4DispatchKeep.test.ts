import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDispatchBook, liveRules } from "../dispatch/rules.ts";
import { dispatchDocumentOf, type ConfigHttp, type Doc } from "./configDocs.ts";
import { presetOf, toolCalls } from "./dispatchTools.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * U1 + U4 (Rules audits/impact/safe-config-saves.md): Dispatch › Save draft and an edited preset rebuilt the dispatch
 * document from the panel's fields, so stored keys the panel does not own (radar / exclusive reaskAfterSeconds, a
 * newer key) were dropped and the next Publish made the loss live. Both now start from the stored document.
 */
type Row = { version: number; liveVersion: number; draft: Doc; live: Doc };
function server(document: Doc) {
  const row: Row = { version: 6, liveVersion: 5, draft: structuredClone(document), live: structuredClone(document) };
  const puts: Doc[] = [];
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      if (path.startsWith("/admin/config/dispatch/history")) return { items: [] } as T;
      if (path.startsWith("/admin/config/dispatch?zoneId=Z001")) return { version: row.version, liveVersion: row.liveVersion, usesStandard: false, document: structuredClone(row.draft) } as T;
      throw Object.assign(new Error("not found"), { status: 404, reason: "config_not_found" });
    },
    put: async <T,>(path: string, body: unknown) => {
      const input = body as { expectedVersion: number; document: Doc };
      if (path === "/admin/config/dispatch") {
        assert.equal(input.expectedVersion, row.version);
        puts.push(structuredClone(input.document));
        row.draft = structuredClone(input.document);
        row.version += 1;
      }
      return { version: row.version } as T;
    },
    post: async <T,>() => ({ version: row.liveVersion }) as T,
  };
  return { http, puts };
}

function stored(): Doc {
  const doc = dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z001"), "Z001", null);
  (doc["radar"] as Doc)["reaskAfterSeconds"] = 30;
  (doc["exclusive"] as Doc)["reaskAfterSeconds"] = 45;
  doc["futureKey"] = { x: 1 };
  doc["neighbours"] = { on: true, zoneIds: ["Z002"] };
  doc["noDriverNearby"] = { on: true, afterSec: 60, message: "Inga bilar nära" };
  return { ...doc, version: 5 };
}

type Zone = ReturnType<typeof liveRules>;
async function saveDraft(change: (zone: Zone) => Zone, document: Doc = stored()) {
  const fake = server(document);
  const settings = createLiveSettings(fake.http, () => "2026-11-17T10:00:00Z");
  const book = (await settings.readSlice("dispatchRules", null)) as ReturnType<typeof emptyDispatchBook>;
  await settings.command("admin.dispatch.saveDraft", { targetId: "dispatch draft", value: { ...book, draft: { Z001: change(liveRules(book, "Z001")) } } });
  assert.equal(fake.puts.length, 1, "Save draft wrote the dispatch draft");
  return fake.puts[0]!;
}

test("U1: Save draft after one radar change keeps radar/exclusive reaskAfterSeconds and an unknown key", async () => {
  const sent = await saveDraft((zone) => ({ ...zone, radar: { ...zone.radar, seconds: 33 } }));
  assert.equal((sent["radar"] as Doc)["seconds"], 33, "the edit is sent");
  assert.equal((sent["radar"] as Doc)["reaskAfterSeconds"], 30);
  assert.equal((sent["exclusive"] as Doc)["reaskAfterSeconds"], 45);
  assert.deepEqual(sent["futureKey"], { x: 1 });
});

test("U1: panel edits still win in Save draft (a switch off, an emptied list)", async () => {
  const sent = await saveDraft((zone) => ({ ...zone, radar: { ...zone.radar, on: !zone.radar.on }, neighbours: { ...zone.neighbours, zoneIds: [] }, noDriverNearby: { ...zone.noDriverNearby, message: "" } }));
  assert.deepEqual((sent["neighbours"] as Doc)["zoneIds"], [], "the emptied list is sent");
  assert.equal((sent["noDriverNearby"] as Doc)["message"], "", "the emptied field is sent");
  assert.equal((sent["radar"] as Doc)["on"], !liveRules(emptyDispatchBook(), "Z001").radar.on);
  assert.equal((sent["exclusive"] as Doc)["reaskAfterSeconds"], 45);
});

// Supervisor M1 (round 2): a key the stored document lacks (older documents) must still be written when the panel edits it.
const EDITS: Record<string, (zone: Zone) => Zone> = {
  bookedNext: (zone) => ({ ...zone, bookedNext: { ...zone.bookedNext, on: !zone.bookedNext.on } }),
  finishing: (zone) => ({ ...zone, finishing: { ...zone.finishing, withinMin: zone.finishing.withinMin + 3 } }),
  favourite: (zone) => ({ ...zone, favourite: { ...zone.favourite, maxKm: zone.favourite.maxKm + 3 } }),
  exclusiveWhileDriving: (zone) => ({ ...zone, exclusiveWhileDriving: { ...zone.exclusiveWhileDriving, on: !(zone.exclusiveWhileDriving as { on: boolean }).on } }),
  choose: (zone) => ({ ...zone, choose: { ...zone.choose, main: zone.choose.main === "radar" ? "exclusive" : "radar" } }),
  radius: (zone) => ({ ...zone, radius: { ...zone.radius, maxWaitMin: zone.radius.maxWaitMin + 3 } }),
  factors: (zone) => ({ ...zone, factors: zone.factors.slice(1) }),
  raisePrice: (zone) => ({ ...zone, raisePrice: { maxFactor: zone.raisePrice.maxFactor === 3 ? 2.5 : 3 } }),
  rulesFrom: (zone) => ({ ...zone, rulesFrom: zone.rulesFrom === "driver" ? "pickup" : "driver" }),
};
for (const [key, edit] of Object.entries(EDITS)) {
  test(`U1 M1: a stored draft without ${key}: the panel's edit of it is still sent by Save draft`, async () => {
    const document = stored();
    delete document[key];
    const sent = await saveDraft(edit, document);
    assert.ok(key in sent, `${key} missing in the sent draft`);
    assert.deepEqual(sent[key], dispatchDocumentOf(edit(liveRules(emptyDispatchBook(), "Z001")), "Z001", null)[key]);
    assert.equal((sent["exclusive"] as Doc)["reaskAfterSeconds"], 45);
  });
}

const none = { presets: [], groups: [], radarZones: [], radarZoneRules: [], events: [] };

test("U4: an edited and renamed preset keeps the stored reaskAfterSeconds and unknown keys; the edit wins", () => {
  const values = stored();
  for (const key of ["version", "publishedAt", "zoneId", "country", "timeZone"]) delete values[key];
  const preset = presetOf({ presetId: "prs_1", country: "SE", name: "Nights", values, version: 3 });
  const edited = { ...preset, name: "Late nights", values: { ...preset.values, radar: { ...preset.values.radar, drivers: 9, on: false } } };
  const [call] = toolCalls({ ...none, presets: [preset] }, { ...none, presets: [edited] });
  const body = call!.body as { values: Doc };
  assert.equal(call!.method, "PUT");
  assert.equal((body.values["radar"] as Doc)["drivers"], 9);
  assert.equal((body.values["radar"] as Doc)["on"], false);
  assert.equal((body.values["radar"] as Doc)["reaskAfterSeconds"], 30);
  assert.equal((body.values["exclusive"] as Doc)["reaskAfterSeconds"], 45);
  assert.deepEqual(body.values["futureKey"], { x: 1 });
  for (const key of ["version", "publishedAt", "zoneId", "country", "timeZone", "usesStandard"]) assert.ok(!(key in body.values), key);
});


