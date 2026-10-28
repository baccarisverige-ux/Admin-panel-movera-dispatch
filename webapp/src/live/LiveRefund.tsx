import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../ui/Modal";
import { tr } from "../i18n";
import { CURRENCIES, type CurrencyCode } from "../domain/money";
import { useLiveSession, useLiveSessionMaybe } from "./LiveSessionContext";
import { liveMoney, parseMinor } from "./format";
import { ErrorLine, isVersionMismatch } from "./ui";
import type { Refund, Trip } from "./types";

const TERMINAL = ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

/** contract §7: only a finished trip whose money was taken can be refunded. */
export function refundable(trip: Pick<Trip, "status" | "paymentStatus">): boolean {
  return TERMINAL.includes(trip.status) && (trip.paymentStatus === "captured" || trip.paymentStatus === "partially_refunded");
}

/**
 * Live builds only: the demo trip page's Refund button opens this dialog instead, for part or all of the fare
 * (POST /admin/trips/{id}/refund with expectedVersion; v0.7.2: one admin is enough, it is made at once).
 * Returns null in a demo build, where the page keeps its own Refund button.
 */
export function useLiveRefund(tripId: string) {
  const live = useLiveSessionMaybe();
  const [open, setOpen] = useState(false);
  if (!live) return null;
  return {
    open: () => setOpen(true),
    dialog: <LiveRefundDialog tripId={tripId} open={open} onClose={() => setOpen(false)} />,
  };
}

function LiveRefundDialog({ tripId, open, onClose }: { tripId: string; open: boolean; onClose: () => void }) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const trip = useQuery({ queryKey: ["live", "trip", tripId], queryFn: () => client.json<Trip>(`/admin/trips/${encodeURIComponent(tripId)}`), enabled: open });
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      {trip.data ? (
        <RefundForm
          open={open}
          trip={trip.data}
          onClose={onClose}
          onSend={async (amountMinor, reason) => {
            const current = trip.data!;
            try {
              await client.post<Partial<Refund>>(`/admin/trips/${encodeURIComponent(current.tripId)}/refund`, { expectedVersion: current.version, amount: { amountMinor, currency: current.fare.currency }, reason });
              // v0.7.2 (contract.json#auth.admin.oneAdmin): never waits for a second admin.
              setNotice(tr("Refund made: {0}.", [liveMoney({ amountMinor, currency: current.fare.currency })]));
            } catch (error) {
              if (isVersionMismatch(error)) setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
              throw error;
            } finally {
              void queryClient.invalidateQueries({ queryKey: ["live", "trip", tripId] });
              void queryClient.invalidateQueries({ queryKey: ["records"] });
            }
          }}
        />
      ) : open ? (
        <Modal open title={tr("Refund trip")} onClose={onClose}>
          {trip.error ? <ErrorLine error={trip.error} onRetry={() => void trip.refetch()} /> : <p className="state-line">{tr("Loading.")}</p>}
        </Modal>
      ) : null}
    </>
  );
}

function RefundForm({ open, trip, onClose, onSend }: { open: boolean; trip: Trip; onClose: () => void; onSend: (amountMinor: number, reason: string) => Promise<void> }) {
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
        <p>{tr("The money goes back to the rider. The reason is written in the audit.")}</p>
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
