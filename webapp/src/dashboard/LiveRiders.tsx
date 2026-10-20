import { useState } from "react";
import { Link } from "react-router";
import { Clock, MapPin, Radar, UserRound, Users } from "lucide-react";
import { driverCode } from "../fleet/codes";
import { CommandButton } from "../ui/CommandButton";
import { NearbyButton } from "../dispatch/AssignPanel";
import type { Candidate, RideRequest, RiderCounts } from "./riders";
import { tr, trn, trx } from "../i18n";

type AssignProps = {
  request: RideRequest;
  candidates: Candidate[];
  onDone: (message: string) => void;
};

/** Send a waiting ride to the nearest suitable driver (radar) or to a driver the admin picks. */
export function AssignControls({ request, candidates, onDone }: AssignProps) {
  const best = candidates.find((item) => item.categoryOk) ?? null;
  const [chosen, setChosen] = useState("");
  const pick = candidates.find((item) => item.driver.id === chosen) ?? best ?? candidates[0] ?? null;
  const offer = (target: Candidate | null, label: string, className: string, title: string) => (
    <CommandButton
      command="admin.trip.offer"
      className={className}
      type="button"
      targetId={request.tripId}
      confirmTarget={false}
      entityState="searching"
      scope={request.zoneId}
      collection="trips"
      before={request.status}
      after={target ? `offered to ${target.driver.id}` : "offered"}
      patch={target ? { driverId: target.driver.id, status: "offered" } : undefined}
      disabled={!target}
      title={target ? title : tr("No free driver nearby")}
      onDone={() => target && onDone(`${request.rider}'s ride offered to ${target.driver.name} (${driverCode(target.driver)}), about ${target.etaMin} min away.`)}
    >
      {trx(label)}
    </CommandButton>
  );
  return (
    <div className="assign">
      <NearbyButton tripId={request.tripId} rider={request.rider} className="dash-btn small" />
      {offer(best, "Driver radar", "dash-btn small", best ? `Offer to the nearest free driver who can drive ${request.categoryLabel}: ${best.driver.name}, ${best.km} km` : "")}
      <label className="assign-pick">
        <span className="sr-only">{trn("Choose a driver for {0}", request.rider)}</span>
        <select value={pick?.driver.id ?? ""} onChange={(event) => setChosen(event.target.value)} disabled={candidates.length === 0}>
          {candidates.length === 0 ? <option value="">{tr("No free driver nearby")}</option> : null}
          {candidates.slice(0, 10).map((item) => (
            <option key={item.driver.id} value={item.driver.id}>{trn("{0} · {1} km · {2} min{3}", item.driver.name, item.km, item.etaMin, item.categoryOk ? "" : tr(" · cannot drive {0}", [request.categoryLabel]))}</option>
          ))}
        </select>
      </label>
      {offer(pick, "Assign", "dash-btn small ghost", pick ? `Offer to ${pick.driver.name}` : "")}
    </div>
  );
}

type Props = {
  counts: RiderCounts;
  requests: RideRequest[];
  candidatesOf: (request: RideRequest) => Candidate[];
  onLocate: (tripId: string) => void;
  canAssign: boolean;
  onAssigned: (message: string) => void;
};

export function LiveRiders({ counts, requests, candidatesOf, onLocate, canAssign, onAssigned }: Props) {
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
                {canAssign ? <AssignControls request={request} candidates={candidates} onDone={onAssigned} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="fine-print">{trn("{0} Driver radar offers the ride to the nearest free driver who is allowed to drive the requested category.", <Radar size={12} aria-hidden="true" />)}</p>
    </section>
  );
}
