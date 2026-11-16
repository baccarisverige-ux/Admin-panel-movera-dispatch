/**
 * Undo last Tips & limits save (live 2026-11-16, Rules audits/impact/country-undo.md).
 *
 * One "Save tips & limits" publishes several server documents: country_rules (tips, raise steps, limits) and
 * rider_app_config (the tip rules) of the country's Standard and of each chosen zone that has its own. The server keeps
 * no group for them, so the save writes its id into the note of every publish (ConfigPublishCommand.note, kept in
 * History and in the audit). The newest save of a country is then read back from History: every document whose
 * newest entries carry that id. Undo publishes the version before again in each (POST …/restore with `country` or
 * `zoneId`); a zone that used the Standard before the save goes back to the Standard (POST …/use-standard).
 * A document that was published again after the save is named and never touched.
 * Pure over a ConfigHttp, so node --test covers it.
 */
import { tr, trx } from "../i18n/core.ts";
import { COUNTRY_LABEL } from "../i18n/countries.ts";
import { zoneById, type MarketId } from "../markets/markets.ts";
import { countryOfStandard, goBackToStandard, readDraft, scopeOf, SettingsChanged, type ConfigHttp, type HistoryEntry } from "./configDocs.ts";

/** The documents one Tips & limits save publishes. The rider document first: restoring country_rules rewrites it. */
export const TIPS_DOCS = ["rider_app_config", "country_rules"] as const;
export type TipsDoc = (typeof TIPS_DOCS)[number];

/** The slice the panel reads the newest save from: `${TIPS_LAST_SAVE_KEY}:<country>`. */
export const TIPS_LAST_SAVE_KEY = "tipsLimitsLastSave";

const NOTE = /^Tips & limits save (\S+)( \(used the Standard before\))?$/;
/** The server's own re-stamp of a Standard when a zone goes back to it: the same document as the next version. */
const RESTAMP = /^re-stamped: /;
const HISTORY_LIMIT = 10;

