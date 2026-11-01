import { useMemo, useState } from "react";
import { History, RotateCcw, Search, Smartphone, Type } from "lucide-react";
import { useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { Card, Check, Choice } from "../dispatch/fields";
import { CommandButton } from "../ui/CommandButton";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import {
  DRIVER_TEXTS_KEY, DRIVER_TEXT_KEYS, TEXT_AREAS, TEXT_GROUPS, TEXT_LANGS, SAMPLE_VALUES, driverAppTexts, emptyDriverTextBook, normalizeDriverTextBook, ownCount, saveTexts,
  textChanges, textIssue, textKey, textOf, valuesIn, type DriverTextBook, type TextArea, type TextGroup, type TextLang, type Texts,
} from "./driverTexts";
import { tr, trn, trx } from "../i18n";
import { PlaceholderChips } from "../ui/PlaceholderChips";

type AreaPick = TextArea | "all";

/**
 * Q30: Content › Driver app texts. Every island, offer and trip button text, per language, with a live preview.
 * Empty means the app's default.
 */
export function DriverTextsView({ editable, onNotice }: { editable: boolean; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  const slice = useSlice<DriverTextBook>(DRIVER_TEXTS_KEY, emptyDriverTextBook());
  const book = useMemo(() => normalizeDriverTextBook(slice.value), [slice.value]);
  const [draft, setDraft] = useState<Texts | null>(null);
  const [lang, setLang] = useState<TextLang>("sv");
  const [area, setArea] = useState<AreaPick>("island");
  const [query, setQuery] = useState("");
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [focus, setFocus] = useState("island.leaveNow");
  const texts = draft ?? book.texts;
  const changes = textChanges(book.texts, texts);
  const saved = saveTexts(book, texts, agent?.id ?? "", new Date().toISOString());
  useDirtyWarning(changes.length > 0);
  const rtl = lang === "ar";
  const langName = TEXT_LANGS.find((item) => item.id === lang)!.label;
  const needle = query.trim().toLowerCase();
  const shown = DRIVER_TEXT_KEYS.filter((key) => (area === "all" || key.area === area)
    && (!onlyOwn || Boolean(texts[lang][key.id]?.trim()))
    && (!needle || key.id.toLowerCase().includes(needle) || key.english.toLowerCase().includes(needle) || (texts[lang][key.id] ?? "").toLowerCase().includes(needle)));
  const groups = [...new Set(shown.map((key) => key.group))] as TextGroup[];
  const set = (id: string, value: string) => setDraft({ ...texts, [lang]: { ...texts[lang], [id]: value } });
  const show = (id: string) => textOf(texts, lang, id, SAMPLE_VALUES).text;
  const focused = textKey(focus);

  return (
    <div className="dt-layout">
      <div className="dt-main">
        <p className="dx-note dx-resv-tie"><Type size={13} aria-hidden="true" /> <span>{trn("Every text the driver app shows on the island, the offer cards and the main trip button. Empty means the app's default text. Values in braces, like {0}, are filled in by the app.", "{time}")}</span></p>
        <div className="dt-filters">
          <Choice<TextLang> label={tr("Text language")} value={lang} onChange={setLang} options={TEXT_LANGS.map((item) => ({ id: item.id, label: ownCount(texts, item.id) ? `${trx(item.label)} · ${ownCount(texts, item.id)}` : item.label }))} />
          <Choice<AreaPick> label={tr("Where in the app")} value={area} onChange={setArea} options={[...TEXT_AREAS.map((item) => ({ id: item.id as AreaPick, label: item.label, hint: item.help })), { id: "all", label: "All" }]} />
          <label className="gr-search dt-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find a text")} placeholder={tr("Find a text")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <Check label={tr("Only changed texts")} on={onlyOwn} onChange={setOnlyOwn} />
        </div>

        {groups.length ? groups.map((group) => (
          <Card key={group} title={`${trx(TEXT_GROUPS[group])} · ${langName}`} tone={group === "scheduled" ? "orange" : group === "cards" ? "purple" : group === "buttons" ? "green" : "blue"} icon={<Type size={18} />}>
            <ul className="dt-list" aria-label={tr("{0} texts", [TEXT_GROUPS[group]])}>
              {shown.filter((key) => key.group === group).map((key) => {
                const value = texts[lang][key.id] ?? "";
                const issue = textIssue(key, value);
                const max = TEXT_AREAS.find((item) => item.id === key.area)!.max;
                const values = valuesIn(key.english);
                return (
                  <li key={key.id} className={key.id === focus ? "focus" : undefined}>
                    <span className="dt-key"><b>{key.english}</b><small>{key.id}</small>{values.length ? <PlaceholderChips text={key.english} /> : null}</span>
                    <span className="dt-input">
                      <input
                        aria-label={tr("{0} in {1}", [key.english, langName])}
                        aria-invalid={issue ? true : undefined}
                        dir={rtl ? "rtl" : undefined}
                        placeholder={tr("Default: {0}", [key.english])}
                        value={value}
                        disabled={!editable}
                        onFocus={() => setFocus(key.id)}
                        onChange={(event) => { setFocus(key.id); set(key.id, event.target.value); }}
                      />
                      <small className={value.trim().length > max ? "over" : undefined}>{value.trim() ? `${value.trim().length}/${max}` : tr("Default")}</small>
                      {value ? <button data-command="admin.content.view" type="button" className="dash-btn small ghost" disabled={!editable} aria-label={tr("Use the default for {0}", [key.english])} title={tr("Use the app's default")} onClick={() => { setFocus(key.id); set(key.id, ""); }}><RotateCcw size={12} aria-hidden="true" /></button> : null}
                    </span>
                    {issue ? <p className="dt-issue" role="alert">{issue}</p> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        )) : <p className="dx-calm">{tr("No text matches.")}</p>}

        <div className={changes.length ? "dx-publish has-changes" : "dx-publish"}>
          <span className="dx-publish-text">
            <b>{changes.length ? tr("{0} change{1} not saved", [changes.length, changes.length === 1 ? "" : "s"]) : tr("Everything is saved")}</b>
            <small>{changes.length && saved.error ? saved.error : tr("The driver app gets the new texts the next time it opens.")}</small>
          </span>
          <span className="dx-publish-actions">
            <button data-command="admin.content.view" type="button" className="dash-btn small ghost" disabled={!changes.length} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
            <CommandButton command="admin.content.driverTexts" className="dash-btn small" targetId="driver app texts" scope="all" confirmTarget={false} before={`${changes.length} changes`} after="saved" sliceKey={DRIVER_TEXTS_KEY} value={saved.book} expectedSliceRev={book.draftRev} disabled={!editable || !changes.length || Boolean(saved.error)} title={saved.error} onDone={() => { setDraft(null); onNotice(tr("Driver app texts saved: {0} change{1}.", [changes.length, changes.length === 1 ? "" : "s"])); }}>{tr("Save texts")}</CommandButton>
          </span>
          {changes.length ? <ul className="dt-changes" aria-label={tr("Changes not saved")}>{changes.slice(0, 6).map((line) => <li key={line}>{line}</li>)}{changes.length > 6 ? <li>{trn("and {0} more", changes.length - 6)}</li> : null}</ul> : null}
        </div>

        {book.log.length ? (
          <Card title={tr("Text changes")} tone="blue" icon={<History size={18} />}>
            <ul className="sa-log" aria-label={tr("Driver app text changes")}>
              {book.log.slice(0, 8).map((item, index) => <li key={`${item.at}-${index}`}><History size={11} aria-hidden="true" /> {item.at.slice(0, 16).replace("T", " ")} · {item.line} · {item.by}</li>)}
            </ul>
          </Card>
        ) : null}
        <details className="dt-file">
          <summary>{tr("What the driver app gets")}</summary>
          <pre>{JSON.stringify(driverAppTexts(book), null, 2)}</pre>
        </details>
      </div>

      <aside className="gr-phone dt-preview" aria-label={tr("Driver app preview")}>
        <h3><Smartphone size={15} aria-hidden="true" />{" "}{trn("Live preview · {0}", langName)}</h3>
        <div className="dt-phone" dir={rtl ? "rtl" : undefined}>
          <span className="gr-phone-bar" />
          <p className={focused?.area === "island" ? "dt-island focus" : "dt-island"} data-testid="preview-island">{show(focused?.area === "island" ? focus : "island.online")}</p>
          <div className="dt-map" aria-hidden="true" />
          <div className={focused?.area === "offer" ? "dt-offer focus" : "dt-offer"} data-testid="preview-offer">
            <p className="dt-offer-head">{focused?.group === "scheduled" ? show("offer.reservationRequest") : show("island.exclusiveRide")}</p>
            <p className="dt-offer-price"><small>{show("offer.yourShare")}</small><b>126 kr</b></p>
            <p>{trn("{0} Sveavägen 44 · {1}", <small>{show("offer.pickup")}</small>, show("offer.kmAway"))}</p>
            <p>{trn("{0} Södermalm", <small>{show("offer.dropoff")}</small>)}</p>
            <p><small>{show("offer.tripLength")}</small></p>
            <span className="dt-offer-actions"><i>{show("offer.hide")}</i><b>{show("offer.accept")}</b></span>
            {focused?.area === "offer" && !["offer.reservationRequest", "offer.yourShare", "offer.pickup", "offer.dropoff", "offer.tripLength", "offer.hide", "offer.accept", "offer.kmAway"].includes(focus) ? <p className="dt-offer-extra"><b>{show(focus)}</b></p> : null}
          </div>
          <div className={focused?.area === "trip" ? "dt-trip focus" : "dt-trip"} data-testid="preview-trip">
            <small>{tr("Sveavägen 44")}</small>
            <b>{show(focused?.area === "trip" ? focus : "trip.arrived")}</b>
          </div>
        </div>
        <p className="gr-help">{tr("Tap a text to see it here. Sample values: 07:40, 15 min, 2.4 km.")}</p>
      </aside>
    </div>
  );
}
