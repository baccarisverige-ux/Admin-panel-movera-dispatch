import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveCategory, editCategory, emptyPricingStore, restoreCategory, zoneBook, startManualSurge, stopManualSurges, type PricingStore } from "../pricing/zonePricing.ts";
import { pricingDocumentOf } from "./configDocs.ts";
import type { ConfigHttp, Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { catalogChanges, categoriesOf, manualOf, scheduleOf, type ServerCategory } from "./livePricingOps.ts";

/** Contract v0.7.1 (owner Pricing decisions 2026-10-27): the live Pricing section's catalog, surge and history calls. */

type Call = { method: string; path: string; body?: unknown };
const AT = "2026-10-27T10:00:00Z";

const serverCatalog: ServerCategory[] = [
  { id: "economy", label: "Movera", line: { sv: "Vardagsresa", fr: "Course du quotidien", en: "Everyday ride" }, seats: 4, builtIn: true, sort: 0 },
  { id: "pet", label: "Movera Pet", line: { sv: "Ditt husdjur åker med dig", fr: "Votre animal voyage avec vous", en: "Your pet rides with you" }, seats: 4, builtIn: true, sort: 6 },
  { id: "child_seat", label: "Child Seat", line: { sv: "Bil med babystol eller barnstol", fr: "Voiture avec siège bébé ou enfant", en: "Car with a baby or child seat" }, seats: 4, builtIn: true, sort: 7 },
];

function fakeServer() {
  const calls: Call[] = [];
  const store = emptyPricingStore();
  const pricing = { doc: "pricing", zoneId: "Z001", version: 4, liveVersion: 3, document: pricingDocumentOf(zoneBook(store, "Z001"), "Z001", null), usesStandard: false } as unknown as Doc;
  const history = [
    { zoneId: "Z001", version: 3, publishedAt: "2026-10-27T09:00:00Z", publishedBy: "adm_1", action: "publish", document: { ...(pricing["document"] as Doc), surge: { smart: {}, scheduled: [], notifyDrivers: true } } },
    { zoneId: "Z001", version: 2, publishedAt: "2026-10-26T09:00:00Z", publishedBy: "adm_1", action: "publish", document: pricing["document"] },
  ];
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      if (path === "/admin/categories") return { categories: serverCatalog, restoreDays: 30 } as T;
      if (path.startsWith("/admin/config/pricing?zoneId=Z001")) return structuredClone(pricing) as T;
      if (path.startsWith("/admin/zones/Z001/surge")) return { scheduleId: "sur_1", zoneId: "Z001", startAt: AT, endAt: "2026-10-27T11:00:00Z", cap: 2, points: [{ atMin: 0, multiplier: 2 }, { atMin: 60, multiplier: 2 }], status: "active", version: 5 } as T;
      if (path.startsWith("/admin/config/pricing/history?zoneId=Z001")) return { items: history, nextCursor: null } as T;
      throw Object.assign(new Error("not found"), { status: 404 });
    },
    put: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "PUT", path, body });
      return { version: 6 } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "POST", path, body });
      return { version: 5, notified: 3, multiplier: 2 } as T;
    },
  };
  return { http, calls };
}

test("the server's catalog, running surge and history fill the live Pricing section", async () => {
  const server = fakeServer();
  const settings = createLiveSettings(server.http, () => AT);
  const store = (await settings.readSlice("zonePricing", null)) as PricingStore;
  assert.deepEqual(store.categories.map((c) => c.id), ["economy", "pet", "child_seat"]);
  assert.deepEqual(store.categories[1]!.lines, { sv: "Ditt husdjur åker med dig", fr: "Votre animal voyage avec vous", en: "Your pet rides with you" });
  assert.equal(store.live["Z001"]!.manual!.multiplier, 2);
  // v0.7.2: no notifyDrivers kept for the zone, even when an old document has it.
  assert.deepEqual(store.live["Z001"], { manual: store.live["Z001"]!.manual });
  assert.deepEqual(store.history.map((r) => r.rev), [2, 1]);
});

