import { emptySignInLog, readSignInLog, withSignIn } from "./signInLog.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// Moved from the old commands/run.ts test (C-21): the login screen's sign-in log.
const signed = withSignIn(emptySignInLog(), "nora", "nora@movera.se", "2026-10-05T09:00:00Z");
assert(signed.audits[0]?.action === "admin.auth.signIn", "sign-in is logged");
assert(signed.audits[0]?.result === "committed", "sign-in log is committed");
assert(readSignInLog(JSON.stringify(signed)).audits.length === 1, "sign-in log can be read back");
assert(withSignIn(signed, "lena", "lena@movera.se", "2026-10-05T09:05:00Z").audits[0]?.actorId === "lena", "the newest sign-in is first");
assert(readSignInLog("not json").audits.length === 0 && readSignInLog(null).audits.length === 0 && readSignInLog("{\"audits\":3}").audits.length === 0, "an unreadable log starts empty");
const older = JSON.stringify({ rev: 4, refunds: {}, byKey: {}, audits: signed.audits });
assert(readSignInLog(older).audits.length === 1, "an older save keeps its sign-in rows");

console.log("sign-in log ok");
