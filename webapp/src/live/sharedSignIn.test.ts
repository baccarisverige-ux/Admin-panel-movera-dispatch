/**
 * Owner D8 (2026-11-07, button "One shared sign-in (Recommended)"): the admin keeps ONE sign-in shared by every tab of
 * the browser; only one tab renews it; two tabs used for 1 h stay signed in. Finder D8 (plan/finders-2026-11-07/D.md):
 * before, each tab kept its own copy (sessionStorage, copied by "Duplicate tab") and renewed it on its own, so the server
 * saw a used refresh token again and ended the session for both tabs (refresh_token_reused).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createLiveClient, LIVE_SESSION_KEY } from "./session.ts";

const admin = { adminId: "adm_1", email: "[REDACTED]", name: "A", role: "owner", permissions: [], scope: { zones: "all" }, idleTimeoutSeconds: 900 };

/** The server's strict rule (movera-server rotateRefresh before Q6): a used refresh token sent again ends the session. */
function strictServer() {
  const used = new Set<string>();
  let n = 0;
  let revoked = false;
  let access = "a0";
  let refreshes = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/admin/auth/refresh")) {
      const { refreshToken } = JSON.parse(String(init?.body));
      if (revoked || refreshToken !== `r${n}` || used.has(refreshToken)) {
        revoked = true;
        return json(401, { code: "unauthenticated", message: "refresh_token_reused" });
      }
      used.add(refreshToken);
      refreshes += 1;
      n += 1;
      access = `a${n}`;
      return json(200, { accessToken: access, refreshToken: `r${n}`, expiresIn: 900, actor: "admin", admin });
    }
    if (url.endsWith("/admin/auth/sign-out")) return new Response(null, { status: 204 });
    const auth = new Headers(init?.headers).get("Authorization");
    if (revoked || auth !== `Bearer ${access}`) return json(401, { code: "unauthenticated", message: "expired" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return json(200, { ok: true });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, revoked: () => revoked, refreshes: () => refreshes };
}

/** One browser: localStorage shared by its tabs, and navigator.locks (one holder at a time). */
function browser() {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  let chain: Promise<unknown> = Promise.resolve();
  const lock = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  return { map, storage, lock };
}

test("D8: two tabs used for 1 h stay signed in; only one tab renews each time (fake clock)", async () => {
  let t = 0;
  const clock = () => t;
  const server = strictServer();
  const b = browser();
  b.map.set(LIVE_SESSION_KEY, JSON.stringify({ accessToken: "a0", refreshToken: "r0", expiresAt: 900_000, admin }));
  const signedOut: string[] = [];
  const tab = (name: string) => createLiveClient({ baseUrl: "https://api.example.test", fetchImpl: server.fetchImpl as never, storage: b.storage, lock: b.lock, now: clock, onSignedOut: (r) => signedOut.push(`${name}:${r}`) });
  const tabA = tab("A");
  const tabB = tab("B");
  for (t = 0; t <= 3_600_000; t += 60_000) {
    // Both tabs read their lists in the same moment (each list's own timer), every minute for an hour.
    const answers = await Promise.all([tabA.json("/admin/trips"), tabB.json("/admin/drivers")]);
    assert.deepEqual(answers, [{ ok: true }, { ok: true }], `at ${t / 60_000} min`);
  }
  assert.deepEqual({ signedOut, revoked: server.revoked() }, { signedOut: [], revoked: false });
  assert.ok(server.refreshes() >= 4 && server.refreshes() <= 5, `one renewal per 15 min for both tabs, got ${server.refreshes()}`);
  assert.equal(tabA.state()?.refreshToken, tabB.state()?.refreshToken, "both tabs hold the same sign-in");
});

test("D8: a tab opened later uses the same sign-in; signing out in one tab signs out every tab", async () => {
  const server = strictServer();
  const b = browser();
  const tabA = createLiveClient({ baseUrl: "https://api.example.test", fetchImpl: server.fetchImpl as never, storage: b.storage, lock: b.lock });
  b.map.set(LIVE_SESSION_KEY, JSON.stringify({ accessToken: "a0", refreshToken: "r0", expiresAt: Date.now() + 900_000, admin }));
  tabA.sync();
  assert.equal(tabA.admin()?.adminId, "adm_1", "signed in by the other tab");
  const signedOut: string[] = [];
  const tabB = createLiveClient({ baseUrl: "https://api.example.test", fetchImpl: server.fetchImpl as never, storage: b.storage, lock: b.lock, onSignedOut: (r) => signedOut.push(r) });
  assert.equal(tabB.admin()?.adminId, "adm_1");
  await tabA.signOut();
  tabB.sync();
  assert.equal(tabB.state(), null);
  assert.deepEqual(signedOut, ["sign_out"]);
});

test("D8: blocked storage never signs a tab out by itself", async () => {
  const server = strictServer();
  const blocked = { getItem: () => null, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined };
  const tabA = createLiveClient({ baseUrl: "https://api.example.test", fetchImpl: server.fetchImpl as never, storage: blocked, lock: null });
  const signIn = createLiveClient({ baseUrl: "https://api.example.test", fetchImpl: (async () => new Response(JSON.stringify({ accessToken: "a0", refreshToken: "r0", expiresIn: 900, actor: "admin", admin }), { status: 200, headers: { "content-type": "application/json" } })) as never, storage: blocked, lock: null });
  await signIn.signIn("[REDACTED]", "x");
  signIn.sync();
  assert.equal(signIn.admin()?.adminId, "adm_1", "kept in memory for this page");
  assert.equal(tabA.state(), null);
});
