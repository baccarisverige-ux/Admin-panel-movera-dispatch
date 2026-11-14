/**
 * Contract 0.18.78 sync (movera-contracts v0.18.78, 93d3df6): admin lists carry an optional `total` on the first page
 * ("50 of N" next to Load more) and GET /admin/incidents takes driverId / riderId (owner 2026-11-12 item 5 "Yes, build").
 * Pins the copy; the admin part (L78-A) is checked in src/live/listTotal.test.ts and src/live/incidentsByPerson.test.ts.
 * G33 (rider "Pay the driver {amount} in the car") is in the same copy; the admin does not show it. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

/** The text of one components/schemas entry (from "    Name:" to the next schema at the same depth). */
function schemaBlock(name: string): string {
  const start = OPENAPI.indexOf(`\n    ${name}:\n`);
  assert.ok(start >= 0, `schema ${name}`);
  const rest = OPENAPI.slice(start + 1);
  const next = rest.slice(1).search(/\n {4}[A-Za-z0-9_]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("the admin pins the contract it carries (0.18.88; L78 landed in 0.18.78)", () => {
  assert.equal(C.version, "0.18.88");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("L78: adminListFilters.total names exactly the 10 admin lists; absent = not counted, first page only", () => {
  assert.deepEqual([...C.adminListFilters.total.lists].sort(), [
    "GET /admin/drivers", "GET /admin/fleets", "GET /admin/incidents", "GET /admin/payments", "GET /admin/payouts",
    "GET /admin/refunds", "GET /admin/riders", "GET /admin/tickets", "GET /admin/trips", "GET /admin/vehicles",
  ]);
  assert.match(C.adminListFilters.total.rule, /left out/);
  assert.match(C.adminListFilters.total.rule, /first page/);
  assert.match(C.adminListFilters.total.panel, /of \{total\}/);
});

test("L78: incidents by person (driverId / riderId); an older server answers unknown_filter", () => {
  const text = C.adminListFilters.incidentsByPerson;
  assert.match(text, /driverId/);
  assert.match(text, /riderId/);
  assert.match(text, /unknown_filter/);
});

test("G33 is in the copy: payDriverInCar in en / fr / sv (rider app text, not shown by the admin)", () => {
  for (const lang of ["en", "fr", "sv"]) assert.match(C.finish.paymentMethods.texts.payDriverInCar[lang], /\{amount\}/, lang);
});

test("the openapi copy has total on IncidentPage / DriverPage and driverId / riderId on GET /admin/incidents", () => {
  for (const name of ["IncidentPage", "DriverPage"]) assert.match(schemaBlock(name), /\n {10}total:\n/, name);
  const route = OPENAPI.slice(OPENAPI.indexOf("\n  /admin/incidents:\n"));
  const get = route.slice(0, route.slice(1).search(/\n {2}\/[^\n]*:\n/) + 1);
  assert.match(get, /- name: driverId\n/);
  assert.match(get, /- name: riderId\n/);
});
