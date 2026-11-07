// Finder D4 (2026-11-07, plan/finders-2026-11-07/D.md): the admin events stream gave up for good on the first 401. Access
// tokens live 900 s and nothing refreshes them while the stream is open (the lists do not poll), so the first drop after
// 15 min reconnected with a dead token: 401 → state "off", no retry, live updates gone until a reload.
import assert from "node:assert/strict";
import test from "node:test";
import { connectAdminEvents, fetchEventSource, type LiveStreamState } from "./adminEvents.ts";

const tick = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const sse = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "content-type": "text/event-stream" } });
const noTimers = { setTimer: () => 0, clearTimer: () => undefined };

test("D4: a 401 refreshes the token once and the stream opens again with the new token", async () => {
  let token = "expired";
  const sent: string[] = [];
  const client = { baseUrl: "https://api.example.test", state: () => ({ accessToken: token }), accessToken: async () => token, refresh: async () => { token = "new"; return true; } };
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    sent.push(auth);
    return auth === "Bearer expired" ? new Response("", { status: 401 }) : sse();
  }) as typeof fetch;
  const states: LiveStreamState[] = [];
  const stop = connectAdminEvents(fetchEventSource(client, fakeFetch, noTimers), () => {}, (s) => states.push(s), noTimers);
  await tick();
  assert.deepEqual(sent, ["Bearer expired", "Bearer new"]);
  assert.equal(states.at(-1), "open", `states ${JSON.stringify(states)}`);
  stop();
});

test("D4: the stream asks the session for a fresh token (not the raw stored one)", async () => {
  const sent: string[] = [];
  const client = { baseUrl: "https://api.example.test", state: () => ({ accessToken: "old" }), accessToken: async () => "fresh", refresh: async () => true };
  const fakeFetch = (async (_input: string | URL | Request, init?: RequestInit) => { sent.push(new Headers(init?.headers).get("Authorization") ?? ""); return sse(); }) as typeof fetch;
  const stop = connectAdminEvents(fetchEventSource(client, fakeFetch, noTimers), () => {}, () => {}, noTimers);
  await tick();
  assert.deepEqual(sent, ["Bearer fresh"]);
  stop();
});

test("D4: a refused refresh (session ended) stops the stream: state off, no more tries", async () => {
  let calls = 0;
  const client = { baseUrl: "https://api.example.test", state: () => ({ accessToken: "expired" }), accessToken: async () => "expired", refresh: async () => false };
  const fakeFetch = (async () => { calls += 1; return new Response("", { status: 401 }); }) as typeof fetch;
  const states: LiveStreamState[] = [];
  const retries: Array<() => void> = [];
  const stop = connectAdminEvents(fetchEventSource(client, fakeFetch, noTimers), () => {}, (s) => states.push(s), { setTimer: (fn) => retries.push(fn), clearTimer: () => undefined });
  await tick();
  assert.equal(states.at(-1), "off");
  assert.equal(calls, 1);
  assert.equal(retries.length, 0);
  stop();
});
