import { useState } from "react";
import { Link } from "react-router";
import { Clock, MapPin, Radar, UserRound, Users } from "lucide-react";
import { driverCode } from "../fleet/codes";
import { CommandButton } from "../ui/CommandButton";
import { NearbyButton } from "../dispatch/AssignPanel";
import type { Candidate, RideRequest, RiderCounts } from "./riders";

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
      title={target ? title : "No free driver nearby"}
      onDone={() => target && onDone(`${request.rider}'s ride offered to ${target.driver.name} (${driverCode(target.driver)}), about ${target.etaMin} min away.`)}
    >
      {label}
    </CommandButton>
  );
  return (
    <div className="assign">
      <NearbyButton tripId={request.tripId} rider={request.rider} className="dash-btn small" />
      {offer(best, "Driver radar", "dash-btn small", best ? `Offer to the nearest free driver who can drive ${request.categoryLabel}: ${best.driver.name}, ${best.km} km` : "")}
      <label className="assign-pick">
        <span className="sr-only">Choose a driver for {request.rider}</span>
        <select value={pick?.driver.id ?? ""} onChange={(event) => setChosen(event.target.value)} disabled={candidates.length === 0}>
          {candidates.length === 0 ? <option value="">No free driver nearby</option> : null}
          {candidates.slice(0, 10).map((item) => (
            <option key={item.driver.id} value={item.driver.id}>
              {item.driver.name} · {item.km} km · {item.etaMin} min{item.categoryOk ? "" : ` · cannot drive ${request.categoryLabel}`}
            </option>
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
        <h3 id="live-riders-title"><Users size={16} aria-hidden="true" /> Live riders</h3>
      </div>
      <div className="rider-counters">
        <span><strong>{counts.online}</strong> In the app now</span>
        <span><strong>{counts.onTrip}</strong> On a trip</span>
        <span><strong>{counts.beingPickedUp}</strong> Driver on the way</span>
        <span className={counts.waiting ? "warn" : undefined}><strong>{counts.waiting}</strong> Looking for a driver</span>
        <span className={counts.longWait ? "danger" : undefined}><strong>{counts.longWait}</strong> Waiting over 5 min</span>
      </div>
      {requests.length === 0 ? <p className="state-line">Nobody is waiting for a driver right now.</p> : (
        <ul className="request-list" aria-label="Riders looking for a driver">
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
                <span className={request.waitingMin > 5 ? "request-wait long" : "request-wait"}><Clock size={13} aria-hidden="true" />{request.waitingMin} min</span>
                <span className="request-status">{request.status === "offered" ? `Offered to ${request.offeredTo}` : nearest ? `Nearest: ${nearest.driver.name} · ${nearest.etaMin} min` : "No free driver nearby"}</span>
                <button type="button" data-command="admin.live.focus" className="fd-icon-btn" aria-label={`Show ${request.rider} on the map`} title="Show on the map" onClick={() => onLocate(request.tripId)}><MapPin size={15} aria-hidden="true" /></button>
                {canAssign ? <AssignControls request={request} candidates={candidates} onDone={onAssigned} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="fine-print"><Radar size={12} aria-hidden="true" /> Driver radar offers the ride to the nearest free driver who is allowed to drive the requested category.</p>
    </section>
  );
}
