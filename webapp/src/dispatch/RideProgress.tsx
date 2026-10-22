import { useMemo } from "react";
import { Link } from "react-router";
import { Car, Clock, MapPin, Phone, Radar, UserRound, Zap } from "lucide-react";
import { useRecords } from "../api/hooks";
import type { TripOffersView } from "../api/dispatchSim";
import type { DemoRecord } from "../api/seed";
import { liveDrivers } from "../dashboard/live";
import { onTheWayRequests, type OnTheWay, type RideRequest } from "../dashboard/riders";
import { MARKETS, formatMoney } from "../markets/markets";
import { StatusDot } from "../ui/kit";
import { EVENT_LABEL, OFFER_STATUS_LABEL, countdownLabel, offerProgress, secondsLeft, type AdminOffer } from "./assign";
import { useMapFocus } from "./assignContext";
import { useClock, useTripOffers } from "./DriverBonusBox";
import { tr, trn, trx, uiLocale } from "../i18n";

/**
 * How the offers sent for a waiting rider are going, the same in the big panel and the small pop-up on the map:
 * who sees it on the radar, how many ignored or refused it, and — once a driver accepts — who is on the way.
 */

function moneyIn(currency: string) {
  const country = MARKETS.find((item) => item.currency === currency)?.id ?? "SE";
  return (minor: number) => formatMoney(minor, country);
}

function offerTone(status: AdminOffer["status"]): "green" | "amber" | "red" | "muted" {
  if (status === "claimed") return "green";
  if (status === "open") return "amber";
  if (status === "declined" || status === "expired") return "red";
  return "muted";
}

export function OfferStatus({ offer, now }: { offer: AdminOffer; now: number }) {
  return (
    <span className="as-offer-status" data-status={offer.status}>
      <StatusDot tone={offerTone(offer.status)}>{trx(OFFER_STATUS_LABEL[offer.status])}</StatusDot>
      {offer.status === "open" ? <span className="as-countdown" aria-label={tr("{0} seconds left", [secondsLeft(offer.expiresAt, now)])}><Clock size={11} aria-hidden="true" /> {countdownLabel(secondsLeft(offer.expiresAt, now))}</span> : null}
    </span>
  );
}

