import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { CalendarClock, Clock, CreditCard, FileText, Navigation, Printer, Route, User, X } from "lucide-react";
import type { LiveTrip, Waybill } from "./liveTrip";

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
export function TripCard({ trip, locale, timeZone, routeShown, onToggleRoute, routeLink, onWaybill, tripLink }: Props) {
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const toPickup = trip.phase === "to_pickup";
  return (
    <section className="trip-card" aria-label="Current trip">
      <div className="trip-card-head">
        <span className={toPickup ? "trip-phase pickup" : "trip-phase onboard"}>{toPickup ? `Going to pickup ${trip.rider}` : `Going to drop-off with ${trip.rider}`}</span>
        <span className="trip-eta"><Clock size={14} aria-hidden="true" />{trip.etaMin} min to {toPickup ? "pickup" : "drop-off"}</span>
      </div>
      <div className="trip-progress" role="progressbar" aria-label={toPickup ? "Way to pickup" : "Trip progress"} aria-valuenow={trip.progressPct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${trip.progressPct}%` }} />
      </div>
      <ol className="trip-stops">
        <li className="stop-a"><span aria-hidden="true">A</span><div><small>Pickup</small><strong>{trip.pickup.label}</strong></div></li>
        <li className="stop-b"><span aria-hidden="true">B</span><div><small>Drop-off</small><strong>{trip.dropoff.label}</strong></div></li>
      </ol>
      <dl className="trip-facts">
        <div><dt><User size={13} aria-hidden="true" />Rider</dt><dd>{trip.riderId ? <Link to={`/riders/${trip.riderId}`}>{trip.rider}</Link> : trip.rider}</dd></div>
        <div><dt><Route size={13} aria-hidden="true" />Category · distance</dt><dd><span className="cat-chip ride">{trip.category}</span> {trip.distanceKm} km</dd></div>
        <div><dt><CreditCard size={13} aria-hidden="true" />Fare</dt><dd>{trip.fare} · {trip.payment}</dd></div>
        <div><dt><Clock size={13} aria-hidden="true" />Started</dt><dd>{time.format(trip.startedAtMs)} · {trip.tripId}</dd></div>
      </dl>
      {trip.next ? (
        <div className="trip-next">
          <CalendarClock size={16} aria-hidden="true" />
          <div>
            <small>Next pickup · {trip.next.source}</small>
            <strong>{time.format(trip.next.atMs)} · {trip.next.rider}</strong>
            <span>{trip.next.stop.label}</span>
          </div>
          {trip.next.link ? <Link className="link-action" to={trip.next.link}>Open</Link> : null}
        </div>
      ) : <p className="trip-none">No other pickup lined up after this ride.</p>}
      <div className="trip-actions">
        {onToggleRoute ? (
          <button type="button" data-command="admin.ui.mapLayer" className={routeShown ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={Boolean(routeShown)} onClick={onToggleRoute}>
            <Navigation size={14} aria-hidden="true" />{routeShown ? "Hide route" : "Show route"}
          </button>
        ) : null}
        {routeLink ? <Link className="dash-btn small ghost" to={routeLink}><Navigation size={14} aria-hidden="true" />See route on map</Link> : null}
        <button type="button" data-command="admin.ui.quickAction" className="dash-btn small ghost" onClick={onWaybill}><FileText size={14} aria-hidden="true" />Waybill</button>
        {tripLink ? <Link className="dash-btn small ghost" to={tripLink}>Open trip</Link> : null}
      </div>
    </section>
  );
}

/** Printable waybill for the current trip. */
export function WaybillDialog({ waybill, onClose }: { waybill: Waybill; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows: [string, string][] = [
    ["Waybill number", waybill.number],
    ["Issued", waybill.issuedAt],
    ["Operator", waybill.operator],
    ["Fleet", waybill.fleet ?? "Independent driver"],
    ["Driver", `${waybill.driver} · ${waybill.driverCode}`],
    ["Driver licence", waybill.licence],
    ["Vehicle", `${waybill.vehicle} · ${waybill.plate}`],
    ["Rider", `${waybill.rider} · ${waybill.passengers} passenger${waybill.passengers > 1 ? "s" : ""}`],
    ["Booked", `${waybill.bookedAt} via ${waybill.bookedVia}`],
    ["Pickup", `${waybill.pickup} · ${waybill.pickupAt}`],
    ["Drop-off", waybill.dropoff],
    ["Service", waybill.category],
    ["Distance", waybill.distance],
    ["Fare", waybill.fare],
    ["Payment", waybill.payment],
    ["Status", waybill.status],
  ];
  return (
    <div className="modal open waybill-modal" role="dialog" aria-modal="true" aria-label={`Waybill ${waybill.number}`} onClick={onClose}>
      <div className="waybill-card" ref={card} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <div className="waybill-head">
          <div>
            <small>Waybill</small>
            <h3>{waybill.number}</h3>
          </div>
          <button type="button" data-command="admin.modal.close" className="map-popup-close" aria-label="Close waybill" onClick={onClose}><X size={14} /></button>
        </div>
        <dl className="waybill-rows">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <div className="waybill-foot">
          <small>Demo record. A live system issues the waybill from the booking when the driver accepts.</small>
          <button type="button" data-command="admin.ui.quickAction" className="dash-btn small" onClick={() => window.print()}><Printer size={14} aria-hidden="true" />Print</button>
        </div>
      </div>
    </div>
  );
}
