import assert from "node:assert/strict";
import { test } from "node:test";
import { contractJson } from "../contract/load.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { STATUS_WORDS, statusLabel } from "./labels.ts";

type Json = Record<string, unknown>;
const at = (root: Json, path: string): unknown => path.split(".").reduce<unknown>((node, part) => (node as Json)[part], root);

test("every code of every contract status family has a non-empty sv, fr and en word (contract §20)", () => {
  const contract = contractJson<Json>("contract.json");
  const words = contract.statusWords as { sources: Record<string, string> };
  const languages = (contract.languages as { values: string[] }).values;
  const missing: string[] = [];
  for (const [family, path] of Object.entries(words.sources)) {
    for (const code of at(contract, path) as string[]) {
      for (const language of languages) {
        const word = (STATUS_WORDS[family]?.[code] as Record<string, string> | undefined)?.[language];
        if (!word?.trim()) missing.push(`${family}.${code}.${language}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("statusLabel shows the contract word for the language and the family", () => {
  registerDictionary("sv", {} as never);
  setLanguage("sv");
  assert.equal(statusLabel("completed"), "Slutförd");
  assert.equal(statusLabel("on_hold"), "Väntar på granskning");
  assert.equal(statusLabel("pending"), "Väntande");
  assert.equal(statusLabel("expired"), "Utgången");
  assert.equal(statusLabel("expired", "documentStatus"), "Utgånget");
  assert.equal(statusLabel("rejected", "documentStatus"), "Avslaget");
  assert.equal(statusLabel("needed", "documentStatus"), "Krävs");
  assert.equal(statusLabel("cancelled_by_rider"), "Avbokad av resenär");
  for (const family of Object.values(STATUS_WORDS)) for (const word of Object.values(family)) assert.ok(!word.sv.includes("Passagerare"));
  setLanguage("fr");
  assert.equal(statusLabel("completed"), "Terminée");
  assert.equal(statusLabel("on_hold"), "En cours de validation");
  assert.equal(statusLabel("pending"), "En attente");
  setLanguage("en");
  assert.equal(statusLabel("some_new_code"), "some new code");
});
