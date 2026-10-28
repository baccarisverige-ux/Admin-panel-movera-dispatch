import assert from "node:assert/strict";
import test from "node:test";
import { activationMissing, groupMissing, liveFunnel, vehicleMissing } from "./activation.ts";

test("409 details are grouped as driver, company and car", () => {
  assert.deepEqual(groupMissing(["driver:terms", "fleet:company_registration", "vehicle:insurance", "driver:terms", "info_session"]), { driver: ["terms", "info_session"], fleet: ["company_registration"], vehicle: ["insurance"] });
});

test("a fleet member needs only his own documents; an owner also the company's", () => {
  const docs = [{ documentId: "1", type: "terms", status: "approved" as const }];
  const member = { country: "SE", accountType: "driver" as const, documents: docs };
  assert.deepEqual(activationMissing(member), ["driver:info_session", "driver:driving_license", "driver:profile_photo", "driver:taxi_driver_license"]);
  const owner = { ...member, accountType: "fleet" as const, requiredDocuments: ["terms"] };
  assert.deepEqual(activationMissing(owner), ["fleet:company_registration", "fleet:taxi_traffic_permit", "fleet:tax_settings", "fleet:bank_statement"]);
});

test("a car with unapproved documents is blocked", () => {
  assert.deepEqual(vehicleMissing({ documents: [{ documentId: "v", type: "insurance", status: "in_review" }] }, "SE"), ["vehicle_registration", "insurance"]);
  assert.deepEqual(vehicleMissing({ requiredDocuments: ["insurance"], documents: [{ documentId: "v", type: "insurance", status: "approved" }] }), []);
});

test("the funnel counts real rows and hides empty steps", () => {
  const steps = liveFunnel([{ accountStatus: "pending", country: "SE", documents: [], requiredDocuments: ["terms"] }]);
  assert.deepEqual(steps, [{ id: "signed_up", count: 1 }]);
});
