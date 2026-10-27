import { useState } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Gavel, RefreshCcw } from "lucide-react";
import { useApprovals, useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { formatMoney, market } from "../markets/markets";
import { METHOD_LABELS, PAY_OPS_KEY, emptyPayOps, factsOf, normalizePayOps, paySplit, refundLimitMinor, retryPlan, type PayOps } from "../payments/desk";
import { Cards } from "../reports/ui";
import { needsSecondAdmin, refundAboveMinor } from "../payments/refundPolicy";
import { useRefundPolicy } from "../payments/useRefundPolicy";
import { statusLabel } from "../domain/labels";
import { paymentTimeline, refundRows } from "../payments/ledger";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";

export function PaymentPage() {
  const { id = "" } = useParams();
  const payments = useRecords("payments", null);
  const approvals = useApprovals();
  const navigate = useNavigate();
  const { agent } = useSession();
  const riders = useRecords("riders", null);
  const trips = useRecords("trips", null);
  const opsSlice = useSlice<PayOps>(PAY_OPS_KEY, emptyPayOps());
  const { policy: refundPolicy } = useRefundPolicy();
  const [now] = useState(() => Date.now());
  const row = payments.data?.find((item) => item.id === id);
  if (payments.isLoading) return <p className="state-line">{tr("Loading payment.")}</p>;
  if (!row) {
    return <NotFoundRecord kind="Payment" id={id} list="/payments" listLabel="payments" />;
  }

  const payment = row;
  const amount = payment.fareOre ?? 0;
  const ops = normalizePayOps(opsSlice.value);
  const facts = factsOf(payment, riders.data ?? [], trips.data ?? [], ops, now);
  const money = (minor: number) => formatMoney(minor, facts.country);
  // Q25: the one second-admin rule from Settings, per country (default above 500 kr, 50 €, 150 DT); the server applies the same setting.
  const threshold = refundAboveMinor(refundPolicy, facts.country);
  const needsSecond = needsSecondAdmin(refundPolicy, facts.country, amount) && payment.status === "captured";
  const pendingApproval = (approvals.data ?? []).find((item) => item.targetId === payment.id && item.action === "admin.payment.refund" && item.status === "pending");
  const split = paySplit(amount, facts.country, facts.tripId);
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
        <button data-command="admin.payment.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/payments"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{trn("Payment {0}", payment.id)}</h2>
          <p>{statusLabel(payment.status)} · {money(amount)} · {payment.zoneId}</p>
        </div>
        <Link className="dash-btn small ghost" to="/payments">{tr("Back to payments")}</Link>
      </header>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => money(value)}
        cards={[
          { id: "driver", label: tr("Driver gets"), value: split.driver, previous: null, format: "money", info: tr("The price minus Movera's commission.") },
          { id: "movera", label: tr("Movera keeps"), value: split.movera, previous: null, format: "money", info: tr("Commission (20% until the price book is linked).") },
          { id: "vat", label: `VAT inside (${Math.round(split.vatRate * 100)}%)`, value: split.vat, previous: null, format: "money", info: tr("VAT included in the price. Rates are placeholders to confirm.") },
        ]}
      />

      <section className="fn-section pm-facts" aria-label={tr("Payment details")}>
        <dl className="fn-facts">
          <div><dt>{tr("Method")}</dt><dd>{trx(METHOD_LABELS[facts.method])}</dd></div>
          <div><dt>{tr("Rider")}</dt><dd>{facts.riderId ? <Link to={`/riders/${facts.riderId}`}>{facts.riderName}</Link> : facts.riderName}</dd></div>
          <div><dt>{tr("Trip")}</dt><dd>{facts.tripId ? <Link to={`/trips/${facts.tripId}`}>{facts.tripId}</Link> : "–"}</dd></div>
        </dl>
        <div className="pm-split" role="img" aria-label={tr("Driver {0}%, Movera {1}%", [Math.round((split.driver / Math.max(split.price, 1)) * 100), Math.round((split.movera / Math.max(split.price, 1)) * 100)])}>
          <i className="driver" style={{ width: `${(split.driver / Math.max(split.price, 1)) * 100}%` }} />
          <i className="movera" style={{ width: `${(split.movera / Math.max(split.price, 1)) * 100}%` }} />
        </div>
        {plan ? <p className="fn-warn">{trn("{0} {1}: {2}. Tried {3} of {4}. {5} {6}", <RefreshCcw size={14} aria-hidden="true" />, plan.cause.kind === "system" ? tr("Our side") : tr("Rider's side"), trx(plan.cause.reason), Number.isFinite(plan.tries) ? plan.tries : tr("Not connected yet"), plan.max, plan.nextAt ? tr("Next try {0}.", [new Intl.DateTimeFormat(market(facts.country).locale, { timeZone: market(facts.country).timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(plan.nextAt))]) : tr("No more automatic tries."), <Link to="/payments?tab=failed">{tr("Failed and retries")}</Link>)}</p> : null}
        {facts.dispute ? <p className="fn-warn">{trn("{0} Dispute: {1}. Answer by {2}. {3}", <Gavel size={14} aria-hidden="true" />, facts.dispute.reason, facts.dispute.deadline, <Link to="/payments?tab=disputes">{tr("Disputes")}</Link>)}</p> : null}
      </section>

      <article className="panel fn-panel" data-testid="payment-timeline">
        <h3>{tr("Timeline")}</h3>
        <ol className="version-list">
          {paymentTimeline(payment.status).map((step) => <li key={step}>{step}</li>)}
        </ol>
      </article>

      <article className="panel fn-panel">
        <h3>{tr("Refund")}</h3>
        <p data-testid="refund-block">
          {blocked ?? (needsSecond
            ? tr("Refund request is allowed. Because it is {0} or more, the payment stays captured until a second authorised agent approves it.", [money(threshold)])
            : tr("Refund is allowed. A double click still writes one ledger row."))}
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
          title={blocked ?? (needsSecond ? tr("Request second-agent approval") : tr("Refund this payment"))}
          retryLabel={tr("Retry refund")}
        >
          {needsSecond ? tr("Request refund approval") : tr("Refund payment")}
        </CommandButton>

        {pendingApproval ? <p><Link to="/audit">{tr("Open approval queue")}</Link></p> : null}
        <p className="fn-help">{trn("{0} Refunds above {1} also need a second admin ({2}).", limit === null ? tr("You have no refund limit.") : tr("Your refund limit is {0}.", [money(limit)]), money(threshold), <Link to="/settings#refunds">{tr("set in Settings")}</Link>)}</p>
      </article>
    </div>
  );
}
