import { MessagesSquare, Plus, Trash2 } from "lucide-react";
import {
  CHAT_FIELDS,
  CHAT_LANGS,
  CHAT_RANGES,
  QUICK_REPLIES_MAX,
  QUICK_REPLY_TEXT_MAX,
  AUTO_ARRIVED_TEXT_MAX,
  chatAutoOpenText,
  newQuickReply,
  type ChatLang,
  type ChatSettings,
  type ChatSide,
  type ChatText,
} from "../config/chatSettings";
import { NumberField } from "./NumberField";
import { tr, trn } from "../i18n";

/**
 * v0.18.56 §78 (G9 part 2, owner Q79–Q85 2026-11-10, rule 16): Admin › Pricing › Tips & limits per country › Chat
 * (CountryRules.chat). Saved with Save tips & limits like Calls; the apps get it through GET /trips/{tripId}/messages/options.
 */
const LANG_LABEL: Record<ChatLang, string> = { sv: "Svenska", fr: "Français", en: "English" };

type Props = { shown: ChatSettings; saved: ChatSettings; canEdit: boolean; onChange: (chat: ChatSettings) => void };

function Toggle({ label, testId, on, disabled, onChange }: { label: string; testId: string; on: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mini-switch">
      <input type="checkbox" aria-label={label} data-testid={testId} checked={on} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true"><i /></span>
      {label}: {on ? tr("On") : tr("Off")}
    </label>
  );
}

function Texts({ label, text, max, disabled, testId, onChange }: { label: string; text: ChatText; max: number; disabled: boolean; testId: string; onChange: (text: ChatText) => void }) {
  return (
    <div className="rd-form-grid" role="group" aria-label={label}>
      {CHAT_LANGS.map((lang) => (
        <label key={lang} className="field"><span>{LANG_LABEL[lang]}</span>
          <input aria-label={`${label} (${LANG_LABEL[lang]})`} data-testid={`${testId}-${lang}`} value={text[lang]} maxLength={max} disabled={disabled} onChange={(event) => onChange({ ...text, [lang]: event.target.value })} />
        </label>
      ))}
    </div>
  );
}

export function ChatSettingsCard({ shown, saved, canEdit, onChange }: Props) {
  const set = (patch: Partial<ChatSettings>) => onChange({ ...shown, ...patch });
  const setSide = (side: ChatSide, list: ChatSettings["quickReplies"][ChatSide]) => set({ quickReplies: { ...shown.quickReplies, [side]: list } });
  return (
    <div id="extras-chat" className="cx-anchor">
      <div className="fee-card" data-testid="chat-settings">
        <div>
          <strong>{trn("{0} Chat", <MessagesSquare size={14} aria-hidden="true" />)}</strong>
          <small>{tr("The trip chat between rider and driver in this country. Nobody sees a phone number. Messages of a trip with a safety case stay with the case.")}</small>
        </div>
        {CHAT_FIELDS.map((field) => (
          <label key={field.key} className="field"><span>{tr(field.label)}</span><NumberField label={tr(field.label)} value={shown[field.key]} step={1} min={CHAT_RANGES[field.key][0]} max={CHAT_RANGES[field.key][1]} disabled={!canEdit} changed={shown[field.key] !== saved[field.key]} onChange={(value) => set({ [field.key]: value })} /></label>
        ))}
        <Toggle label={tr("Sound on a new message")} testId="chat-sound" on={shown.sound} disabled={!canEdit} onChange={(sound) => set({ sound })} />
        <label className="check-row">{tr("Folded trip sheet opens by itself")}{" "}
          <select data-testid="chat-sheet-auto-open" value={shown.sheetAutoOpen} disabled={!canEdit} onChange={(event) => set({ sheetAutoOpen: event.target.value === "off" ? "off" : "new_message" })}>
            <option value="new_message">{chatAutoOpenText("new_message")}</option>
            <option value="off">{chatAutoOpenText("off")}</option>
          </select>
        </label>
        <Toggle label={tr("Read new messages aloud (driver, start value)")} testId="chat-read-aloud" on={shown.readAloudDefault} disabled={!canEdit} onChange={(readAloudDefault) => set({ readAloudDefault })} />
        <Toggle label={tr("Translate link under messages")} testId="chat-translation" on={shown.translation} disabled={!canEdit} onChange={(translation) => set({ translation })} />
        <small className="dx-note">{tr("The link translates into the reader's own app language, with \"See original\" under a translated message. Until a translation service is set on the server the apps show \"Translation coming soon\".")}</small>
        <Toggle label={tr("Quick replies")} testId="chat-quick-replies-on" on={shown.quickRepliesOn} disabled={!canEdit} onChange={(quickRepliesOn) => set({ quickRepliesOn })} />
        {(["driver", "rider"] as const).map((side) => {
          const list = shown.quickReplies[side];
          const title = side === "driver" ? tr("Quick replies the driver sees") : tr("Quick replies the rider sees");
          return (
            <section key={side} className="cx-list" aria-label={title} data-testid={`chat-quick-replies-${side}`}>
              <strong>{title}</strong>
              <small>{tr("Up to {0} replies, each 1 to {1} characters in every language. A tap sends it in the reader's language.", [QUICK_REPLIES_MAX, QUICK_REPLY_TEXT_MAX])}</small>
              <ol>
                {list.map((item, index) => (
                  <li key={index}>
                    <label className="field"><span>{tr("Id")}</span><input aria-label={tr("Quick reply {0} id", [index + 1])} value={item.id} disabled={!canEdit || !shown.quickRepliesOn} onChange={(event) => setSide(side, list.map((old, i) => (i === index ? { ...old, id: event.target.value.trim() } : old)))} /></label>
                    <Texts label={tr("Quick reply {0}", [index + 1])} testId={`chat-qr-${side}-${index}`} text={item.text} max={QUICK_REPLY_TEXT_MAX} disabled={!canEdit || !shown.quickRepliesOn} onChange={(text) => setSide(side, list.map((old, i) => (i === index ? { ...old, text } : old)))} />
                    <button type="button" data-command="admin.pricing.edit" className="dash-btn ghost small" aria-label={tr("Remove quick reply {0}", [index + 1])} disabled={!canEdit || !shown.quickRepliesOn} onClick={() => setSide(side, list.filter((_, i) => i !== index))}><Trash2 size={13} aria-hidden="true" /></button>
                  </li>
                ))}
              </ol>
              <button type="button" data-command="admin.pricing.edit" className="dash-btn small" data-testid={`chat-qr-add-${side}`} disabled={!canEdit || !shown.quickRepliesOn || list.length >= QUICK_REPLIES_MAX} onClick={() => setSide(side, [...list, newQuickReply(list)])}>{trn("{0} Add quick reply", <Plus size={13} aria-hidden="true" />)}</button>
            </section>
          );
        })}
        <Toggle label={tr("Automatic \"I've arrived\" message")} testId="chat-auto-arrived" on={shown.autoArrived.on} disabled={!canEdit} onChange={(on) => set({ autoArrived: { ...shown.autoArrived, on } })} />
        <small className="dx-note">{tr("When the driver arrives (tap or automatic), the rider gets this message once, in the rider's app language.")}</small>
        <Texts label={tr("\"I've arrived\" text")} testId="chat-auto-arrived-text" text={shown.autoArrived.text} max={AUTO_ARRIVED_TEXT_MAX} disabled={!canEdit || !shown.autoArrived.on} onChange={(text) => set({ autoArrived: { ...shown.autoArrived, text } })} />
      </div>
    </div>
  );
}
