import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Banknote, Car, Clock3, Coins, FileText, History, ListOrdered, Lock, MapPinned, MessagesSquare, Radar, RotateCcw, Route as RouteIcon, ShieldCheck, Star, Users, Wrench } from "lucide-react";
import { ApiError } from "../api/httpClient";
import { CATEGORIES } from "../domain/contract";
import { statusLabel } from "../domain/labels";
import { MapPanel } from "../dispatch/maps";
import { cancelReasonsDefault, reasonText } from "../dispatch/offers";
import { RADIUS_PRESETS_KM, canAssign, isLocked } from "../dispatch/assign";
import { zoneById } from "../markets/markets";
import { Cards } from "../reports/ui";
import { cancelledBy, cancelBlock, completeBlock, noShowBlock, offerBlock, reassignBlock, zoneTimeLabel } from "../trips/present";
import { Section, SplitView } from "../trips/TripParts";
import { RouteMap } from "../trips/RouteMap";
import { cashFigures } from "../trips/cash";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { NoAccess, StatusDot } from "../ui/kit";
import { currentLanguage, tr, trn, trx, trSentences, uiLocale } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { liveMoney, parseMinor, tripTimeline } from "./format";
import { LiveAssignDialog, LiveOffers, bonusOf, offerKindLabel, useTripOffers } from "./LiveAssign";
import { LiveCommandDialog, useTripCommand } from "./LiveTripDialogs";
import { carLabel, categoryName, tripStops, useRiderNames, wordText } from "./LiveTripsPage";
import { DRIVER_ONLY_LINES, FARE_LINE_LABEL, PAYMENT_METHOD_LABEL, liveAdjustBlock, liveRefundBlock, liveSplit, liveWaitingBlock, marketOf, refundedSoFar, traceKm } from "./trips";
import { ErrorLine } from "./ui";
import type { AuditEntry, NearbyDriver, Page, Trip, TripTrace } from "./types";

/** The demo trip page's jump bar (pages/TripPage.tsx SECTIONS). */
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

type Dialog = "cancel" | "offer" | "reassign" | "noShow" | "complete" | "adjust" | "waiting" | "refund" | "partRefund" | "bonus" | null;

/** Every contract cancel reason code with the panel's default text (Dispatch › Cancel reasons). */
function reasonLabels(): Map<string, string> {
  const book = cancelReasonsDefault();
  const language = currentLanguage();
  const rows = [...Object.values(book.groups).flat(), book.noShow];
  return new Map(rows.map((item) => [item.code, reasonText(item.title, language) || item.code]));
}

const RATING_LABEL: Record<string, string> = { not_requested: "Not rated yet", pending: "Not rated yet", submitted: "Rated", skipped: "Skipped" };

/**
 * GET /api/v1/admin/trips/{tripId}: the demo trip page (pages/TripPage.tsx) on the server's trip, with its sections,
 * money names and live controls. Offers (…/offers), the GPS trace (…/trace), the trip's audit (GET /admin/audit) and
 * every trip command the server serves: cancel, assign, radar group, reassign, no-show (fee waived or not), complete,
 * fare and waiting time (adjust), refund and money added for the driver.
 */
