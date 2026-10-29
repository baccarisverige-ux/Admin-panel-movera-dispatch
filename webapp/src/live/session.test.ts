import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, type FetchLike, type FetchResponse } from "../api/httpClient.ts";
import { LIVE_SESSION_KEY, createLiveClient, idleExpired, resolveBase } from "./session.ts";
import type { AdminMe, AdminSession } from "./types.ts";

const ADMIN: AdminMe = {
  adminId: "A1",
  email: "owner@movera.se",
  name: "Owner",
  role: "super",
  permissions: ["overview.read", "drivers.read"],
  scope: { zones: "all" },
  idleTimeoutSeconds: 900,
  approvalExempt: true,
};

function session(access: string, refresh: string): AdminSession {
  return { accessToken: access, refreshToken: refresh, expiresIn: 900, actor: "admin", admin: ADMIN };
}

type Call = { url: string; method: string; headers: Headers; body: unknown };

function respond(status: number, body: unknown, headers: Record<string, string> = {}): FetchResponse {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name) => map.get(name.toLowerCase()) ?? null },
    blob: async () => new Blob([JSON.stringify(body)], { type: headers["Content-Type"] ?? "application/octet-stream" }),
  };
}

/** A fake server: a queue of answers, and every call recorded with its headers. */
function fakeServer(script: ((call: Call) => FetchResponse)[]) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    const call: Call = { url, method: (init?.method ?? "GET").toUpperCase(), headers, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const next = script.shift();
    if (!next) throw new Error(`unexpected call ${call.method} ${url}`);
    return next(call);
  };
  return { calls, fetchImpl };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key), map };
}

test("sign-in posts e-mail and password without a bearer, keeps the tokens in sessionStorage and sends Bearer afterwards", async () => {
  const storage = memoryStorage();
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(200, { items: [], nextCursor: null }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test/", fetchImpl: server.fetchImpl, storage });
  const me = await client.signIn(" owner@movera.se ", "secret");
  assert.equal(me.adminId, "A1");
  assert.equal(server.calls[0]!.url, "http://api.test/api/v1/admin/auth/sign-in");
  assert.deepEqual(server.calls[0]!.body, { email: "owner@movera.se", password: "secret" });
  assert.equal(server.calls[0]!.headers.get("Authorization"), null, "no bearer on sign-in");
  assert.equal(server.calls[0]!.headers.get("X-Api-Version"), "0.5");
  assert.ok(server.calls[0]!.headers.get("Idempotency-Key"), "sign-in is a POST: it carries a key");
  const stored = JSON.parse(storage.map.get(LIVE_SESSION_KEY)!);
  assert.equal(stored.accessToken, "access-1");
  assert.equal(stored.admin.adminId, "A1");

  const page = await client.json<{ items: unknown[] }>("/admin/drivers?limit=50");
  assert.deepEqual(page.items, []);
  assert.equal(server.calls[1]!.url, "http://api.test/api/v1/admin/drivers?limit=50");
  assert.equal(server.calls[1]!.headers.get("Authorization"), "Bearer access-1");
  assert.ok(server.calls[1]!.headers.get("X-Request-Id"));
  assert.equal(server.calls[1]!.headers.get("Idempotency-Key"), null, "a GET has no key");
});

test("a 401 refreshes once with the rotated token and retries the same command; the refresh token moves", async () => {
  const storage = memoryStorage();
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(401, { code: "unauthenticated", message: "expired", requestId: "r1", retryable: false }),
    () => respond(200, session("access-2", "refresh-2")),
    () => respond(200, { driverId: "D1", version: 3 }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage });
  await client.signIn("owner@movera.se", "secret");
  const driver = await client.post<{ driverId: string }>("/admin/drivers/D1/status", { expectedVersion: 2, accountStatus: "active", note: "ok" });
  assert.equal(driver.driverId, "D1");
  assert.equal(server.calls.length, 4);
  assert.equal(server.calls[1]!.headers.get("Authorization"), "Bearer access-1");
  assert.equal(server.calls[2]!.url, "http://api.test/api/v1/admin/auth/refresh");
  assert.deepEqual(server.calls[2]!.body, { refreshToken: "refresh-1" });
  assert.equal(server.calls[2]!.headers.get("Authorization"), null, "refresh carries no bearer");
  assert.equal(server.calls[3]!.headers.get("Authorization"), "Bearer access-2");
  assert.equal(server.calls[3]!.headers.get("Idempotency-Key"), server.calls[1]!.headers.get("Idempotency-Key"), "the retry is the same command");
  assert.deepEqual(server.calls[3]!.body, { expectedVersion: 2, accountStatus: "active", note: "ok" });
  assert.equal(client.state()?.refreshToken, "refresh-2");
  assert.equal(JSON.parse(storage.map.get(LIVE_SESSION_KEY)!).accessToken, "access-2");
});

