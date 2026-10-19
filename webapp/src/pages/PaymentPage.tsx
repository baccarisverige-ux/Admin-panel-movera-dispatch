import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Gavel, RefreshCcw } from "lucide-react";
import { useApprovals, useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { formatMoney, market } from "../markets/markets";
import { METHOD_LABELS, PAY_OPS_KEY, emptyPayOps, factsOf, normalizePayOps, paySplit, refundLimitMinor, retryPlan, type PayOps } from "../payments/desk";
import { Cards } from "../reports/ui";
import { REFUND_APPROVAL_MINOR } from "../commands/registry";
import { statusLabel } from "../domain/labels";
import { paymentTimeline, refundRows } from "../payments/ledger";
import { CommandButton } from "../ui/CommandButton";

export function PaymentPage() {
  const { id = "" } = useParams();
  const payments = useRecords("payments", null);
  const approvals = useApprovals();
  const navigate = useNavigate();
  const { agent } = useSession();
  const riders = useRecords("riders", null);
  const trips = useRecords("trips", null);
  const opsSlice = useSlice<PayOps>(PAY_OPS_KEY, emptyPayOps());
  const [now] = useState(() => Date.now());
  const row = payments.data?.find((item) => item.id === id);
  if (payments.isLoading) return <p className="state-line">Loading payment.</p>;
  if (!row) {
    return (
      <div className="page-heading">
        <div>
          <h2>Payment {id}</h2>
          <p>That payment is not in the demo ledger.</p>
          <Link to="/payments">Back to payments</Link>
        </div>
      </div>
    );
  }

  const payment = row;
  const amount = payment.fareOre ?? 0;
  const ops = normalizePayOps(opsSlice.value);
  const facts = factsOf(payment, riders.data ?? [], trips.data ?? [], ops, now);
  const money = (minor: number) => formatMoney(minor, facts.country);
  // The second-admin threshold is per currency (200 kr, 20 €, 60 DT); the server applies the same table.
  const threshold = REFUND_APPROVAL_MINOR[market(facts.country).currency];
  const needsSecond = amount >= threshold && payment.status === "captured";
  const pendingApproval = (approvals.data ?? []).find((item) => item.targetId === payment.id && item.action === "admin.payment.refund" && item.status === "pending");
  const split = paySplit(amount, facts.country);
  const plan = payment.status === "failed" ? retryPlan(payment, facts, ops, now) : null;
  const limit = agent ? refundLimitMinor(agent.role, facts.country, ops) : 0;
  const overLimit = limit !== null && amount > limit && payment.status === "captured";
  const blocked = payment.status === "refunded"
    ? "Already refunded."
    : payment.status !== "captured"
      ? "Refund is only available after capture."
      : pendingApproval
        ? `Pending second-agent approval ${pendingApproval.id}.`
        : overLimit
          ? `Over your refund limit of ${money(limit ?? 0)}. Ask a finance admin.`
          : null;
  const matches = refundRows(payments.data ?? [], payment.id);

  return (
    <div className="dx-page fn-page pm-page">
      <header className="dx-head">
        <button data-command="admin.payment.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/payments"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Payment {payment.id}</h2>
          <p>{statusLabel(payment.status)} · {money(amount)} · {payment.zoneId}</p>
        </div>
        <Link className="dash-btn small ghost" to="/payments">Back to payments</Link>
      </header>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => money(value)}
        cards={[
          { id: "driver", label: "Driver gets", value: split.driver, previous: null, format: "money", info: "The price minus Movera's commission." },
          { id: "movera", label: "Movera keeps", value: split.movera, previous: null, format: "money", info: "Commission (20% until the price book is linked)." },
          { id: "vat", label: `VAT inside (${Math.round(split.vatRate * 100)}%)`, value: split.vat, previous: null, format: "money", info: "VAT included in the price. Rates are placeholders to confirm." },
        ]}
      />

      <section className="fn-section pm-facts" aria-label="Payment details">
        <dl className="fn-facts">
          <div><dt>Method</dt><dd>{METHOD_LABELS[facts.method]}</dd></div>
          <div><dt>Rider</dt><dd>{facts.riderId ? <Link to={`/riders/${facts.riderId}`}>{facts.riderName}</Link> : facts.riderName}</dd></div>
          <div><dt>Trip</dt><dd>{facts.tripId ? <Link to={`/trips/${facts.tripId}`}>{facts.tripId}</Link> : "–"}</dd></div>
        </dl>
        <div className="pm-split" role="img" aria-label={`Driver ${Math.round((split.driver / Math.max(split.price, 1)) * 100)}%, Movera ${Math.round((split.movera / Math.max(split.price, 1)) * 100)}%`}>
          <i className="driver" style={{ width: `${(split.driver / Math.max(split.price, 1)) * 100}%` }} />
          <i className="movera" style={{ width: `${(split.movera / Math.max(split.price, 1)) * 100}%` }} />
        </div>
        {plan ? <p className="fn-warn"><RefreshCcw size={14} aria-hidden="true" /> {plan.cause.kind === "system" ? "Our side" : "Rider's side"}: {plan.cause.reason}. Tried {plan.tries} of {plan.max}. {plan.nextAt ? `Next try ${new Intl.DateTimeFormat(market(facts.country).locale, { timeZone: market(facts.country).timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(plan.nextAt))}.` : "No more automatic tries."} <Link to="/payments?tab=failed">Failed and retries</Link></p> : null}
        {facts.dispute ? <p className="fn-warn"><Gavel size={14} aria-hidden="true" /> Dispute: {facts.dispute.reason}. Answer by {facts.dispute.deadline}. <Link to="/payments?tab=disputes">Disputes</Link></p> : null}
      </section>

      <article className="panel fn-panel" data-testid="payment-timeline">
        <h3>Timeline</h3>
        <ol className="version-list">
          {paymentTimeline(payment.status).map((step) => <li key={step}>{step}</li>)}
        </ol>
      </article>

      <article className="panel fn-panel">
        <h3>Refund</h3>
        <p data-testid="refund-block">
          {blocked ?? (needsSecond
            ? `Refund request is allowed. Because it is ${money(threshold)} or more, the payment stays captured until a second authorised agent approves it.`
            : "Refund is allowed. A double click still writes one ledger row.")}
        </p>
        <p data-testid="refund-count">{matches.length}</p>

        {/* The refund asks for a reason and the payment id like every other money action; "Retry refund" only
            becomes available when the last attempt did not commit, and re-sends with the same reason (C-15, UI-04). */}
        <CommandButton
          command="admin.payment.refund"
          className="primary-btn"
          targetId={payment.id}
          scope={payment.zoneId}
          collection="payments"
          before={payment.status}
          after={needsSecond ? "pending approval" : "refunded"}
          patch={{ status: "refunded" }}
          amountOre={amount}
          disabled={Boolean(blocked)}
          title={blocked ?? (needsSecond ? "Request second-agent approval" : "Refund this payment")}
          retryLabel="Retry refund"
        >
          {needsSecond ? "Request refund approval" : "Refund payment"}
        </CommandButton>

        {pendingApproval ? <p><Link to="/audit">Open approval queue</Link></p> : null}
        <p className="fn-help">{limit === null ? "You have no refund limit." : `Your refund limit is ${money(limit)}. Refunds of ${money(threshold)} or more also need a second admin.`}</p>
      </article>
    </div>
  );
}
