import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { liveMoney } from "./format";
import { loadFeePayments, paidTwiceOf, refundableOf, refundFeePayment, STRIPE_STATUS_LABEL } from "./stripeFeePayments";

/**
 * v0.18.136 stripeFees (DRAFT, Stripe TEST mode; area c50; owner 2026-11-20 "So we use stripe"): the rider's card
 * payments of owed fees, their Stripe status, the "Paid twice" list and the Refund button (finance.edit, with a reason).
 * The status comes from the server (its signed webhook); the amounts are the server's.
 */
export function LiveStripeFeePayments({ riderId }: { riderId: string }) {
  const session = useLiveSessionMaybe();
  const queries = useQueryClient();
  const canRead = session?.can("finance.read") ?? false;
  const canEdit = session?.can("finance.edit") ?? false;
  const key = ["stripe-fee-payments", riderId];
  const list = useQuery({ queryKey: key, enabled: Boolean(session) && canRead, queryFn: () => loadFeePayments(session!.client, riderId) });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Money review MUST 1: one refund at a time, even on a fast double click (state updates are not instant).
  const inFlight = useRef(false);
  const [notice, setNotice] = useState("");
  const items = list.data ?? [];
  if (!canRead || items.length === 0) return null;
  const twice = paidTwiceOf(items);
  const refundable = new Set(refundableOf(items).map((p) => p.paymentIntentId));
  const refund = async (tripId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await refundFeePayment(session!.client, riderId, tripId, reason);
      setNotice(tr("Refund sent. The money goes back to the card."));
      setReason("");
      await queries.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="fd-box" data-testid="live-stripe-fee-payments">
      <h3>{trn("{0} Card payments of fees", <CreditCard size={16} aria-hidden="true" />)}</h3>
      {twice.length ? (
        <ul className="fd-banner red" role="alert" data-testid="stripe-paid-twice" aria-label={tr("Paid twice")}>
          {twice.map((p) => <li key={p.paymentIntentId}>{p.tripId} · {tr("Paid twice: refund {0}.", [liveMoney(p.overpaid ?? p.amount)])}</li>)}
        </ul>
      ) : null}
      <ul className="rd-owed-trips">
        {items.map((p) => (
          <li key={p.paymentIntentId} data-testid="stripe-fee-payment">
            {p.tripId} · {liveMoney(p.amount)} · <b>{tr(STRIPE_STATUS_LABEL[p.status] as Parameters<typeof tr>[0])}</b>
            {p.paidTwice ? <> · {tr("Paid twice")}</> : null}
            {p.amountMismatch ? <> · {tr("Amount differs: check in Stripe.")}</> : null}
            {canEdit && refundable.has(p.paymentIntentId) ? <button type="button" className="dash-btn small ghost" disabled={busy || !reason.trim()} data-command="admin.server.feeStripeRefund" title={liveMoney(p.paidTwice && p.overpaid ? p.overpaid : p.amount)} onClick={() => void refund(p.tripId)}>{tr("Refund")}</button> : null}
          </li>
        ))}
      </ul>
      {canEdit && refundable.size ? <label className="field"><span>{tr("Reason")}</span><input aria-label={tr("Reason")} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
