import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { CalendarClock, Clock, CreditCard, FileText, Navigation, Printer, Route, User, X } from "lucide-react";
import type { LiveTrip, Waybill } from "./liveTrip";
import { tr, trn, uiLocale, trx } from "../i18n";

type Props = {
  trip: LiveTrip;
  locale: string;
  timeZone: string;
  routeShown?: boolean;
  onToggleRoute?: () => void;
  routeLink?: string;
  onWaybill: () => void;
  /** null when the viewer cannot open the trip. */
  tripLink: string | null;
};

/** The driver's current trip: phase, ETA, pickup and drop-off, rider, fare and the next pickup. */
export function TripCard({ trip, timeZone, routeShown, onToggleRoute, routeLink, onWaybill, tripLink }: Props) {
  const time = new Intl.DateTimeFormat(uiLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const toPickup = trip.phase === "to_pickup";
  return (
    <section className="trip-card" aria-label={tr("Current trip")}>
      <div className="trip-card-head">
        <span className={toPickup ? "trip-phase pickup" : "trip-phase onboard"}>{toPickup ? tr("Going to pickup {0}", [trip.rider]) : tr("Going to drop-off with {0}", [trip.rider])}</span>
        <span className="trip-eta">{trip.etaMin === null ? <>{tr("ETA")}: —</> : trn("{0}{1} min to {2}", <Clock size={14} aria-hidden="true" />, trip.etaMin, toPickup ? tr("pickup") : tr("drop-off"))}</span>
      </div>
      {trip.progressPct === null ? null : (
        <div className="trip-progress" role="progressbar" aria-label={toPickup ? tr("Way to pickup") : tr("Trip progress")} aria-valuenow={trip.progressPct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${trip.progressPct}%` }} />
        </div>
      )}
      <ol className="trip-stops">
        <li className="stop-a"><span aria-hidden="true">A</span><div><small>{tr("Pickup")}</small><strong>{trx(trip.pickup.label)}</strong></div></li>
        <li className="stop-b"><span aria-hidden="true">B</span><div><small>{tr("Drop-off")}</small><strong>{trx(trip.dropoff.label)}</strong></div></li>
      </ol>
      <dl className="trip-facts">
        <div><dt>{trn("{0}Rider", <User size={13} aria-hidden="true" />)}</dt><dd>{trip.riderId ? <Link to={`/riders/${trip.riderId}`}>{trip.rider}</Link> : trip.rider}</dd></div>
        <div><dt>{trn("{0}Category · distance", <Route size={13} aria-hidden="true" />)}</dt><dd>{trip.distanceKm === null ? <><span className="cat-chip ride">{trip.category}</span> —</> : trn("{0} {1} km", <span className="cat-chip ride">{trip.category}</span>, trip.distanceKm)}</dd></div>
        <div><dt>{trn("{0}Fare", <CreditCard size={13} aria-hidden="true" />)}</dt><dd>{trip.fare} · {trip.payment}</dd></div>
        <div><dt>{trn("{0}Started", <Clock size={13} aria-hidden="true" />)}</dt><dd>{time.format(trip.startedAtMs)} · {trip.tripId}</dd></div>
      </dl>
      {trip.next ? (
        <div className="trip-next">
          <CalendarClock size={16} aria-hidden="true" />
          <div>
            <small>{trn("Next pickup · {0}", trip.next.source)}</small>
            <strong>{time.format(trip.next.atMs)} · {trip.next.rider}</strong>
            <span>{trx(trip.next.stop.label)}</span>
          </div>
          {trip.next.link ? <Link className="link-action" to={trip.next.link}>{tr("Open")}</Link> : null}
        </div>
      ) : <p className="trip-none">{tr("No other pickup lined up after this ride.")}</p>}
      <div className="trip-actions">
        {onToggleRoute ? (
          <button type="button" data-command="admin.ui.mapLayer" className={routeShown ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={Boolean(routeShown)} onClick={onToggleRoute}>
            <Navigation size={14} aria-hidden="true" />{routeShown ? tr("Hide route") : tr("Show route")}
          </button>
        ) : null}
        {routeLink ? <Link className="dash-btn small ghost" to={routeLink}>{trn("{0}See route on map", <Navigation size={14} aria-hidden="true" />)}</Link> : null}
        <button type="button" data-command="admin.ui.quickAction" className="dash-btn small ghost" onClick={onWaybill}>{trn("{0}Waybill", <FileText size={14} aria-hidden="true" />)}</button>
        {tripLink ? <Link className="dash-btn small ghost" to={tripLink}>{tr("Open trip")}</Link> : null}
      </div>
    </section>
  );
}

/** Printable waybill for the current trip. */
export function WaybillDialog({ waybill, onClose }: { waybill: Waybill; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.focus();
    // On document, so it runs before the driver panel's window listener and only the waybill closes.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows: [string, string][] = [
    ["Waybill number", waybill.number],
    ["Issued", waybill.issuedAt],
    ["Operator", waybill.operator],
    ["Fleet", waybill.fleet ?? tr("Independent driver")],
    ["Driver", `${waybill.driver} · ${waybill.driverCode}`],
    ["Driver licence", waybill.licence],
    ["Vehicle", `${waybill.vehicle} · ${waybill.plate}`],
    ["Rider", waybill.passengers === null ? waybill.rider : `${waybill.rider} · ${waybill.passengers} passenger${waybill.passengers > 1 ? "s" : ""}`],
    ["Booked", tr("{0} via {1}", [waybill.bookedAt, trx(waybill.bookedVia)])],
    ["Pickup", `${waybill.pickup} · ${waybill.pickupAt}`],
    ["Drop-off", waybill.dropoff],
    ["Service", waybill.category],
    ["Distance", waybill.distance],
    ["Fare", waybill.fare],
    ["Payment", waybill.payment],
    ["Status", waybill.status],
  ];
  return (
    <div className="modal open waybill-modal" role="dialog" aria-modal="true" aria-label={tr("Waybill {0}", [waybill.number])} onClick={onClose}>
      <div className="waybill-card" ref={card} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="waybill-head">
          <div>
            <small>{tr("Waybill")}</small>
            <h3>{waybill.number}</h3>
          </div>
          <button type="button" data-command="admin.modal.close" className="map-popup-close" aria-label={tr("Close waybill")} onClick={onClose}><X size={14} /></button>
        </div>
        <dl className="waybill-rows">
          {rows.map(([label, value]) => <div key={label}><dt>{trx(label)}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="waybill-foot">
          <small>{tr("Demo record. A live system issues the waybill from the booking when the driver accepts.")}</small>
          <button type="button" data-command="admin.ui.quickAction" className="dash-btn small" onClick={() => window.print()}>{trn("{0}Print", <Printer size={14} aria-hidden="true" />)}</button>
        </div>
      </div>
    </div>
  );
}
