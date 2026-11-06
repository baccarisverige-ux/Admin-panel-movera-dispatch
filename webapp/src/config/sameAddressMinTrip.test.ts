import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { bookOfPricing, pricingDocumentOf } from "../live/configDocs.ts";
import { BUILT_IN_CATEGORIES, defaultZoneBook, validateZoneBook, diffBooks } from "../pricing/zonePricing.ts";

/**
 * Same-address fix (contract v0.18.42 §67, contract.json#sameAddress; boss answer decisions/driver-g15.md: "minTripMeters
 * default 300 m per zone as an admin setting in the zone pricing page"). The server refuses /quotes and /trips with
 * dropoff_too_close below it; the admin sets it on Pricing › the zone's fees ("Shortest trip").
 */
const MT = (contract as unknown as { sameAddress: { minTripMeters: { default: number; range: [number, number] } } }).sameAddress.minTripMeters;

test("the zone book carries minTripMeters, default 0 = off (contract; owner Q9 overrides the boss 300 m)", () => {
  assert.equal(MT.default, 0);
  assert.equal(defaultZoneBook("Z001").fees.minTripMeters, 0);
});

test("an untouched zone republishes the same pricing document (no minTripMeters added)", () => {
  const doc = pricingDocumentOf(defaultZoneBook("Z001"), "Z001", { version: 4 }) as { minTripMeters?: number };
  assert.equal("minTripMeters" in doc, false);
});

test("a changed value goes to the server and comes back from the server document", () => {
  const book = defaultZoneBook("Z001");
  book.fees.minTripMeters = 450;
  const doc = pricingDocumentOf(book, "Z001", null) as { minTripMeters?: number };
  assert.equal(doc.minTripMeters, 450);
  assert.equal(bookOfPricing(doc as Record<string, unknown>, defaultZoneBook("Z001")).fees.minTripMeters, 450);
  // A server document that already has the key keeps it, also when turned back to the default 0 (off).
  assert.equal((pricingDocumentOf(defaultZoneBook("Z001"), "Z001", { minTripMeters: 300 }) as { minTripMeters?: number }).minTripMeters, 0);
  // A bad server value keeps the book's.
  assert.equal(bookOfPricing({ minTripMeters: -5 }, defaultZoneBook("Z001")).fees.minTripMeters, 0);
});

test("validation: whole metres from 0 to 5000", () => {
  for (const [value, ok] of [[0, true], [300, true], [5000, true], [-1, false], [5001, false], [12.5, false]] as const) {
    const book = defaultZoneBook("Z001");
    book.fees.minTripMeters = value;
    const problems = validateZoneBook(book, BUILT_IN_CATEGORIES).filter((p) => p.path === "fees.minTripMeters");
    assert.equal(problems.length === 0, ok, String(value));
  }
});

test("the change list names it", () => {
  const before = defaultZoneBook("Z001");
  const after = defaultZoneBook("Z001");
  after.fees.minTripMeters = 500;
  assert.ok(diffBooks(before, after, BUILT_IN_CATEGORIES).some((line) => line.includes("Shortest trip") && line.includes("0 → 500")));
});
