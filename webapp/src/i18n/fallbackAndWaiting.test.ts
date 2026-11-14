import assert from "node:assert/strict";
import test from "node:test";
import { registerDictionary, setLanguage } from "./core.ts";
import { en } from "./en.ts";
import { fr } from "./fr.ts";
import { sv } from "./sv.ts";
import { waitingMinutes } from "../trips/rules.ts";

/**
 * BQ-A27 texts and the trip page's waiting-time error: both are written in the admin's language (owner rule: every text
 * in sv / fr / en). The waiting error was English in Swedish and French.
 */
const KEYS = ["Waiting time must be a whole number from 0 to 120 minutes.", "Could not load {0}, showing English.", "Try again", "Try loading the panel language again"] as const;

test("the new texts have a real Swedish and French text", () => {
  for (const key of KEYS) {
    assert.ok(key in en, key);
    assert.ok((sv as Record<string, string>)[key] && (sv as Record<string, string>)[key] !== key, `sv ${key}`);
    assert.ok((fr as Record<string, string>)[key] && (fr as Record<string, string>)[key] !== key, `fr ${key}`);
  }
});

test("Trip page › Waiting time: the 0–120 minutes error is in Swedish and French", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  try {
    setLanguage("sv");
    assert.equal(waitingMinutes("arrived", 121).error, sv["Waiting time must be a whole number from 0 to 120 minutes." as keyof typeof sv]);
    setLanguage("fr");
    assert.equal(waitingMinutes("arrived", -1).error, fr["Waiting time must be a whole number from 0 to 120 minutes." as keyof typeof fr]);
    setLanguage("en");
    assert.equal(waitingMinutes("arrived", 2.5).error, "Waiting time must be a whole number from 0 to 120 minutes.");
  } finally {
    setLanguage("en");
  }
});