test("a failed refresh signs out: the tokens are gone, onSignedOut fires and the 401 is thrown", async () => {
  const storage = memoryStorage();
  const reasons: string[] = [];
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(401, { code: "unauthenticated", message: "expired", requestId: "r1", retryable: false }),
    () => respond(401, { code: "unauthenticated", message: "refresh used", requestId: "r2", retryable: false }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage, onSignedOut: (reason) => reasons.push(reason) });
  await client.signIn("owner@movera.se", "secret");
  await assert.rejects(client.json("/admin/drivers"), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(server.calls.length, 3, "no retry after a failed refresh");
  assert.equal(client.state(), null);
  assert.equal(client.admin(), null);
  assert.equal(storage.map.has(LIVE_SESSION_KEY), false);
  assert.deepEqual(reasons, ["refresh_failed"]);
  await assert.rejects(client.json("/admin/drivers"), (error: unknown) => error instanceof ApiError && error.status === 401, "signed out: no call is made");
  assert.equal(server.calls.length, 3);
});

test("concurrent 401s share one refresh", async () => {
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(401, { code: "unauthenticated", message: "expired", requestId: "r1", retryable: false }),
    () => respond(401, { code: "unauthenticated", message: "expired", requestId: "r2", retryable: false }),
    () => respond(200, session("access-2", "refresh-2")),
    () => respond(200, { items: [], nextCursor: null }),
    () => respond(200, { items: [], nextCursor: null }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage: null });
  await client.signIn("owner@movera.se", "secret");
  await Promise.all([client.json("/admin/drivers"), client.json("/admin/fleets")]);
  const refreshes = server.calls.filter((call) => call.url.endsWith("/admin/auth/refresh"));
  assert.equal(refreshes.length, 1);
  assert.equal(server.calls.at(-1)!.headers.get("Authorization"), "Bearer access-2");
});

test("sign-in errors are thrown as ApiError with the reason and Retry-After; the session stays empty", async () => {
  const server = fakeServer([
    () => respond(401, { code: "unauthenticated", message: "Unauthenticated", requestId: "r1", retryable: false, reason: "invalid_credentials" }),
    () => respond(429, { code: "rate_limited", message: "Locked", requestId: "r2", retryable: true }, { "Retry-After": "45" }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage: null });
  await assert.rejects(client.signIn("owner@movera.se", "wrong"), (error: unknown) => error instanceof ApiError && error.status === 401 && error.reason === "invalid_credentials");
  await assert.rejects(client.signIn("owner@movera.se", "wrong"), (error: unknown) => error instanceof ApiError && error.status === 429 && error.retryAfterSeconds === 45);
  assert.equal(client.state(), null);
});

test("sign-out forgets the tokens first and revokes on the server (204); a 204 json() gives undefined", async () => {
  const storage = memoryStorage();
  const reasons: string[] = [];
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(204, null),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage, onSignedOut: (reason) => reasons.push(reason) });
  await client.signIn("owner@movera.se", "secret");
  await client.signOut();
  assert.equal(server.calls[1]!.url, "http://api.test/api/v1/admin/auth/sign-out");
  assert.equal(server.calls[1]!.headers.get("Authorization"), "Bearer access-1");
  assert.equal(client.state(), null);
  assert.equal(storage.map.has(LIVE_SESSION_KEY), false);
  assert.deepEqual(reasons, ["sign_out"]);
});

