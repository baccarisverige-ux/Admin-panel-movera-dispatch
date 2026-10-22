import { Link } from "react-router";
import { Clock, MapPin, Radar, UserRound, Users } from "lucide-react";
import { RiderRowActions } from "../dispatch/HandlePanel";
import { OnTheWayGroup } from "../dispatch/RideProgress";
import type { Candidate, OnTheWay, RideRequest, RiderCounts } from "./riders";
import { tr, trn } from "../i18n";

type Props = {
  counts: RiderCounts;
  requests: RideRequest[];
  candidatesOf: (request: RideRequest) => Candidate[];
  onLocate: (tripId: string) => void;
  canAssign: boolean;
  onAssigned: (message: string) => void;
  /** Rides a driver just accepted, shown apart under the waiting riders. */
  onTheWay?: readonly OnTheWay[];
};

export function LiveRiders({ counts, requests, candidatesOf, onLocate, canAssign, onAssigned, onTheWay = [] }: Props) {
  return (
    <section className="dash-card live-riders" aria-labelledby="live-riders-title">
      <div className="card-head">
        <h3 id="live-riders-title">{trn("{0} Live riders", <Users size={16} aria-hidden="true" />)}</h3>
      </div>
      <div className="rider-counters">
        <span>{trn("{0} In the app now", <strong>{counts.online}</strong>)}</span>
        <span>{trn("{0} On a trip", <strong>{counts.onTrip}</strong>)}</span>
        <span>{trn("{0} Driver on the way", <strong>{counts.beingPickedUp}</strong>)}</span>
        <span className={counts.waiting ? "warn" : undefined}>{trn("{0} Looking for a driver", <strong>{counts.waiting}</strong>)}</span>
        <span className={counts.longWait ? "danger" : undefined}>{trn("{0} Waiting over 5 min", <strong>{counts.longWait}</strong>)}</span>
      </div>
      {requests.length === 0 ? <p className="state-line">{tr("Nobody is waiting for a driver right now.")}</p> : (
        <ul className="request-list" aria-label={tr("Riders looking for a driver")}>
          {requests.slice(0, 8).map((request) => {
            const candidates = candidatesOf(request);
            const nearest = candidates[0];
            return (
              <li key={request.tripId} className={request.waitingMin > 5 ? "long" : undefined}>
                <div className="request-who">
                  <UserRound size={16} aria-hidden="true" />
                  <div>
                    {request.riderId ? <Link to={`/riders/${request.riderId}`}><strong>{request.rider}</strong></Link> : <strong>{request.rider}</strong>}
                    <small>{request.tripId} · {request.zoneName}</small>
                  </div>
                </div>
                <span className="fd-chip">{request.categoryLabel}</span>
                <span className={request.waitingMin > 5 ? "request-wait long" : "request-wait"}>{trn("{0}{1} min", <Clock size={13} aria-hidden="true" />, request.waitingMin)}</span>
                <span className="request-status">{request.status === "offered" ? tr("Offered to {0}", [request.offeredTo]) : nearest ? tr("Nearest: {0} · {1} min", [nearest.driver.name, nearest.etaMin]) : tr("No free driver nearby")}</span>
                <button type="button" data-command="admin.live.focus" className="fd-icon-btn" aria-label={tr("Show {0} on the map", [request.rider])} title={tr("Show on the map")} onClick={() => onLocate(request.tripId)}><MapPin size={15} aria-hidden="true" /></button>
                {canAssign ? <RiderRowActions request={request} candidates={candidates} onNotice={onAssigned} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      <OnTheWayGroup items={onTheWay} onLocate={onLocate} />
      <p className="fine-print">{trn("{0} Exclusive to nearest offers the ride to the nearest free driver who is allowed to drive the requested category. Handle opens Exclusive and Radar, the same panel as in Dispatch.", <Radar size={12} aria-hidden="true" />)}</p>
    </section>
  );
}
