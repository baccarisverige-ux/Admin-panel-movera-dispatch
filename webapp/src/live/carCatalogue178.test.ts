/**
 * v0.18.178 (contract.json#carCatalogue.admin; owner 2026-11-28 "admin can add more"; area c73): Fleet › Vehicle rules
 * › Car catalogue (GET /admin/car-catalogue drivers.read; POST/PATCH vehicles.edit; no delete), the accent-insensitive
 * search, the 409 make_exists text (hidden row: "use Show"), and Vehicle › "Typed by driver" (Vehicle.makeId null).
 * Rule 36: fails on main (no src/vehicles/carCatalogue.ts, contract copy 0.18.172).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { vehicleRecord } from "./liveAdminApi.ts";
import { CAR_LABELS, addMake, addModel, carErrorText, carKey, carTypedByDriver, filterMakes, readCatalogue, setMake, setModel, type AdminCarMake, type CarHttp } from "../vehicles/carCatalogue.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
const FX = JSON.parse(readFileSync(new URL("../../../contracts/fixtures/car_catalogue.json", import.meta.url), "utf8"));
const PANEL = readFileSync(new URL("../vehicles/CarCataloguePanel.tsx", import.meta.url), "utf8");
const make = (name: string, models: string[] = [], hidden = false): AdminCarMake => ({ makeId: carKey(name).replace(/ /g, "-"), name, hidden, source: "eea", models: models.map((m) => ({ modelId: m, name: m, hidden: false, source: "eea" })) });

test("the admin carries contract 0.18.178 with the catalogue routes and permissions, no DELETE", () => {
  assert.equal(C.version, "0.18.178");
  assert.equal(CONTRACT_VERSION, C.version);
  assert.match(OPENAPI, /operationId: adminGetCarCatalogue\n[\s\S]*?x-permission: drivers\.read/);
  for (const id of ["adminAddCarMake", "adminAddCarModel", "adminUpdateCarMake", "adminUpdateCarModel"]) assert.match(OPENAPI, new RegExp(`operationId: ${id}\\n[\\s\\S]*?x-permission: vehicles\\.edit`), id);
  assert.doesNotMatch(OPENAPI, /operationId: \w*[Dd]elete\w*Car/);
});

test("calls: the exact paths and bodies (trimmed names, hide/show by PATCH)", async () => {
  const calls: unknown[][] = [];
  const http: CarHttp = {
    json: async <T,>(p: string) => { calls.push(["GET", p]); return { version: 1, attribution: "", makes: [] } as T; },
    post: async <T,>(p: string, b?: unknown) => { calls.push(["POST", p, b]); return {} as T; },
    patch: async <T,>(p: string, b: unknown) => { calls.push(["PATCH", p, b]); return {} as T; },
  };
  await readCatalogue(http);
  await addMake(http, "  Zeekr ");
  await addModel(http, "volvo", "EX90");
  await setMake(http, "ssangyong", { hidden: true });
  await setModel(http, "volkswagen.id-4", { hidden: false });
  assert.deepEqual(calls, [
    ["GET", "/admin/car-catalogue"],
    ["POST", "/admin/car-catalogue/makes", { name: "Zeekr" }],
    ["POST", "/admin/car-catalogue/makes/volvo/models", { name: "EX90" }],
    ["PATCH", "/admin/car-catalogue/makes/ssangyong", { hidden: true }],
    ["PATCH", "/admin/car-catalogue/models/volkswagen.id-4", { hidden: false }],
  ]);
  assert.doesNotMatch(PANEL, /\.delete\(|"DELETE"|>Delete</);
});

test("search: accent- and case-insensitive on make and model names (fixture cases)", () => {
  const makes = FX.catalogue.makes.map((m: { name: string; models: { name: string }[] }) => make(m.name, m.models.map((d) => d.name)));
  assert.deepEqual(filterMakes(makes, "skoda").map((m) => m.name), ["Škoda"]);
  assert.deepEqual(filterMakes(makes, "VO").map((m) => m.name), ["Volkswagen", "Volvo"]);
  assert.deepEqual(filterMakes(makes, "xc60").map((m) => m.name), ["Volvo"]);
  assert.equal(filterMakes(makes, "").length, 3);
});

test("409 make_exists: plain text, or 'use Show' when the existing row is hidden; other errors", () => {
  assert.equal(carErrorText({ status: 409, reason: "make_exists", details: ["skoda", "shown"] }), "Already in the catalogue.");
  assert.equal(carErrorText({ status: 409, reason: "make_exists", details: ["ssangyong", "hidden"] }), "Already in the catalogue, hidden: use Show.");
  assert.equal(carErrorText({ status: 409, reason: "model_exists", details: ["volvo.xc60", "shown"] }), "Already in the catalogue.");
  assert.equal(carErrorText({ status: 403, reason: "missing_permission" }), "You need the right to edit vehicles.");
});

test("Vehicle: makeId null = Typed by driver (marker + Add to catalogue); an id or an older server = no marker", () => {
  const base = { vehicleId: "veh_1", make: "Zeekr", model: "001", year: 2024, color: "Black", plate: "ABC123", seats: 4, categoryIds: [], status: "pending", version: 1 } as const;
  assert.equal(carTypedByDriver({ makeId: null }), true);
  assert.equal(carTypedByDriver({ makeId: "volvo" }), false);
  assert.equal(carTypedByDriver({}), false);
  assert.equal(vehicleRecord({ ...base, makeId: null } as never, new Map()).liveMakeTyped, true);
  assert.equal(vehicleRecord({ ...base, makeId: "volvo" } as never, new Map()).liveMakeTyped, undefined);
  const page = readFileSync(new URL("../pages/VehicleDetailPage.tsx", import.meta.url), "utf8");
  assert.match(page, /record\.liveMakeTyped \?[\s\S]*Typed by driver[\s\S]*Add to catalogue/);
});

test("the 8 labels (owner OK pending) are translated in sv and fr; the attribution is shown", () => {
  assert.deepEqual(Object.values(CAR_LABELS), ["Car catalogue", "Add make", "Add model", "Hide", "Show", "Hidden", "Typed by driver", "Add to catalogue"]);
  for (const label of Object.values(CAR_LABELS)) {
    assert.ok(label in en, label);
    assert.notEqual((sv as Record<string, string>)[label], undefined, label);
    assert.notEqual((fr as Record<string, string>)[label], undefined, label);
  }
  assert.equal((sv as Record<string, string>)["Car catalogue"], "Bilkatalog");
  assert.match(PANEL, /data\.attribution/);
  assert.match(C.carCatalogue.attribution.en, /CC BY 4\.0/);
});