test("a stored session is restored from sessionStorage; a broken one is ignored", async () => {
  const storage = memoryStorage();
  storage.setItem(LIVE_SESSION_KEY, JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: 1, admin: ADMIN }));
  const server = fakeServer([() => respond(204, null)]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage });
  assert.equal(client.admin()?.adminId, "A1");
  await client.json("/admin/fleets/F1/drivers/D1/remove", { method: "POST" });
  assert.equal(server.calls[0]!.headers.get("Authorization"), "Bearer a");
  assert.ok(server.calls[0]!.headers.get("Idempotency-Key"));

  const broken = memoryStorage();
  broken.setItem(LIVE_SESSION_KEY, "{not json");
  assert.equal(createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage: broken }).admin(), null);
  const partial = memoryStorage();
  partial.setItem(LIVE_SESSION_KEY, JSON.stringify({ accessToken: "a" }));
  assert.equal(createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage: partial }).admin(), null);
});

test("a document file comes back as a Blob with its media type, fetched with the bearer token", async () => {
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(200, "pdf-bytes", { "Content-Type": "application/pdf" }),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage: null });
  await client.signIn("owner@movera.se", "secret");
  const file = await client.blob("/admin/documents/DOC1/file");
  assert.equal(file.mediaType, "application/pdf");
  assert.ok(file.blob.size > 0);
  assert.equal(server.calls[1]!.headers.get("Authorization"), "Bearer access-1");
  assert.ok(!server.calls[1]!.url.includes("access-1"), "the token is never in the URL");
});

test("idleExpired follows idleTimeoutSeconds and falls back to 900 s", () => {
  assert.equal(idleExpired(0, 899_000, 900), false);
  assert.equal(idleExpired(0, 900_000, 900), true);
  assert.equal(idleExpired(0, 300_000, 300), true);
  assert.equal(idleExpired(0, 899_000, 0), false, "a missing timeout means the default");
  assert.equal(idleExpired(0, 900_000, Number.NaN), true);
});

test("resolveBase: a URL loses its trailing slash; same origin takes the page's origin when there is one", () => {
  assert.equal(resolveBase("http://api.test/"), "http://api.test");
  assert.equal(resolveBase(" https://api.movera.se "), "https://api.movera.se");
  assert.equal(resolveBase(""), typeof location === "undefined" ? "" : location.origin);
});

test("the setup link is checked, then the first password signs the admin in", async () => {
  const storage = memoryStorage();
  const server = fakeServer([
    () => respond(200, { email: "owner@movera.se", name: "Owner", expiresAt: "2026-10-29T08:00:00Z" }),
    () => respond(200, session("access-1", "refresh-1")),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage });
  assert.deepEqual(await client.checkSetupLink("t".repeat(32)), { email: "owner@movera.se", name: "Owner", expiresAt: "2026-10-29T08:00:00Z" });
  assert.equal((await client.setupPassword("t".repeat(32), "correct horse battery")).adminId, "A1");
  assert.equal(server.calls[0].url, "http://api.test/api/v1/admin/auth/setup-password/check");
  assert.deepEqual(server.calls[1].body, { setupToken: "t".repeat(32), password: "correct horse battery" });
  assert.equal(server.calls[1].headers.get("Authorization"), null);
  assert.equal(client.state()?.accessToken, "access-1");
  assert.ok(storage.map.has(LIVE_SESSION_KEY));
});

test("contract v0.16.1: updateMyLanguage PATCHes /admin/auth/me with a key, keeps the answer and tells the listeners", async () => {
  const storage = memoryStorage();
  const server = fakeServer([
    () => respond(200, session("access-1", "refresh-1")),
    () => respond(200, { ...ADMIN, language: "sv" }),
    () => respond(200, ADMIN),
  ]);
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl: server.fetchImpl, storage });
  await client.signIn("owner@movera.se", "secret");
  const seen: (string | undefined)[] = [];
  client.subscribe((state) => seen.push(state?.admin.language));
  const me = await client.updateMyLanguage("sv");
  assert.equal(me.language, "sv");
  assert.equal(server.calls[1]!.method, "PATCH");
  assert.equal(server.calls[1]!.url, "http://api.test/api/v1/admin/auth/me");
  assert.deepEqual(server.calls[1]!.body, { language: "sv" });
  assert.ok(server.calls[1]!.headers.get("Idempotency-Key"));
  assert.equal(JSON.parse(storage.map.get(LIVE_SESSION_KEY)!).admin.language, "sv", "kept for a reload");
  await client.updateMyLanguage(null);
  assert.deepEqual(server.calls[2]!.body, { language: null });
  assert.deepEqual(seen, ["sv", undefined]);
});
