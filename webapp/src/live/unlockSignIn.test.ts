import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UNLOCK_SIGN_IN_PATH, UNLOCK_SIGN_IN_PERMISSION, fullPhone, unlockMessage } from "./unlockSignIn.ts";
import { commandById } from "../commands/registry.ts";
import { LIVE_COMMANDS } from "./liveCommands.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

test("the route and body match the contract (SignInUnlock { phone })", () => {
  const yaml = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
  const at = yaml.indexOf(`  ${UNLOCK_SIGN_IN_PATH}:\n    post:`);
  assert.ok(at > 0);
  assert.match(yaml.slice(at, at + 3000), /\$ref: '#\/components\/schemas\/SignInUnlock'/);
  assert.ok(yaml.includes("    SignInUnlock:\n      type: object\n      required:\n      - phone\n"));
});

test("only a full E.164 number is sent; a masked one is revealed first", () => {
  assert.equal(fullPhone("+46700000501"), "+46700000501");
  assert.equal(fullPhone("+46•••••01"), null);
  assert.equal(fullPhone(""), null);
  assert.equal(fullPhone(null), null);
});

test("lifted 0 says there was no lock", () => {
  assert.equal(unlockMessage({ phone: "+46700000501", lifted: 0 }), "This number had no sign-in lock.");
  assert.equal(unlockMessage({ phone: "+46700000501", lifted: 2 }), "Sign-in unlocked: the number can get codes again.");
  assert.equal(unlockMessage(undefined), "Sign-in unlocked: the number can get codes again.");
});

test("the command is registered, live, with a reason and settings.edit", () => {
  const spec = commandById("admin.auth.unlockSignIn");
  assert.ok(spec);
  assert.equal(spec.reason, true);
  assert.equal(spec.permission, UNLOCK_SIGN_IN_PERMISSION);
  assert.ok(LIVE_COMMANDS.has("admin.auth.unlockSignIn"));
});

test("owner texts in sv / fr / en", () => {
  const dicts = { en, sv, fr } as Record<string, Record<string, string>>;
  assert.equal(dicts.en!["Unlock sign-in"], "Unlock sign-in");
  assert.equal(dicts.sv!["Unlock sign-in"], "Lås upp inloggning");
  assert.equal(dicts.fr!["Unlock sign-in"], "Débloquer la connexion");
  for (const key of ["Sign-in lock", "This number had no sign-in lock.", "Sign-in unlocked: the number can get codes again.", "There is no phone number on this account.", "After too many wrong codes the number is locked for up to 24 hours.", "Lift the wrong-code lock on this person's phone number so they can get a sign-in code again."]) {
    for (const lang of ["sv", "fr"]) assert.ok(dicts[lang]![key] && dicts[lang]![key] !== key, `${lang}: ${key}`);
  }
});
