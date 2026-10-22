import { useState } from "react";
import { Link } from "react-router";
import { useDashboardAccess } from "./access";
import { Crosshair, MessageSquare, Phone, Siren, Star, UserRound, X } from "lucide-react";
import { driverCode } from "../fleet/codes";
import { Avatar } from "../fleet/ui";
import { CommandButton } from "../ui/CommandButton";
import { LIVE_STATES, type LiveDriver } from "./live";
import type { LiveTrip } from "./liveTrip";
import { TripCard } from "./TripCard";
import { TripMoneyTab } from "./TripMoneyTab";
import { lengthKm } from "./route";
import { useEscape } from "../ui/useEscape";
import { tr, trn, trx } from "../i18n";

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
  useEscape(onClose);
  const state = LIVE_STATES.find((item) => item.id === driver.state)?.label ?? driver.state;
  const [tab, setTab] = useState<"trip" | "money">("trip");
  const pickupKm = driver.route ? Math.round(lengthKm(driver.route.approach) * 10) / 10 : null;
  // The Money tab needs only the ride, so it shows on both maps even where the trip card has no details.
  const busy = driver.state === "trip" || driver.state === "pickup" || driver.state === "sos";
  const moneyTripId = trip?.tripId ?? (busy ? driver.tripId ?? `T-${driver.id}` : null);
  return (
    <aside className="driver-panel" role="dialog" aria-label={tr("Driver {0}", [driver.name])}>
      <div className="driver-panel-head">
        <Avatar name={driver.name} size={48} />
        <div className="driver-panel-title">
          <strong>{driver.name}</strong>
          <small className="map-popup-code">{driverCode(driver)}</small>
          <span className="map-popup-state"><i style={{ background: color }} />{state}{driver.lastSeenMin ? tr(" · last GPS {0} min ago", [driver.lastSeenMin]) : tr(" · live")}</span>
        </div>
        <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label={tr("Close")} onClick={onClose}><X size={14} /></button>
      </div>

      {driver.state === "sos" ? <p className="driver-panel-sos">{trn("{0} SOS raised on this trip. {1}", <Siren size={15} aria-hidden="true" />, <Link to={withScope("/incidents")}>{tr("Open incidents")}</Link>)}</p> : null}

      <div className="driver-panel-actions">
        {access.drivers ? <Link className="dash-btn small" to={withScope(`/drivers/${driver.id}`)}>{trn("{0}Open driver", <UserRound size={14} aria-hidden="true" />)}</Link> : null}
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
          >{trn("{0}Call", <Phone size={14} aria-hidden="true" />)}</CommandButton>
        ) : null}
        {access.drivers ? <Link className="dash-btn small ghost" to={`/drivers/${driver.id}?tab=messages`}>{trn("{0}Message", <MessageSquare size={14} aria-hidden="true" />)}</Link> : null}
        <button type="button" data-command="admin.ui.mapLayer" className={following ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={following} onClick={onToggleFollow}>
          <Crosshair size={14} aria-hidden="true" />{following ? tr("Following live") : tr("Follow live")}
        </button>
      </div>

      <dl className="driver-panel-facts">
        <div><dt>{tr("Zone")}</dt><dd>{driver.zoneName}</dd></div>
        <div><dt>{tr("Vehicle")}</dt><dd>{driver.vehicle ?? "—"}{driver.plate ? ` · ${driver.plate}` : ""}</dd></div>
        {info ? (
          <>
            <div><dt>{tr("Rating")}</dt><dd><Star size={12} aria-hidden="true" /> {info.rating.toFixed(2)}</dd></div>
            <div><dt>{tr("Account")}</dt><dd>{info.account}</dd></div>
            <div><dt>{tr("Works for")}</dt><dd>{info.fleet ?? tr("Independent")}</dd></div>
            <div><dt>{tr("Acceptance · cancel")}</dt><dd>{info.acceptancePct}% · {info.cancellationPct}%</dd></div>
            <div><dt>{tr("Today")}</dt><dd>{trn("{0} trips · {1}", info.todayTrips, info.todayNet)}</dd></div>
            <div><dt>{tr("Online today")}</dt><dd>{trn("{0} h", info.onlineHours)}</dd></div>
            <div className="wide"><dt>{tr("Can drive")}</dt><dd className="cat-list">{info.categories.length ? info.categories.map((label) => <span key={label} className="cat-chip">{trx(label)}</span>) : tr("No category allowed")}</dd></div>
          </>
        ) : null}
      </dl>

      {moneyTripId ? (
        <div className="driver-panel-tabs" role="tablist" aria-label={tr("Trip details")}>
          <button type="button" role="tab" data-command="admin.ui.mapLayer" aria-selected={tab === "trip"} className={tab === "trip" ? "active" : undefined} onClick={() => setTab("trip")}>{tr("Trip")}</button>
          <button type="button" role="tab" data-command="admin.ui.mapLayer" aria-selected={tab === "money"} className={tab === "money" ? "active" : undefined} onClick={() => setTab("money")} data-testid="driver-money-tab">{tr("Money")}</button>
        </div>
      ) : null}
      {moneyTripId && tab === "money" ? (
        <TripMoneyTab tripId={moneyTripId} zoneId={driver.zoneId} pickupKm={pickupKm} hasFleet={Boolean(info?.fleet)} />
      ) : trip ? (
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
        <p className="trip-none">{driver.state === "free" ? tr("Free and waiting for a ride request.") : driver.state === "stale" ? tr("No GPS signal right now. The last known position is shown.") : tr("No trip right now.")}</p>
      )}
    </aside>
  );
}
