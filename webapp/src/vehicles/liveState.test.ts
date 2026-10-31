import assert from "node:assert/strict";
import test from "node:test";
import { contractJson } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { EXTRA_CATEGORIES, approvalBlock, approvalChoices, initialApprovalPick, liveCarState, liveCarStateLabel } from "./liveState.ts";

const required = ["vehicle_registration", "insurance"];

// Owner G2-D5.4 (2026-10-30, "Fix the page (Recommended)"): the Vehicles page shows each car's true state.
test("G2-D5.4: a car's true state from the server's status and papers", () => {
  assert.equal(liveCarState({ status: "approved", documents: [], requiredDocuments: required }), "approved");
  assert.equal(liveCarState({ status: "blocked" }), "blocked");
  assert.equal(liveCarState({ status: "rejected" }), "rejected");
  assert.equal(liveCarState({ status: "pending", documents: [{ type: "vehicle_registration", status: "approved" }], requiredDocuments: required }), "waiting_papers", "insurance missing");
  assert.equal(liveCarState({ status: "pending", documents: [{ type: "vehicle_registration", status: "approved" }, { type: "insurance", status: "rejected" }], requiredDocuments: required }), "waiting_papers", "insurance rejected");
  assert.equal(liveCarState({ status: "pending", documents: [{ type: "vehicle_registration", status: "approved" }, { type: "insurance", status: "in_review" }], requiredDocuments: required }), "waiting_admin");
  assert.equal(liveCarState({ status: "pending", documents: [{ type: "vehicle_registration", status: "approved" }, { type: "insurance", status: "approved" }], requiredDocuments: required }), "waiting_admin");
  // A renewal never counts as the paper itself.
  assert.equal(liveCarState({ status: "pending", documents: [{ type: "vehicle_registration", status: "approved" }, { type: "insurance", status: "in_review", renewalOf: "X" }], requiredDocuments: required }), "waiting_papers");
});

test("G2-D5.4: the states are words in sv / fr / en", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  try {
    setLanguage("sv");
    assert.equal(liveCarStateLabel("waiting_papers"), "Väntar på papper");
    assert.equal(liveCarStateLabel("waiting_admin"), "Väntar på admin");
    assert.equal(liveCarStateLabel("approved"), "Godkänd");
    setLanguage("fr");
    assert.equal(liveCarStateLabel("waiting_admin"), "En attente de l’admin");
    assert.equal(liveCarStateLabel("blocked"), "Bloqué");
  } finally {
    setLanguage("en");
  }
  assert.equal(liveCarStateLabel("waiting_papers"), "Waiting for papers");
});

// Owner G2-D5.3 (2026-10-30): "The owner never decide !! Admin who gave him the allowed cathegories after approve !"
test("G2-D5.3: approval offers only fitCategories, needs a ride category; an extra is never alone", () => {
  const contract = contractJson<{ driverOnboarding: { vehicleRules: { extraCategories: string[] } } }>("contract.json");
  assert.deepEqual([...EXTRA_CATEGORIES], contract.driverOnboarding.vehicleRules.extraCategories);
  assert.deepEqual(approvalChoices(["child_seat", "economy", "xl"]), { rides: ["economy", "xl"], extras: ["child_seat"] });
  assert.deepEqual(approvalChoices(undefined), { rides: [], extras: [] });
  // The owner's old choice is not pre-picked unless the car fits it.
  assert.deepEqual(initialApprovalPick(["economy", "xl"], ["economy", "child_seat"]), ["economy"]);
  assert.deepEqual(initialApprovalPick([], ["economy"]), []);
  assert.equal(approvalBlock([]), "Give the car at least one ride category.");
  assert.equal(approvalBlock(["child_seat"]), "Give the car at least one ride category.");
  assert.equal(approvalBlock(["economy", "child_seat"]), null);
});
