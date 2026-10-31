import assert from "node:assert/strict";
import test from "node:test";
import { registerDictionary, setLanguage, tr } from "./core.ts";
import { fr } from "./fr.ts";
import { sv } from "./sv.ts";
import { chooseSignInLanguage, computerLanguage, resolveSignInLanguage, SIGN_IN_LANGUAGE_KEY, signInLanguage, subscribeSignInLanguage } from "./signInLanguage.ts";

/**
 * Owner G1-D2 (2026-10-30, "Computer language + globe (Recommended)"): the admin sign-in, forgot password and
 * signed-out page in sv / fr / en from the computer's language (else English) + a globe; remembered on that computer.
 */

test("G1-D2: the computer's first language the panel has; English otherwise", () => {
  assert.equal(computerLanguage(["sv-SE", "en-US"]), "sv");
  assert.equal(computerLanguage(["fr-FR"]), "fr");
  assert.equal(computerLanguage(["fr_CA"]), "fr");
  assert.equal(computerLanguage(["de-DE", "fr-FR", "sv"]), "fr");
  assert.equal(computerLanguage(["en-GB"]), "en");
  assert.equal(computerLanguage(["ar-TN", "de"]), "en");
  assert.equal(computerLanguage([]), "en");
  assert.equal(computerLanguage(undefined), "en");
});

test("G1-D2: the globe's choice on this computer wins over the computer's language", () => {
  assert.deepEqual(resolveSignInLanguage("fr", ["sv-SE"]), { language: "fr", source: "chosen" });
  assert.deepEqual(resolveSignInLanguage(null, ["sv-SE"]), { language: "sv", source: "computer" });
  assert.deepEqual(resolveSignInLanguage("de", ["sv-SE"]), { language: "sv", source: "computer" });
});

test("G1-D2: choosing with the globe is remembered on this computer and tells the page", () => {
  const stored = new Map<string, string>();
  const fake = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) };
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
  try {
    let told = 0;
    const stop = subscribeSignInLanguage(() => { told += 1; });
    chooseSignInLanguage("sv");
    assert.equal(stored.get(SIGN_IN_LANGUAGE_KEY), "sv");
    assert.deepEqual(signInLanguage(), { language: "sv", source: "chosen" });
    assert.equal(told, 1);
    stop();
    chooseSignInLanguage("fr");
    assert.equal(told, 1);
    assert.equal(stored.get(SIGN_IN_LANGUAGE_KEY), "fr");
  } finally {
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("G1-D2: the sign-in, forgot-password and signed-out texts exist in Swedish and French", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  const texts = [
    "Sign in",
    "Sign in with your Movera admin e-mail and password.",
    "Email",
    "Password",
    "Forgot your password?",
    "Ask a Super admin for a new password link. If you are the only Super admin, the server's operator makes one (deploy guide: “Forgot the admin password”).",
    "Wrong e-mail or password.",
    "Choose your password",
    "Save password",
    "You were signed out because the panel was not used for a while. Sign in again.",
    "Your session has ended. Sign in again.",
  ] as const;
  try {
    for (const language of ["sv", "fr"] as const) {
      setLanguage(language);
      for (const text of texts) assert.notEqual(tr(text), text, `${language}: ${text}`);
    }
    setLanguage("sv");
    assert.equal(tr("Language: {0}", ["Svenska"]), "Språk: Svenska");
  } finally {
    setLanguage("en");
  }
});