export const newSaveId = (at: string): string => `${at}/${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;

/** The note of every publish of one save; `wasOnStandard`: the scope had no document of its own before. */
export function saveNote(saveId: string, wasOnStandard: boolean): string {
  return `Tips & limits save ${saveId}${wasOnStandard ? " (used the Standard before)" : ""}`;
}

export function parseSaveNote(note: string | null | undefined): { saveId: string; wasOnStandard: boolean } | null {
  const match = NOTE.exec(note ?? "");
  return match ? { saveId: match[1]!, wasOnStandard: Boolean(match[2]) } : null;
}

export const undoNote = (saveId: string): string => `Undo Tips & limits save ${saveId}`;

/** What Undo does with one document of the save. */
export type Back =
  | { to: "version"; version: number; expectedVersion: number }
  | { to: "standard" }
  /** changed: published again after the save. first: there is no earlier version to go back to. */
  | { to: "nothing"; why: "changed" | "first" };

export type SavedDocument = { doc: TipsDoc; id: string; version: number; back: Back };
export type TipsSave = { saveId: string; at: string; by: string; documents: SavedDocument[] };

const historyOf = async (http: ConfigHttp, doc: TipsDoc, id: string): Promise<HistoryEntry[]> => {
  const scope = scopeOf(id);
  const query = "country" in scope ? `country=${encodeURIComponent(scope.country)}` : `zoneId=${encodeURIComponent(scope.zoneId)}`;
  // A scope the server cannot answer for (no such zone, or a server that does not take a country yet) has no save here.
  const page = await http.json<{ items?: HistoryEntry[] }>(`/admin/config/${doc}/history?${query}&limit=${HISTORY_LIMIT}`).catch(() => null);
  return [...(page?.items ?? [])].sort((a, b) => b.version - a.version);
};

/** The Standard first, then the zones; the rider documents before the Tips & limits ones. */
const inUndoOrder = (documents: SavedDocument[]): SavedDocument[] =>
  [...documents].sort((a, b) => TIPS_DOCS.indexOf(a.doc) - TIPS_DOCS.indexOf(b.doc) || Number(Boolean(countryOfStandard(b.id))) - Number(Boolean(countryOfStandard(a.id))) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * The newest Tips & limits save among `scopes` (a country's Standard and zones), with what Undo would do to each
 * document it published; null when no publish there carries a save id.
 */
export async function lastTipsSave(http: ConfigHttp, scopes: readonly string[]): Promise<TipsSave | null> {
  const read = await Promise.all(scopes.flatMap((id) => TIPS_DOCS.map(async (doc) => ({ doc, id, items: await historyOf(http, doc, id) }))));
  let newest: { saveId: string; at: string; by: string } | null = null;
  for (const { items } of read) {
    for (const entry of items) {
      const tag = parseSaveNote(entry.note);
      if (tag && (!newest || Date.parse(entry.publishedAt) > Date.parse(newest.at))) newest = { saveId: tag.saveId, at: entry.publishedAt, by: entry.publishedBy ?? "" };
    }
  }
  if (!newest) return null;
  const { saveId, by } = newest;
  const documents: SavedDocument[] = [];
  let at = newest.at;
  for (const { doc, id, items } of read) {
    const index = items.findIndex((entry) => parseSaveNote(entry.note)?.saveId === saveId);
    if (index < 0) continue;
    const entry = items[index]!;
    if (Date.parse(entry.publishedAt) < Date.parse(at)) at = entry.publishedAt;
    const tag = parseSaveNote(entry.note)!;
    const above = items.slice(0, index);
    const previous = items[index + 1];
    let back: Back;
    if (above.some((item) => !RESTAMP.test(item.note ?? ""))) back = { to: "nothing", why: "changed" };
    else if (tag.wasOnStandard) back = { to: "standard" };
    else if (previous) back = { to: "version", version: previous.version, expectedVersion: items[0]!.version };
    // The page was full: an earlier version may exist beyond it, so nothing is claimed.
    else back = { to: "nothing", why: items.length >= HISTORY_LIMIT ? "changed" : "first" };
    if (back.to !== "nothing") {
      // History keeps a zone's versions after it went back to the Standard: the draft says what is live now.
      const now = await readDraft(http, doc, id).catch(() => null);
      const live = back.to === "version" ? back.expectedVersion : entry.version;
      if (!now || now.usesStandard === true || now.liveVersion !== live) back = { to: "nothing", why: "changed" };
    }
    documents.push({ doc, id, version: entry.version, back });
  }
  return { saveId, at, by, documents: inUndoOrder(documents) };
}

export type UndoOutcome = { undone: SavedDocument[]; skipped: SavedDocument[] };

/**
 * Puts back every document of the save that can go back, in the order read (rider documents, then Tips & limits;
 * the Standard before the zones). A document the server says changed meanwhile (409) is skipped, the rest go on.
 */
export async function undoTipsSave(http: ConfigHttp, save: TipsSave): Promise<UndoOutcome> {
  const undone: SavedDocument[] = [];
  const skipped: SavedDocument[] = [];
  for (const item of save.documents) {
    if (item.back.to === "nothing") {
      skipped.push(item);
      continue;
    }
    try {
      if (item.back.to === "version") {
        await http.post(`/admin/config/${item.doc}/restore`, { ...scopeOf(item.id), version: item.back.version, expectedVersion: item.back.expectedVersion, note: undoNote(save.saveId) });
      } else {
        const now = await readDraft(http, item.doc, item.id);
        if (!now || now.usesStandard === true || now.liveVersion !== item.version) throw new SettingsChanged();
        await goBackToStandard(http, item.doc, item.id, now);
      }
      undone.push(item);
    } catch (error) {
      if (!(error instanceof SettingsChanged) && (error as { status?: number } | null)?.status !== 409) throw error;
      skipped.push({ ...item, back: { to: "nothing", why: "changed" } });
    }
  }
  return { undone, skipped };
}

/** "Standard Sweden" or "Stockholm City (Z001)". */
export function scopeName(id: string): string {
  const country = countryOfStandard(id);
  if (country) return tr("Standard {0}", [trx(COUNTRY_LABEL[country as MarketId] ?? country)]);
  const name = zoneById(id)?.name;
  return name ? `${name} (${id})` : id;
}

const docName = (doc: TipsDoc): string => (doc === "country_rules" ? tr("Tips & limits") : tr("Rider app tip rules"));

/** One line of the Undo dialog: the document, the version the save published and what Undo does with it. */
export function savedLine(item: SavedDocument): string {
  const head = [scopeName(item.id), docName(item.doc)];
  if (item.back.to === "version") return tr("{0} · {1}: version {2} → back to version {3}", [...head, item.version, item.back.version]);
  if (item.back.to === "standard") return tr("{0} · {1}: its own version {2} → back to the Standard", [...head, item.version]);
  if (item.back.why === "first") return tr("{0} · {1}: version {2} is its first version. Not touched.", [...head, item.version]);
  return tr("{0} · {1}: version {2} was changed after this save. Not touched.", [...head, item.version]);
}
