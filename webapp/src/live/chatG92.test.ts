import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHAT_DEFAULTS, chatSettingsIssues, chatSettingsLines, chatSettingsOf, newQuickReply } from "../config/chatSettings.ts";
import { PRICING_FIELDS, completeCountrySettings, countrySettingsIssues, defaultCountrySettings } from "../config/countrySettings.ts";
import { countryRulesOf } from "./configDocs.ts";
import { adminChatsPath, chatRowLabel, chatRowOf, joinChatPages, lastFromText, personMessagePath, personMessageProblem, readAdminChats, sendPersonMessage, type AdminChatRow } from "./adminChats.ts";
import { PERMISSIONS } from "../platform/team.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { en } from "../i18n/en.ts";

// v0.18.56 §78 (G9 part 2, owner Q79–Q85 2026-11-10): the admin part — CountryRules.chat settings, GET /admin/chats,
// admin Message driver / rider, support.reply in the role editor.
const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const O = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("§78 chat settings: the admin defaults are configDefaults.chat of the contract copy, ranges match", () => {
  assert.deepEqual(CHAT_DEFAULTS, C.configDefaults.chat);
  assert.deepEqual(chatSettingsOf(undefined), C.configDefaults.chat);
  const r = C.chat.settings.ranges;
  assert.deepEqual([r.keepDays, r.maxLength, r.spamPerMin, r.quickRepliesPerSide[1], r.quickReplyTextLength[1]], [[1, 365], [100, 2000], [1, 60], 8, 60]);
  assert.deepEqual(C.chat.settings.sheetAutoOpenValues, ["new_message", "off"]);
});

test("§78 chat settings per country: in every country's defaults, saved with Save tips & limits, missing parts read as defaults", () => {
  for (const country of ["SE", "FR", "TN"] as const) assert.deepEqual(defaultCountrySettings(country).chat, CHAT_DEFAULTS);
  assert.ok((PRICING_FIELDS as readonly string[]).includes("chat"));
  const got = completeCountrySettings("FR", { chat: { keepDays: 30, sound: false, sheetAutoOpen: "off" } }).chat;
  assert.equal(got.keepDays, 30);
  assert.equal(got.sound, false);
  assert.equal(got.sheetAutoOpen, "off");
  assert.deepEqual(got.quickReplies, CHAT_DEFAULTS.quickReplies);
  // A stored number out of range is kept for the check to see, and blocks Save.
  const bad = completeCountrySettings("SE", { chat: { keepDays: 999 } });
  assert.equal(bad.chat.keepDays, 999);
  assert.ok(countrySettingsIssues("SE", bad).some((line) => line.includes("365")));
});

test("§78 chat settings are checked and listed before Save", () => {
  assert.deepEqual(chatSettingsIssues("Sweden", CHAT_DEFAULTS), []);
  assert.equal(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, maxLength: 50 }).length, 1);
  assert.equal(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, spamPerMin: 61 }).length, 1);
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: `r_${i}`, text: { sv: "a", fr: "a", en: "a" } }));
  assert.ok(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, quickReplies: { ...CHAT_DEFAULTS.quickReplies, rider: nine } }).length >= 1);
  const dup = [{ id: "x", text: { sv: "a", fr: "a", en: "a" } }, { id: "x", text: { sv: "b", fr: "b", en: "b" } }];
  assert.equal(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, quickReplies: { ...CHAT_DEFAULTS.quickReplies, driver: dup } }).length, 1);
  const empty = newQuickReply(CHAT_DEFAULTS.quickReplies.driver);
  assert.match(empty.id, /^reply_\d+$/);
  assert.equal(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, quickReplies: { ...CHAT_DEFAULTS.quickReplies, driver: [empty] } }).length, 1, "a text is needed in sv, fr and en");
  assert.equal(chatSettingsIssues("Sweden", { ...CHAT_DEFAULTS, autoArrived: { on: true, text: { sv: "", fr: "x", en: "x" } } }).length, 1);
  assert.deepEqual(chatSettingsLines(CHAT_DEFAULTS, { ...CHAT_DEFAULTS, keepDays: 30 }), ["Chat kept: 90 days → 30 days"]);
  assert.deepEqual(chatSettingsLines(CHAT_DEFAULTS, { ...CHAT_DEFAULTS, autoArrived: { ...CHAT_DEFAULTS.autoArrived, on: false } }), ["Automatic \"I've arrived\" message: On → Off"]);
});

test("§78 (fail-before: never sent): Save writes CountryRules.chat and keeps a stored chat block when the panel has none", () => {
  const input = { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 } };
  assert.equal(countryRulesOf("SE", "SEK", input, null)["chat"], undefined);
  const chat = { ...CHAT_DEFAULTS, keepDays: 60 };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, chat }, null)["chat"], chat);
  const base = { chat: { keepDays: 10 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", input, base)["chat"], base.chat);
});

test("§78 the Chat card sits in Tips & limits, next to Calls, with every setting", () => {
  const panel = src("../pricing/CountryExtrasPanel.tsx");
  assert.match(panel, /<ChatSettingsCard shown=\{shown\.chat\}/);
  assert.match(panel, /"calls", "chat", "dont-match"/);
  const card = src("../pricing/ChatSettingsCard.tsx");
  for (const id of ["chat-sound", "chat-sheet-auto-open", "chat-read-aloud", "chat-translation", "chat-quick-replies-on", "chat-auto-arrived", "chat-qr-add-"]) assert.ok(card.includes(id), id);
  assert.match(card, /\["driver", "rider"\]/, "quick replies per side");
});

