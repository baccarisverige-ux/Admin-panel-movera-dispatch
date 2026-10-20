/**
 * The demo sign-in log: the login screen adds one committed "admin.auth.signIn" row per sign-in under its
 * own storage key. Kept apart from the business audit (the fixture server's), as before.
 */
export type SignInEntry = {
  id: string;
  at: string;
  actorId: string;
  action: "admin.auth.signIn";
  targetId: string;
  before: string;
  after: string;
  reason: string;
  result: "committed";
};

export type SignInLog = { rev: number; audits: SignInEntry[] };

export const SIGN_IN_LOG_KEY = "movera-admin-commands";

export function emptySignInLog(): SignInLog {
  return { rev: 1, audits: [] };
}

export function withSignIn(log: SignInLog, actorId: string, email: string, nowIso: string): SignInLog {
  const entry: SignInEntry = {
    id: `aud-${log.audits.length + 1}`,
    at: nowIso,
    actorId,
    action: "admin.auth.signIn",
    targetId: email,
    before: "signed out",
    after: "signed in",
    reason: "Demo sign-in",
    result: "committed",
  };
  return { ...log, audits: [entry, ...log.audits] };
}

/** Reads the stored log; anything unreadable starts a new one. Older saves (with refunds and keys) keep their rows. */
export function readSignInLog(raw: string | null): SignInLog {
  if (!raw) return emptySignInLog();
  try {
    const parsed = JSON.parse(raw) as SignInLog;
    if (!parsed || !Array.isArray(parsed.audits) || typeof parsed.rev !== "number") return emptySignInLog();
    return parsed;
  } catch {
    return emptySignInLog();
  }
}
