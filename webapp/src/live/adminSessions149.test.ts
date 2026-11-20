/**
 * Contract v0.18.149 (owner Rules decisions/driver-g12.md Q6 "Real, riders + drivers (Recommended)",
 * contract.json#adminSessions): the Sessions card on the rider and driver pages lists the real signed-in phones and signs
 * one or all out with the admin's reason. Written before the code: on main admin.rider.signOut was a demo-only button
 * (hidden on live: not in LIVE_COMMANDS), admin.driver.signOut did not exist and nothing called the server.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { commandById } from "../commands/registry.ts";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import { LIVE_COMMANDS } from "./liveCommands.ts";
import { errorText } from "./format.ts";
import { deviceLine, sessionsPath, SESSION_PERMISSIONS, type AdminSession } from "./sessions.ts";
import type { LiveClient } from "./session.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC54Sessions } from "../i18n/en/c54-sessions.ts";

function fakeClient(answer: (path: string, body: unknown) => unknown = () => ({ signedOut: 1, items: [] })) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ items: [], nextCursor: null }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return answer(path, body); },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}
const base = { before: "", after: "" };

test("both sign-out commands are live, need a reason and the contract's permissions (riders.block / drivers.activate)", () => {
  for (const [id, permission] of [["admin.rider.signOut", "riders.block"], ["admin.driver.signOut", "drivers.activate"]] as const) {
    assert.ok(LIVE_COMMANDS.has(id), `${id} is sent to the server`);
    const spec = commandById(id);
    assert.ok(spec, `${id} is registered`);
    assert.equal(spec.permission, permission);
    assert.equal(spec.reason, true, `${id} asks for the reason in the confirm step`);
  }
  assert.deepEqual(SESSION_PERMISSIONS.rider, { read: "riders.read", signOut: "riders.block", command: "admin.rider.signOut", list: "riders" });
  assert.deepEqual(SESSION_PERMISSIONS.driver, { read: "drivers.read", signOut: "drivers.activate", command: "admin.driver.signOut", list: "drivers" });
  assert.equal(sessionsPath("rider", "rdr_1"), "/admin/riders/rdr_1/sessions");
  assert.equal(sessionsPath("driver", "drv 1"), "/admin/drivers/drv%201/sessions");
});

test("one phone: POST .../sessions/sign-out { sessionId, reason } (rider and driver)", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  await api.command({ ...base, action: "admin.rider.signOut", targetId: "rdr_1", reason: " Lost phone ", value: { sessionId: "sid_a" } });
  await api.command({ ...base, action: "admin.driver.signOut", targetId: "drv_1", reason: "Stolen phone", value: { sessionId: "sid_b" } });
  assert.deepEqual(posts, [
    { path: "/admin/riders/rdr_1/sessions/sign-out", body: { sessionId: "sid_a", reason: "Lost phone" } },
    { path: "/admin/drivers/drv_1/sessions/sign-out", body: { sessionId: "sid_b", reason: "Stolen phone" } },
  ]);
});

test("every phone: { all: true, reason }; no reason or no target is refused before any request", async () => {
  const { client, posts } = fakeClient();
  const api = createLiveAdminApi(client);
  await api.command({ ...base, action: "admin.driver.signOut", targetId: "drv_1", reason: "Account taken over", value: { all: true } });
  assert.deepEqual(posts, [{ path: "/admin/drivers/drv_1/sessions/sign-out", body: { all: true, reason: "Account taken over" } }]);
  await assert.rejects(api.command({ ...base, action: "admin.rider.signOut", targetId: "rdr_1", reason: "  ", value: { all: true } }), (error: unknown) => error instanceof ApiError && error.reason === "reason_required");
  await assert.rejects(api.command({ ...base, action: "admin.rider.signOut", targetId: "rdr_1", reason: "Why", value: {} }), (error: unknown) => error instanceof ApiError && error.reason === "session_or_all");
  assert.equal(posts.length, 1);
});

test("a driver on a trip (409 sign_out_on_trip) and an already ended phone (404 session_not_found) are said plainly", async () => {
  const { client } = fakeClient(() => { throw new ApiError(409, "The driver is on a trip. Sign him out after the trip ends.", { code: "conflict", reason: "sign_out_on_trip" }); });
  const api = createLiveAdminApi(client);
  await assert.rejects(api.command({ ...base, action: "admin.driver.signOut", targetId: "drv_1", reason: "Stolen phone", value: { all: true } }), (error: unknown) => error instanceof Error && error.message === "The driver is on a trip. Sign the driver out after the trip ends.");
  assert.equal(errorText(new ApiError(404, "x", { code: "not_found", reason: "session_not_found" })), "This phone is already signed out. The list was reloaded.");
});

test("the device line never shows an address; unknown parts say so", () => {
  const session: AdminSession = { sessionId: "s", app: "rider", device: "iPhone", platform: "ios", appVersion: "1.4.2", lastSeenAt: "2026-11-20T09:00:00Z", createdAt: "2026-11-20T08:00:00Z" };
  assert.equal(deviceLine(session), "iPhone · iOS · 1.4.2");
  assert.equal(deviceLine({ ...session, device: null, platform: "unknown", appVersion: null }), "Unknown device · Unknown platform");
});

test("c54 texts exist in en / sv / fr, and sv / fr are translated", () => {
  for (const key of Object.keys(enC54Sessions) as Array<keyof typeof enC54Sessions>) {
    assert.equal(en[key], key);
    assert.ok(sv[key] && sv[key] !== key, `sv ${key}`);
    assert.ok(fr[key] && (fr[key] !== key || key === "Sessions"), `fr ${key}`);
  }
  assert.match(sv["Phones where this account is signed in. Signing out sends the person back to Sign in with \"You were signed out by Movera\"."], /Du loggades ut av Movera/);
  assert.match(fr["Phones where this account is signed in. Signing out sends the person back to Sign in with \"You were signed out by Movera\"."], /Vous avez été déconnecté par Movera/);
});

test("the Sessions card is on the rider and the driver page on live", () => {
  const rider = readFileSync(new URL("../pages/RiderDetailPage.tsx", import.meta.url), "utf8");
  const driver = readFileSync(new URL("../pages/DriverDetailPage.tsx", import.meta.url), "utf8");
  assert.match(rider, /liveData \? <LiveSessions kind="rider" id=\{rider\.id\} \/>/);
  assert.match(driver, /liveData \? <LiveSessions kind="driver" id=\{driver\.id\} \/>/);
});