const ROW: AdminChatRow = { tripId: "trp_01ABCDEFGHJKMNPQRSTV", zoneId: "z-sto", status: "driver_to_pickup", riderFirstName: "Anna", driverFirstName: "Omar", messageCount: 3, lastMessageAt: "2026-11-10T10:00:00Z", lastFrom: "driver" };

test("§78 GET /admin/chats: zone filter + limit + cursor; the old /admin/trips?limit=100 read is gone", async () => {
  assert.ok(O.includes("/admin/chats:"));
  assert.equal(adminChatsPath([["country", "SE"]], null), "/admin/chats?country=SE&limit=50");
  assert.equal(adminChatsPath([["zoneIds", "a,b"]], "c 1"), "/admin/chats?zoneIds=a%2Cb&limit=50&cursor=c+1");
  const asked: string[] = [];
  const page = await readAdminChats(async (path) => { asked.push(path); return { items: [{ ...ROW, text: "secret", phone: "+46701234567" } as AdminChatRow], nextCursor: "n2" }; }, [["zoneId", "z-sto"]], null);
  assert.deepEqual(asked, ["/admin/chats?zoneId=z-sto&limit=50"]);
  assert.equal(page.nextCursor, "n2");
  assert.ok(!JSON.stringify(page).includes("secret") && !JSON.stringify(page).includes("+4670"), "never a text or a phone");
  const chat = src("./LiveChat.tsx");
  assert.ok(!chat.includes("/admin/trips?limit=100"));
  assert.match(chat, /useInfiniteQuery/);
});

test("§78 chat rows: first names, count, last time and who wrote last; pages joined once per trip", () => {
  assert.equal(chatRowLabel(ROW).title, "Anna – Omar");
  assert.equal(lastFromText(ROW), "Last: Omar");
  assert.equal(lastFromText({ ...ROW, lastFrom: "support" }), "Last: Support");
  assert.equal(lastFromText({ ...ROW, lastFrom: "rider", riderFirstName: null }), "Last: Rider");
  const rows = joinChatPages([{ items: [ROW], nextCursor: "x" }, { items: [ROW, { ...ROW, tripId: "t2" }], nextCursor: null }]);
  assert.deepEqual(rows.map((r) => r.tripId), [ROW.tripId, "t2"]);
  assert.deepEqual(Object.keys(chatRowOf(ROW)).sort(), ["driverFirstName", "lastFrom", "lastMessageAt", "messageCount", "riderFirstName", "status", "tripId", "zoneId"]);
});

test("§78 admin Message: POST /admin/drivers|riders/{id}/message { text } opens a Support ticket", async () => {
  assert.ok(O.includes("/admin/drivers/{driverId}/message:") && O.includes("/admin/riders/{riderId}/message:"));
  assert.equal(personMessagePath("driver", "drv 1"), "/admin/drivers/drv%201/message");
  assert.equal(personMessagePath("rider", "rid_1"), "/admin/riders/rid_1/message");
  assert.ok(personMessageProblem("  "));
  assert.ok(personMessageProblem("x".repeat(2001)));
  assert.equal(personMessageProblem("Hello"), null);
  const sent: [string, unknown][] = [];
  const ticket = await sendPersonMessage(async (path, body) => { sent.push([path, body]); return { ticketId: "tck_1" }; }, "rider", "rid_1", "  Hello  ");
  assert.deepEqual(sent, [["/admin/riders/rid_1/message", { text: "Hello" }]]);
  assert.equal(ticket.ticketId, "tck_1");
  await assert.rejects(sendPersonMessage(async () => ({}), "driver", "d", ""));
  for (const page of ["../pages/DriverDetailPage.tsx", "../pages/RiderDetailPage.tsx"]) assert.match(src(page), /liveData \? <LiveMessagePerson kind="(driver|rider)"/, page);
  assert.match(src("./LiveMessagePerson.tsx"), /can\("support\.reply"\)/);
});

test("§78 support.reply is a tick box per role in the role editor and guards the four routes", () => {
  const item = PERMISSIONS.find((p) => p.id === "support.reply");
  assert.ok(item);
  assert.match(item.label, /chats/);
  for (const op of ["adminChats", "adminMessageDriver", "adminMessageRider"]) {
    const at = O.indexOf(`operationId: ${op}`);
    assert.ok(at > 0, op);
    assert.match(O.slice(at, at + 4000), /x-permission: support\.reply/, op);
  }
});

test("§78 every new admin text has sv and fr", () => {
  const area = src("../i18n/en/c13-chat-g92.ts");
  const keys = Object.keys(en).filter((key) => area.includes(JSON.stringify(key)));
  assert.ok(keys.length > 30, `found ${keys.length}`);
  for (const key of keys) {
    assert.ok((sv as Record<string, string>)[key], `sv: ${key}`);
    assert.ok((fr as Record<string, string>)[key], `fr: ${key}`);
  }
});
