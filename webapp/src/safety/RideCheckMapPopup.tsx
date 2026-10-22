import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Phone, ShieldAlert, X } from "lucide-react";
import { answerLabel, isAlert, outcomeOf, shiftOf, shifted, triggerLabel, type RideCheck } from "./rideCheck";
import { tr, trn, trx } from "../i18n";

/** How serious an open check looks on the map: a red answer or 112 is red, no answer or a plain reason is amber. */
export type RideCheckTone = "red" | "amber";

export type MapRideCheck = {
  check: RideCheck;
  driverId: string;
  tone: RideCheckTone;
  /** When the card opened in the apps, in demo time. */
  sinceMs: number;
};

/** Checks still going on for a driver on the map: the trip is live and nobody has said "I'm OK" yet. */
export function openRideChecks(checks: readonly RideCheck[], driverTrips: ReadonlyMap<string, string | null>, demoShift: number, dismissed: ReadonlySet<string>): MapRideCheck[] {
  const out: MapRideCheck[] = [];
  for (const check of checks) {
    if (dismissed.has(check.id)) continue;
    const outcome = outcomeOf(check);
    if (outcome === "ok") continue;
    // The driver is on the map with that trip; a demo check marked live follows its driver wherever the demo put them.
    if (!driverTrips.has(check.driverId)) continue;
    if (!check.live && driverTrips.get(check.driverId) !== check.tripId) continue;
    out.push({ check, driverId: check.driverId, tone: isAlert(check) || outcome === "call112" ? "red" : "amber", sinceMs: shifted(check.at, shiftOf(check, null, demoShift)) });
  }
  return out;
}

const KEY = "movera-admin-ride-check-dismissed";

/** Checks this admin hid on the map, kept in this browser only. */
export function useDismissedRideChecks(): [Set<string>, (id: string) => void] {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...dismissed]));
    } catch {
      // Private window or storage off: the list lives for this page only.
    }
  }, [dismissed]);
  return [dismissed, (id) => setDismissed((current) => new Set([...current, id]))];
}

/** "Long stop · Driver says: Car problem" — the trigger, then the latest answer. */
export function rideCheckLine(check: RideCheck): string {
  const trigger = trx(triggerLabel(check.trigger));
  const latest = [check.driver && { who: "driver" as const, answer: check.driver }, check.rider && { who: "rider" as const, answer: check.rider }]
    .filter((item): item is { who: "driver" | "rider"; answer: NonNullable<RideCheck["driver"]> } => Boolean(item))
    .sort((a, b) => b.answer.at.localeCompare(a.answer.at))[0];
  if (!latest) return `${trigger} · ${tr("No answer yet")}`;
  return `${trigger} · ${latest.who === "driver" ? tr("Driver says: {0}", [answerLabel("driver", latest.answer)]) : tr("Rider says: {0}", [answerLabel("rider", latest.answer)])}`;
}

function ago(sinceMs: number, now: number): string {
  const min = Math.max(0, Math.round((now - sinceMs) / 60_000));
  if (min < 1) return tr("just now");
  if (min < 60) return tr("{0} min ago", [min]);
  return tr("{0} h ago", [Math.round(min / 6) / 10]);
}

type Props = {
  item: MapRideCheck;
  now: number;
  driverName: string;
  driverPhone: string | null;
  /** Where "Open" goes: the trip, or the alerts list when the admin cannot see trips. */
  openTo: string;
  driverTo: string | null;
  onDismiss: () => void;
};

const tel = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

/** The small card pinned to a driver's car while a ride check is open. */
export function RideCheckMapPopup({ item, now, driverName, driverPhone, openTo, driverTo, onDismiss }: Props) {
  const { check, tone } = item;
  return (
    <div className={`ride-check-pin ${tone}`} data-testid={`ride-check-pin-${check.id}`}>
      <span className="ride-check-ring" aria-hidden="true" />
      <section className="ride-check-card" role="status" aria-label={tr("Ride check for {0}", [driverName])}>
        <header>
          <ShieldAlert size={14} aria-hidden="true" />
          <b>{tr("Ride check")}</b>
          <small>{ago(item.sinceMs, now)}</small>
          <button type="button" data-command="admin.ui.mapClose" className="ride-check-close" aria-label={tr("Dismiss")} onClick={onDismiss}><X size={12} /></button>
        </header>
        <p>{rideCheckLine(check)}</p>
        <small className="ride-check-who">{driverName} · {check.name}</small>
        <div className="ride-check-actions">
          <Link className="dash-btn small" to={openTo}>{tr("Open")}</Link>
          {driverPhone ? <a className="dash-btn small ghost" href={tel(driverPhone)}>{trn("{0}Call driver", <Phone size={12} aria-hidden="true" />)}</a> : driverTo ? <Link className="dash-btn small ghost" to={driverTo}>{tr("Driver")}</Link> : null}
          {check.phone ? <a className="dash-btn small ghost" href={tel(check.phone)}>{trn("{0}Call rider", <Phone size={12} aria-hidden="true" />)}</a> : null}
        </div>
      </section>
    </div>
  );
}
