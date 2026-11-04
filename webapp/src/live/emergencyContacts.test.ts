import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emergencyContactsPath, readEmergencyContacts, type IncidentEmergencyContacts } from "./emergencyContacts.ts";

/** BASE B13 (contract v0.18.26 §47): a safety case reads the driver's emergency contacts from the server, read-only. */

test("reads the incident's emergency contacts from the contract's route", async () => {
  const asked: string[] = [];
  const answer: IncidentEmergencyContacts = { incidentId: "inc_1", driverId: "drv_1", updatedAt: "2026-11-04T12:00:00Z", items: [{ name: "Sara", phone: "+46701234567", relation: "Sister" }, { name: " ", phone: "+33612345678" }] };
  const read = async (path: string) => { asked.push(path); return answer; };
  const got = await readEmergencyContacts(read, "inc 1");
  assert.deepEqual(asked, ["/admin/incidents/inc%201/emergency-contacts"]);
  // A row without a name is not shown.
  assert.deepEqual(got.items, [{ name: "Sara", phone: "+46701234567", relation: "Sister" }]);
  assert.equal(got.driverId, "drv_1");
});

test("the route is in the contract copy, read-only for incidents.read", () => {
  const spec = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
  const at = spec.indexOf(`  ${emergencyContactsPath("{incidentId}").replace("%7B", "{").replace("%7D", "}")}:`);
  assert.ok(at > 0, "GET /admin/incidents/{incidentId}/emergency-contacts is in openapi.yaml");
  const block = spec.slice(at, at + 1500);
  assert.match(block, /get:/);
  assert.doesNotMatch(block.split("\n  /")[0] ?? "", /\n {4}(put|post|patch|delete):/);
  assert.match(block, /x-permission: incidents\.read/);
});

test("owner 2026-11-04: profile reads use the contract routes; contacts only from an open case", async () => {
  const { riderPlacesPath, driverPreferencesPath, caseIsOpen, categoryLabel } = await import("./emergencyContacts.ts");
  const spec = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
  assert.ok(spec.includes("  /admin/riders/{riderId}/saved-places:"));
  assert.ok(spec.includes("  /admin/drivers/{driverId}/preferences:"));
  assert.equal(riderPlacesPath("rdr 1"), "/admin/riders/rdr%201/saved-places");
  assert.equal(driverPreferencesPath("drv_1"), "/admin/drivers/drv_1/preferences");
  assert.equal(caseIsOpen("new"), true);
  assert.equal(caseIsOpen("solved"), false);
  assert.equal(categoryLabel("child_seat"), "Child seat");
});
