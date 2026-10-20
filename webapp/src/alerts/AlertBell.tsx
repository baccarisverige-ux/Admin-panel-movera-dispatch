import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell, BellRing, Volume2, VolumeX } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { useAlertSignals, type Signal } from "../dashboard/useAlertSignals";
import { useAlertsData } from "./AlertsContext";
import { AlertActions, StatusLine } from "./AlertActions";
import { inQuiet, LEVELS } from "./engine";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

/** The bell in the top bar: how many alerts are open, the newest ones, and the one sound for the whole panel. */
export function AlertBell() {
  const data = useAlertsData();
  const { agent } = useSession();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const hhmm = new Intl.DateTimeFormat(uiLocale(), { timeZone: data.market.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.now));
  const quiet = inQuiet(data.book.personal[agent?.id ?? ""]?.quiet, hhmm);
  const channels = data.book.settings.channels;
  const signals: Signal[] = quiet ? [] : data.active
    .filter((alert) => channels[alert.level].sound || channels[alert.level].browser)
    // The ride check banner plays its own sound, so the bell stays quiet for those.
    .map((alert) => ({ id: alert.id, title: `${LEVELS.find((item) => item.id === alert.level)?.label}: ${alert.title}`, body: alert.detail, urgent: alert.level === "critical", sound: channels[alert.level].sound && alert.kind !== "ride_check", notify: channels[alert.level].browser }));
  const sound = useAlertSignals(signals, !data.loading);
  const total = data.active.length;
  const fresh = sound.fresh.length > 0;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="al-bell" ref={box}>
      <button data-command="admin.alerts.view" type="button" className={`al-bell-btn${data.counts.critical ? " critical" : ""}${fresh ? " ring" : ""}`} aria-label={tr("Alerts, {0} open", [total])} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => !value)}>
        {fresh ? <BellRing size={17} aria-hidden="true" /> : <Bell size={17} aria-hidden="true" />}
        {total ? <span className="al-badge">{total > 99 ? "99+" : total}</span> : null}
      </button>
      {open ? (
        <div className="al-pop" role="dialog" aria-label={tr("Newest alerts")}>
          <div className="al-pop-head">
            <b>{tr("Alerts")}</b>
            <span className="al-pop-counts">
              <i className="critical">{trn("{0} critical", data.counts.critical)}</i>
              <i className="important">{trn("{0} important", data.counts.important)}</i>
              <i className="info">{trn("{0} info", trx(data.counts.info))}</i>
            </span>
            <button data-command="admin.alerts.view" type="button" className="icon-ghost" aria-label={sound.muted ? tr("Turn alert sound on") : tr("Turn alert sound off")} title={quiet ? tr("Your quiet hours are on") : undefined} onClick={sound.toggleMute}>{sound.muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}</button>
          </div>
          {sound.permission === "default" ? <button data-command="admin.alerts.view" type="button" className="al-allow" onClick={() => void sound.askPermission()}>{tr("Allow browser notifications for Critical alerts")}</button> : null}
          {notice ? <p className="al-pop-notice" role="status">{trSentences(notice)}</p> : null}
          {total === 0 ? <p className="al-empty">{tr("Nothing needs you right now.")}</p> : (
            <ul className="al-pop-list">
              {data.active.slice(0, 7).map((alert) => (
                <li key={alert.id} className={`al-pop-item ${alert.level}`}>
                  <span className="al-dot" aria-hidden="true" />
                  <span className="al-pop-text">
                    <b>{trx(alert.title)}</b>
                    <StatusLine alert={alert} />
                  </span>
                  <AlertActions alert={alert} compact onDone={setNotice} />
                </li>
              ))}
            </ul>
          )}
          <Link className="al-pop-all" to="/alerts" onClick={() => setOpen(false)}>{trn("See all alerts{0}", total > 7 ? ` (${total})` : "")}</Link>
        </div>
      ) : null}
    </div>
  );
}