test("Manage categories, surge Start / Stop, Restore and Undo go to the server; Tell drivers is gone (v0.7.2)", async () => {
  const server = fakeServer();
  const settings = createLiveSettings(server.http, () => AT);
  const store = (await settings.readSlice("zonePricing", null)) as PricingStore;
  const sent = () => server.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);

  server.calls.length = 0;
  const edited = editCategory(store, "pet", { label: "Movera Pet", line: "Pets welcome", lines: { sv: "Husdjur välkomna", fr: "Animaux bienvenus", en: "Pets welcome" }, seats: 4 }).store;
  await settings.command("admin.pricing.editCategory", { targetId: "pet", value: edited });
  assert.deepEqual(sent(), ["PUT /admin/categories/pet"]);
  assert.deepEqual((server.calls.find((c) => c.method === "PUT")!.body as Doc)["line"], { sv: "Husdjur välkomna", fr: "Animaux bienvenus", en: "Pets welcome" });

  server.calls.length = 0;
  const archived = archiveCategory(store, "pet", { activeRides: 0, reservations: 0, vehicles: 0 }, "adm_1", "Not this winter", AT).store;
  await settings.command("admin.pricing.archiveCategory", { targetId: "Movera Pet", value: archived });
  assert.deepEqual(sent(), ["POST /admin/categories/pet/archive"]);
  assert.deepEqual(server.calls.find((c) => c.method === "POST")!.body, { reason: "Not this winter" });

  server.calls.length = 0;
  const back = restoreCategory({ ...store, categories: categoriesOf(serverCatalog.map((c) => (c.id === "pet" ? { ...c, archivedAt: AT } : c))) }, "pet", Date.parse(AT)).store;
  assert.deepEqual(catalogChanges(categoriesOf(serverCatalog.map((c) => (c.id === "pet" ? { ...c, archivedAt: AT } : c))), back.categories).map((c) => c.kind), ["restore"]);

  // A running ×2 is replaced by ×4 (the slider's value is its maximum), then stopped.
  server.calls.length = 0;
  const four = startManualSurge(store, "Z001", 4, 30, "adm_1", "Concert", AT).store;
  await settings.command("admin.pricing.startSurge", { targetId: "Z001", value: four });
  const put = server.calls.find((c) => c.method === "PUT")!;
  assert.equal(put.path, "/admin/zones/Z001/surge");
  assert.deepEqual((put.body as Doc)["points"], [{ atMin: 0, multiplier: 4 }, { atMin: 30, multiplier: 4 }]);
  assert.equal((put.body as Doc)["expectedVersion"], 5);
  server.calls.length = 0;
  const stopped = stopManualSurges(four, ["Z001"], "adm_1", "Over", AT).store;
  await settings.command("admin.pricing.stopSurge", { targetId: "Z001", value: stopped });
  assert.deepEqual(server.calls.filter((c) => c.method === "POST"), [{ method: "POST", path: "/admin/zones/Z001/surge/end", body: { expectedVersion: 6 } }]);

  server.calls.length = 0;
  // v0.7.2 (contract.json#surgeNoticeRemoved): no command sends a surge notice any more.
  assert.equal(settings.command("admin.pricing.notifyDrivers", { targetId: "Z001", value: stopped }), null);
  assert.equal(settings.command("admin.pricing.notifySetting", { targetId: "Z001", value: stopped }), null);
  assert.deepEqual(sent(), []);

  server.calls.length = 0;
  await settings.command("admin.pricing.restore", { targetId: "pricing-rev-1", value: store });
  assert.deepEqual(server.calls.find((c) => c.method === "POST"), { method: "POST", path: "/admin/config/pricing/restore", body: { zoneId: "Z001", version: 2, expectedVersion: 3 } });
  server.calls.length = 0;
  await settings.command("admin.pricing.undo", { targetId: "pricing-rev-2", value: store });
  assert.deepEqual(server.calls.find((c) => c.method === "POST")!.body, { zoneId: "Z001", version: 2, expectedVersion: 3 });
});

test("a manual surge and the server schedule read the same", () => {
  const manual = manualOf({ scheduleId: "s", zoneId: "Z001", startAt: AT, endAt: "2026-10-27T10:30:00Z", cap: 3, points: [{ atMin: 0, multiplier: 3 }, { atMin: 30, multiplier: 1.5 }], status: "active", version: 1 })!;
  assert.equal(manual.multiplier, 3);
  assert.deepEqual(scheduleOf(manual, 1)["points"], [{ atMin: 0, multiplier: 3 }, { atMin: 30, multiplier: 1.5 }]);
  assert.equal(manualOf({ scheduleId: "s", zoneId: "Z001", startAt: AT, endAt: AT, cap: 2, points: [], status: "ended", version: 1 }), null);
});
