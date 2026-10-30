import { NotConnected } from "../live/NotConnected";
import { LiveTripChat } from "../live/LiveTripChat";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { fareLineLabel } from "../live/format";
import { Link, useNavigate, useParams } from "react-router";
import { useLiveRefund } from "../live/LiveRefund";
import { useFreeDriverIds } from "../dispatch/RideProgress";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, Car, Clock3, Coins, Eye, FileText, Flag, History, ListOrdered, Lock, MapPinned, MessagesSquare, Radar, Route as RouteIcon, ShieldCheck, Star, Users, Wrench } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import { emptySafety, useAudit, useDrivers, useRecords, useSlice, useTrips, type SafetyBook } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { demoShift } from "../dashboard/scheduled";
import { formatMoney as formatTripMoney } from "../domain/money";
import { statusLabel } from "../domain/labels";
import { MapPanel } from "../dispatch/maps";
import { reasonText as cancelReasonLabel } from "../dispatch/offers";
import { DISPATCH_KEY, emptyDispatchBook, liveCountry, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { formatMoney, market, zoneById } from "../markets/markets";
import { emptyPricingStore, normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY } from "../pricing/zonePricing";
import { Cards } from "../reports/ui";
import { INCIDENT_OPS_KEY, caseOf, emptyIncidentOps, normalizeIncidentOps, type IncidentOps } from "../safety/cases";
import { answerLabel, asRideChecks, followText, isRed, reasonText, shiftOf, shifted, triggerLabel } from "../safety/rideCheck";
import {
  TRIP_OPS_KEY,
  callsOf,
  canSeePrivate,
  chatOf,
  countryOf,
  emptyTripOps,
  entriesFor,
  isFlagged,
  maskPhone,
  moneySplit,
  normalizeTripOps,
  routeOf,
  type TripOps,
} from "../trips/file";
import {
  adjustBlock,
  asTrip,
  cancelBlock,
  cancelReason,
  cancelledBy,
  categoryOf,
  completeBlock,
  fareBreakdown,
  noShowBlock,
  offerBlock,
  offersFor,
  paymentOf,
  pinVerified,
  ratingLabel,
  refundBlock,
  reassignBlock,
  riderIdFor,
  startedAt,
  timelineOf,
  waitingBlock,
  waybill,
  zoneTimeLabel,
} from "../trips/present";
import { AdminActions, ChatCalls, Section, SplitView, Waiting, agentName, entryLine } from "../trips/TripParts";
import { RouteMap } from "../trips/RouteMap";
import { cashFigures, isCashTrip } from "../trips/cash";
import { offerLog, timelineOffers } from "../trips/offerLog";
import { adjustFare, waitingMinutes } from "../trips/rules";
import { CommandButton } from "../ui/CommandButton";
import { DriverBonusBox, NearbyButton, OffersSection, useTripOffers } from "../dispatch/AssignPanel";
import { canAssign as canAssignTrip, isLocked } from "../dispatch/assign";
import { StatusDot } from "../ui/kit";
import { currentLanguage, tr, trn, uiLocale, trx, trSentences } from "../i18n";

type TimelineEvent = { at: string; text: string; tone: "status" | "good" | "muted" | "call" | "check" | "alert"; link?: { to: string; label: string } };

const SECTIONS = [
  ["timeline", "Timeline"],
  ["assign", "Assign"],
  ["route", "Route"],
  ["fare", "Money"],
  ["chat", "Chat and calls"],
  ["waybill", "Waybill"],
  ["actions", "Actions"],
  ["history", "Who did what"],
] as const;

/** A clock for the admin offer countdowns. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function TripPage() {
  const { tripId = "" } = useParams();
  const navigate = useNavigate();
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const liveRefund = useLiveRefund(tripId);
  const trips = useTrips(null);
  const drivers = useDrivers(null);
  const vehicles = useRecords("vehicles", null);
  const audit = useAudit();
  const opsSlice = useSlice<TripOps>(TRIP_OPS_KEY, emptyTripOps(), { enabled: can(role, "trips.read") });
  const pricing = useSlice<unknown>(PRICING_KEY, emptyPricingStore());
  const dispatchSlice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const ops = normalizeTripOps(opsSlice.value);
  const api = useAdminApi();
  const canSafety = can(role, "incidents.read");
  const rideCheckRows = useRecords("rideChecks", null);
  const incidents = useRecords("incidents", null);
  const safety = useSlice<SafetyBook>("safetyOps", emptySafety(), { enabled: canSafety });
  const incidentOps = useSlice<IncidentOps>(INCIDENT_OPS_KEY, emptyIncidentOps(), { enabled: canSafety });
  const trip = trips.data?.find((item) => item.id === tripId);
  const live = Boolean(useLiveSessionMaybe());
  const dispatchOffers = useTripOffers(tripId, can(role, "trips.read"));
  const clock = useNow();
  const [driverId, setDriverId] = useState("");
  const [farePercent, setFarePercent] = useState("10");
  const [waitingInput, setWaitingInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState("");

  // Only drivers who can take an offer now: the server refuses an exclusive offer to a busy driver.
  const free = useFreeDriverIds();
  const eligible = useMemo(
    () => (trip ? offersFor(trip, drivers.data ?? [], vehicles.data ?? []).filter((driver) => !free || free.has(driver.id)) : []),
    [drivers.data, trip, vehicles.data, free],
  );
  const route = useMemo(() => (trip ? routeOf(trip) : null), [trip]);
  const chosen = driverId || eligible[0]?.id || "";

  if (trips.isLoading || drivers.isLoading || vehicles.isLoading) return <p className="state-line">{tr("Loading trip.")}</p>;
  if (!trip || !route) {
    return <NotFoundRecord kind="Trip" id={tripId} list="/trips" listLabel="trips" />;
  }

  const country = countryOf(trip.zoneId);
  const place = market(country);
  const money = (minor: number) => formatMoney(minor, country);
  const legacyMoney = (minor: number) => formatTripMoney({ amountMinor: minor, currency: (trip.liveTrip?.currency as typeof place.currency | undefined) ?? place.currency });
  const driver = drivers.data?.find((item) => item.id === trip.driverId);
  const vehicle = vehicles.data?.find((item) => item.driverId === trip.driverId);
  const fare = fareBreakdown(trip);
  const sheet = waybill(trip, driver?.name ?? "", vehicle?.plate ?? "", vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() : "");
  const payment = paymentOf(trip);
  const cancelWhy = cancelBlock(trip.status);
  const offerWhy = offerBlock(trip.status) ?? (eligible.length === 0 ? "No eligible driver with an eligible matching vehicle is free for this category." : null);
  const reassignWhy = reassignBlock(trip.status);
  const noShowWhy = noShowBlock(trip.status);
  const completeWhy = completeBlock(trip.status);
  // Admin cancel reasons: contract admin_* codes, texts from Dispatch › Cancel reasons (the one editor).
  const adminReasons = liveCountry(normalizeDispatchBook(dispatchSlice.value), country).cancelReasons.groups.admin;
  const fareAttempt = adjustFare(asTrip(trip), Number(farePercent));
  const adjustWhy = adjustBlock(trip.status) ?? fareAttempt.error ?? null;
  const waitingValue = waitingInput === "" ? fare.waitingMin : Number(waitingInput);
  const waitingAttempt = waitingMinutes(trip.status, waitingValue);
  const waitingWhy = waitingBlock(trip.status) ?? waitingAttempt.error ?? null;
  const refundWhy = refundBlock(payment, trip.status);
  const tripAudits = (audit.data ?? []).filter((item) => item.targetId === trip.id).slice(0, 20);
  const tone = trip.status.includes("cancel") || trip.status === "failed" ? "red" : trip.status === "completed" ? "green" : "amber";
  const store = normalizeStore(pricing.value);
  const split = moneySplit(trip, zoneBook(store, trip.zoneId), Boolean(driver?.fleetId), ops.entries, liveRules(normalizeDispatchBook(dispatchSlice.value), trip.zoneId).riderCancel.fees, dispatchOffers.data?.bonusMinor ?? 0);
  const chat = chatOf(trip);
  const calls = callsOf(trip);
  const offerSteps = offerLog(trip, (drivers.data ?? []).map((row) => ({ id: row.id, name: row.name, zoneId: row.zoneId })), dispatchOffers.data?.offers);
  const offers = timelineOffers(offerSteps);
  const driverName = (id: string) => drivers.data?.find((row) => row.id === id)?.name ?? "A driver";
  const allowed = canSeePrivate(role, ops.settings);
  const entries = entriesFor(ops, trip.id);
  const flagged = isFlagged(ops, trip.id);
  const riderId = riderIdFor(trip);
  const zone = zoneById(trip.zoneId);
  const time = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, timeStyle: "short" }).format(new Date(iso));
  const timeSec = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  const cashTrip = isCashTrip(trip, country);
  const cash = cashTrip ? cashFigures(split) : null;

  // Ride checks on this trip: when the card opened and what each person answered.
  const now = Date.now();
  const rideEvents: TimelineEvent[] = asRideChecks(rideCheckRows.data).filter((check) => check.tripId === trip.id).flatMap((check) => {
    const incident = check.incidentId ? incidents.data?.find((row) => row.id === check.incidentId) : undefined;
    const openedAt = incident ? caseOf(incident, safety.value, normalizeIncidentOps(incidentOps.value), now).openedAt : null;
    const shift = shiftOf(check, openedAt, demoShift(now, api.demo));
    const at = (iso: string) => new Date(shifted(iso, shift)).toISOString();
    const link = check.incidentId && canSafety ? { to: `/incidents?case=${check.incidentId}`, label: check.incidentId } : undefined;
    return [
      { at: at(check.at), text: `Ride check: ${triggerLabel(check.trigger)} · ${reasonText(check)}`, tone: "check", link },
      ...(["driver", "rider"] as const).flatMap((who): TimelineEvent[] => {
        const answer = check[who];
        if (!answer) return [{ at: at(check.at), text: `Ride check, ${who}: no answer yet`, tone: "muted" }];
        const extra = [...(answer.follow ?? []).map(followText), ...(answer.text ? [`“${answer.text}”`] : [])];
        return [{ at: at(answer.at), text: `Ride check, ${who}: ${answerLabel(who, answer)}${extra.length ? ` · ${extra.join(" · ")}` : ""}`, tone: isRed(answer) ? "alert" : answer.choice === "ok" ? "good" : "check" }];
      }),
    ];
  });

  const events: TimelineEvent[] = [
    ...rideEvents,
    ...timelineOf(trip).map((event) => ({ at: event.at, text: event.label, tone: "status" as const })),
    ...offers.map((offer) => ({ at: offer.at, text: offer.answer === "accepted" ? `${driverName(offer.driverId)} said yes` : `Asked ${driverName(offer.driverId)}: ${offer.answer}`, tone: offer.answer === "accepted" ? "good" as const : "muted" as const })),
    ...(calls ?? []).map((call) => ({ at: call.at, text: `${call.from === "driver" ? "The driver called the rider" : "The rider called the driver"}${call.answered ? "" : " (not answered)"}`, tone: "call" as const })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const reveal = ops.settings.reasonToShow ? (
    <CommandButton command="admin.trip.revealSensitive" className="dash-btn small" targetId={trip.id} scope={trip.zoneId} confirmTarget={false} before="hidden" after="shown" onDone={() => setRevealed(true)}>{trn("{0} Show numbers and messages", <Eye size={13} aria-hidden="true" />)}</CommandButton>
  ) : (
    <CommandButton command="admin.trip.revealSensitiveQuick" className="dash-btn small" targetId={trip.id} scope={trip.zoneId} confirmTarget={false} before="hidden" after="shown" onDone={() => setRevealed(true)}>{trn("{0} Show numbers and messages", <Eye size={13} aria-hidden="true" />)}</CommandButton>
  );
  const phone = (value: string) => (revealed ? value : maskPhone(value));

  return (
    <div className="dx-page op-page op-trip">
      <header className="dx-head">
        <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/trips"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{trn("Trip {0}", trip.id)}</h2>
          <p>
            <StatusDot tone={tone}>{statusLabel(trip.status)}</StatusDot>
            {" "}{trip.name} · {zone?.name ?? trip.zoneId} · {trx(categoryOf(trip.id).label)} · {zoneTimeLabel(startedAt(trip.id), trip.zoneId)}
            {flagged ? <span className="op-status problem">{trn("{0} Flagged", <Flag size={11} aria-hidden="true" />)}</span> : null}
          </p>
        </div>
        <Link className="dash-btn small ghost" to="/trips">{tr("All trips")}</Link>
      </header>

      <nav className="op-jump" aria-label={tr("Trip sections")}>
        {SECTIONS.map(([id, label]) => (
          <button key={id} data-command="admin.tabs.select" type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" })}>{trx(label)}</button>
        ))}
      </nav>

      {notice ? <p className="dx-note" role="status">{trSentences(notice)}</p> : null}
      <Waiting trip={trip} ops={ops} money={money} onNotice={setNotice} />

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (!Number.isFinite(value) ? tr("Not connected yet") : format === "money" ? money(value) : format === "min" ? `${value} min` : String(value))}
        cards={[
          { id: "paid", label: split.state === "estimate" ? tr("Rider pays (estimate)") : tr("Rider paid"), value: split.riderPaid, previous: null, format: "money", info: tr("The trip price, minus promotions and refunds, plus the tip.") },
          { id: "driver", label: tr("Driver gets"), value: split.driverGets, previous: null, format: "money", info: tr("The ride price minus Movera's commission (and the fleet owner's share), plus the tip.") },
          { id: "movera", label: tr("Movera keeps"), value: split.moveraKeeps, previous: null, format: "money", info: tr("Commission and app fee, minus promotions and refunds Movera paid.") },
          { id: "km", label: tr("Distance, km"), value: route.km, previous: null, format: "count", info: tr("Distance charged, in km.") },
          { id: "min", label: tr("Ride time"), value: route.minutes, previous: null, format: "min", info: tr("Minutes from pickup to drop-off.") },
        ]}
      />

      <div className="op-trip-grid">
        <Section id="timeline" title={tr("Timeline")} icon={<Clock3 size={16} />} testId="trip-timeline">
          <ol className="op-timeline">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} className={event.tone}><time>{time(event.at)}</time><i aria-hidden="true" /><span>{event.text}{event.link ? <> · <Link to={event.link.to}>{trx(event.link.label)}</Link></> : null}</span></li>
            ))}
          </ol>
          <p className="op-help">{trn("Who cancelled: {0}. Reason: {1}{2}.", cancelledBy(trip.status), cancelReason(trip), trip.cancelReasonCode ? ` (${trip.cancelReasonCode})` : "")}</p>
        </Section>

        <Section id="people" title={tr("People and car")} icon={<Users size={16} />} aside={allowed && !revealed ? reveal : revealed ? <span className="dx-tag">{trn("{0} Shown, logged in Reports", <Eye size={11} aria-hidden="true" />)}</span> : null}>
          <div className="op-people">
            <div className="op-person rider">
              <small>{tr("Rider")}</small>
              <Link to={`/riders/${riderId}`}><b>{trip.name}</b></Link>
              {canAssignTrip(trip.status) && can(role, "trips.intervene") ? <NearbyButton tripId={trip.id} rider={trip.name} className="dash-btn small" /> : null}
              <span>{allowed ? phone(trip.phone) : <>{trn("{0} Number hidden", <Lock size={11} aria-hidden="true" />)}</>}</span>
            </div>
            <div className="op-person driver">
              <small>{tr("Driver")}</small>
              {driver ? <Link to={`/drivers/${driver.id}`}><b>{driver.name}</b></Link> : <b>{tr("Not assigned")}</b>}
              <span>{driver ? (allowed ? phone(driver.phone) : <>{trn("{0} Number hidden", <Lock size={11} aria-hidden="true" />)}</>) : "–"}</span>
            </div>
          </div>
          <div className="op-facts-list">
            <p>{trn("Driver {0}", driver ? <><Link to={`/drivers/${driver.id}`}>{driver.name}</Link> · {driver.id}</> : tr("Unassigned"))}</p>
            <p>{trn("{0} Vehicle {1}", <Car size={13} aria-hidden="true" />, vehicle ? `${vehicle.plate} · ${vehicle.make ?? ""} ${vehicle.model ?? ""}` : tr("Unassigned"))}</p>
            <p data-testid="trip-payment">{trn("{0} Payment {1} · {2}", <Banknote size={13} aria-hidden="true" />, statusLabel(payment), cashTrip ? tr("Cash") : tr("In the app"))}</p>
            <p data-testid="trip-rating">{trn("{0} Rating {1}", <Star size={13} aria-hidden="true" />, ratingLabel(trip))}</p>
            <p data-testid="trip-pin">{trn("PIN verified {0}", pinVerified(trip.id))}</p>
          </div>
        </Section>
      </div>

      <Section id="offers" title={tr("Offer log")} icon={<Radar size={16} />} testId="trip-offer-log" wide>
        {offerSteps.length ? (
          <ol className="op-offer-log" aria-label={tr("Offer log")}>
            {offerSteps.map((step, index) => (
              <li key={`${step.at}-${index}`} className={step.kind}>
                <time>{timeSec(step.at)}</time>
                <b>{trx(step.title)}</b>
                <span>{trx(step.detail)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="dx-calm">{tr("No offer was sent for this trip.")}</p>}
        <p className="op-help">{tr("One line per step: Scheduled rides, Home popup, Exclusive (to whom and the answer), Radar (how many saw it), who tried to take it, who won and who got “No longer available”.")}</p>
      </Section>

      <Section id="assign" title={tr("Assign a driver")} icon={<Radar size={16} />} testId="trip-assign" wide>
        {isLocked(trip.status) && dispatchOffers.data?.lockedTo ? (
          <p className="as-locked" role="status">{trn("{0} Assigned to {1}. The assignment is locked.", <Lock size={14} aria-hidden="true" />, <b>{dispatchOffers.data.lockedTo.driverName}</b>)}</p>
        ) : canAssignTrip(trip.status) ? (
          <p className="op-help">{trn("The rider sees “Searching”. See the active drivers near the pickup to send an exclusive offer to one, or a radar group of up to 10.{0}", can(role, "trips.intervene") ? <> <NearbyButton tripId={trip.id} rider={trip.name} /></> : null)}</p>
        ) : <p className="dx-calm">{tr("Assigning is open only while the trip is requested, searching or offered.")}</p>}
        {dispatchOffers.data && canAssignTrip(trip.status) ? <DriverBonusBox trip={{ id: trip.id, zoneId: trip.zoneId, status: trip.status }} view={dispatchOffers.data} canAct={can(role, "trips.intervene")} onDone={(text) => { setNotice(text); void dispatchOffers.refetch(); }} /> : null}
        {dispatchOffers.data?.offers.length ? <OffersSection view={dispatchOffers.data} now={clock} /> : null}
      </Section>

      <Section id="route" title={tr("Route")} icon={<RouteIcon size={16} />} testId="trip-route" wide>
        <div className="op-route-grid">
          <MapPanel title={tr("Map")} note={<span className="op-legend">{trn("{0} Ride {1} Driver to pickup {2} Pickup {3} Stop {4} Drop-off", <i className="ride" />, <i className="approach" />, <i className="pickup" />, <i className="stop" />, <i className="dropoff" />)}</span>}>
            <RouteMap stops={route.stops} path={route.path} approach={trip.driverId ? route.approach : []} label={tr("Route of trip {0}", [trip.id])} />
          </MapPanel>
          <div>
            <ol className="op-stops" data-testid="trip-stops">
              {route.stops.map((stop, index) => (
                <li key={`${stop.kind}-${index}`} className={stop.kind}><i aria-hidden="true" />{stop.kind === "pickup" ? tr("Pickup") : stop.kind === "dropoff" ? tr("Drop-off") : tr("Stop")} · {trx(stop.label)}</li>
              ))}
            </ol>
            <dl className="op-facts">
              <div><dt>{tr("Distance")}</dt><dd>{Number.isFinite(route.km) ? trn("{0} km", route.km) : <NotConnected />}</dd></div>
              <div><dt>{tr("Ride time")}</dt><dd>{Number.isFinite(route.minutes) ? trn("{0} min", route.minutes) : <NotConnected />}</dd></div>
              <div><dt>{tr("Stops")}</dt><dd>{route.stops.length - 2}</dd></div>
            </dl>
          </div>
        </div>
      </Section>

      <div className="op-trip-grid">
        <Section id="fare" title={tr("How the price was made · rule {0}", [fare.ruleVersion])} icon={<ListOrdered size={16} />} testId="trip-fare">
          {fare.live ? (
            <ul className="op-lines" data-testid="trip-fare-lines">
              {fare.lines.length ? fare.lines.map((line) => <li key={line.code}><span>{fareLineLabel(line.code)}</span><b>{legacyMoney(line.amountMinor)}</b></li>) : <li><span>{tr("Fare lines")}</span><b><NotConnected /></b></li>}
              <li className="total"><span>{trn("Charged {0}", legacyMoney(fare.chargedOre))}</span></li>
            </ul>
          ) : <ul className="op-lines">
            <li><span>{tr("Pickup")}</span><b>{legacyMoney(fare.pickupOre)}</b></li>
            <li><span>{trn("{0} km × {1}", fare.km, legacyMoney(fare.perKmOre))}</span><b>{legacyMoney(fare.km * fare.perKmOre)}</b></li>
            <li><span>{trn("{0} min × {1}", fare.minutes, legacyMoney(fare.perMinOre))}</span><b>{legacyMoney(fare.minutes * fare.perMinOre)}</b></li>
            <li><span>{trn("Waiting time charged: {0} min · {1}", fare.waitingMin, legacyMoney(fare.waitingOre))}</span></li>
            <li><span>{fare.appliedMin ? tr("Minimum {0} applied", [legacyMoney(fare.minimumOre)]) : tr("Minimum not applied")}</span></li>
            <li className="total"><span>{trn("Charged {0}", legacyMoney(fare.chargedOre))}</span></li>
          </ul>}
        </Section>
        <Section id="split" title={tr("Who gets what")} icon={<Banknote size={16} />}>
          <SplitView split={split} money={money} />
          {cashTrip ? (
            <div className="op-cash" data-testid="trip-cash">
              <b>{trn("{0} Cash trip", <Coins size={13} aria-hidden="true" />)}</b>
              {cash ? (
                <>
                  <dl className="op-split-lines">
                    <div><dt>{tr("Cash collected by driver")}</dt><dd>{money(cash.collected)}</dd></div>
                    <div className="minus"><dt>{tr("Owed to Movera")}</dt><dd>{money(cash.owed)}</dd></div>
                  </dl>
                  <p className="op-help">{trn("The owed amount is taken from the driver's next payout. {0}", <Link to="/payouts">{tr("Payouts")}</Link>)}</p>
                </>
              ) : <p className="op-help">{tr("The driver collects the fare in cash at the drop-off.")}</p>}
            </div>
          ) : null}
        </Section>
      </div>

      <Section id="chat" title={tr("Chat and calls")} icon={<MessagesSquare size={16} />} wide>
        {/* v0.18.5 (owner G9): live, the trip's chat from the server (admins only; the apps keep no copy). */}
        {live ? <LiveTripChat tripId={trip.id} hadDriver={Boolean(trip.driverId)} riderName={trip.name || tr("Rider")} driverName={driver?.name || tr("Driver")} /> : <ChatCalls chat={chat} calls={calls} revealed={revealed} allowed={allowed} reveal={reveal} country={country} riderName={trip.name} driverName={driver?.name ?? "The driver"} />}
      </Section>

      <Section id="waybill" title={tr("Waybill")} icon={<FileText size={16} />} testId="trip-waybill" wide>
        <dl className="waybill op-waybill">
          {Object.entries({
            "Trip": sheet.tripId,
            "Status": sheet.status,
            "Issued at": sheet.issuedAt,
            "Fare": sheet.fare,
            "Service": sheet.service,
            "Rider": sheet.riderName,
            "Pickup": sheet.pickup,
            "Drop-off": sheet.dropoff,
            "Source": sheet.source,
            "Driver": sheet.driverName,
            "Vehicle": sheet.vehicle,
            "Licence plate": sheet.plate,
            "Passenger capacity": sheet.seats,
          }).map(([label, value]) => (
            <div key={label}>
              <dt>{trx(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="actions" title={tr("Actions")} icon={<Wrench size={16} />} wide>
        <h4 className="op-sub">{tr("Admin actions")}</h4>
        <AdminActions trip={trip} ops={ops} split={split} money={money} country={country} riderId={riderId} onNotice={setNotice} />
        {ops.settings.actions.price || ops.settings.actions.refund ? (
          <div className="op-live">
            <h4 className="op-sub">{trn("Live trip controls {0}", <small>{tr("cancel, offer, reassign, no-show, complete, fare, waiting time and full refund")}</small>)}</h4>
            <div className="op-live-body" data-testid="trip-actions">

              <p data-testid="cancel-block">{cancelWhy ?? tr("Cancel is allowed in this state.")}</p>
              {cancelWhy ? (
                <button data-command="admin.trip.cancel" className="secondary-btn" type="button" disabled title={cancelWhy}>{tr("Cancel trip")}</button>
              ) : (
                // Q27: one dialog, the cancel reason code (none preselected, A-O1) and an optional note.
                <CommandButton
                  command="admin.trip.cancel"
                  className="secondary-btn"
                  targetId={trip.id}
                  confirmTarget={false}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={trip.status}
                  after="cancelled_by_admin"
                  patch={{ status: "cancelled_by_admin", previousStatus: trip.status }}
                  reasonChoices={adminReasons.map((item) => ({ value: item.code, label: cancelReasonLabel(item.title, currentLanguage()) || cancelReasonLabel(item.title, "en") || item.code, audit: cancelReasonLabel(item.title, "en") || item.code }))}
                  reasonField="cancelReasonCode"
                  reasonLabel={tr("Cancel reason")}
                  storeReason
                >{tr("Cancel trip")}</CommandButton>
              )}

              <label>{trn("Eligible driver{0}", <select
                  aria-label={tr("Eligible driver")}
                  value={chosen}
                  onChange={(event) => setDriverId(event.target.value)}
                  disabled={eligible.length === 0 || !!offerWhy}
                >
                  {eligible.length === 0 ? <option value="">{tr("No eligible driver")}</option> : null}
                  {eligible.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · {item.id}</option>
                  ))}
                </select>)}</label>

              <p data-testid="offer-block">{offerWhy ?? tr("Offer is allowed in this state. The driver gets an Assigned by Movera offer and still has to accept.")}</p>
              {offerWhy ? (
                <button data-command="admin.trip.assign" className="secondary-btn" type="button" disabled title={offerWhy}>{tr("Offer to driver")}</button>
              ) : (
                // A real exclusive offer (the assign tool): an offer record with the money added for the driver and
                // its countdown, shown in the offers above; the trip gets its driver only when the driver accepts.
                <CommandButton
                  command="admin.trip.assign"
                  className="secondary-btn"
                  targetId={trip.id}
                  confirmTarget={false}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={trip.status}
                  after={`exclusive offer to ${chosen}`}
                  patch={{ status: "offered" }}
                  value={{ driverId: chosen }}
                >{tr("Offer to driver")}</CommandButton>
              )}

              <p data-testid="reassign-block">{reassignWhy ?? tr("Reassign takes the trip off its driver and sends it back to dispatch (searching). Then offer it to a driver.")}</p>
              {reassignWhy ? (
                <button data-command="admin.trip.reassign" className="secondary-btn" type="button" disabled title={reassignWhy}>{tr("Reassign")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.reassign"
                  className="secondary-btn"
                  targetId={trip.id}
                  confirmTarget={false}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={trip.driverId ?? "none"}
                  after="searching"
                  patch={{ driverId: null, status: "searching", previousStatus: trip.status }}
                >{tr("Reassign")}</CommandButton>
              )}

              <p data-testid="noshow-block">{noShowWhy ?? tr("No-show ends the trip as no_show. The no-show fee follows the zone's waiting rules.")}</p>
              {noShowWhy ? (
                <button data-command="admin.trip.noShow" className="secondary-btn" type="button" disabled title={noShowWhy}>{tr("Mark rider no-show")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.noShow"
                  className="secondary-btn"
                  targetId={trip.id}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={trip.status}
                  after="no_show"
                  patch={{ status: "no_show", previousStatus: trip.status, cancelReasonCode: "rider_no_show" }}
                  storeReason
                >{tr("Mark rider no-show")}</CommandButton>
              )}

              <p data-testid="complete-block">{completeWhy ?? tr("Complete ends a stuck trip as completed with the current fare.")}</p>
              {completeWhy ? (
                <button data-command="admin.trip.complete" className="secondary-btn" type="button" disabled title={completeWhy}>{tr("Complete trip")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.complete"
                  className="secondary-btn"
                  targetId={trip.id}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={trip.status}
                  after="completed"
                  patch={{ status: "completed", previousStatus: trip.status }}
                >{tr("Complete trip")}</CommandButton>
              )}

              <div className="field-grid">
                <label>{trn("Fare adjustment (%){0}", <input
                    aria-label={tr("Fare adjustment percent")}
                    type="number"
                    min="-15"
                    max="15"
                    step="1"
                    value={farePercent}
                    onChange={(event) => setFarePercent(event.target.value)}
                  />)}</label>
                <label>{trn("Waiting minutes{0}", <input
                    aria-label={tr("Waiting minutes")}
                    type="number"
                    min="0"
                    max="120"
                    step="1"
                    value={waitingInput === "" ? String(fare.waitingMin) : waitingInput}
                    onChange={(event) => setWaitingInput(event.target.value)}
                  />)}</label>
              </div>

              <p data-testid="adjust-block">{adjustWhy ?? tr("Fare can be adjusted by up to ±15% in this state.")}</p>
              {adjustWhy ? (
                <button data-command="admin.trip.adjust" className="secondary-btn" type="button" disabled title={adjustWhy}>{tr("Apply fare adjustment")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.adjust"
                  className="secondary-btn"
                  targetId={trip.id}
                  confirmTarget={false}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={legacyMoney(trip.fareOre ?? 0)}
                  after={legacyMoney(fareAttempt.trip.fareOre)}
                  patch={{ fareOre: fareAttempt.trip.fareOre }}
                >{tr("Apply fare adjustment")}</CommandButton>
              )}

              <p data-testid="waiting-block">{waitingWhy ?? tr("Waiting time can be corrected in this state.")}</p>
              {waitingWhy ? (
                <button data-command="admin.trip.waiting" className="secondary-btn" type="button" disabled title={waitingWhy}>{tr("Save waiting time")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.waiting"
                  className="secondary-btn"
                  targetId={trip.id}
                  confirmTarget={false}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={`${fare.waitingMin} min`}
                  after={`${waitingAttempt.minutes} min`}
                  patch={{ waitingMin: waitingAttempt.minutes }}
                  onDone={() => setWaitingInput("")}
                >{tr("Save waiting time")}</CommandButton>
              )}

              <p data-testid="refund-block">{refundWhy ?? tr("Refund is allowed. The captured terminal payment can be returned.")}</p>
              {refundWhy ? (
                <button data-command="admin.trip.refund" className="secondary-btn" type="button" disabled title={refundWhy}>{tr("Refund")}</button>
              ) : liveRefund ? (
                <button data-command="admin.trip.refund" className="secondary-btn" type="button" disabled={!can(role, "payments.refund")} onClick={liveRefund.open}>{tr("Refund")}</button>
              ) : (
                <CommandButton
                  command="admin.trip.refund"
                  className="secondary-btn"
                  targetId={trip.id}
                  entityState={trip.status}
                  scope={trip.zoneId}
                  collection="trips"
                  before={payment}
                  after="refunded"
                  patch={{ kind: "refunded" }}
                  storeReason
                >{tr("Refund")}</CommandButton>
              )}
            </div>
          </div>
        ) : null}
        {liveRefund?.dialog}
      </Section>

      <Section id="history" title={tr("Who did what")} icon={<History size={16} />} wide>
        {entries.length ? (
          <ul className="op-history" aria-label={tr("Admin work on this trip")}>
            {entries.map((entry) => (
              <li key={entry.id}><time>{zoneTimeLabel(entry.at, trip.zoneId)}</time><b>{agentName(entry.actorId)}</b><span>{entryLine(entry, money)}</span></li>
            ))}
          </ul>
        ) : null}
        <h4 className="op-sub">{trn("{0} Intervention audit", <ShieldCheck size={13} aria-hidden="true" />)}</h4>
        {tripAudits.length === 0 ? (
          <p className="state-line">{tr("No audited admin intervention on this trip yet.")}</p>
        ) : (
          <ul aria-label={tr("Trip intervention audit")} className="op-history">
            {tripAudits.map((item) => (
              <li key={item.id}><time>{item.at}</time><b>{agentName(item.actorId)}</b><span>{item.action} · {item.result} · {item.actorId} · {item.reason}</span></li>
            ))}
          </ul>
        )}
        <p className="op-help">{trn("{0} Every action here is also in Reports → Admin work, with the admin's name.", <MapPinned size={12} aria-hidden="true" />)}</p>
      </Section>
    </div>
  );
}
