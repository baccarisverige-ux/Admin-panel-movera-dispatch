import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { NoAccess } from "../ui/kit";
import { Modal } from "../ui/Modal";
import { tr } from "../i18n";
import { CURRENCIES, type CurrencyCode } from "../domain/money";
import { useLiveSession } from "./LiveSessionContext";
import { Word, carLabel } from "./LiveTripsPage";
import { liveMoney, parseMinor, tripTimeline } from "./format";
import { DateText, ErrorLine, Field, Status, isVersionMismatch } from "./ui";
import type { Page, Refund, Trip, TripOffer } from "./types";

const TERMINAL = ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

/** contract §7: only a finished trip whose money was taken can be refunded (the server answers not_paid otherwise). */
export function refundable(trip: Pick<Trip, "status" | "paymentStatus">): boolean {
  return TERMINAL.includes(trip.status) && (trip.paymentStatus === "captured" || trip.paymentStatus === "partially_refunded");
}

/** contract §5: an admin may mark a no-show while the driver is on the way or waiting at pickup. */
export const NO_SHOW_FROM = ["accepted", "driver_to_pickup", "arrived"];

/**
 * GET /api/v1/admin/trips/{tripId} and /offers: the trip's id, status, rider, driver, car, route, money, timeline and the
 * offers sent; Refund (POST /admin/trips/{tripId}/refund, payments.refund) on a paid, finished trip.
 */