/** Offers sent (direct and radar groups), with the countdown of each group, and the dispatch events of the trip. */
export function OffersSection({ view, now, compact = false }: { view: TripOffersView | undefined; now: number; compact?: boolean }) {
  if (!view) return null;
  const direct = view.offers.filter((offer) => offer.kind === "assigned");
  const nothing = view.offers.length === 0 && view.groups.length === 0;
  return (
    <section className={compact ? "as-section as-offers-section compact" : "as-section as-offers-section"} aria-label={tr("Offers sent")} data-testid="offers-sent">
      <h4>{trn("{0} Offers sent", <Radar size={14} aria-hidden="true" />)}</h4>
      {nothing ? <p className="dx-calm">{tr("No offer sent from here yet.")}</p> : (
        <ul className="as-offers" aria-label={tr("Offers")}>
          {direct.length ? (
            <li>
              <b>{trn("{0} Direct assign (exclusive)", <Zap size={12} aria-hidden="true" />)}</b>
              <ul>{direct.map((offer) => <OfferLine key={offer.offerId} offer={offer} now={now} />)}</ul>
            </li>
          ) : null}
          {view.groups.map((group) => {
            const left = secondsLeft(group.expiresAt, now);
            const items = view.offers.filter((offer) => offer.groupId === group.groupId);
            const open = items.some((offer) => offer.status === "open") || (items.length === 0 && left > 0);
            return (
              <li key={group.groupId} data-group={group.groupId}>
                <b>{trn("{0} Radar group {1} · {2} driver{3}", <Radar size={12} aria-hidden="true" />, group.number, group.driverIds.length, group.driverIds.length === 1 ? "" : tr("s"))}</b>
                {group.target ? <small className="as-group-target">{trx(group.target)}{group.maxDrivers ? tr(" · up to {0}", [group.maxDrivers]) : ""}</small> : null}
                <span className="as-countdown" data-testid={`group-countdown-${group.number}`}>{open ? <>{trn("{0} {1} left", <Clock size={11} aria-hidden="true" />, countdownLabel(left))}</> : tr("Ended")}</span>
                {items.length === 0 ? <p className="dx-calm" data-testid="radar-waiting">{left > 0 ? tr("On the radar · waiting for drivers to come in.") : tr("Nobody came in before the timer ended.")}</p> : <ul>{items.map((offer) => <OfferLine key={offer.offerId} offer={offer} now={now} />)}</ul>}
              </li>
            );
          })}
        </ul>
      )}
      {!compact && view.events.length ? (
        <ol className="as-events" aria-label={tr("Dispatch events")}>
          {view.events.slice(-8).reverse().map((event) => (
            <li key={event.eventId} data-kind={event.kind}>
              <time>{new Date(event.occurredAt).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              <span>{trx(EVENT_LABEL[event.kind])}{event.driverName ? ` · ${event.driverName}` : ""}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function OfferLine({ offer, now }: { offer: AdminOffer; now: number }) {
  const money = moneyIn(offer.currency);
  return (
    <li data-offer={offer.offerId} data-driver={offer.driverId}>
      <span>{offer.driverName}</span>
      <OfferStatus offer={offer} now={now} />
      <small>{trn("Driver sees {0}{1}", money(offer.fareMinor), offer.driverBonusMinor ? tr(" (incl. +{0})", [money(offer.driverBonusMinor)]) : "")}</small>
      {offer.priority ? <span className="as-priority">{tr("Priority")}</span> : null}
    </li>
  );
}

/** One line of chips: on the radar (who sees it, countdown), exclusive out, ignored, refused. */
export function ProgressSummary({ view, now }: { view: TripOffersView; now: number }) {
  const progress = offerProgress(view, now);
  if (!progress.sent && !progress.radarEndsAt) return null;
  const chips: { key: string; tone: string; text: string }[] = [];
  if (progress.radarEndsAt) {
    const left = countdownLabel(secondsLeft(progress.radarEndsAt, now));
    chips.push({ key: "radar", tone: "amber", text: progress.radarWaiting && !progress.onRadar ? tr("On the radar · waiting for drivers · {0}", [left]) : tr("On the radar · {0} see it · {1}", [progress.onRadar, left]) });
  }
  if (progress.exclusiveOpen) chips.push({ key: "exclusive", tone: "amber", text: tr("Exclusive to {0} · {1}", [progress.exclusiveOpen.driverName, countdownLabel(secondsLeft(progress.exclusiveOpen.expiresAt, now))]) });
  chips.push({ key: "ignored", tone: progress.ignored ? "red" : "muted", text: tr("{0} ignored", [progress.ignored]) });
  chips.push({ key: "refused", tone: progress.refused ? "red" : "muted", text: tr("{0} refused", [progress.refused]) });
  if (progress.accepted) chips.push({ key: "accepted", tone: "green", text: tr("Accepted by {0}", [progress.accepted.driverName]) });
  return (
    <ul className="hq-progress" aria-label={tr("Offer progress")} data-testid="offer-progress">
      {chips.map((chip) => <li key={chip.key} className={`hq-chip ${chip.tone}`} data-chip={chip.key}>{chip.text}</li>)}
    </ul>
  );
}

const tel = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

/** "Driver on the way": who accepted, the car, the time to the pickup, how the ride reached them and the price. */
export function AcceptedCard({ view }: { view: TripOffersView }) {
  const focus = useMapFocus();
  const driver = view.accepted;
  if (!driver) return null;
  const money = moneyIn(view.currency);
  const how = driver.kind === "assigned" ? tr("Exclusive") : driver.via ? tr("Radar · {0}", [trx(driver.via)]) : tr("Radar");
  return (
    <section className="hq-accepted" aria-label={tr("Driver on the way")} data-testid="accepted-driver">
      <p className="hq-accepted-head"><StatusDot tone="green">{tr("Driver on the way · {0}", [driver.name])}</StatusDot></p>
      <dl className="driver-panel-facts">
        <div><dt>{tr("Driver")}</dt><dd>{driver.name} · <span className="map-popup-code">{driver.code}</span></dd></div>
        <div><dt>{tr("Car")}</dt><dd><Car size={12} aria-hidden="true" /> {[driver.car, driver.plate].filter(Boolean).join(" · ") || "–"}</dd></div>
        <div><dt>{tr("To the pickup")}</dt><dd>{driver.etaMin === null ? "–" : tr("{0} min away", [driver.etaMin])}</dd></div>
        <div><dt>{tr("Taken by")}</dt><dd>{how}</dd></div>
        <div><dt>{tr("Price accepted")}</dt><dd data-testid="accepted-price">{money(driver.fareMinor)}{driver.driverBonusMinor ? tr(" (incl. +{0})", [money(driver.driverBonusMinor)]) : ""}</dd></div>
      </dl>
      <div className="hq-actions">
        {focus ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => focus.focusDriver(driver.driverId)}>{trn("{0} Show on the map", <MapPin size={13} aria-hidden="true" />)}</button> : null}
        <Link className="dash-btn small ghost" to={`/drivers/${driver.driverId}`}>{trn("{0} Open driver", <UserRound size={13} aria-hidden="true" />)}</Link>
        {driver.phone ? <a className="dash-btn small ghost" href={tel(driver.phone)}>{trn("{0} Call driver", <Phone size={13} aria-hidden="true" />)}</a> : null}
      </div>
    </section>
  );
}

/** Live state of the offers in the small pop-up: the accepted driver, or the summary and the offers sent. */
export function RideProgress({ view }: { view: TripOffersView | undefined }) {
  const now = useClock();
  if (!view) return null;
  if (view.accepted) return <AcceptedCard view={view} />;
  if (!view.offers.length && !view.groups.length) return null;
  return (
    <div className="hq-progress-block">
      <ProgressSummary view={view} now={now} />
      <OffersSection view={view} now={now} compact />
    </div>
  );
}

/** The rider's state line in the pop-up: "Looking for a driver", "Offered to …" or "Driver on the way · …". */
export function RequestState({ request }: { request: RideRequest }) {
  const offers = useTripOffers(request.tripId);
  const accepted = offers.data?.accepted ?? null;
  if (accepted) return <span className="map-popup-state" data-testid="rider-state" data-state="accepted"><i style={{ background: "#1f9d55" }} />{tr("Driver on the way · {0}", [accepted.name])}</span>;
  const open = offers.data?.offers.find((offer) => offer.status === "open" && offer.kind === "assigned");
  const label = open ? tr("Offered to {0}", [open.driverName]) : request.status === "offered" ? tr("Offered to {0}", [request.offeredTo]) : tr("Looking for a driver");
  return <span className="map-popup-state" data-testid="rider-state" data-state={open || request.status === "offered" ? "offered" : "searching"}><i style={{ background: request.waitingMin > 5 ? "#d03b3b" : "#d55181" }} />{label}</span>;
}

/**
 * Rides a driver accepted a moment ago (the same trips the screen already reads): shown apart under the waiting
 * riders as "Driver on the way", so the admin can open them again on the map. Never counted as waiting.
 */
export function useOnTheWay(): OnTheWay[] {
  const trips = useRecords("trips", undefined, { refetchMs: 10_000 });
  const drivers = useRecords("drivers", undefined, { refetchMs: 10_000 });
  const riders = useRecords("riders");
  return useMemo(() => {
    const names = new Map(((drivers.data ?? []) as DemoRecord[]).map((row) => [row.id, row.name]));
    return onTheWayRequests((trips.data ?? []) as DemoRecord[], (riders.data ?? []) as DemoRecord[], (id) => names.get(id));
  }, [trips.data, drivers.data, riders.data]);
}

/**
 * The drivers who can take an offer right now (online, free, not heading to a pickup): the same rule the server uses
 * for an exclusive offer, so a picker never offers a driver the server would refuse. Null while loading.
 */
export function useFreeDriverIds(): Set<string> | null {
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const trips = useRecords("trips", null);
  const incidents = useRecords("incidents", null);
  return useMemo(() => {
    if (!drivers.data || !vehicles.data || !trips.data) return null;
    const live = liveDrivers(drivers.data as DemoRecord[], vehicles.data as DemoRecord[], trips.data as DemoRecord[], (incidents.data ?? []) as DemoRecord[], 0);
    return new Set(live.filter((driver) => driver.state === "free").map((driver) => driver.id));
  }, [drivers.data, vehicles.data, trips.data, incidents.data]);
}

/** The small "Driver on the way" group under a riders list: rider, zone, the driver, and See on map. */
export function OnTheWayGroup({ items, onLocate }: { items: readonly OnTheWay[]; onLocate: (tripId: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="hq-on-the-way" data-testid="on-the-way">
      <h4>{trn("{0} Driver on the way {1}", <Car size={14} aria-hidden="true" />, <span className="dx-count">{items.length}</span>)}</h4>
      <ul aria-label={tr("Driver on the way")}>
        {items.map((item) => (
          <li key={item.tripId} data-trip={item.tripId}>
            <span className="hq-on-the-way-who">
              {item.riderId ? <Link to={`/riders/${item.riderId}`}><b>{item.rider}</b></Link> : <b>{item.rider}</b>}
              <small>{item.zoneName} · {item.tripId}</small>
            </span>
            <span className="hq-chip blue">{tr("Driver on the way · {0}", [item.driverName])}</span>
            <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" aria-label={tr("Show {0} on the map", [item.rider])} onClick={() => onLocate(item.tripId)}>{trn("{0}See on map", <MapPin size={13} aria-hidden="true" />)}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
