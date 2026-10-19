import { Link } from "react-router";
import { useDashboardAccess } from "./access";
import { Crosshair, MessageSquare, Phone, Siren, Star, UserRound, X } from "lucide-react";
import { driverCode } from "../fleet/codes";
import { Avatar } from "../fleet/ui";
import { CommandButton } from "../ui/CommandButton";
import { LIVE_STATES, type LiveDriver } from "./live";
import type { LiveTrip } from "./liveTrip";
import { TripCard } from "./TripCard";

export type DriverInfo = {
  phone: string;
  account: string;
  rating: number;
  fleet: string | null;
  todayTrips: number;
  todayNet: string;
  onlineHours: number;
  acceptancePct: number;
  cancellationPct: number;
  /** Categories the driver is allowed to drive. */
  categories: string[];
};

type Props = {
  driver: LiveDriver;
  color: string;
  info: DriverInfo | null;
  trip: LiveTrip | null;
  locale: string;
  timeZone: string;
  routeShown: boolean;
  following: boolean;
  onToggleRoute: () => void;
  onToggleFollow: () => void;
  onWaybill: () => void;
  onClose: () => void;
  withScope: (path: string) => string;
};

/** Everything about a driver on the live map: who they are, what they are doing, and what to do next. */
export function DriverPanel({ driver, color, info, trip, locale, timeZone, routeShown, following, onToggleRoute, onToggleFollow, onWaybill, onClose, withScope }: Props) {
  const access = useDashboardAccess();
  const state = LIVE_STATES.find((item) => item.id === driver.state)?.label ?? driver.state;
  return (
    <aside className="driver-panel" role="dialog" aria-label={`Driver ${driver.name}`}>
      <div className="driver-panel-head">
        <Avatar name={driver.name} size={48} />
        <div className="driver-panel-title">
          <strong>{driver.name}</strong>
          <small className="map-popup-code">{driverCode(driver)}</small>
          <span className="map-popup-state"><i style={{ background: color }} />{state}{driver.lastSeenMin ? ` · last GPS ${driver.lastSeenMin} min ago` : " · live"}</span>
        </div>
        <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label="Close" onClick={onClose}><X size={14} /></button>
      </div>

      {driver.state === "sos" ? <p className="driver-panel-sos"><Siren size={15} aria-hidden="true" /> SOS raised on this trip. <Link to={withScope("/incidents")}>Open incidents</Link></p> : null}

      <div className="driver-panel-actions">
        {access.drivers ? <Link className="dash-btn small" to={withScope(`/drivers/${driver.id}`)}><UserRound size={14} aria-hidden="true" />Open driver</Link> : null}
        {info ? (
          <CommandButton
            command="admin.driver.call"
            className="dash-btn small ghost"
            type="button"
            targetId={driver.id}
            confirmTarget={false}
            scope={driver.zoneId}
            before="idle"
            after="call started"
            onDone={() => { window.location.href = `tel:${info.phone.replace(/[^+\d]/g, "")}`; }}
          >
            <Phone size={14} aria-hidden="true" />Call
          </CommandButton>
        ) : null}
        {access.drivers ? <Link className="dash-btn small ghost" to={`/drivers/${driver.id}?tab=messages`}><MessageSquare size={14} aria-hidden="true" />Message</Link> : null}
        <button type="button" data-command="admin.ui.mapLayer" className={following ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={following} onClick={onToggleFollow}>
          <Crosshair size={14} aria-hidden="true" />{following ? "Following live" : "Follow live"}
        </button>
      </div>

      <dl className="driver-panel-facts">
        <div><dt>Zone</dt><dd>{driver.zoneName}</dd></div>
        <div><dt>Vehicle</dt><dd>{driver.vehicle ?? "—"}{driver.plate ? ` · ${driver.plate}` : ""}</dd></div>
        {info ? (
          <>
            <div><dt>Rating</dt><dd><Star size={12} aria-hidden="true" /> {info.rating.toFixed(2)}</dd></div>
            <div><dt>Account</dt><dd>{info.account}</dd></div>
            <div><dt>Works for</dt><dd>{info.fleet ?? "Independent"}</dd></div>
            <div><dt>Acceptance · cancel</dt><dd>{info.acceptancePct}% · {info.cancellationPct}%</dd></div>
            <div><dt>Today</dt><dd>{info.todayTrips} trips · {info.todayNet}</dd></div>
            <div><dt>Online today</dt><dd>{info.onlineHours} h</dd></div>
            <div className="wide"><dt>Can drive</dt><dd className="cat-list">{info.categories.length ? info.categories.map((label) => <span key={label} className="cat-chip">{label}</span>) : "No category allowed"}</dd></div>
          </>
        ) : null}
      </dl>

      {trip ? (
        <TripCard
          trip={trip}
          locale={locale}
          timeZone={timeZone}
          routeShown={routeShown}
          onToggleRoute={onToggleRoute}
          onWaybill={onWaybill}
          tripLink={!access.trips ? null : withScope(trip.tripId.startsWith("T-") ? `/drivers/${driver.id}?tab=trips` : `/trips/${trip.tripId}`)}
        />
      ) : (
        <p className="trip-none">{driver.state === "free" ? "Free and waiting for a ride request." : driver.state === "stale" ? "No GPS signal right now. The last known position is shown." : "No trip right now."}</p>
      )}
    </aside>
  );
}
