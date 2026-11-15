import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPricingStore, publishZones, zoneBook, type PricingStore, type ZoneBook } from "../pricing/zonePricing.ts";
import { setLiveMarketZones } from "../markets/markets.ts";
import { pricingDocumentOf, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings, readScopes } from "./liveSettings.ts";

/**
 * Owner screen recording 2026-11-15 (Grand Tunis, Tarifs › Commission, card Movera): "Frais de plateforme" 10 → 0,
 * Publier, "Êtes-vous sûr(e) ?" confirmed — the server published 0 (staging history TN-TC v3 and v5), but the card
 * showed 10 again. Two causes in liveSettings.ts: (1) readScopes() skipped every zone of a closed country (TN), so the
 * page never read Grand Tunis from the server and showed the built-in default (10 %); (2) publishPricing kept the
 * zone's pre-publish server draft in its 10-second read cache, so the re-read right after a publish showed the old value.
 */

type Row = { version: number; liveVersion: number; usesStandard: boolean; document: Doc };

/** A server that keeps what is PUT and published (GET returns the saved document, like /admin/config/{doc}). */
function savingServer(rows: Record<string, Row>) {
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    return `${url.pathname.split("/")[3]}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const notFound = () => Object.assign(new Error("not found"), { status: 404, reason: "zone_not_found" });
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      if (!path.startsWith("/admin/config/") || path.includes("/history")) throw notFound();
      const row = rows[keyOf(path)];
      if (!row) throw notFound();
      return structuredClone(row) as T;
    },
    put: async <T,>(path: string, body: unknown) => {
      const { document, expectedVersion } = body as { document: Doc; expectedVersion: number };
      const key = `${path.split("/")[3]}:${(body as { zoneId?: string }).zoneId}`;
      const row = rows[key]!;
      if (row.version !== expectedVersion) throw Object.assign(new Error("changed"), { status: 409 });
      rows[key] = { ...row, version: row.version + 1, usesStandard: false, document: structuredClone(document) };
      return { version: rows[key].version } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      const key = `${path.split("/")[3]}:${(body as { zoneId?: string }).zoneId}`;
      const row = rows[key]!;
      rows[key] = { ...row, version: row.version + 1, liveVersion: row.liveVersion + 1 };
      return { version: rows[key].version } as T;
    },
  };
  return { http, rows };
}

const fee = (store: PricingStore, zoneId: string) => zoneBook(store, zoneId).prices["economy"]!.appFeePct;
const withFee = (book: ZoneBook, pct: number): ZoneBook => ({ ...book, prices: { ...book.prices, economy: { ...book.prices["economy"]!, appFeePct: pct } } });

async function publishFeeZero(zoneId: string, name: string, country: "TN" | "SE") {
  // The server's zone list (live build): Grand Tunis (TND) and Norrmalm (SEK).
  setLiveMarketZones([{ id: zoneId, name, city: name, kind: "operating", center: [0, 0], country }]);
  try {
    const own = withFee(zoneBook(emptyPricingStore(), zoneId), 10);
    const { http, rows } = savingServer({ [`pricing:${zoneId}`]: { version: 4, liveVersion: 2, usesStandard: false, document: pricingDocumentOf(own, zoneId, null) } });
    const settings = createLiveSettings(http, () => "2026-11-15T10:59:00Z");
    const read = (await settings.readSlice("zonePricing", null)) as PricingStore;
    assert.equal(fee(read, zoneId), 10, `${zoneId}: the page reads the server's 10 %`);

    const published = publishZones(read, { [zoneId]: withFee(zoneBook(read, zoneId), 0) }, "A1", "Pricing update", "2026-11-15T10:59:00Z");
    assert.equal(published.error, undefined);
    assert.equal(await settings.command("admin.pricing.publish", { targetId: "pricing", value: published.store }), "Published.");
    const saved = rows[`pricing:${zoneId}`]!.document["categories"] as Record<string, Doc>;
    assert.equal(saved["economy"]!["appFeePct"], 0, `${zoneId}: the server got appFeePct 0`);

    // The page's re-read right after the publish (CommandButton → refresh), well inside the 10 s read window.
    const after = (await settings.readSlice("zonePricing", published.store)) as PricingStore;
    assert.equal(fee(after, zoneId), 0, `${zoneId}: the app fee 0 survives publish and reload`);
    // A fresh page load (new session) reads 0 from the server too.
    const reloaded = (await createLiveSettings(http).readSlice("zonePricing", null)) as PricingStore;
    assert.equal(fee(reloaded, zoneId), 0, `${zoneId}: a new page load shows 0`);
  } finally {
    setLiveMarketZones(null);
  }
}

test("fee-zero: Grand Tunis (TND, closed country) app fee 10 → 0 survives publish and reload", async () => {
  await publishFeeZero("TN-TC", "Grand Tunis", "TN");
});

test("fee-zero: Norrmalm (SEK) app fee 10 → 0 survives publish and the re-read right after it", async () => {
  await publishFeeZero("Z001", "Norrmalm", "SE");
});

test("fee-zero: a closed country's zones on the server's list are read; without a server list only open countries", () => {
  assert.ok(!readScopes().some((id) => id.startsWith("TN-") || id === "standard-TN"), "demo seeds of a closed country: no 404s (G2c)");
  setLiveMarketZones([{ id: "TN-TC", name: "Grand Tunis", city: "Grand Tunis", kind: "operating", center: [0, 0], country: "TN" }]);
  try {
    assert.ok(readScopes().includes("TN-TC") && readScopes().includes("standard-TN"));
  } finally {
    setLiveMarketZones(null);
  }
});
