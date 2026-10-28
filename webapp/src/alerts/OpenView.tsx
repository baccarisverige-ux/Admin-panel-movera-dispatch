import { useState } from "react";
import { AlertOctagon, AlertTriangle, BellOff, Clock, Hand, Info, MapPin, UserRound, X } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { useAlertsData } from "./AlertsContext";
import { AlertActions, agentName, StatusLine } from "./AlertActions";
import { ALERTS_KEY, GROUPS, kindDef, LEVELS, unmuteKind, type GroupId, type Level, type OpenAlert } from "./engine";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

export function ago(since: number, now: number): string {
  const min = Math.max(0, Math.round((now - since) / 60_000));
  if (min < 1) return tr("just now");
  if (min < 60) return tr("{0} min ago", [min]);
  const hours = Math.floor(min / 60);
  if (hours < 48) return tr("{0} h ago", [hours]);
  return tr("{0} days ago", [Math.floor(hours / 24)]);
}

export const LEVEL_ICON = { critical: AlertOctagon, important: AlertTriangle, info: Info } as const;

type Quick = "all" | Level | "mine" | "new";

export function OpenView() {
  const data = useAlertsData();
  const { agent } = useSession();
  const [quick, setQuick] = useState<Quick>("all");
  const [group, setGroup] = useState<GroupId | "all">("all");
  const [zone, setZone] = useState("all");
  const [state, setState] = useState<"open" | "snoozed" | "muted">("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const list = data.open.filter((alert) => {
    if (state === "open" && (alert.status === "snoozed" || alert.muted)) return false;
    if (state === "snoozed" && alert.status !== "snoozed") return false;
    if (state === "muted" && !alert.muted) return false;
    if (quick === "mine" && alert.owner !== agent?.id) return false;
    if (quick === "new" && alert.status !== "new") return false;
    if ((quick === "critical" || quick === "important" || quick === "info") && alert.level !== quick) return false;
    if (group !== "all" && alert.group !== group) return false;
    if (zone !== "all" && alert.zoneId !== zone) return false;
    return true;
  });
  const current = list.find((alert) => alert.id === selected) ?? null;
  const counters: { id: Quick; label: string; count: number }[] = [
    { id: "critical", label: tr("Critical"), count: data.counts.critical },
    { id: "important", label: tr("Important"), count: data.counts.important },
    { id: "info", label: tr("Info"), count: data.counts.info },
    { id: "mine", label: tr("Mine"), count: data.counts.mine },
    { id: "new", label: tr("Not taken"), count: data.counts.notTaken },
  ];
  const mutedKinds = Object.entries(data.book.mutes).filter(([, mute]) => Date.parse(mute.until) > data.now);

  return (
    <div className="al-open">
      <section className="al-counters" aria-label={tr("Alerts at a glance")}>
        {counters.map((item) => (
          <button data-command="admin.alerts.view" key={item.id} type="button" aria-pressed={quick === item.id} className={`al-counter ${item.id}${quick === item.id ? " on" : ""}`} onClick={() => setQuick(quick === item.id ? "all" : item.id)}>
            <b>{item.count}</b><span>{trx(item.label)}</span>
          </button>
        ))}
      </section>

      <div className="al-filters" role="group" aria-label={tr("Filter alerts")}>
        <select aria-label={tr("Kind")} value={group} onChange={(event) => setGroup(event.target.value as GroupId | "all")}>
          <option value="all">{tr("All kinds")}</option>
          {GROUPS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
        </select>
        <select aria-label={tr("Zone")} value={zone} onChange={(event) => setZone(event.target.value)}>
          <option value="all">{tr("All zones")}</option>
          {data.zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span className="dx-choice" role="radiogroup" aria-label={tr("Show")}>
          {([["open", "Open"], ["snoozed", "Snoozed"], ["muted", "Muted"]] as const).map(([id, label]) => (
            <label key={id} className={state === id ? "on" : undefined}><input type="radio" name="al-state" checked={state === id} onChange={() => setState(id)} />{trx(label)}</label>
          ))}
        </span>
        {quick !== "all" || group !== "all" || zone !== "all" ? <button data-command="admin.alerts.view" type="button" className="dash-btn small ghost" onClick={() => { setQuick("all"); setGroup("all"); setZone("all"); }}>{trn("{0} Clear filters", <X size={13} aria-hidden="true" />)}</button> : null}
      </div>

      {mutedKinds.length ? (
        <p className="al-muted-line">{trn("{0} Muted: {1}", <BellOff size={13} aria-hidden="true" />, mutedKinds.map(([kind, mute]) => (
          <span key={kind}>{trn("{0} until {1} by {2}{3}", trx(kindDef(kind as OpenAlert["kind"])?.label) ?? kind, new Date(mute.until).toTimeString().slice(0, 5), agentName(mute.by), <CommandButton command="admin.alerts.mute" className="link-action" targetId={kind} confirmTarget={false} scope="all" before="muted" after="on" expectedSliceRev={data.book.draftRev} sliceKey={ALERTS_KEY} value={unmuteKind(data.book, kind as OpenAlert["kind"])} onDone={() => setNotice(tr("Alerts of that kind show again."))}>{tr("Unmute")}</CommandButton>)}</span>
        )))}</p>
      ) : null}
      {notice ? <p className="pricing-notice" role="status">{trSentences(notice)}</p> : null}

      <div className={current ? "al-work has-detail" : "al-work"}>
        <ul className="al-list" aria-label={tr("Alerts")}>
          {list.length === 0 ? <li className="al-empty">{state === "open" ? tr("Nothing here. Good work.") : state === "snoozed" ? tr("No snoozed alert.") : tr("No muted alert.")}</li> : list.map((alert) => {
            const Icon = LEVEL_ICON[alert.level];
            return (
              <li key={alert.id} className={`al-row ${alert.level}${alert.id === selected ? " on" : ""}`}>
                <button data-command="admin.alerts.view" type="button" className="al-row-main" aria-pressed={alert.id === selected} onClick={() => setSelected(alert.id === selected ? null : alert.id)}>
                  <span className="al-level" aria-hidden="true"><Icon size={16} /></span>
                  <span className="al-row-text">
                    <b>{trx(alert.title)}</b>
                    <small>
                      <span className="al-tag">{trx(GROUPS.find((item) => item.id === alert.group)?.label)}</span>
                      {alert.detail ? <span>{trx(alert.detail)}</span> : null}
                      <span><Clock size={11} aria-hidden="true" /> {ago(alert.since, data.now)}</span>
                    </small>
                    <StatusLine alert={alert} />
                  </span>
                </button>
                <AlertActions alert={alert} compact onDone={setNotice} />
              </li>
            );
          })}
        </ul>
        {current ? <Detail alert={current} onClose={() => setSelected(null)} onNotice={setNotice} /> : null}
      </div>
    </div>
  );
}

function Detail({ alert, onClose, onNotice }: { alert: OpenAlert; onClose: () => void; onNotice: (text: string) => void }) {
  const data = useAlertsData();
  const def = kindDef(alert.kind);
  const level = LEVELS.find((item) => item.id === alert.level)!;
  const Icon = LEVEL_ICON[alert.level];
  const sosEvents = alert.incidentId ? data.safety.value.incidents[alert.incidentId]?.events ?? [] : [];
  const events = alert.incidentId
    ? sosEvents.map((event) => ({ at: event.at, by: event.actor, text: event.kind === "take" ? "Working on it" : event.kind === "resolve" ? `Solved: ${event.text}` : event.text }))
    : (alert.record?.events ?? []).map((event) => ({ at: event.at, by: event.by, text: event.kind === "take" ? "Working on it" : event.kind === "done" ? `Solved: ${event.text}` : event.text }));
  const time = (iso: string | number) => new Intl.DateTimeFormat(uiLocale(), { timeZone: data.market.timeZone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso));
  return (
    <aside className={`al-detail ${alert.level}`} aria-label={tr("Alert details")}>
      <header>
        <span className="al-level" aria-hidden="true"><Icon size={18} /></span>
        <span className="al-detail-title"><small>{trx(level.label)} · {trx(def?.label) ?? tr("Your rule")}</small><b>{trx(alert.title)}</b></span>
        <button data-command="admin.alerts.view" type="button" className="icon-ghost" aria-label={tr("Close details")} onClick={onClose}><X size={15} aria-hidden="true" /></button>
      </header>
      <dl className="al-facts">
        {alert.detail ? <div><dt>{tr("Details")}</dt><dd>{trx(alert.detail)}</dd></div> : null}
        <div><dt>{tr("Zone")}</dt><dd><MapPin size={12} aria-hidden="true" /> {data.zones.find((zone) => zone.id === alert.zoneId)?.name ?? tr("Whole country")}</dd></div>
        <div><dt>{tr("Started")}</dt><dd><Clock size={12} aria-hidden="true" /> {time(alert.since)} · {ago(alert.since, data.now)}</dd></div>
        <div><dt>{tr("Now")}</dt><dd><StatusLine alert={alert} /></dd></div>
      </dl>
      <h4>{tr("Timeline")}</h4>
      <ol className="al-timeline" aria-label={tr("Timeline")}>
        <li><span className="al-tl-dot start" /><span><b>{tr("Alert started")}</b><small>{time(alert.since)}</small></span></li>
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`}><span className="al-tl-dot" /><span><b><UserRound size={11} aria-hidden="true" /> {agentName(event.by)}: {event.text}</b><small>{time(event.at)}</small></span></li>
        ))}
        {!events.length ? <li className="al-tl-wait"><span className="al-tl-dot wait" /><span><b>{trn("{0} Waiting for someone to take it", <Hand size={11} aria-hidden="true" />)}</b></span></li> : null}
      </ol>
      <AlertActions alert={alert} onDone={onNotice} />
      {def?.help ? <p className="al-help">{trx(def.help)}</p> : null}
    </aside>
  );
}
