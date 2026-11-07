// Finder D3 (2026-11-07, plan/finders-2026-11-07/D.md): an open admin events stream that goes silent (laptop sleep,
// Wi-Fi change: half-open connection) kept state "open", so the streamed lists stopped polling and froze with no badge.
import assert from "node:assert/strict";
import test from "node:test";
import { connectAdminEvents, fetchEventSource, STREAM_SILENCE_MS, type LiveStreamState } from "./adminEvents.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("D3: an open stream that goes silent (no heartbeat) is closed and opened again", async () => {
  // The server writes ": heartbeat" every 15 s (movera-server src/realtime/sse.ts).
  const client = { baseUrl: "https://api.example.test", state: () => ({ accessToken: "ok" }) };
  let opens = 0;
  const fakeFetch = (async () => { opens += 1; return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { "content-type": "text/event-stream" } }); }) as typeof fetch;
  const states: LiveStreamState[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const fake = {
    setTimer: (fn: () => void, ms: number) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (handle: unknown) => { (handle as { cleared: boolean }).cleared = true; },
  };
  const stop = connectAdminEvents(fetchEventSource(client, fakeFetch, fake), () => {}, (s) => states.push(s), { ...fake, random: () => 0 });
  await tick();
  await tick();
  assert.equal(states.at(-1), "open");
  const watchdog = timers.find((t) => !t.cleared && t.ms === STREAM_SILENCE_MS);
  assert.ok(watchdog, "no silence watchdog is armed while the stream is open");
  watchdog.fn();
  assert.equal(states.at(-1), "reconnecting", "silence shows the Reconnecting badge and the lists poll again");
  timers.filter((t) => !t.cleared && t.ms !== STREAM_SILENCE_MS).at(-1)?.fn();
  await tick();
  await tick();
  assert.equal(opens, 2, "the stream is opened again (with Last-Event-ID)");
  assert.equal(states.at(-1), "open");
  stop();
});

test("D3: a heartbeat or event chunk keeps the stream open (the watchdog is re-armed)", async () => {
  const client = { baseUrl: "https://api.example.test", state: () => ({ accessToken: "ok" }) };
  let push: ((text: string) => void) | null = null;
  const fakeFetch = (async () => new Response(new ReadableStream({ start(c) { push = (text) => c.enqueue(new TextEncoder().encode(text)); } }), { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  const states: LiveStreamState[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const fake = {
    setTimer: (fn: () => void, ms: number) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (handle: unknown) => { (handle as { cleared: boolean }).cleared = true; },
  };
  const stop = connectAdminEvents(fetchEventSource(client, fakeFetch, fake), () => {}, (s) => states.push(s), fake);
  await tick();
  await tick();
  const first = timers.filter((t) => t.ms === STREAM_SILENCE_MS).length;
  push!(": heartbeat\n\n");
  await tick();
  await tick();
  assert.ok(timers.filter((t) => t.ms === STREAM_SILENCE_MS).length > first, "a heartbeat re-arms the watchdog");
  assert.equal(timers.filter((t) => t.ms === STREAM_SILENCE_MS && !t.cleared).length, 1, "only one watchdog at a time");
  assert.equal(states.at(-1), "open");
  stop();
  assert.equal(timers.filter((t) => !t.cleared).length, 0, "stop clears the watchdog");
});
