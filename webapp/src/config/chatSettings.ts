import { tr, type MessageKey } from "../i18n/core.ts";

/**
 * v0.18.56 §78 (G9 part 2, owner Q79–Q85 2026-11-10; contract.json#chat.settings, defaults configDefaults.chat): the chat
 * settings of a country (CountryRules.chat). Admin › Pricing › Tips & limits › Chat. Saved with Save tips & limits, published
 * with country_rules like CountryRules.calls. The apps read them through GET /trips/{tripId}/messages/options.
 */
export type ChatLang = "sv" | "fr" | "en";
export const CHAT_LANGS = ["sv", "fr", "en"] as const satisfies readonly ChatLang[];
export type ChatText = Record<ChatLang, string>;
export type QuickReply = { id: string; text: ChatText };
export type ChatSide = "driver" | "rider";
export type SheetAutoOpen = "new_message" | "off";
export type ChatSettings = {
  keepDays: number;
  maxLength: number;
  spamPerMin: number;
  sound: boolean;
  sheetAutoOpen: SheetAutoOpen;
  readAloudDefault: boolean;
  translation: boolean;
  quickRepliesOn: boolean;
  quickReplies: Record<ChatSide, QuickReply[]>;
  autoArrived: { on: boolean; text: ChatText };
};

export const CHAT_RANGES = { keepDays: [1, 365], maxLength: [100, 2000], spamPerMin: [1, 60] } as const;
export const QUICK_REPLIES_MAX = 8;
export const QUICK_REPLY_TEXT_MAX = 60;
export const AUTO_ARRIVED_TEXT_MAX = 200;
export const QUICK_REPLY_ID = /^[a-z][a-z0-9_]{0,39}$/;
type RangeKey = keyof typeof CHAT_RANGES;

/** configDefaults.chat of contract v0.18.56 (checked against the copy in chatG92.test.ts). */
export const CHAT_DEFAULTS: ChatSettings = {
  keepDays: 90,
  maxLength: 2000,
  spamPerMin: 10,
  sound: true,
  sheetAutoOpen: "new_message",
  readAloudDefault: false,
  translation: true,
  quickRepliesOn: true,
  quickReplies: {
    driver: [
      { id: "on_my_way", text: { sv: "Jag är på väg", fr: "Je suis en route", en: "I'm on my way" } },
      { id: "five_min", text: { sv: "Framme om 5 minuter", fr: "J'arrive dans 5 minutes", en: "Arriving in 5 minutes" } },
      { id: "traffic", text: { sv: "Mycket trafik, jag blir lite sen", fr: "Il y a des bouchons, j'aurai un peu de retard", en: "Heavy traffic, I'll be a little late" } },
      { id: "where_are_you", text: { sv: "Var exakt är du?", fr: "Où êtes-vous exactement ?", en: "Where exactly are you?" } },
      { id: "ok_got_it", text: { sv: "OK, uppfattat!", fr: "D'accord, bien reçu !", en: "OK, got it!" } },
    ],
    rider: [
      { id: "coming_now", text: { sv: "Jag kommer nu", fr: "J'arrive tout de suite", en: "I'm coming now" } },
      { id: "two_min", text: { sv: "Jag är ute om 2 minuter", fr: "Je sors dans 2 minutes", en: "I'll be out in 2 minutes" } },
      { id: "where_parked", text: { sv: "Var står du?", fr: "Où êtes-vous garé ?", en: "Where are you parked?" } },
      { id: "thanks", text: { sv: "Tack!", fr: "Merci !", en: "Thanks!" } },
    ],
  },
  autoArrived: { on: true, text: { sv: "Jag är framme vid upphämtningsplatsen.", fr: "Je suis au point de prise en charge.", en: "I've arrived at the pickup point." } },
};

/** The 3 number boxes of the Chat card. */
export const CHAT_FIELDS = [
  { key: "keepDays", label: "Keep messages (days)" },
  { key: "maxLength", label: "Longest message (characters)" },
  { key: "spamPerMin", label: "Messages per minute per sender" },
] as const satisfies readonly { key: RangeKey; label: MessageKey }[];