export function LiveTripDetailPage() {
  const { tripId = "" } = useParams();
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const [refundOpen, setRefundOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const key = ["live", "trip", tripId];
  const query = useQuery({ queryKey: key, queryFn: () => client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`), enabled: can("trips.read") && Boolean(tripId) });
  const offers = useQuery({
    queryKey: ["live", "trip-offers", tripId],
    queryFn: () => client.json<Page<TripOffer>>(`/admin/trips/${encodeURIComponent(tripId)}/offers?limit=50`),
    enabled: can("trips.read") && Boolean(tripId) && Boolean(query.data),
  });
  const reload = () => void queryClient.invalidateQueries({ queryKey: key });

  if (!can("trips.read")) return <NoAccess />;
  if (query.isLoading) return <p className="state-line">{tr("Loading trip.")}</p>;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundRecord kind="Trip" list="/trips" listLabel="Trips" />;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;

  const trip = query.data;
  const canRefund = can("payments.refund") && refundable(trip);
  const canNoShow = can("trips.intervene") && NO_SHOW_FROM.includes(trip.status);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="crumb"><Link to="/trips">{tr("Trips")}</Link> · {trip.zoneId}</p>
          <h2>{trip.tripId}</h2>
          <p>
            <Status code={trip.status} /> · {trip.kind === "scheduled" ? tr("Reservation") : tr("Ride now")} · {trip.categoryId}
          </p>
        </div>
        {canRefund || canNoShow ? (
          <div className="actions">
            {canNoShow ? <button data-command="admin.server.tripNoShow" type="button" className="secondary-btn" onClick={() => setNoShowOpen(true)}>{tr("Mark no-show")}</button> : null}
            {canRefund ? <button data-command="admin.server.tripRefund" type="button" className="primary-btn" onClick={() => setRefundOpen(true)}>{tr("Refund")}</button> : null}
          </div>
        ) : null}
      </div>
      {notice ? <p className="state-line" role="status">{notice}</p> : null}

      <div className="live-grid">
        <section className="panel" data-testid="trip-people">
          <h3>{tr("Rider, driver and car")}</h3>
          <div className="live-fields">
            <Field label={tr("Rider")}>{trip.riderId}</Field>
            <Field label={tr("Driver")}>
              {trip.driverId ? <Link to={`/drivers/${encodeURIComponent(trip.driverId)}`}>{trip.driver?.firstName ?? trip.driverId}</Link> : tr("No driver")}
            </Field>
            <Field label={tr("Car")}>{carLabel(trip)}</Field>
            <Field label={tr("Pickup")}>{trip.pickup.address ?? `${trip.pickup.lat}, ${trip.pickup.lng}`}</Field>
            {trip.stops.map((stop, index) => (
              <Field key={index} label={tr("Stop {0}", [index + 1])}>{stop.address ?? `${stop.lat}, ${stop.lng}`}</Field>
            ))}
            <Field label={tr("Drop-off")}>{trip.dropoff.address ?? `${trip.dropoff.lat}, ${trip.dropoff.lng}`}</Field>
            <Field label={tr("Version")}>{trip.version}</Field>
          </div>
        </section>
        <section className="panel" data-testid="trip-money">
          <h3>{tr("Money")}</h3>
          <div className="live-fields">
            <Field label={tr("Rider pays")}>{liveMoney(trip.fare)}</Field>
            <Field label={tr("Driver earns")}>{liveMoney(trip.driverEarnings)}</Field>
            <Field label={tr("Commission")}>{liveMoney(trip.commission)}</Field>
            {trip.driverBonus ? <Field label={tr("Driver bonus")}>{liveMoney(trip.driverBonus)}</Field> : null}
            <Field label={tr("Payment method")}>{trip.paymentMethod}</Field>
            <Field label={tr("Payment status")}>{trip.paymentStatus ? <Word code={trip.paymentStatus} /> : "—"}</Field>
            {trip.cancellation ? <Field label={tr("Cancel fee")}>{liveMoney(trip.cancellation.fee)}</Field> : null}
          </div>
          {trip.fareLines && trip.fareLines.length > 0 ? (
            <div className="table-wrap live-fare-lines">
            <table className="live-table">
              <tbody>
                {trip.fareLines.map((line, index) => (
                  <tr key={`${line.code}-${index}`}>
                    <td>{line.code.replaceAll("_", " ")}</td>
                    <td>{liveMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : null}
        </section>
      </div>

      <div className="live-grid">
        <section className="panel">
          <h3>{tr("Timeline")}</h3>
          <ol className="live-timeline" data-testid="trip-timeline">
            {tripTimeline(trip).map((row) => (
              <li key={`${row.label}-${row.at}`}>
                <strong>{tr(row.label)}</strong> <DateText value={row.at} withTime />
              </li>
            ))}
          </ol>
          {trip.cancellation ? <p className="live-muted">{tr("Reason")}: {trip.cancellation.reasonCode.replaceAll("_", " ")}{trip.cancellation.note ? ` · ${trip.cancellation.note}` : ""}</p> : null}
        </section>
        <section className="panel" data-testid="trip-offers">
          <h3>{tr("Offers")}</h3>
          {offers.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
          <ErrorLine error={offers.error} onRetry={() => void offers.refetch()} />
          {offers.data && offers.data.items.length === 0 ? <p className="state-line">{tr("No offers sent.")}</p> : null}
          {offers.data && offers.data.items.length > 0 ? (
            <div className="table-wrap">
              <table className="live-table">
                <thead>
                  <tr>
                    <th>{tr("Kind")}</th>
                    <th>{tr("Status")}</th>
                    <th>{tr("Expires")}</th>
                    <th>{tr("Driver earns")}</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.data.items.map((offer) => (
                    <tr key={offer.offerId} data-offer-id={offer.offerId}>
                      <td>{offer.kind}</td>
                      <td><Word code={offer.status} /></td>
                      <td><DateText value={offer.expiresAt} /></td>
                      <td>{liveMoney(offer.driverEarnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      <NoShowDialog
        open={noShowOpen}
        onClose={() => setNoShowOpen(false)}
        onSend={async (note, waiveFee) => {
          try {
            await client.post<Trip>(`/admin/trips/${encodeURIComponent(trip.tripId)}/no-show`, { expectedVersion: trip.version, note, ...(waiveFee ? { waiveFee: true } : {}) });
            setNotice(waiveFee ? tr("Marked as no-show. No fee is charged.") : tr("Marked as no-show. The zone's no-show fee is charged."));
            reload();
          } catch (error) {
            if (isVersionMismatch(error)) {
              reload();
              setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
            }
            throw error;
          }
        }}
      />
      <RefundDialog
        open={refundOpen}
        trip={trip}
        onClose={() => setRefundOpen(false)}
        onSend={async (amountMinor, reason) => {
          try {
            const answer = await client.post<Partial<Refund>>(`/admin/trips/${encodeURIComponent(trip.tripId)}/refund`, { expectedVersion: trip.version, amount: { amountMinor, currency: trip.fare.currency }, reason });
            setNotice(answer && answer.refundId ? tr("Refund made: {0}.", [liveMoney({ amountMinor, currency: trip.fare.currency })]) : tr("The refund waits for a second admin."));
            reload();
          } catch (error) {
            if (isVersionMismatch(error)) {
              reload();
              setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
            }
            throw error;
          }
        }}
      />
    </>
  );
}

function RefundDialog({ open, trip, onClose, onSend }: { open: boolean; trip: Trip; onClose: () => void; onSend: (amountMinor: number, reason: string) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setError(null);
      setBusy(false);
      sending.current = false;
    }
  }, [open]);
  const currency = trip.fare.currency;
  const symbol = currency in CURRENCIES ? CURRENCIES[currency as CurrencyCode].symbol : currency;
  const minor = amount.trim() ? parseMinor(amount, currency) : null;
  const most = trip.fare.amountMinor;
  const amountError = !amount.trim() ? null : minor === null || minor <= 0 ? tr("Enter an amount above 0.") : minor > most ? tr("At most {0} can be refunded.", [liveMoney(trip.fare)]) : null;
  const reasonText = reason.trim();
  const invalid = minor === null || Boolean(amountError) || reasonText.length === 0 || reasonText.length > 1000;
  return (
    <Modal open={open} title={tr("Refund trip")} onClose={onClose}>
      <form
        className="live-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (invalid || sending.current || minor === null) return;
          sending.current = true;
          setBusy(true);
          setError(null);
          try {
            await onSend(minor, reasonText);
            onClose();
          } catch (caught) {
            setError(caught);
            sending.current = false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{tr("The money goes back to the rider. The reason is written in the audit; a big refund waits for a second admin.")}</p>
        <label>
          {tr("Amount ({0})", [symbol])}
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(amountError)} />
        </label>
        {amountError ? <p className="live-error" role="alert">{amountError}</p> : null}
        <label>
          {tr("Reason (required)")}
          <textarea value={reason} maxLength={1000} rows={3} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error ? <ErrorLine error={error} /> : null}
        <div className="actions">
          <button data-command="admin.server.dialogConfirm" type="submit" className="primary-btn" disabled={invalid || busy}>
            {busy ? tr("Sending.") : tr("Refund")}
          </button>
          <button data-command="admin.server.dialogCancel" type="button" className="secondary-btn" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function NoShowDialog({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (note: string, waiveFee: boolean) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [waive, setWaive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open) {
      setNote("");
      setWaive(false);
      setError(null);
      setBusy(false);
      sending.current = false;
    }
  }, [open]);
  const text = note.trim();
  const invalid = text.length === 0 || text.length > 1000;
  return (
    <Modal open={open} title={tr("Mark rider no-show")} onClose={onClose}>
      <form
        className="live-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (invalid || sending.current) return;
          sending.current = true;
          setBusy(true);
          setError(null);
          try {
            await onSend(text, waive);
            onClose();
          } catch (caught) {
            setError(caught);
            sending.current = false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{tr("The trip ends as a no-show. The rider pays the zone's no-show fee and the driver gets their share, unless you waive it.")}</p>
        <label>
          {tr("Note (required)")}
          <textarea value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="check-row live-check">
          <input type="checkbox" checked={waive} onChange={(event) => setWaive(event.target.checked)} />
          {tr("Waive fee")}
        </label>
        {waive ? <p className="live-muted">{tr("The rider pays nothing and the driver gets no no-show share.")}</p> : null}
        {error ? <ErrorLine error={error} /> : null}
        <div className="actions">
          <button data-command="admin.server.dialogConfirm" type="submit" className="primary-btn live-danger" disabled={invalid || busy}>{busy ? tr("Sending.") : tr("Mark no-show")}</button>
          <button data-command="admin.server.dialogCancel" type="button" className="secondary-btn" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}
