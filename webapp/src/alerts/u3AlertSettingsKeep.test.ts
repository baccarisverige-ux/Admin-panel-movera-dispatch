import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAlertBook, type AlertBook, type KindSettings } from "./engine.ts";
import { alertCall, bookFromServer, type AlertBookState } from "../live/liveAlerts.ts";

/**
 * U3 (Rules audits/impact/safe-config-saves.md, SAFETY): Alerts › Settings Save sends the settings the panel rebuilt.
 * The settings must start from the stored document, so kinds.rule, kinds this panel does not know and other top-level
 * keys reach the server unchanged. Real path: GET book → bookFromServer → normalizeAlertBook (useAlerts) → the view's
 * setKind → normalizeAlertBook + alertCall (liveAdminApi "admin.alerts.settings") → an in-memory server that stores
 * what it is sent.
 */
function server(settings: Record<string, unknown>) {
  let state: AlertBookState = { rev: 3, settings, rules: [], records: [], mutes: {}, quiet: { on: false, from: "22:00", to: "07:00" }, people: [] };
  const read = () => structuredClone(state);
  const put = (body: { expectedRev: number; settings: Record<string, unknown> }) => {
    assert.equal(body.expectedRev, state.rev);
    state = { ...state, rev: state.rev + 1, settings: structuredClone(body.settings) };
    return read();
  };
  return { read, put, stored: () => state.settings };
}

/** What the view does: setKind on the shown book, then Save with { ...book, draftRev + 1, settings }. */
function save(fake: ReturnType<typeof server>, id: string, patch: Partial<KindSettings>) {
  const book = normalizeAlertBook(bookFromServer(fake.read(), "A1"));
  const settings: AlertBook["settings"] = { ...book.settings, kinds: { ...book.settings.kinds, [id]: { ...book.settings.kinds[id]!, ...patch } } };
  const call = alertCall("admin.alerts.settings", "alert settings", normalizeAlertBook({ ...book, draftRev: book.draftRev + 1, settings }), "A1", Date.now(), "SE");
  assert.ok(call && call.method === "PUT" && call.path === "/admin/alerts/settings");
  fake.put(call.body as { expectedRev: number; settings: Record<string, unknown> });
  return call.body!["settings"] as Record<string, unknown>;
}

const STORED = () => ({
  kinds: { future_kind: { on: false }, rule: { level: "critical" }, sos: { on: true, level: "critical", who: "all" }, ride_check: { on: true } },
  extraKey: { keep: 1 },
});

test("U3 safety: a Save after switching one known kind keeps kinds.rule, an unknown kind and a top-level key", () => {
  const fake = server(STORED());
  const sent = save(fake, "car_lost", { on: false });
  const kinds = sent["kinds"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(kinds["future_kind"], { on: false }, "unknown kind sent");
  assert.deepEqual(kinds["rule"], { level: "critical" }, "kinds.rule sent");
  assert.deepEqual(sent["extraKey"], { keep: 1 }, "top-level key sent");
  const stored = fake.stored() as { kinds: Record<string, unknown>; extraKey: unknown };
  assert.deepEqual(stored.kinds["future_kind"], { on: false });
  assert.deepEqual(stored.kinds["rule"], { level: "critical" });
  assert.deepEqual(stored.extraKey, { keep: 1 });
});

test("U3 mutation: the panel's own change still wins, a switched-off kind is written as on false", () => {
  const fake = server(STORED());
  const sent = save(fake, "sos", { on: false, level: "important" });
  const sos = (sent["kinds"] as Record<string, KindSettings>)["sos"]!;
  assert.equal(sos.on, false, "a cleared switch is written explicitly");
  assert.equal(sos.level, "important");
  assert.ok("car_lost" in (sent["kinds"] as object), "known kinds still get their defaults");
  const partial = (sent["kinds"] as Record<string, KindSettings>)["ride_check"]!;
  assert.ok(partial.escalate && partial.who, "a stored known kind missing fields is filled from the defaults");
  // a second save keeps everything too
  const again = save(fake, "car_lost", { on: true });
  assert.deepEqual((again["kinds"] as Record<string, unknown>)["rule"], { level: "critical" });
  assert.equal(((again["kinds"] as Record<string, KindSettings>)["sos"]!).on, false);
});
