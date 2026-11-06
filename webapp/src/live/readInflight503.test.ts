import assert from "node:assert/strict";
import test from "node:test";
import type { FetchLike, FetchResponse } from "../api/httpClient.ts";
import { createLiveClient } from "./session.ts";

/** 503 proof 2026-11-06 (Rules plan/FIX-503-ADMIN-BURST-2026-11-06.md): 1200+ GET /admin/payments in 25 s from one admin filled the DB pool. */
const ok = (body: unknown): FetchResponse => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null }, blob: async () => new Blob([]) });
function setup() {
  const calls: string[] = [];
  let release: () => void = () => {};
  const gate = () => new Promise<void>((resolve) => (release = resolve));
  let wait: Promise<void> = Promise.resolve();
  const fetchImpl: FetchLike = async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url.replace("http://api.test/api/v1", "")}`);
    if (url.endsWith("/admin/auth/sign-in")) return ok({ accessToken: "a", refreshToken: "r", expiresIn: 900, actor: "admin", admin: { adminId: "A1", email: "x", name: "x", role: "super", permissions: [], scope: { zones: "all" }, idleTimeoutSeconds: 900, approvalExempt: true } });
    await wait;
    return ok({ items: [calls.length], nextCursor: null });
  };
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  const client = createLiveClient({ baseUrl: "http://api.test", fetchImpl, storage });
  return { client, calls, hold: () => (wait = gate()), release: () => release() };
}

test("503: 100 identical list reads at once send ONE GET; all 100 get its answer", async () => {
  const s = setup();
  await s.client.signIn("x", "y");
  s.hold();
  const reads = Array.from({ length: 100 }, () => s.client.json<{ items: number[] }>("/admin/payments?limit=50"));
  s.release();
  const answers = await Promise.all(reads);
  assert.equal(s.calls.filter((c) => c.startsWith("GET /admin/payments")).length, 1);
  assert.equal(new Set(answers.map((a) => a.items[0])).size, 1);
});

test("503: a read after the first one finished is sent again (no stale cache)", async () => {
  const s = setup();
  await s.client.signIn("x", "y");
  await s.client.json("/admin/alerts/book?country=SE");
  await s.client.json("/admin/alerts/book?country=SE");
  assert.equal(s.calls.filter((c) => c.startsWith("GET /admin/alerts/book")).length, 2);
});

test("503: different paths, POSTs and reads with an abort signal are never joined", async () => {
  const s = setup();
  await s.client.signIn("x", "y");
  s.hold();
  const ctl = new AbortController();
  const reads = [s.client.json("/admin/trips?limit=50"), s.client.json("/admin/trips?limit=50&cursor=c1"), s.client.json("/admin/trips?limit=50", { signal: ctl.signal }), s.client.json("/admin/x", { method: "POST", body: "{}" }), s.client.json("/admin/x", { method: "POST", body: "{}" })];
  s.release();
  await Promise.all(reads);
  assert.equal(s.calls.length - 1, 5);
});
