import { useEffect, useMemo, useState } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useParams } from "react-router";
import {
  answerAsk,
  askDriver,
  currentAsk,
  emptyReservationBook,
  normalizeReservationBook,
  notAccepted,
  raiseFare,
  recordReservationContact,
  reservationCandidates,
  reservationOps,
  reservationWarning,
  scheduleReturnRide,
  timeZoneCity,
  zonedLabel,
  zonedLocalToIso,
  zonedLocalValue,
  touchReservation,
  unassignReservation,
  useAudit,
  useRecords,
  useSlice,
  type ReservationBook,
} from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { reservationFareMinor } from "../dashboard/scheduled";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook, raiseCap, raiseSplit, type DispatchBook } from "../dispatch/rules";
import { statusLabel } from "../domain/labels";
import { market, marketOfZone } from "../markets/markets";
import { currencySymbol, emptyPricingStore, money as formatMajor, normalizeStore, SLICE_KEY as PRICING_KEY, zoneBook, type PricingStore } from "../pricing/zonePricing";
import { CommandButton } from "../ui/CommandButton";
import { SensitiveValue } from "../ui/SensitiveValue";
import { tr, trn } from "../i18n";
import { categoryName } from "../riders/profile";

export function ReservationDetailPage() {
  const { id = "" } = useParams();
  const { agent } = useSession();
  const reservations = useRecords("reservations", null);
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const riders = useRecords("riders", null);
  const audit = useAudit();
  const store = useSlice<ReservationBook>("reservationOps", emptyReservationBook());
  const book = useMemo(() => normalizeReservationBook(store.value), [store.value]);
  const dispatchSlice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const pricingSlice = useSlice<PricingStore>(PRICING_KEY, emptyPricingStore());
  const record = reservations.data?.find((item) => item.id === id);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // While a driver is being asked, count the seconds down.
  const asking = Boolean(record && reservationOps(book, record).asks[0]?.answer === "waiting");
  useEffect(() => {
    if (!asking) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [asking]);
  const [driverId, setDriverId] = useState("");
  const [contactChannel, setContactChannel] = useState<"call" | "sms">("sms");
  const [contactNote, setContactNote] = useState("");
  const [returnLocal, setReturnLocal] = useState("");
  const [returnDisambiguation, setReturnDisambiguation] = useState<"earlier" | "later">("earlier");
  const [notice, setNotice] = useState("");
  const [raiseText, setRaiseText] = useState("");

  if (reservations.isLoading || drivers.isLoading || vehicles.isLoading || store.loading) {
    return <p className="state-line">{tr("Loading reservation.")}</p>;
  }
  if (!record) {
    return <NotFoundRecord kind="Reservation" id={id} list="/reservations" back={tr("Back to reservations")} />;
  }

  const ops = reservationOps(book, record);
  const nowIso = new Date(Math.max(nowMs, Date.now())).toISOString();
  const said = notAccepted(ops, nowIso);
  const candidates = reservationCandidates(record, ops, drivers.data ?? [], vehicles.data ?? []);
  const fresh = candidates.filter((item) => !said.has(item.id));
  const chosen = candidates.some((item) => item.id === driverId) ? driverId : fresh[0]?.id ?? candidates[0]?.id ?? "";
  const rider = (riders.data ?? []).find((item) => item.phone === record.phone);
  const zoneRules = liveRules(normalizeDispatchBook(dispatchSlice.value), record.zoneId).reservation;
  const ask = currentAsk(ops, nowIso);
  const askName = ask ? (drivers.data ?? []).find((item) => item.id === ask.ask.driverId)?.name ?? ask.ask.driverId : "";
  const country = marketOfZone(record.zoneId)?.id ?? "SE";
  const unit = currencySymbol(country);
  const fare = reservationFareMinor(record);
  const fareMajor = fare.minor / market(country).minorUnits;
  const commissionPct = zoneBook(normalizeStore(pricingSlice.value), record.zoneId).commission[ops.category ?? "economy"] ?? 20;
  const raiseMax = Math.min(zoneRules.raiseMax, raiseCap(country));
  const raiseAmount = raiseText.trim() === "" ? 0 : Number(raiseText.replace(",", "."));
  const split = raiseSplit(raiseAmount, fareMajor, commissionPct);
  const warning = reservationWarning(record, ops, nowIso);
  const canIntervene = Boolean(agent && can(agent.role, "trips.intervene"));
  const pickupFuture = Date.parse(ops.pickupAt) > Date.parse(nowIso);
  const isOpen = ["waiting", "booked", "assigned"].includes(record.status);
  const canAssign = canIntervene && pickupFuture && ["waiting", "booked"].includes(record.status) && candidates.length > 0 && ask?.state !== "waiting";
  const canAnswer = canIntervene && ask?.state === "waiting" && ["waiting", "booked"].includes(record.status);
  const canRaise = canIntervene && zoneRules.raiseFare && pickupFuture && ["waiting", "booked"].includes(record.status) && !record.driverId;
  const canUnassign = canIntervene && record.status === "assigned" && Boolean(record.driverId);
  const canCancel = canIntervene && ["waiting", "booked", "assigned"].includes(record.status);
  const canNoShow = canCancel && !pickupFuture;

  const contactPrepared = recordReservationContact(
    book,
    record,
    agent?.id ?? "",
    contactChannel,
    contactNote,
    new Date().toISOString(),
  );
  const askPrepared = askDriver(book, record, chosen, agent?.id ?? "", zoneRules.assignAcceptSec, nowIso);
  const acceptPrepared = answerAsk(book, record, "accepted", nowIso);
  const declinePrepared = answerAsk(book, record, "declined", nowIso);
  const raisePrepared = raiseFare(book, record, raiseAmount, raiseMax, agent?.id ?? "", nowIso, unit);
  const show = (value: number) => formatMajor(value, country);
  const unassignPrepared = touchReservation(book, record, agent?.id ?? "", `Driver ${record.driverId ?? "none"} unassigned`);
  const cancelPrepared = touchReservation(book, record, agent?.id ?? "", "Reservation cancelled");
  const noShowPrepared = touchReservation(book, record, agent?.id ?? "", "Rider did not show up");

  // Times are shown and typed in the reservation zone's own time zone (Tunis has no DST and is UTC+1).
  const timeZone = market(country).timeZone;
  const city = timeZoneCity(timeZone);
  const shownReturnLocal = returnLocal || (ops.returnPickupAt ? zonedLocalValue(ops.returnPickupAt, timeZone) : "");
  const parsedReturn = shownReturnLocal
    ? zonedLocalToIso(shownReturnLocal, timeZone, returnDisambiguation)
    : { iso: undefined, error: undefined, ambiguous: false };
  const returnPrepared = scheduleReturnRide(book, record, parsedReturn.iso ?? null, agent?.id ?? "");
  const removeReturnPrepared = scheduleReturnRide(book, record, null, agent?.id ?? "");
  const reservationAudits = (audit.data ?? []).filter((item) => item.targetId === record.id).slice(0, 30);

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{trn("Reservation {0}", record.id)}</h2>
          <p>{trn("{0} · {1} · {2} · {3} · policy {4}", record.name, statusLabel(record.status), categoryName(ops.category ?? "economy"), record.zoneId, ops.policy.version)}</p>
        </div>
        <Link to="/reservations">{tr("Back to reservations")}</Link>
      </div>

      <p className="state-line">
        {warning ? tr("Attention: {0}", [warning]) : tr("Reservation timing is within policy.")}
        {notice ? ` ${notice}` : ""} {store.message}
      </p>

      <div className="split">
        <article className="panel" data-testid="reservation-summary">
          <h3>{tr("Schedule")}</h3>
          <p>{trn("Pickup {0} · {1}.", zonedLabel(ops.pickupAt, timeZone), timeZone)}</p>
          <p>{trn("Return {0}.", ops.returnPickupAt ? zonedLabel(ops.returnPickupAt, timeZone) : tr("Not scheduled"))}</p>
          <p>{trn("Driver {0}.", record.driverId ?? tr("Unassigned"))}</p>
          <p>{trn("Rider {0} ·", rider ? <Link to={`/riders/${rider.id}`}>{rider.name}</Link> : record.name)}{" "}<SensitiveValue value={record.phone} permission="riders.viewSensitive" command="admin.rider.revealSensitive" targetId={rider?.id ?? record.id} label={tr("Phone")} />
          </p>
        </article>

        <article className="panel" data-testid="reservation-policy-snapshot">
          <h3>{trn("Policy snapshot · {0}", ops.policy.version)}</h3>
          <ul className="version-list">
            <li>{trn("Booking horizon {0} days", ops.policy.bookingHorizonDays)}</li>
            <li>{trn("Assignment lead {0} min", ops.policy.assignmentLeadMinutes)}</li>
            <li>{trn("Give-up {0} min", ops.policy.giveUpMinutes)}</li>
            <li>{trn("Included waiting {0} min", ops.policy.includedWaitingMinutes)}</li>
          </ul>
          <p className="state-line">{tr("This snapshot does not change when the current reservation policy is updated.")}</p>
        </article>
      </div>

      <article className="panel" data-testid="reservation-dispatch">
        <h3>{tr("Driver assignment")}</h3>
        <p className="state-line">{trn("The driver must accept. The ride reaches them like an Exclusive, “Assigned by Movera”, with {0} s to accept. If they do not accept, pick someone else.", zoneRules.assignAcceptSec)}</p>
        {ask && ask.state !== "accepted" ? (
          <div className={`resv-ask ${ask.state}`} data-testid="reservation-ask" role="status">
            {ask.state === "waiting" ? <p>{trn("{0} · waiting for {1} ({2}) to accept · {3} left", <b>{tr("Assigned by Movera")}</b>, askName, ask.ask.driverId, <b>{ask.secondsLeft} s</b>)}</p> : null}
            {ask.state === "expired" ? <p>{trn("{0} Pick someone else.", <b>{trn("{0} did not accept in time.", askName)}</b>)}</p> : null}
            {ask.state === "declined" ? <p>{trn("{0} Pick someone else.", <b>{trn("{0} said no.", askName)}</b>)}</p> : null}
            {ask.state === "waiting" ? (
              <div className="actions">
                <CommandButton
                  command="admin.reservation.answer"
                  className="secondary-btn"
                  type="button"
                  targetId={record.id}
                  confirmTarget={false}
                  entityState={record.status}
                  scope={record.zoneId}
                  collection="reservations"
                  patch={{ driverId: ask.ask.driverId, status: "assigned" }}
                  before="waiting for the driver"
                  after={`accepted by ${ask.ask.driverId}`}
                  expectedSliceRev={book.draftRev}
                  sliceKey="reservationOps"
                  value={acceptPrepared.book}
                  disabled={!canAnswer || Boolean(acceptPrepared.error)}
                  title={acceptPrepared.error}
                  onDone={() => setNotice(tr("{0} accepted. The ride is theirs.", [askName]))}
                >{tr("Driver accepted (demo)")}</CommandButton>
                <CommandButton
                  command="admin.reservation.answer"
                  className="secondary-btn"
                  type="button"
                  targetId={record.id}
                  confirmTarget={false}
                  entityState={record.status}
                  scope={record.zoneId}
                  before="waiting for the driver"
                  after={`declined by ${ask.ask.driverId}`}
                  expectedSliceRev={book.draftRev}
                  sliceKey="reservationOps"
                  value={declinePrepared.book}
                  disabled={!canAnswer || Boolean(declinePrepared.error)}
                  title={declinePrepared.error}
                  onDone={() => setNotice(tr("{0} said no. Pick someone else.", [askName]))}
                >{tr("Driver said no (demo)")}</CommandButton>
              </div>
            ) : null}
            {ask.state === "waiting" ? <p className="fine-print">{tr("Demo: in the live system the answer comes from the driver app.")}</p> : null}
          </div>
        ) : null}
        <label>{tr("Eligible driver")}<select
            aria-label={tr("Reservation driver")}
            value={chosen}
            disabled={!canIntervene || candidates.length === 0 || !isOpen || !pickupFuture}
            onChange={(event) => setDriverId(event.target.value)}
          >
            {candidates.length === 0 ? <option value="">{tr("No eligible driver")}</option> : null}
            {candidates.map((driver) => {
              const vehicle = (vehicles.data ?? []).find((item) => item.driverId === driver.id);
              return <option key={driver.id} value={driver.id}>{driver.name} · {driver.id} · {vehicle?.plate ?? tr("vehicle")}{said.has(driver.id) ? tr(" · did not accept") : ""}</option>;
            })}
          </select>
        </label>
        <p className="state-line">{trn("Candidates require an active driver and an eligible vehicle matching category {0}.", categoryName(ops.category ?? "economy"))}</p>
        <div className="actions">
          <CommandButton
            command="admin.reservation.assign"
            className="primary-btn"
            type="button"
            targetId={record.id}
            confirmTarget={false}
            entityState={record.status}
            scope={record.zoneId}
            before={record.driverId ?? "unassigned"}
            after={chosen ? `assigned by Movera to ${chosen}, waiting to accept` : "no driver"}
            expectedSliceRev={book.draftRev}
            sliceKey="reservationOps"
            value={askPrepared.book}
            disabled={!canAssign || Boolean(askPrepared.error)}
            title={!canAssign ? (!canIntervene ? tr("Your role is read-only.") : !pickupFuture ? tr("Pickup time has already passed.") : ask?.state === "waiting" ? tr("Waiting for {0} to accept.", [askName]) : candidates.length === 0 ? tr("No eligible driver.") : tr("Reservation cannot be assigned in this state.")) : askPrepared.error}
            onDone={() => setNotice(tr("Sent to {0} as “Assigned by Movera”. Waiting for the driver to accept.", [chosen]))}
          >{tr("Assign driver")}</CommandButton>

          <CommandButton
            command="admin.reservation.unassign"
            className="secondary-btn"
            type="button"
            targetId={record.id}
            confirmTarget={false}
            entityState={record.status}
            scope={record.zoneId}
            collection="reservations"
            patch={unassignReservation(record)}
            before={record.driverId ?? "unassigned"}
            after="unassigned"
            expectedSliceRev={book.draftRev}
            sliceKey="reservationOps"
            value={unassignPrepared}
            disabled={!canUnassign}
            title={!canUnassign ? tr("Only an assigned reservation can be unassigned.") : undefined}
            onDone={() => setNotice(tr("Driver unassigned. Reservation returned to waiting."))}
          >{tr("Unassign")}</CommandButton>
        </div>

        <h4>{tr("Offer history")}</h4>
        {ops.offers.length === 0 ? <p className="state-line">{tr("No offer has been logged yet.")}</p> : (
          <ol className="version-list" aria-label={tr("Reservation offer history")}>
            {ops.offers.map((item) => <li key={item.id}>{item.at} · {item.driverId} · {item.result} · {item.actorId}</li>)}
          </ol>
        )}
      </article>

      {isOpen && !record.driverId ? (
        <article className="panel" data-testid="reservation-raise">
          <h3>{tr("Raise the driver's fare")}</h3>
          {!zoneRules.raiseFare ? <p>{trn("Raising the fare is off in this zone. Change it in {0}.", <Link to={`/dispatch?zone=${record.zoneId}&tab=reservations`}>{tr("Dispatch › Reservations")}</Link>)}</p> : (
            <>
              <p>{tr("Nobody has taken it yet. A higher fare helps a driver take it. It is paid from Movera's commission; the rider pays the same.")}</p>
              <p className="state-line">{trn("Fare {0}{1} · Movera's commission {2}% = {3} · highest raise {4}.", show(fareMajor), fare.estimated ? tr(" (estimate)") : "", commissionPct, show(split.commission), show(raiseMax))}</p>
              <label>{trn("Raise by ({0})", unit)}<input aria-label={tr("Fare raise")} inputMode="decimal" value={raiseText} disabled={!canRaise} onChange={(event) => setRaiseText(event.target.value.replace(/[^\d.,]/g, ""))} placeholder={tr("For example {0}", [Math.round(raiseMax / 5)])} />
              </label>
              {raiseAmount > 0 && split.beyond > 0 ? <p className="resv-raise over" role="status">{trn("Goes {0} beyond Movera's commission. Movera pays the difference.", show(split.beyond))}</p> : null}
              {raiseAmount > 0 && split.beyond === 0 ? <p className="resv-raise" role="status">{trn("All from Movera's commission. {0} of it is left.", show(split.commission - split.fromCommission))}</p> : null}
              {raiseText && raisePrepared.error ? <p className="state-line" role="alert">{raisePrepared.error}</p> : null}
              <div className="actions">
                <CommandButton
                  command="admin.reservation.raise"
                  className="primary-btn"
                  type="button"
                  targetId={record.id}
                  confirmTarget={false}
                  entityState={record.status}
                  scope={record.zoneId}
                  before={ops.raise ? `+${ops.raise.amount} ${unit}` : "no raise"}
                  after={`+${raiseAmount} ${unit}`}
                  expectedSliceRev={book.draftRev}
                  sliceKey="reservationOps"
                  value={raisePrepared.book}
                  disabled={!canRaise || !raiseText || Boolean(raisePrepared.error)}
                  title={!canRaise ? (!canIntervene ? tr("Your role is read-only.") : tr("Only a future ride without a driver can get a higher fare.")) : raisePrepared.error}
                  onDone={() => {
                    setNotice(tr("Driver fare raised by {0}. Drivers see the new fare.", [show(raiseAmount)]));
                    setRaiseText("");
                  }}
                >{tr("Raise the fare")}</CommandButton>
              </div>
            </>
          )}
          {ops.raise ? <p className="state-line" data-testid="reservation-raise-now">{trn("Raised by {0} · {1} · {2}. Drivers see +{3} on the offer.", show(ops.raise.amount), ops.raise.by, ops.raise.at.slice(0, 16).replace("T", " "), show(ops.raise.amount))}</p> : null}
        </article>
      ) : null}

      <article className="panel" data-testid="reservation-contact">
        <h3>{tr("Contact rider")}</h3>
        <div className="field-grid">
          <label>{tr("Channel")}<select aria-label={tr("Contact channel")} value={contactChannel} onChange={(event) => setContactChannel(event.target.value as "call" | "sms")}>
              <option value="sms">SMS</option>
              <option value="call">{tr("Call")}</option>
            </select>
          </label>
          <label>{tr("Contact note")}<input aria-label={tr("Contact note")} value={contactNote} onChange={(event) => setContactNote(event.target.value)} />
          </label>
        </div>
        <CommandButton
          command="admin.reservation.contact"
          className="secondary-btn"
          type="button"
          targetId={record.id}
          confirmTarget={false}
          entityState={record.status}
          scope={record.zoneId}
          before={`${ops.contacts.length} contacts`}
          after={`${contactChannel} contact`}
          expectedSliceRev={book.draftRev}
          sliceKey="reservationOps"
          value={contactPrepared.book}
          disabled={!canIntervene || !isOpen || Boolean(contactPrepared.error)}
          title={contactPrepared.error ?? (!isOpen ? tr("Cancelled/completed reservations cannot be contacted from dispatch.") : undefined)}
          onDone={() => {
            setNotice(tr("{0} contact logged.", [contactChannel.toUpperCase()]));
            setContactNote("");
          }}
        >{tr("Log contact")}</CommandButton>

        {ops.contacts.length === 0 ? <p className="state-line">{tr("No contact attempt has been logged.")}</p> : (
          <ol className="version-list" aria-label={tr("Reservation contacts")}>
            {ops.contacts.map((item) => <li key={item.id}>{item.at} · {item.channel} · {item.actorId} · {item.note}</li>)}
          </ol>
        )}
      </article>

      <article className="panel" data-testid="reservation-return">
        <h3>{tr("Return ride")}</h3>
        <p>{trn("Return scheduling is stored as an absolute instant and displayed in {0}.", timeZone)}</p>
        <div className="field-grid">
          <label>{tr("Return pickup")}<input
              aria-label={tr("Return pickup")}
              type="datetime-local"
              value={shownReturnLocal}
              onChange={(event) => setReturnLocal(event.target.value)}
              disabled={!canIntervene || !isOpen}
            />
          </label>
          <label>{tr("Repeated DST hour")}<select
              aria-label={tr("DST disambiguation")}
              value={returnDisambiguation}
              onChange={(event) => setReturnDisambiguation(event.target.value as "earlier" | "later")}
              disabled={!canIntervene || !parsedReturn.ambiguous}
            >
              <option value="earlier">{tr("Earlier occurrence")}</option>
              <option value="later">{tr("Later occurrence")}</option>
            </select>
          </label>
        </div>
        {parsedReturn.error ? <p className="state-line">{parsedReturn.error}</p> : null}
        {parsedReturn.ambiguous ? <p className="state-line">{trn("This {0} local time occurs twice because the DST clock moves back. Choose which occurrence is intended.", city)}</p> : null}
        <div className="actions">
          <CommandButton
            command="admin.reservation.return"
            className="primary-btn"
            type="button"
            targetId={record.id}
            confirmTarget={false}
            entityState={record.status}
            scope={record.zoneId}
            before={ops.returnPickupAt ?? "none"}
            after={parsedReturn.iso ?? "invalid"}
            expectedSliceRev={book.draftRev}
            sliceKey="reservationOps"
            value={returnPrepared.book}
            disabled={!canIntervene || !isOpen || !shownReturnLocal || Boolean(parsedReturn.error) || Boolean(returnPrepared.error)}
            title={parsedReturn.error ?? returnPrepared.error}
            onDone={() => {
              setReturnLocal("");
              setNotice(tr("Return ride saved with {0} DST validation.", [city]));
            }}
          >{tr("Save return ride")}</CommandButton>
          <CommandButton
            command="admin.reservation.return"
            className="secondary-btn"
            type="button"
            targetId={record.id}
            confirmTarget={false}
            entityState={record.status}
            scope={record.zoneId}
            before={ops.returnPickupAt ?? "none"}
            after="none"
            expectedSliceRev={book.draftRev}
            sliceKey="reservationOps"
            value={removeReturnPrepared.book}
            disabled={!canIntervene || !isOpen || !ops.returnPickupAt}
            onDone={() => {
              setReturnLocal("");
              setNotice(tr("Return ride removed."));
            }}
          >{tr("Remove return")}</CommandButton>
        </div>
      </article>

      <article className="panel" data-testid="reservation-cancel">
        <h3>{tr("Cancellation")}</h3>
        <p>{trn("Policy snapshot {0} stays attached after cancellation.", ops.policy.version)}</p>
        <CommandButton
          command="admin.reservation.cancel"
          className="secondary-btn"
          type="button"
          targetId={record.id}
          entityState={record.status}
          scope={record.zoneId}
          collection="reservations"
          patch={{ status: "cancelled" }}
          before={record.status}
          after="cancelled"
          expectedSliceRev={book.draftRev}
          sliceKey="reservationOps"
          value={cancelPrepared}
          disabled={!canCancel}
          title={!canCancel ? tr("Reservation is already terminal.") : undefined}
          storeReason
          onDone={() => setNotice(tr("Reservation cancelled. Policy {0} remains on the booking.", [ops.policy.version]))}
        >{tr("Cancel reservation")}</CommandButton>
        <p>{tr("Mark a no-show when the pickup time has passed and the rider did not come.")}</p>
        <CommandButton
          command="admin.reservation.noShow"
          className="secondary-btn"
          type="button"
          targetId={record.id}
          entityState={record.status}
          scope={record.zoneId}
          collection="reservations"
          patch={{ status: "no_show" }}
          before={record.status}
          after="no_show"
          expectedSliceRev={book.draftRev}
          sliceKey="reservationOps"
          value={noShowPrepared}
          disabled={!canNoShow}
          title={!canNoShow ? (pickupFuture ? tr("Available once the pickup time has passed.") : tr("Reservation is already terminal.")) : undefined}
          storeReason
          onDone={() => setNotice(tr("Reservation marked as no-show."))}
        >{tr("Mark no-show")}</CommandButton>
      </article>

      <article className="panel" data-testid="reservation-activity">
        <h3>{tr("Activity and audit")}</h3>
        <ul className="version-list">
          {ops.activity.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
        <h4>{tr("Command audit")}</h4>
        {reservationAudits.length === 0 ? <p className="state-line">{tr("No audited reservation command yet.")}</p> : (
          <ul aria-label={tr("Reservation audit")} className="version-list">
            {reservationAudits.map((item) => <li key={item.id}>{item.at} · {item.action} · {item.result} · {item.actorId} · {item.reason}</li>)}
          </ul>
        )}
      </article>
    </>
  );
}