export function LiveTripDetailPage() {
  const { tripId = "" } = useParams();
  const navigate = useNavigate();
  const { client, can } = useLiveSession();
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [farePercent, setFarePercent] = useState("10");
  const [waitingInput, setWaitingInput] = useState("");
  const [refundInput, setRefundInput] = useState("");
  const [bonusInput, setBonusInput] = useState("");
  const [driverId, setDriverId] = useState("");
  const readable = can("trips.read") && Boolean(tripId);
  const query = useQuery({ queryKey: ["live", "trip", tripId], queryFn: () => client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`), enabled: readable });
  const trip = query.data;
  const offers = useTripOffers(tripId, Boolean(trip));
  const audit = useQuery({
    queryKey: ["live", "trip-audit", tripId],
    queryFn: () => client.json<Page<AuditEntry>>(`/admin/audit?targetId=${encodeURIComponent(tripId)}&limit=50`),
    enabled: Boolean(trip) && can("audit.read"),
  });
  const trace = useQuery({
    queryKey: ["live", "trip-trace", tripId],
    queryFn: () => client.json<TripTrace>(`/admin/trips/${encodeURIComponent(tripId)}/trace`).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return { tripId, fixes: [] } as TripTrace;
      throw error;
    }),
    enabled: Boolean(trip),
  });
  const assignable = Boolean(trip && canAssign(trip.status));
  const nearby = useQuery({
    queryKey: ["live", "trip-nearby", tripId, "radius", RADIUS_PRESETS_KM[0]],
    queryFn: () => client.json<Page<NearbyDriver>>(`/admin/trips/${encodeURIComponent(tripId)}/nearby-drivers?scope=radius&radiusKm=${RADIUS_PRESETS_KM[0]}`),
    enabled: assignable && can("trips.intervene"),
  });
  const riders = useRiderNames(trip ? [trip.riderId] : []);
  const stops = useMemo(() => (trip ? tripStops(trip) : []), [trip]);
  const run = useTripCommand(trip ?? { tripId, version: 0 }, setNotice);

  if (!can("trips.read")) return <NoAccess />;
  if (query.isLoading) return <p className="state-line">{tr("Loading trip.")}</p>;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundRecord kind="Trip" id={tripId} list="/trips" listLabel="trips" />;
  if (query.error || !trip) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;

  const place = marketOf(trip.zoneId);
  const currency = trip.fare.currency;
  const money = (minor: number) => liveMoney({ amountMinor: minor, currency });
  const rider = riders.get(trip.riderId) ?? trip.riderId;
  const zone = zoneById(trip.zoneId);
  const tone = trip.status.includes("cancel") || trip.status === "failed" ? "red" : trip.status === "completed" ? "green" : "amber";
  const auditRows = (audit.data?.items ?? []).filter((item) => item.targetId === trip.tripId);
  const refunded = refundedSoFar(auditRows);
  const split = liveSplit(trip, refunded);
  const left = Math.max(0, trip.fare.amountMinor - refunded);
  const fixes = trace.data?.fixes ?? [];
  const path = fixes.map((fix) => [fix.lat, fix.lng] as [number, number]);
  const plan = offers.data?.items.find((offer) => offer.tripMeters || offer.tripSeconds);
  const km = traceKm(fixes) ?? (plan?.tripMeters ? Math.round(plan.tripMeters / 100) / 10 : null);
  const minutes = plan?.tripSeconds ? Math.round(plan.tripSeconds / 60) : null;
  const time = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, timeStyle: "short" }).format(new Date(iso));
  const timeSec = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: place.timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  const reasons = reasonLabels();
  const adminReasons = cancelReasonsDefault().groups.admin.map((item) => ({ value: item.code, label: reasons.get(item.code) ?? item.code }));
  const cash = trip.paymentMethod === "cash";
  const cashMoney = cash ? cashFigures(split) : null;
  const intervene = can("trips.intervene");
  const roleNo = tr("Your role cannot do that.");
  const method = trx(PAYMENT_METHOD_LABEL[trip.paymentMethod] ?? trip.paymentMethod);

  const events = [
    ...tripTimeline(trip).map((row) => ({ at: row.at, text: tr(row.label), tone: "status" })),
    ...(trip.waiting?.arrivedAt ? [{ at: trip.waiting.arrivedAt, text: tr("Driver arrived"), tone: "good" }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const cancelCode = trip.cancellation?.reasonCode;

  // Live controls: the demo's block texts (trips/present.ts) and the server's own rules for adjust and refund.
  const cancelWhy = cancelBlock(trip.status);
  const eligible = (nearby.data?.items ?? []).filter((row) => row.onlineStatus === "online" && !row.openOfferId);
  const chosen = eligible.find((row) => row.driverId === driverId) ?? eligible[0];
  const offerWhy = offerBlock(trip.status) ?? (eligible.length === 0 ? tr("No eligible driver with an eligible matching vehicle is free for this category.") : null);
  const reassignWhy = reassignBlock(trip.status);
  const noShowWhy = noShowBlock(trip.status);
  const completeWhy = completeBlock(trip.status);
  const percent = Number(farePercent);
  const newFare = Math.round(trip.fare.amountMinor * (1 + percent / 100));
  const adjustWhy = liveAdjustBlock(trip.status) ?? (!Number.isFinite(percent) || percent === 0 ? tr("Enter a non-zero fare adjustment.") : Math.abs(percent) > 15 ? tr("Adjustment is limited to {0}%.", [15]) : null);
  const chargedMin = Math.round((trip.waiting?.chargedSeconds ?? 0) / 60);
  const waitingValue = waitingInput === "" ? chargedMin : Number(waitingInput);
  const waitingWhy = liveWaitingBlock(trip) ?? (!Number.isInteger(waitingValue) || waitingValue < 0 || waitingValue > 120 ? tr("Waiting time must be a whole number from 0 to 120 minutes.") : null);
  const refundWhy = liveRefundBlock(trip, left);
  const partMinor = refundInput.trim() ? parseMinor(refundInput, currency) : null;
  const partError = !refundInput.trim() ? null : partMinor === null || partMinor <= 0 ? tr("Choose an amount above zero.") : partMinor > left ? tr("That is more than the rider paid.") : null;
  const bonus = bonusOf(bonusInput, currency);

  const blocked = (why: string | null, permission: string) => why ?? (can(permission) ? null : roleNo);
  const control = (id: Exclude<Dialog, null>, label: string, why: string | null, permission = "trips.intervene") => {
    const reason = blocked(why, permission);
    return <button data-command={`admin.trip.${id}`} className="secondary-btn" type="button" disabled={Boolean(reason)} title={reason ?? undefined} onClick={() => setDialog(id)}>{label}</button>;
  };

  return (
    <div className="dx-page op-page op-trip">
      <header className="dx-head">
        <button data-command="admin.trip.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/trips"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{trn("Trip {0}", trip.tripId)}</h2>
          <p data-testid="trip-head">
            <StatusDot tone={tone}>{statusLabel(trip.status)}</StatusDot>
            {" "}{rider} · {zone?.name ?? trip.zoneId} · {categoryName(trip.categoryId)} · {zoneTimeLabel(trip.createdAt, trip.zoneId)}
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

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (!Number.isFinite(value) ? "–" : format === "money" ? money(value) : format === "min" ? `${value} min` : String(value))}
        cards={[
          { id: "paid", label: split.state === "estimate" ? tr("Rider pays (estimate)") : tr("Rider paid"), value: split.riderPaid, previous: null, format: "money", info: tr("The trip price, minus refunds.") },
          { id: "driver", label: tr("Driver gets"), value: split.driverGets, previous: null, format: "money", info: tr("The driver's earnings, pickup pay and money added for the driver.") },
          { id: "movera", label: tr("Movera keeps"), value: split.moveraKeeps, previous: null, format: "money", info: tr("What the rider paid minus what the driver gets.") },
          { id: "km", label: tr("Distance, km"), value: km ?? Number.NaN, previous: null, format: "count", info: tr("From the driver's GPS trace, or the planned route when there is no trace.") },
          { id: "min", label: tr("Ride time"), value: minutes ?? Number.NaN, previous: null, format: "min", info: tr("The planned minutes from pickup to drop-off.") },
        ]}
      />

      <div className="op-trip-grid">
        <Section id="timeline" title={tr("Timeline")} icon={<Clock3 size={16} />} testId="trip-timeline">
          <ol className="op-timeline">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} className={event.tone}><time>{time(event.at)}</time><i aria-hidden="true" /><span>{event.text}</span></li>
            ))}
          </ol>
          <p className="op-help">{trn("Who cancelled: {0}. Reason: {1}{2}.", trx(cancelledBy(trip.status)), cancelCode ? reasons.get(cancelCode) ?? cancelCode : tr("Not cancelled"), cancelCode ? ` (${cancelCode})` : "")}</p>
        </Section>

        <Section id="people" title={tr("People and car")} icon={<Users size={16} />} testId="trip-people">
          <div className="op-people">
            <div className="op-person rider">
              <small>{tr("Rider")}</small>
              <b>{rider}</b>
              {assignable && intervene ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small" aria-label={tr("Nearby drivers for {0}", [rider])} onClick={() => setAssignOpen(true)}>{trn("{0} Nearby drivers", <Radar size={13} aria-hidden="true" />)}</button> : null}
              <span>{trn("{0} Number hidden", <Lock size={11} aria-hidden="true" />)}</span>
            </div>
            <div className="op-person driver">
              <small>{tr("Driver")}</small>
              {trip.driverId ? <Link to={`/drivers/${encodeURIComponent(trip.driverId)}`}><b>{trip.driver?.firstName ?? trip.driverId}</b></Link> : <b>{tr("Not assigned")}</b>}
              <span>{trip.driverId ? trn("{0} Number hidden", <Lock size={11} aria-hidden="true" />) : "–"}</span>
            </div>
          </div>
          <div className="op-facts-list">
            <p>{trn("Driver {0}", trip.driverId ? <><Link to={`/drivers/${encodeURIComponent(trip.driverId)}`}>{trip.driver?.firstName ?? trip.driverId}</Link> · {trip.driverId}</> : tr("Unassigned"))}</p>
            <p>{trn("{0} Vehicle {1}", <Car size={13} aria-hidden="true" />, trip.driverId || trip.vehicleId ? carLabel(trip) : tr("Unassigned"))}</p>
            <p data-testid="trip-payment">{trn("{0} Payment {1} · {2}", <Banknote size={13} aria-hidden="true" />, trip.paymentStatus ? wordText(trip.paymentStatus) : "–", method)}</p>
            <p data-testid="trip-rating">{trn("{0} Rating {1}", <Star size={13} aria-hidden="true" />, trx(RATING_LABEL[trip.ratingStatus ?? ""] ?? "Not rated yet"))}</p>
            <p data-testid="trip-pin">{tr("PIN asked at pickup: {0}", [trip.pinRequired ? tr("Yes") : tr("No")])}</p>
          </div>
        </Section>
      </div>

      <Section id="offers" title={tr("Offer log")} icon={<Radar size={16} />} testId="trip-offer-log" wide>
        {offers.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
        <ErrorLine error={offers.error} onRetry={() => void offers.refetch()} />
        {offers.data && offers.data.items.length ? (
          <ol className="op-offer-log" aria-label={tr("Offer log")}>
            {[...offers.data.items].reverse().map((offer) => (
              <li key={offer.offerId} className={offer.status === "claimed" ? "won" : offer.status === "declined" || offer.status === "expired" ? "miss" : "step"} data-offer-id={offer.offerId}>
                <time title={tr("Answer by")}>{timeSec(offer.expiresAt)}</time>
                <b>{offerKindLabel(offer.kind)}{offer.driverId ? ` · ${offer.driverId}` : ""}</b>
                <span>{wordText(offer.status)} · {tr("Driver earns")} {liveMoney(offer.driverEarnings)}</span>
              </li>
            ))}
          </ol>
        ) : offers.data ? <p className="dx-calm">{tr("No offer was sent for this trip.")}</p> : null}
        <p className="op-help">{tr("One line per offer the server sent: the kind (Radar, Exclusive, Assigned by Movera), the driver, the answer and the time to answer by.")}</p>
      </Section>

      <Section id="assign" title={tr("Assign a driver")} icon={<Radar size={16} />} testId="trip-assign" wide>
        {isLocked(trip.status) && trip.driverId ? (
          <p className="as-locked" role="status">{trn("{0} Assigned to {1}. The assignment is locked.", <Lock size={14} aria-hidden="true" />, <b>{trip.driver?.firstName ?? trip.driverId}</b>)}</p>
        ) : assignable ? (
          <p className="op-help">{trn("The rider sees “Searching”. See the active drivers near the pickup to send an exclusive offer to one, or a radar group of up to 10.{0}", intervene ? <> <button data-command="admin.dispatch.view" type="button" className="dash-btn small" onClick={() => setAssignOpen(true)}>{trn("{0} Nearby drivers", <Radar size={13} aria-hidden="true" />)}</button></> : null)}</p>
        ) : <p className="dx-calm">{tr("Assigning is open only while the trip is requested, searching or offered.")}</p>}
        {assignable ? (
          <div className="op-action blue" data-testid="driver-bonus">
            <h4>{tr("Money for the driver")}</h4>
            <p className="op-help">{tr("Paid by Movera, never by the rider. Open offers show the new money at once.")}{trip.driverBonus ? ` ${tr("Already added: {0}.", [liveMoney(trip.driverBonus)])}` : ""}</p>
            <div className="op-inline">
              <label className="op-money"><input aria-label={tr("Money for the driver")} inputMode="decimal" value={bonusInput} placeholder="0" onChange={(event) => setBonusInput(event.target.value)} /><span>{currency}</span></label>
              <button data-command="admin.trip.driverBonus" type="button" className="dash-btn small" disabled={!bonus || !intervene} title={!intervene ? roleNo : undefined} onClick={() => setDialog("bonus")}>{tr("Add money")}</button>
            </div>
            {bonus === undefined ? <p className="dx-warn">{tr("Enter an amount above 0.")}</p> : null}
          </div>
        ) : null}
        {offers.data?.items.length ? <LiveOffers offers={offers.data.items} loading={false} error={null} onRetry={() => void offers.refetch()} /> : null}
      </Section>

      <Section id="route" title={tr("Route")} icon={<RouteIcon size={16} />} testId="trip-route" wide>
        <div className="op-route-grid">
          <MapPanel title={tr("Map")} note={<span className="op-legend">{trn("{0} Driven (GPS) {1} Pickup {2} Stop {3} Drop-off", <i className="ride" />, <i className="pickup" />, <i className="stop" />, <i className="dropoff" />)}</span>}>
            <RouteMap stops={stops} path={path} label={tr("Route of trip {0}", [trip.tripId])} />
          </MapPanel>
          <div>
            <ol className="op-stops" data-testid="trip-stops">
              {stops.map((stop, index) => (
                <li key={`${stop.kind}-${index}`} className={stop.kind}><i aria-hidden="true" />{stop.kind === "pickup" ? tr("Pickup") : stop.kind === "dropoff" ? tr("Drop-off") : tr("Stop")} · {stop.label}</li>
              ))}
            </ol>
            <dl className="op-facts">
              <div><dt>{tr("Distance")}</dt><dd>{km === null ? "–" : trn("{0} km", km)}</dd></div>
              <div><dt>{tr("Ride time")}</dt><dd>{minutes === null ? "–" : trn("{0} min", minutes)}</dd></div>
              <div><dt>{tr("Stops")}</dt><dd>{trip.stops.length}</dd></div>
            </dl>
            {!fixes.length ? <p className="op-help">{tr("No GPS trace for this trip yet: the map shows the stops only.")}</p> : null}
          </div>
        </div>
      </Section>

      <div className="op-trip-grid">
        <Section id="fare" title={tr("How the price was made")} icon={<ListOrdered size={16} />} testId="trip-fare">
          <ul className="op-lines">
            {(trip.fareLines ?? []).filter((line) => !DRIVER_ONLY_LINES.includes(line.code)).map((line, index) => (
              <li key={`${line.code}-${index}`} data-code={line.code}><span>{trx(FARE_LINE_LABEL[line.code] ?? line.code.replaceAll("_", " "))}</span><b>{liveMoney(line.amount)}</b></li>
            ))}
            {!(trip.fareLines ?? []).length ? <li><span>{tr("The server sent no price lines for this trip.")}</span></li> : null}
            <li className="total"><span>{trip.status === "completed" ? trn("Charged {0}", liveMoney(trip.fare)) : tr("Price {0}", [liveMoney(trip.fare)])}</span></li>
            <li data-testid="trip-method"><span>{tr("Payment method")}</span><b>{method}</b></li>
          </ul>
          {(trip.fareLines ?? []).some((line) => DRIVER_ONLY_LINES.includes(line.code)) || trip.pickupPay ? (
            <>
              <h4 className="op-sub">{tr("Paid by Movera to the driver (not in the rider's price)")}</h4>
              <ul className="op-lines" data-testid="trip-driver-lines">
                {(trip.fareLines ?? []).filter((line) => DRIVER_ONLY_LINES.includes(line.code)).map((line, index) => (
                  <li key={`${line.code}-${index}`} data-code={line.code}><span>{trx(FARE_LINE_LABEL[line.code] ?? line.code)}</span><b>{liveMoney(line.amount)}</b></li>
                ))}
                {trip.pickupPay && !(trip.fareLines ?? []).some((line) => line.code === "pickup_pay") ? <li data-code="pickup_pay"><span>{tr("Pickup pay")}</span><b>{liveMoney(trip.pickupPay)}</b></li> : null}
              </ul>
            </>
          ) : null}
        </Section>
        <Section id="split" title={tr("Who gets what")} icon={<Banknote size={16} />} testId="trip-money">
          <SplitView split={split} money={money} />
          {trip.pickupPay ? <p className="op-help" data-testid="split-pickup-pay">{tr("Driver gets includes {0} pickup pay.", [liveMoney(trip.pickupPay)])}</p> : null}
          {cash ? (
            <div className="op-cash" data-testid="trip-cash">
              <b>{trn("{0} Cash trip", <Coins size={13} aria-hidden="true" />)}</b>
              {cashMoney ? (
                <dl className="op-split-lines">
                  <div><dt>{tr("Cash collected by driver")}</dt><dd>{money(trip.cashToCollect?.amountMinor ?? cashMoney.collected)}</dd></div>
                  <div className="minus"><dt>{tr("Owed to Movera")}</dt><dd>{money(cashMoney.owed)}</dd></div>
                </dl>
              ) : <p className="op-help">{tr("The driver collects the fare in cash at the drop-off.")}</p>}
            </div>
          ) : null}
          {refunded > 0 || trip.paymentStatus === "partially_refunded" ? <p className="op-help">{can("audit.read") ? tr("Refunded so far: {0}.", [money(refunded)]) : tr("Some money was refunded; your role cannot read the audit, so the amount is not shown.")}</p> : null}
        </Section>
      </div>

      <Section id="chat" title={tr("Chat and calls")} icon={<MessagesSquare size={16} />} testId="trip-chat" wide>
        <p className="dx-calm">{tr("The server keeps no chat messages or calls for trips yet, so there is nothing to show here.")}</p>
        <p className="op-help">{tr("Calls go through the Movera line: rider and driver never see each other's real number. Calls are not recorded.")}</p>
      </Section>

      <Section id="waybill" title={tr("Waybill")} icon={<FileText size={16} />} testId="trip-waybill" wide>
        <dl className="waybill op-waybill">
          {([
            ["Trip", trip.tripId],
            ["Status", statusLabel(trip.status)],
            ["Issued at", zoneTimeLabel(trip.createdAt, trip.zoneId)],
            ["Fare", liveMoney(trip.fare)],
            ["Service", categoryName(trip.categoryId)],
            ["Rider", rider],
            ["Pickup", stops[0]?.label ?? ""],
            ["Drop-off", stops[stops.length - 1]?.label ?? ""],
            ["Source", trip.kind === "scheduled" ? tr("Reservation") : tr("Rider app")],
            ["Driver", trip.driver?.firstName ?? (trip.driverId || tr("Unassigned"))],
            ["Vehicle", [trip.driver?.vehicle?.make, trip.driver?.vehicle?.model].filter(Boolean).join(" ") || tr("Unassigned")],
            ["Licence plate", trip.driver?.vehicle?.plate ?? tr("Unassigned")],
            ["Passenger capacity", String(CATEGORIES.find((item) => item.id === trip.categoryId)?.seats ?? "–")],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt>{trx(label)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="actions" title={tr("Actions")} icon={<Wrench size={16} />} wide>
        <h4 className="op-sub">{tr("Admin actions")}</h4>
        <div className="op-actions-grid" data-testid="trip-admin-actions">
          <div className="op-action green" data-testid="part-refund">
            <h4>{trn("{0} Refund the rider", <RotateCcw size={15} aria-hidden="true" />)}</h4>
            {refundWhy ? <p className="op-help" data-testid="part-refund-block">{trx(refundWhy)}</p> : (
              <p className="op-help">{tr("Up to {0}, less earlier refunds. Above your role's limit, a second admin approves.", [money(left)])}</p>
            )}
            <div className="op-inline">
              <label className="op-money"><input aria-label={tr("Refund amount")} inputMode="decimal" value={refundInput} placeholder="0" disabled={Boolean(refundWhy)} onChange={(event) => setRefundInput(event.target.value)} /><span>{currency}</span></label>
              <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" disabled={Boolean(refundWhy) || left <= 0} onClick={() => setRefundInput(String(left / 100).replace(".", ","))}>{tr("Full amount")}</button>
              <button data-command="admin.trip.partRefund" type="button" className="dash-btn small" disabled={Boolean(blocked(refundWhy, "payments.refund")) || partMinor === null || Boolean(partError)} title={blocked(refundWhy, "payments.refund") ?? partError ?? undefined} onClick={() => setDialog("partRefund")}>{tr("Give money back")}</button>
            </div>
            {partError ? <p className="dx-warn">{partError}</p> : null}
          </div>
        </div>

        <div className="op-live">
          <h4 className="op-sub">{trn("Live trip controls {0}", <small>{tr("cancel, offer, reassign, no-show, complete, fare, waiting time and full refund")}</small>)}</h4>
          <div className="op-live-body" data-testid="trip-actions">
            <p data-testid="cancel-block">{cancelWhy ? trx(cancelWhy) : tr("Cancel is allowed in this state.")}</p>
            {control("cancel", tr("Cancel trip"), cancelWhy)}

            <label>{trn("Eligible driver{0}", <select aria-label={tr("Eligible driver")} value={chosen?.driverId ?? ""} onChange={(event) => setDriverId(event.target.value)} disabled={eligible.length === 0 || Boolean(offerBlock(trip.status))}>
              {eligible.length === 0 ? <option value="">{tr("No eligible driver")}</option> : null}
              {eligible.map((item) => <option key={item.driverId} value={item.driverId}>{item.firstName} · {item.driverId}</option>)}
            </select>)}</label>
            <p data-testid="offer-block">{offerWhy ? trx(offerWhy) : tr("Offer is allowed in this state. The driver gets an Assigned by Movera offer and still has to accept.")}</p>
            {control("offer", tr("Offer to driver"), offerWhy)}

            <p data-testid="reassign-block">{reassignWhy ? trx(reassignWhy) : tr("Reassign takes the trip off its driver and sends it back to dispatch (searching). Then offer it to a driver.")}</p>
            {control("reassign", tr("Reassign"), reassignWhy)}

            <p data-testid="noshow-block">{noShowWhy ? trx(noShowWhy) : tr("No-show ends the trip as no_show. The no-show fee follows the zone's waiting rules.")}</p>
            {control("noShow", tr("Mark rider no-show"), noShowWhy)}

            <p data-testid="complete-block">{completeWhy ? trx(completeWhy) : tr("Complete ends a stuck trip as completed with the current fare.")}</p>
            {control("complete", tr("Complete trip"), completeWhy)}

            <div className="field-grid">
              <label>{trn("Fare adjustment (%){0}", <input aria-label={tr("Fare adjustment percent")} type="number" min="-15" max="15" step="1" value={farePercent} onChange={(event) => setFarePercent(event.target.value)} />)}</label>
              <label>{trn("Waiting minutes{0}", <input aria-label={tr("Waiting minutes")} type="number" min="0" max="120" step="1" value={waitingInput === "" ? String(chargedMin) : waitingInput} onChange={(event) => setWaitingInput(event.target.value)} />)}</label>
            </div>

            <p data-testid="adjust-block">{adjustWhy ? trx(adjustWhy) : tr("Fare can be adjusted by up to ±15% in this state.")}</p>
            {control("adjust", tr("Apply fare adjustment"), adjustWhy)}

            <p data-testid="waiting-block">{waitingWhy ? trx(waitingWhy) : tr("Waiting time can be corrected in this state.")}</p>
            {control("waiting", tr("Save waiting time"), waitingWhy)}

            <p data-testid="refund-block">{refundWhy ? trx(refundWhy) : tr("Refund is allowed. The captured terminal payment can be returned.")}</p>
            {control("refund", tr("Refund"), refundWhy, "payments.refund")}
          </div>
        </div>
      </Section>

      <Section id="history" title={tr("Who did what")} icon={<History size={16} />} testId="trip-history" wide>
        <h4 className="op-sub">{trn("{0} Intervention audit", <ShieldCheck size={13} aria-hidden="true" />)}</h4>
        {!can("audit.read") ? (
          <p className="state-line">{tr("Your role cannot read the audit, so the admin work on this trip is not shown.")}</p>
        ) : audit.isLoading ? <p className="state-line">{tr("Loading.")}</p> : audit.error ? <ErrorLine error={audit.error} onRetry={() => void audit.refetch()} /> : auditRows.length === 0 ? (
          <p className="state-line">{tr("No audited admin intervention on this trip yet.")}</p>
        ) : (
          <ul aria-label={tr("Trip intervention audit")} className="op-history">
            {auditRows.map((item) => (
              <li key={item.auditId}><time>{zoneTimeLabel(item.at, trip.zoneId)}</time><b>{item.actorId}{item.actorRole ? ` (${item.actorRole})` : ""}</b><span>{item.action} · {item.result === "pending_approval" ? tr("waits for a second admin") : tr("done")}{item.reason ? ` · ${item.reason}` : ""}</span></li>
            ))}
          </ul>
        )}
        <p className="op-help">{trn("{0} Every action here is also in Reports → Admin work, with the admin's name.", <MapPinned size={12} aria-hidden="true" />)}</p>
      </Section>

      {assignOpen ? <LiveAssignDialog trip={trip} rider={rider} onClose={() => setAssignOpen(false)} /> : null}

      <LiveCommandDialog open={dialog === "cancel"} title={tr("Cancel trip")} summary={tr("Cancels {0}. The rider pays nothing; the reason and note go in the audit.", [trip.tripId])} reasons={adminReasons} reasonLabel={tr("Cancel reason")} onClose={() => setDialog(null)}
        onSend={({ reasonCode, note }) => run("cancel", { reasonCode, note }, tr("Trip cancelled.")).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "reassign"} title={tr("Reassign")} summary={tr("Takes {0} off {1} and sends it back to dispatch.", [trip.tripId, trip.driver?.firstName ?? trip.driverId ?? ""])} reasons={adminReasons} reasonLabel={tr("Reason")} onClose={() => setDialog(null)}
        onSend={({ reasonCode, note }) => run("reassign", { reasonCode, note }, tr("The trip is back in dispatch.")).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "offer"} title={tr("Offer to driver")} summary={tr("Send an exclusive offer for {0} to {1}.", [rider, chosen?.firstName ?? ""])} note="optional" onClose={() => setDialog(null)}
        onSend={({ note }) => run("assign", { driverId: chosen?.driverId, ...(note ? { note } : {}) }, tr("Exclusive offer sent to {0}.", [chosen?.firstName ?? ""])).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "noShow"} title={tr("Mark rider no-show")} summary={tr("Ends {0} as no-show.", [trip.tripId])} checkbox={tr("Waive the no-show fee")} onClose={() => setDialog(null)}
        onSend={({ note, checked }) => run("no-show", { note, waiveFee: checked }, checked ? tr("Marked no-show; the fee is waived.") : tr("Marked no-show.")).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "complete"} title={tr("Complete trip")} summary={tr("Ends {0} as completed with the current fare, {1}.", [trip.tripId, liveMoney(trip.fare)])} onClose={() => setDialog(null)}
        onSend={({ note }) => run("complete", { note }, tr("Trip completed.")).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "adjust"} title={tr("Apply fare adjustment")} summary={tr("The fare goes from {0} to {1}.", [liveMoney(trip.fare), money(newFare)])} noteLabel={tr("Reason (required)")} onClose={() => setDialog(null)}
        onSend={({ note }) => run("adjust", { fare: { amountMinor: newFare, currency }, reason: note }, tr("Fare changed to {0}.", [money(newFare)])).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "waiting"} title={tr("Save waiting time")} summary={tr("Waiting time charged goes from {0} min to {1} min.", [chargedMin, waitingValue])} noteLabel={tr("Reason (required)")} onClose={() => setDialog(null)}
        onSend={({ note }) => run("adjust", { waitingSeconds: waitingValue * 60, reason: note }, tr("Waiting time saved.")).then(() => { setWaitingInput(""); })} />
      <LiveCommandDialog open={dialog === "refund"} title={tr("Refund trip")} summary={tr("Gives {0} back to the rider: all that is left to refund.", [money(left)])} noteLabel={tr("Reason (required)")} onClose={() => setDialog(null)}
        onSend={({ note }) => run("refund", { amount: { amountMinor: left, currency }, reason: note }, tr("{0} refunded to {1}.", [money(left), rider])).then(() => undefined)} />
      <LiveCommandDialog open={dialog === "partRefund"} title={tr("Refund trip")} summary={tr("Gives {0} back to the rider.", [money(partMinor ?? 0)])} noteLabel={tr("Reason (required)")} onClose={() => setDialog(null)}
        onSend={({ note }) => run("refund", { amount: { amountMinor: partMinor, currency }, reason: note }, tr("{0} refunded to {1}.", [money(partMinor ?? 0), rider])).then(() => { setRefundInput(""); })} />
      <LiveCommandDialog open={dialog === "bonus"} title={tr("Money for the driver")} summary={tr("Adds {0} for the driver on {1}, paid by Movera.", [bonus ? money(bonus.amountMinor) : "", trip.tripId])} note="optional" onClose={() => setDialog(null)}
        onSend={({ note }) => run("driver-bonus", { amount: bonus, ...(note ? { note } : {}) }, tr("{0} added for the driver.", [bonus ? money(bonus.amountMinor) : ""])).then(() => { setBonusInput(""); })} />
    </div>
  );
}
