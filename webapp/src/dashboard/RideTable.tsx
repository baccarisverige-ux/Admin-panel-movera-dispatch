import { Link } from "react-router";
import { useDashboardAccess } from "./access";
import { AlertTriangle } from "lucide-react";
import { statusLabel } from "../domain/labels";
import type { ScheduledRide } from "./scheduled";
import { tr, trn } from "../i18n";

type Props = {
  rides: ScheduledRide[];
  now: number;
  upcoming: boolean;
  timeFormat: Intl.DateTimeFormat;
  dayFormat: Intl.DateTimeFormat;
  money: (minor: number) => string;
  withScope: (path: string) => string;
};

/** Scheduled rides, soonest first for upcoming and newest first for past. */
export function RideTable({ rides, now, upcoming, timeFormat, dayFormat, money, withScope }: Props) {
  const access = useDashboardAccess();
  return (
    <div className="table-scroll">
      <table className="ride-table">
        <thead><tr><th>{tr("Pickup")}</th><th>{tr("Rider")}</th><th>{tr("Zone")}</th><th>{tr("Category")}</th><th>{tr("Driver")}</th><th>{tr("Status")}</th><th className="num">{tr("Fare")}</th><th><span className="sr-only">{tr("Action")}</span></th></tr></thead>
        <tbody>
          {rides.slice(0, 8).map((ride) => {
            const minutes = Math.round((ride.pickupAt - now) / 60_000);
            const when = !upcoming
              ? dayFormat.format(ride.pickupAt)
              : minutes < 60 ? `in ${minutes} min` : minutes < 24 * 60 ? `in ${Math.floor(minutes / 60)} h ${minutes % 60} min` : dayFormat.format(ride.pickupAt);
            const open = !ride.driver && ride.pickupAt >= now && ride.status !== "cancelled" && ride.status !== "no_show";
            return (
              <tr key={ride.id} className={ride.warning ? `ride-${ride.warning}` : undefined}>
                <td><strong>{timeFormat.format(ride.pickupAt)}</strong><small>{when}</small></td>
                <td>{ride.rider}{ride.hasReturn ? <span className="chip">{tr("Return")}</span> : null}</td>
                <td>{ride.zoneName}</td>
                <td>{ride.category}</td>
                <td>{ride.driver ?? (ride.status === "cancelled" || ride.status === "no_show" ? "—" : <span className={ride.warning === "red" ? "no-driver red" : "no-driver"}>{trn("{0} Unassigned", <AlertTriangle size={13} aria-hidden="true" />)}</span>)}</td>
                <td><span className={`ride-status s-${ride.status}`}>{statusLabel(ride.status)}</span></td>
                <td className="num">{money(ride.fareMinor)}{ride.estimated ? <small>{" "}{tr("est.")}</small> : null}</td>
                <td>{access.trips ? <Link className="link-action" to={withScope(`/reservations/${ride.id}`)}>{open ? tr("Assign") : tr("Open")}</Link> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rides.length === 0 ? <p className="state-line">{upcoming ? tr("No scheduled rides in the next 7 days.") : tr("No past scheduled rides in this period.")}</p> : null}
    </div>
  );
}
