import { useEffect } from "react";
import { Link } from "react-router";
import { ShieldAlert } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { readMuted, tone } from "../dashboard/useAlertSignals";
import { useAlertsData } from "./AlertsContext";
import { inQuiet } from "./engine";
import { OpenRideCheck } from "./OpenRideCheck";
import { ago } from "./OpenView";
import { tr, trn, uiLocale, trx } from "../i18n";

const HEARD_KEY = "movera-admin-ridecheck-heard";

/** Ride check alerts this browser already played a sound for, so each new one sounds once. */
function heard(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(HEARD_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function remember(ids: Set<string>) {
  try {
    localStorage.setItem(HEARD_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Remembering is optional; at worst the sound plays again after a reload.
  }
}

/** The red banner under the top bar on every page, until an admin opens the alert. One short sound per new alert. */
export function RideCheckBanner() {
  const data = useAlertsData();
  const { agent } = useSession();
  const list = data.rideCheck.unopened;
  const hhmm = new Intl.DateTimeFormat(uiLocale(), { timeZone: data.market.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(data.now));
  const quiet = inQuiet(data.book.personal[agent?.id ?? ""]?.quiet, hhmm);
  const channels = data.book.settings.channels;
  const loud = list.filter((alert) => channels[alert.level].sound).map((alert) => alert.id).join(",");

  useEffect(() => {
    if (!loud || quiet) return;
    const known = heard();
    const fresh = loud.split(",").filter((id) => !known.has(id));
    if (!fresh.length) return;
    for (const id of fresh) known.add(id);
    remember(known);
    if (!readMuted()) tone(true, true);
  }, [loud, quiet]);

  if (!list.length) return null;
  const shown = list.slice(0, 3);
  return (
    <section className="rc-banner" aria-label={tr("Ride check alert")}>
      {shown.map((alert) => (
        <div key={alert.id} className="rc-banner-row">
          <span className="rc-banner-icon" aria-hidden="true"><ShieldAlert size={18} /></span>
          <span className="rc-banner-text">
            <b>{trx(alert.title)}</b>
            <small>{trx(alert.detail)} · {ago(alert.since, data.now)}</small>
          </span>
          <OpenRideCheck alert={alert} label={tr("Open ride check")} className="rc-banner-btn" />
        </div>
      ))}
      {list.length > shown.length ? <p className="rc-banner-more">{trn("{0} more ride check alert{1}. {2}", list.length - shown.length, list.length - shown.length === 1 ? "" : tr("s"), <Link to="/alerts">{tr("See all alerts")}</Link>)}</p> : null}
    </section>
  );
}