const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
const inRange = (key: RangeKey, v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= CHAT_RANGES[key][0] && v <= CHAT_RANGES[key][1];
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const copyText = (t: ChatText): ChatText => ({ sv: t.sv, fr: t.fr, en: t.en });
const copyList = (list: QuickReply[]) => list.map((item) => ({ id: item.id, text: copyText(item.text) }));

function textOf(raw: unknown): ChatText | null {
  const v = obj(raw);
  return CHAT_LANGS.every((lang) => typeof v[lang] === "string") ? { sv: v["sv"] as string, fr: v["fr"] as string, en: v["en"] as string } : null;
}

function listOf(raw: unknown, fallback: QuickReply[]): QuickReply[] {
  if (!Array.isArray(raw)) return copyList(fallback);
  return raw.flatMap((item) => {
    const v = obj(item);
    const text = textOf(v["text"]);
    return typeof v["id"] === "string" && text ? [{ id: v["id"], text }] : [];
  });
}

/** A stored chat block (or nothing) as settings; anything missing or of the wrong kind reads as the default. */
export function chatSettingsOf(raw: unknown): ChatSettings {
  const v = obj(raw);
  const pick = (key: RangeKey) => (inRange(key, v[key]) ? v[key] : CHAT_DEFAULTS[key]);
  const qr = obj(v["quickReplies"]);
  const arrived = obj(v["autoArrived"]);
  return {
    keepDays: pick("keepDays"),
    maxLength: pick("maxLength"),
    spamPerMin: pick("spamPerMin"),
    sound: bool(v["sound"], CHAT_DEFAULTS.sound),
    sheetAutoOpen: v["sheetAutoOpen"] === "off" || v["sheetAutoOpen"] === "new_message" ? v["sheetAutoOpen"] : CHAT_DEFAULTS.sheetAutoOpen,
    readAloudDefault: bool(v["readAloudDefault"], CHAT_DEFAULTS.readAloudDefault),
    translation: bool(v["translation"], CHAT_DEFAULTS.translation),
    quickRepliesOn: bool(v["quickRepliesOn"], CHAT_DEFAULTS.quickRepliesOn),
    quickReplies: { driver: listOf(qr["driver"], CHAT_DEFAULTS.quickReplies.driver), rider: listOf(qr["rider"], CHAT_DEFAULTS.quickReplies.rider) },
    autoArrived: { on: bool(arrived["on"], CHAT_DEFAULTS.autoArrived.on), text: textOf(arrived["text"]) ?? copyText(CHAT_DEFAULTS.autoArrived.text) },
  };
}

export function defaultChatSettings(): ChatSettings {
  return chatSettingsOf(undefined);
}

const sideText = (side: ChatSide) => (side === "driver" ? tr("Driver") : tr("Rider"));

export function chatSettingsIssues(name: string, s: ChatSettings): string[] {
  const issues: string[] = [];
  if (!inRange("keepDays", s.keepDays)) issues.push(tr("{0}: chat messages must be kept 1 to 365 days.", [name]));
  if (!inRange("maxLength", s.maxLength)) issues.push(tr("{0}: the longest chat message must be 100 to 2000 characters.", [name]));
  if (!inRange("spamPerMin", s.spamPerMin)) issues.push(tr("{0}: chat messages per minute must be 1 to 60.", [name]));
  for (const side of ["driver", "rider"] as const) {
    const list = s.quickReplies[side];
    if (list.length > QUICK_REPLIES_MAX) issues.push(tr("{0}: at most {1} quick replies for the {2}.", [name, QUICK_REPLIES_MAX, sideText(side).toLowerCase()]));
    const ids = new Set<string>();
    for (const item of list) {
      if (!QUICK_REPLY_ID.test(item.id) || ids.has(item.id)) issues.push(tr("{0}: each quick reply needs its own short id (a–z, 0–9, _).", [name]));
      ids.add(item.id);
      if (CHAT_LANGS.some((lang) => !item.text[lang].trim() || item.text[lang].length > QUICK_REPLY_TEXT_MAX)) issues.push(tr("{0}: each quick reply needs a text of 1 to 60 characters in Swedish, French and English.", [name]));
    }
  }
  if (CHAT_LANGS.some((lang) => !s.autoArrived.text[lang].trim() || s.autoArrived.text[lang].length > AUTO_ARRIVED_TEXT_MAX)) issues.push(tr("{0}: the \"I've arrived\" message needs 1 to 200 characters in Swedish, French and English.", [name]));
  return [...new Set(issues)];
}

const onOff = (on: boolean) => (on ? tr("On") : tr("Off"));
const autoOpenText = (v: SheetAutoOpen) => (v === "new_message" ? tr("On a new message") : tr("Never"));
export { autoOpenText as chatAutoOpenText };

/** Plain-language lines of what changed, for the save dialog. */
export function chatSettingsLines(before: ChatSettings, after: ChatSettings): string[] {
  const lines: string[] = [];
  if (before.keepDays !== after.keepDays) lines.push(tr("Chat kept: {0} days → {1} days", [before.keepDays, after.keepDays]));
  if (before.maxLength !== after.maxLength) lines.push(tr("Longest chat message: {0} → {1} characters", [before.maxLength, after.maxLength]));
  if (before.spamPerMin !== after.spamPerMin) lines.push(tr("Chat messages per minute: {0} → {1}", [before.spamPerMin, after.spamPerMin]));
  if (before.sound !== after.sound) lines.push(tr("Chat sound: {0} → {1}", [onOff(before.sound), onOff(after.sound)]));
  if (before.sheetAutoOpen !== after.sheetAutoOpen) lines.push(tr("Trip sheet opens by itself: {0} → {1}", [autoOpenText(before.sheetAutoOpen), autoOpenText(after.sheetAutoOpen)]));
  if (before.readAloudDefault !== after.readAloudDefault) lines.push(tr("Read messages aloud (start value): {0} → {1}", [onOff(before.readAloudDefault), onOff(after.readAloudDefault)]));
  if (before.translation !== after.translation) lines.push(tr("Translate link: {0} → {1}", [onOff(before.translation), onOff(after.translation)]));
  if (before.quickRepliesOn !== after.quickRepliesOn) lines.push(tr("Quick replies: {0} → {1}", [onOff(before.quickRepliesOn), onOff(after.quickRepliesOn)]));
  for (const side of ["driver", "rider"] as const) {
    if (JSON.stringify(before.quickReplies[side]) !== JSON.stringify(after.quickReplies[side])) lines.push(tr("Quick replies for the {0} changed ({1} → {2})", [sideText(side).toLowerCase(), before.quickReplies[side].length, after.quickReplies[side].length]));
  }
  if (before.autoArrived.on !== after.autoArrived.on) lines.push(tr("Automatic \"I've arrived\" message: {0} → {1}", [onOff(before.autoArrived.on), onOff(after.autoArrived.on)]));
  if (JSON.stringify(before.autoArrived.text) !== JSON.stringify(after.autoArrived.text)) lines.push(tr("\"I've arrived\" text changed"));
  return lines;
}

/** A new quick reply with a free id and empty texts. */
export function newQuickReply(list: QuickReply[]): QuickReply {
  let n = list.length + 1;
  while (list.some((item) => item.id === `reply_${n}`)) n += 1;
  return { id: `reply_${n}`, text: { sv: "", fr: "", en: "" } };
}
