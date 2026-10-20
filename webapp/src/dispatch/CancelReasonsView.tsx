import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Languages, ListX, Plus, Trash2, UserX } from "lucide-react";
import type { Market } from "../markets/markets";
import { Card, Check, Choice } from "./fields";
import { CANCEL_GROUPS, CANCEL_SUBTITLE_MAX, CANCEL_TITLE_MAX, cancelReasonIssues, LANGS, type CancelGroupId, type CancelReason, type CancelReasonBook, type LangId } from "./offers";
import type { CountryDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";

type Props = {
  market: Market;
  country: CountryDispatch;
  onCountry: (next: CountryDispatch) => void;
  canEdit: boolean;
};

/** Q21: the cancel reasons the apps offer in one country, per language, with a "Doesn't count" flag. */
export function CancelReasonsView({ market, country, onCountry, canEdit }: Props) {
  const [lang, setLang] = useState<LangId>("en");
  const book = country.cancelReasons;
  const rtl = LANGS.find((item) => item.id === lang)?.rtl;
  const setBook = (next: CancelReasonBook) => onCountry({ ...country, cancelReasons: next });
  const setGroup = (id: CancelGroupId, list: CancelReason[]) => setBook({ ...book, groups: { ...book.groups, [id]: list } });
  const issues = cancelReasonIssues(book);
  const disabled = !canEdit;

  const row = (item: CancelReason, onItem: (next: CancelReason) => void, subtitles: boolean, tools: ReactNode, fixedLabel?: string) => (
    <li key={item.code} className={item.counts ? "dx-reason" : "dx-reason free"}>
      <span className="dx-reason-texts">
        <input className={lang === "en" && !item.title.en?.trim() ? "dx-text invalid" : "dx-text"} dir={rtl ? "rtl" : undefined} aria-label={tr("Reason text {0}", [item.code])} value={item.title[lang] ?? ""} placeholder={lang === "en" ? tr("Short reason") : item.title.en ?? ""} maxLength={CANCEL_TITLE_MAX + 20} disabled={disabled} onChange={(event) => onItem({ ...item, title: { ...item.title, [lang]: event.target.value } })} />
        {subtitles ? <input className="dx-text soft" dir={rtl ? "rtl" : undefined} aria-label={tr("Second line {0}", [item.code])} value={item.subtitle[lang] ?? ""} placeholder={lang === "en" ? tr("Second line (optional)") : item.subtitle.en ?? ""} maxLength={CANCEL_SUBTITLE_MAX + 20} disabled={disabled} onChange={(event) => onItem({ ...item, subtitle: { ...item.subtitle, [lang]: event.target.value } })} /> : null}
        <small><code>{item.code}</code>{fixedLabel ? ` · ${fixedLabel}` : ""}</small>
      </span>
      <span className="dx-reason-tools">
        <Check label={tr("Doesn't count")} on={!item.counts} disabled={disabled} onChange={(free) => onItem({ ...item, counts: !free })} />
        {tools}
      </span>
    </li>
  );

  return (
    <div className="dx-reasons-view">
      <section className="dash-card" aria-labelledby="dx-reasons-title">
        <div className="card-head">
          <h3 id="dx-reasons-title">{trn("{0} Cancel reasons in {1}", <ListX size={16} aria-hidden="true" />, trx(market.name))}</h3>
          <span className="dx-lang"><Languages size={14} aria-hidden="true" /><Choice label={tr("Language")} value={lang} onChange={setLang} options={LANGS.map((item) => ({ id: item.id, label: item.label }))} /></span>
        </div>
        <p className="dx-modal-help">{tr("What drivers and riders choose from when they cancel. Mark a reason “Doesn't count” and it never hurts the cancel rate or the late-cancel rule, for example a rider no-show, safety or a car problem. An empty language shows the English text.")}</p>
        {issues.length ? <ul className="dx-issues" role="alert">{issues.map((line) => <li key={line}><AlertTriangle size={13} aria-hidden="true" /> {line}</li>)}</ul> : null}
        {!canEdit ? <p className="dx-readonly" role="status">{tr("You can view the reasons. Only Super admin and Operations can change them.")}</p> : null}
      </section>

      <div className="dx-cards">
        {CANCEL_GROUPS.map((group) => {
          const list = book.groups[group.id];
          const move = (index: number, by: number) => {
            const next = [...list];
            const [item] = next.splice(index, 1);
            next.splice(index + by, 0, item);
            setGroup(group.id, next);
          };
          return (
            <Card key={group.id} title={trx(group.label)} tone={group.id === "rider" ? "pink" : group.id === "scheduled" ? "orange" : "blue"} icon={<UserX size={18} />} help={trx(group.help)}>
              <ul className="dx-reason-list" aria-label={tr("{0} reasons", [trx(group.label)])}>
                {group.id === "driverBeforeTrip" ? row(book.noShow, (noShow) => setBook({ ...book, noShow }), true, null, "after the no-show time, always offered") : null}
                {list.map((item, index) => row(item, (next) => setGroup(group.id, list.map((entry) => (entry.code === item.code ? next : entry))), group.subtitles, group.fixed ? null : (
                  <span>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} up", [item.title.en || item.code])} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} down", [item.title.en || item.code])} disabled={disabled || index === list.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Remove {0}", [item.title.en || item.code])} disabled={disabled || list.length === 1} onClick={() => setGroup(group.id, list.filter((entry) => entry.code !== item.code))}><Trash2 size={14} aria-hidden="true" /></button>
                  </span>
                )))}
              </ul>
              {group.fixed ? null : <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => setGroup(group.id, [...list, { code: `${group.id === "rider" ? "rider" : "driver"}_custom_${Date.now().toString(36)}`, title: {}, subtitle: {}, counts: true }])}>{trn("{0} Add a reason", <Plus size={13} aria-hidden="true" />)}</button>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
