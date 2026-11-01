import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BellRing, Megaphone, MoonStar, Pencil, RotateCcw, Send, ShieldCheck, Smartphone, WalletCards } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { DRIVER_TEXTS_KEY, SAMPLE_VALUES, emptyDriverTextBook, normalizeDriverTextBook, textOf, type DriverTextBook } from "../content/driverTexts";
import { Card, Check, Choice, Num, Row, Switch } from "../dispatch/fields";
import { DISPATCH_KEY, emptyDispatchBook, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { market as marketById, zoneById, type MarketId } from "../markets/markets";
import { citiesOf, PLACES } from "../zones/cities";
import { CommandButton } from "../ui/CommandButton";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import { AreaMap } from "./AreaMap";
import {
  BODY_MAX, DRIVER_NOTICES_KEY, NOTICE_GROUPS, NOTICE_KINDS, NOTICE_LANGS, SAMPLE, TITLE_MAX, deliveryLine, driverAppNotices, emptyDriverNoticeBook, fillNotice, isOnlineNow,
  limitOf, noticeChanges, noticeDef, noticeIssues, noticeText, normalizeDriverNoticeBook, promoToday, sendNotice, targetDrivers,
  type DriverNoticeBook, type NoticeArea, type NoticeKind, type NoticeLang, type NoticeLimits, type NoticeReach, type NoticeSetting,
} from "./driverNotices";
import { tr, trn, trx } from "../i18n";
import { PlaceholderChips } from "../ui/PlaceholderChips";

/** The island text each kind uses, from Content › Driver app texts. */
const ISLAND_KEY: Partial<Record<NoticeKind, string>> = {
  newScheduledRide: "island.newReservation",
  exclusiveOffer: "island.exclusiveRide",
  scheduledReminder: "island.pickupIn",
  leaveNow: "island.leaveNow",
  highDemand: "island.highDemand",
  documentExpiring: "island.documentExpires",
  documentApproved: "island.documentApproved",
  restOver: "island.restOver",
  scheduledPaused: "island.scheduledPaused",
};

type Draft = Pick<DriverNoticeBook, "kinds" | "limits">;

const localTime = (timeZone: string) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const localDay = (timeZone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Q31: Messages › Driver notifications. N1 ride alerts, N2 demand and events, N3 account and money, N4 limits. */
export function DriverNoticesView({ country, editable, onNotice }: { country: MarketId; editable: boolean; onNotice: (text: string) => void }) {
  const slice = useSlice<DriverNoticeBook>(DRIVER_NOTICES_KEY, emptyDriverNoticeBook());
  const book = useMemo(() => normalizeDriverNoticeBook(slice.value), [slice.value]);
  const textSlice = useSlice<DriverTextBook>(DRIVER_TEXTS_KEY, emptyDriverTextBook());
  const texts = useMemo(() => normalizeDriverTextBook(textSlice.value).texts, [textSlice.value]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<NoticeKind>("newScheduledRide");
  const [lang, setLang] = useState<NoticeLang>(country === "SE" ? "sv" : country === "FR" ? "fr" : "ar");
  const market = marketById(country);
  const current: Draft = draft ?? { kinds: book.kinds, limits: book.limits };
  const changes = noticeChanges(book, current);
  const issues = noticeIssues(current);
  useDirtyWarning(changes.length > 0);
  const limits = current.limits[country];
  const now = localTime(market.timeZone);
  const def = noticeDef(selected);
  const setting = current.kinds[selected];
  const own = noticeText(setting, selected, lang);
  // Page audit round 2: the default words and the sample values read in the admin's language.
  const shown = own.own ? own : { ...own, title: trx(own.title), body: trx(own.body) };
  const sample = Object.fromEntries(Object.entries(SAMPLE).map(([name, value]) => [name, trx(value)]));
  const rtl = lang === "ar";
  const islandKey = ISLAND_KEY[selected];
  const islandText = islandKey ? textOf(texts, lang, islandKey, { ...SAMPLE_VALUES, area: "City" }).text : fillNotice(shown.title, sample);
  const setKind = (kind: NoticeKind, patch: Partial<NoticeSetting>) => setDraft({ ...current, kinds: { ...current.kinds, [kind]: { ...current.kinds[kind], ...patch } } });
  const setText = (part: "title" | "body", value: string) => setKind(selected, { texts: { ...setting.texts, [lang]: { ...setting.texts[lang], [part]: value } } });
  const setLimits = (patch: Partial<NoticeLimits>) => setDraft({ ...current, limits: { ...current.limits, [country]: { ...limits, ...patch } } });

  return (
    <div className="gr-tab dn-page">
      <p className="dx-note dx-resv-tie"><BellRing size={13} aria-hidden="true" /> <span>{tr("What the driver app sends by itself, and what you send. Popups also reach drivers who are offline or have the app closed, when “Also offline” is on.")}</span></p>
      <div className="dn-layout">
        <div className="dn-main">
          {NOTICE_GROUPS.map((group) => (
            <Card key={group.id} title={`${group.code} ${trx(group.label)}`} tone={group.id === "rideAlerts" ? "blue" : group.id === "demand" ? "orange" : "green"} icon={group.id === "rideAlerts" ? <BellRing size={18} /> : group.id === "demand" ? <Megaphone size={18} /> : <WalletCards size={18} />} help={trx(group.help)}>
              <ul className="dn-kinds" aria-label={tr("{0} notifications", [trx(group.label)])}>
                {NOTICE_KINDS.filter((item) => item.group === group.id).map((item) => {
                  const kind = current.kinds[item.kind];
                  const text = noticeText(kind, item.kind, lang);
                  return (
                    <li key={item.kind} className={`${kind.on ? "on" : "off"}${item.kind === selected ? " picked" : ""}`} aria-label={trx(item.label)}>
                      <span className="dn-kind">
                        <b>{trx(item.label)}{limitOf(item.kind) === "always" ? <em className="dn-tag">{tr("Always goes through")}</em> : null}</b>
                        <small>{trx(item.when)} · {item.kind}</small>
                        <span className="dn-line" dir={rtl ? "rtl" : undefined}>{fillNotice(text.own ? text.title : trx(text.title), sample)} · {fillNotice(text.own ? text.body : trx(text.body), sample)}{text.own ? "" : tr(" (default)")}</span>
                      </span>
                      <span className="dn-tools">
                        <Switch label={trx(item.label)} on={kind.on} disabled={!editable} onChange={(on) => setKind(item.kind, { on })} />
                        <Check label={tr("Island")} on={kind.island} disabled={!editable || !kind.on} onChange={(island) => setKind(item.kind, { island })} />
                        <Check label={tr("Also offline")} on={kind.offline} disabled={!editable || !kind.on} onChange={(offline) => setKind(item.kind, { offline })} />
                        <button data-command="admin.campaigns.view" type="button" className={item.kind === selected ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={item.kind === selected} onClick={() => setSelected(item.kind)}><Pencil size={12} aria-hidden="true" />{" "}{tr("Text")}</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}

          <Card title={tr("N4 Limits · {0}", [market.name])} tone="purple" icon={<MoonStar size={18} />} help={tr("Too many messages make drivers turn them off.")}>
            <Row label={tr("Promo messages per driver per day")} help={tr("Demand and event messages.")} on={limits.promoPerDay.on} disabled={!editable} onToggle={(on) => setLimits({ promoPerDay: { ...limits.promoPerDay, on } })}>
              <Num label={tr("Promo messages per day")} value={limits.promoPerDay.max} unit="a day" min={1} max={10} disabled={!editable} onChange={(max) => setLimits({ promoPerDay: { ...limits.promoPerDay, max: Math.round(max) } })} />
            </Row>
            <Row label={tr("Quiet hours")} help={tr("Demand, event and account messages wait until quiet hours end.")} on={limits.quiet.on} disabled={!editable} onToggle={(on) => setLimits({ quiet: { ...limits.quiet, on } })}>
              <input className="dx-select" aria-label={tr("Driver quiet hours from")} type="time" value={limits.quiet.from} disabled={!editable} onChange={(event) => setLimits({ quiet: { ...limits.quiet, from: event.target.value } })} />
              <input className="dx-select" aria-label={tr("Driver quiet hours to")} type="time" value={limits.quiet.to} disabled={!editable} onChange={(event) => setLimits({ quiet: { ...limits.quiet, to: event.target.value } })} />
            </Row>
            <p className="dx-note dx-resv-tie"><ShieldCheck size={13} aria-hidden="true" /> <span>{tr("Ride alerts and reminders always go through, also in quiet hours and over the limit.")}</span></p>
          </Card>

          <div className={changes.length ? "dx-publish has-changes" : "dx-publish"}>
            <span className="dx-publish-text">
              <b>{changes.length ? tr("{0} change{1} not saved", [changes.length, changes.length === 1 ? "" : "s"]) : tr("Everything is saved")}</b>
              <small>{issues[0] ?? tr("Applies to every driver. The limits are for this country.")}</small>
            </span>
            <span className="dx-publish-actions">
              <button data-command="admin.campaigns.view" type="button" className="dash-btn small ghost" disabled={!changes.length} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
              <CommandButton command="admin.driverNotices.save" className="dash-btn small" targetId="driver notifications" scope="all" confirmTarget={false} before="saved" after={`${changes.length} changes`} sliceKey={DRIVER_NOTICES_KEY} value={{ ...book, draftRev: book.draftRev + 1, kinds: current.kinds, limits: current.limits }} expectedSliceRev={book.draftRev} disabled={!editable || !changes.length || issues.length > 0} onDone={() => { setDraft(null); onNotice(tr("Driver notifications saved: {0} change{1}.", [changes.length, changes.length === 1 ? "" : "s"])); }}>{tr("Save notifications")}</CommandButton>
            </span>
            {changes.length ? <ul className="dt-changes" aria-label={tr("Notification changes not saved")}>{changes.slice(0, 6).map((line) => <li key={line}>{line}</li>)}{changes.length > 6 ? <li>{trn("and {0} more", changes.length - 6)}</li> : null}</ul> : null}
          </div>
        </div>

        <aside className="gr-phone dn-preview" aria-label={tr("Notification text")}>
          <h3><Smartphone size={15} aria-hidden="true" /> {trx(def.label)}</h3>
          <Choice<NoticeLang> label={tr("Notification language")} value={lang} onChange={setLang} options={NOTICE_LANGS} />
          <label className="gr-field dn-field"><span>{tr("Title")}</span><input aria-label={tr("Notification title")} dir={rtl ? "rtl" : undefined} placeholder={trx(def.title)} maxLength={TITLE_MAX + 20} value={setting.texts[lang]?.title ?? ""} disabled={!editable} onChange={(event) => setText("title", event.target.value)} /></label>
          <label className="gr-field dn-field"><span>{tr("Text")}</span><textarea aria-label={tr("Notification text")} dir={rtl ? "rtl" : undefined} rows={2} placeholder={trx(def.body)} value={setting.texts[lang]?.body ?? ""} disabled={!editable} onChange={(event) => setText("body", event.target.value)} /></label>
          <PlaceholderChips text={`${setting.texts[lang]?.title || def.title} ${setting.texts[lang]?.body || def.body}`} />
          <p className="gr-help">{tr("Empty means the app's default.")}</p>
          {shown.own ? <button data-command="admin.campaigns.view" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => setKind(selected, { texts: { ...setting.texts, [lang]: {} } })}><RotateCcw size={12} aria-hidden="true" />{" "}{tr("Use the default")}</button> : null}
          <div className={setting.on ? "dn-phone" : "dn-phone off"} dir={rtl ? "rtl" : undefined}>
            <span className="dn-clock">{now}</span>
            {setting.island && setting.on ? <p className="dt-island" data-testid="notice-island">{islandText}</p> : null}
            <div className="dn-push" data-testid="notice-preview">
              <small>{tr("Movera Driver · now")}</small>
              <b>{fillNotice(shown.title, sample)}</b>
              <span>{fillNotice(shown.body, sample)}</span>
              {def.action ? <i>{trx(def.action)}</i> : null}
            </div>
            {!setting.on ? <p className="dn-off">{tr("Off: drivers do not get it.")}</p> : null}
          </div>
          <p className="gr-help">{setting.on ? deliveryLine(selected, limits, now) : tr("Turned off.")}{islandKey ? <>{" "}{trn("The island text is in {0}.", <Link to="/content?view=driver-texts">{tr("Driver app texts")}</Link>)}</> : null}</p>
        </aside>
      </div>

      <SendCard book={book} country={country} editable={editable} onNotice={onNotice} />

      <details className="dt-file">
        <summary>{tr("What the driver app gets")}</summary>
        <pre>{JSON.stringify(driverAppNotices(book, country), null, 2)}</pre>
      </details>
    </div>
  );
}

type AreaPick = "zone" | "map" | string;

/** N2: send a demand or event message to a zone or area, a driver group, online or offline drivers. */
function SendCard({ book, country, editable, onNotice }: { book: DriverNoticeBook; country: MarketId; editable: boolean; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  const drivers = useRecords("drivers");
  const dispatch = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const groups = useMemo(() => normalizeDispatchBook(dispatch.value).groups.filter((group) => group.country === country), [dispatch.value, country]);
  const market = marketById(country);
  const cityIds = new Set(citiesOf(country).map((city) => city.id));
  const places = PLACES.filter((place) => cityIds.has(place.city));
  const [kind, setKind] = useState<"highDemand" | "event">("highDemand");
  const [zoneId, setZoneId] = useState(market.zones[0]?.id ?? "");
  const [areaPick, setAreaPick] = useState<AreaPick>("zone");
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [radiusKm, setRadiusKm] = useState(2);
  const [groupId, setGroupId] = useState("");
  const [reach, setReach] = useState<NoticeReach>("all");
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const zone = zoneById(zoneId);
  const place = places.find((item) => item.name === areaPick);
  const area: NoticeArea = areaPick === "map" && picked
    ? { name: "Picked on the map", center: picked, radiusKm }
    : place ? { name: place.name.split(",")[0], center: [place.lat, place.lng], radiusKm } : { name: zone?.name ?? zoneId, center: zone?.center ?? market.center, radiusKm };
  const template = noticeText(book.kinds[kind], kind, "en");
  const values = { ...SAMPLE, area: area.name, time: "18:00–22:30" };
  const titleText = title ?? fillNotice(template.title, values);
  const bodyText = body ?? fillNotice(template.body, values);
  const group = groups.find((item) => item.id === groupId) ?? null;
  const targets = targetDrivers(drivers.data ?? [], { zoneId, groupDriverIds: group ? group.driverIds : null, reach });
  const online = targets.filter((row) => isOnlineNow(row.id)).length;
  const limits = book.limits[country];
  const day = localDay(market.timeZone);
  const time = localTime(market.timeZone);
  const overLimit = limits.promoPerDay.on ? targets.filter((row) => promoToday(book, row.id, day) >= limits.promoPerDay.max).length : 0;
  const result = sendNotice(book, { kind, country, zoneId, area, groupId: group?.id ?? null, reach, title: titleText, body: bodyText, driverIds: targets.map((row) => row.id) }, agent?.id ?? "", new Date().toISOString(), time);
  const sent = book.sent.filter((item) => item.country === country);
  const reset = () => { setTitle(null); setBody(null); };

  return (
    <>
      <Card title={tr("Send a demand or event message")} tone="orange" icon={<Megaphone size={18} />} help={tr("Pick the zone or an area, a driver group and online or offline drivers. The driver sees the area on a map.")}>
        <div className="dn-send">
          <div className="dn-send-form">
            <Row label={tr("Message")}>
              <Choice<"highDemand" | "event"> label={tr("Message kind")} value={kind} onChange={(next) => { setKind(next); reset(); }} options={[{ id: "highDemand", label: "High demand" }, { id: "event", label: "Event" }]} />
            </Row>
            <Row label={tr("Zone")}>
              <select className="dx-select" aria-label={tr("Zone for the message")} value={zoneId} onChange={(event) => { setZoneId(event.target.value); setAreaPick("zone"); reset(); }}>
                {market.zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Row>
            <Row label={tr("Area")} help={tr("Or click the map to put the area there.")}>
              <select className="dx-select" aria-label={tr("Area")} value={areaPick} onChange={(event) => { setAreaPick(event.target.value); reset(); }}>
                <option value="zone">{tr("Whole zone")}</option>
                {places.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                {picked ? <option value="map">{tr("Picked on the map")}</option> : null}
              </select>
              <Num label={tr("Area size")} value={radiusKm} unit="km" min={0.5} max={30} step={0.5} onChange={setRadiusKm} />
            </Row>
            <Row label={tr("Driver group")}>
              <select className="dx-select" aria-label={tr("Driver group")} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">{tr("All drivers in the zone")}</option>
                {groups.map((item) => <option key={item.id} value={item.id}>{trn("{0} · {1} drivers", trx(item.name), item.driverIds.length)}</option>)}
              </select>
            </Row>
            <Row label={tr("Drivers")}>
              <Choice<NoticeReach> label={tr("Which drivers")} value={reach} onChange={setReach} options={[{ id: "all", label: "Everyone" }, { id: "online", label: "Online now" }, { id: "offline", label: "Offline" }]} />
            </Row>
            <label className="gr-field dn-field"><span>{tr("Title")}</span><input aria-label={tr("Message title")} value={titleText} maxLength={TITLE_MAX + 20} disabled={!editable} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="gr-field dn-field"><span>{tr("Text")}</span><textarea aria-label={tr("Message text")} rows={2} value={bodyText} maxLength={BODY_MAX + 40} disabled={!editable} onChange={(event) => setBody(event.target.value)} /></label>
            <p className="dn-reach" role="status" data-testid="notice-reach">{trn("Reaches {0} driver{1}: {2} online, {3} offline.{4}{5} {6}", targets.length, targets.length === 1 ? "" : "s", online, targets.length - online, overLimit ? tr(" {0} already got {1} promo messages today and are left out.", [overLimit, limits.promoPerDay.max]) : "", !book.kinds[kind].offline && targets.length - online ? tr(" {0} does not reach offline drivers.", [noticeDef(kind).label]) : "", deliveryLine(kind, limits, time))}</p>
            {result.error ? <p className="dx-issues" role="alert">{trx(result.error)}</p> : null}
            <div className="dx-modal-actions">
              <CommandButton command="admin.driverNotices.send" className="dash-btn small" targetId={`${kind} ${zoneId}`} scope={zoneId} confirmTarget={false} before="" after={`${result.sent?.driverIds.length ?? 0} drivers`} sliceKey={DRIVER_NOTICES_KEY} value={result.book} expectedSliceRev={book.draftRev} disabled={!editable || Boolean(result.error)} title={result.error} onDone={() => { onNotice(tr("Sent “{0}” to {1} drivers{2}.", [titleText, result.sent?.driverIds.length ?? 0, result.sent?.sendsAt ? `. It goes out at ${result.sent.sendsAt}` : ""])); reset(); }}>
                <Send size={13} aria-hidden="true" />{" "}{trn("Send to {0} drivers", result.sent?.driverIds.length ?? 0)}</CommandButton>
            </div>
          </div>
          <div className="dn-send-side">
            <AreaMap center={area.center} radiusKm={radiusKm} label={tr("Area: {0}, {1} km", [area.name, radiusKm])} onPick={(at) => { setPicked(at); setAreaPick("map"); reset(); }} />
            <div className="dn-push" data-testid="send-preview">
              <small>{trn("Movera Driver · {0}", area.name)}</small>
              <b>{titleText}</b>
              <span>{bodyText}</span>
            </div>
          </div>
        </div>
      </Card>
      <Card title={tr("Sent messages · {0}", [market.name])} tone="blue" icon={<Send size={18} />}>
        {sent.length ? (
          <ul className="sa-log" aria-label={tr("Sent driver messages")}>
            {sent.slice(0, 10).map((item) => <li key={item.id}><Send size={11} aria-hidden="true" />{" "}{trn("{0} · {1} · {2} · {3} · {4} drivers{5}{6} · {7}", item.at.slice(0, 16).replace("T", " "), item.title, zoneById(item.zoneId)?.name ?? item.zoneId, item.area.name, item.driverIds.length, item.skipped ? tr(" ({0} left out)", [item.skipped]) : "", item.sendsAt ? tr(" · goes out at {0}", [item.sendsAt]) : "", item.by)}</li>)}
          </ul>
        ) : <p className="dx-calm">{tr("Nothing sent yet.")}</p>}
      </Card>
    </>
  );
}
