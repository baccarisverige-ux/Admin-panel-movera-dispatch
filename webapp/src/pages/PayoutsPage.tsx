import { useMemo, useState } from "react";
import { formatZoneMoney } from "../markets/markets";
import { REFUND_APPROVAL_MINOR } from "../commands/registry";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import {
  bankReview,
  bankValidation,
  defaultFinanceBook,
  markPayoutPaid,
  normalizeFinanceBook,
  payoutState,
  reviewBank,
  useRecords,
  useSlice,
  type BankReview,
  type FinanceBook,
} from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";
import { can } from "../auth/permissions";
import { formatMoney } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { PayoutLines, RunCard, ScheduleView } from "../payments/PayoutParts";
import { PAYOUT_OPS_KEY, bankReady, countryOfPayout, emptyPayoutOps, failedOf, holdOf, nextRun, normalizePayoutOps, type PayoutOps } from "../payments/runs";
import { emptyPricingStore, normalizeStore, SLICE_KEY as PRICING_KEY, zoneBook, type PricingStore } from "../pricing/zonePricing";
import { cashOwed } from "../trips/cash";
import { TRIP_OPS_KEY, countryOf, emptyTripOps, moneySplit, normalizeTripOps, type TripOps } from "../trips/file";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook } from "../dispatch/rules";

export function PayoutsPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = useMarketScope();
  const drivers = useRecords("drivers", null);
  const opsSlice = useSlice<PayoutOps>(PAYOUT_OPS_KEY, emptyPayoutOps());
  const ops = normalizePayoutOps(opsSlice.value);
  const [now] = useState(() => Date.now());
  const payouts = useRecords("payouts", null);
  const trips = useRecords("trips", null);
  const pricingSlice = useSlice<PricingStore>(PRICING_KEY, emptyPricingStore());
  const dispatchSlice = useSlice<unknown>(DISPATCH_KEY, emptyDispatchBook());
  // Trip changes (refunds, fare changes) need trips access; without it the cash owed uses the trips as charged.
  const tripOpsSlice = useSlice<TripOps>(TRIP_OPS_KEY, emptyTripOps(), { enabled: Boolean(agent && can(agent.role, "trips.read")) });
  const financeStore = useSlice<FinanceBook>("finance", defaultFinanceBook());
  const finance = useMemo(() => normalizeFinanceBook(financeStore.value), [financeStore.value]);
  const rows = payouts.data ?? [];
  // A payout detail link (/payouts?payout=PO3) opens that payout.
  const [selectedId, setSelectedId] = useState(() => params.get("payout") ?? "PO1");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const [bankDraft, setBankDraft] = useState<BankReview | null>(null);
  const [bankNote, setBankNote] = useState("Verified account holder");
  const [notice, setNotice] = useState("Payout status is ledger-derived and cannot be typed manually.");

  const tab = params.get("tab") === "schedule" ? "schedule" : "payouts";
  const selectTab = (id: string) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    if (id === "payouts") next.delete("tab");
    else next.set("tab", id);
    return next;
  }, { replace: true });
  const country = scope.market.id;
  const money = (minor: number) => formatMoney(minor, country);
  const driverName = (id: string | null | undefined) => (drivers.data ?? []).find((row) => row.id === id)?.name ?? id ?? "";

  if (payouts.isLoading || financeStore.loading) return <p className="state-line">Loading payouts.</p>;
  if (!selected) return <p className="state-line">No payouts are available.</p>;

  const driverId = selected.driverId ?? "";
  const selectedFleet = Boolean((drivers.data ?? []).find((row) => row.id === selected.driverId)?.fleetId);
  const pricingStore = normalizeStore(pricingSlice.value);
  const tripEntries = normalizeTripOps(tripOpsSlice.value).entries;
  const dispatchBook = normalizeDispatchBook(dispatchSlice.value);
  const selectedCash = cashOwed(trips.data ?? [], driverId, (trip) => moneySplit(trip, zoneBook(pricingStore, trip.zoneId), selectedFleet, tripEntries, liveRules(dispatchBook, trip.zoneId).riderCancel.fees), (trip) => countryOf(trip.zoneId));
  const persistedBank = bankReview(finance, driverId);
  const bank = bankDraft?.driverId === driverId ? bankDraft : persistedBank;
  const state = payoutState(finance, selected);
  const validation = bankValidation(bank);
  const approved = agent
    ? reviewBank(finance, bank, "approved", agent.id, bankNote, new Date().toISOString())
    : { book: finance, error: "Sign in again." };
  const rejected = agent
    ? reviewBank(finance, bank, "rejected", agent.id, bankNote, new Date().toISOString())
    : { book: finance, error: "Sign in again." };
  const operationKey = `payout-${selected.id}-mark-paid`;
  const paid = agent
    ? markPayoutPaid(finance, selected, agent.id, operationKey, new Date().toISOString())
    : { book: finance, error: "Sign in again." };

  function patchBank(patch: Partial<BankReview>) {
    setBankDraft({ ...bank, ...patch, status: "in_review", reviewedBy: "", reviewedAt: "", note: "" });
  }

  const open = rows.filter((row) => payoutState(finance, row).status !== "paid");
  const next = nextRun(ops.schedules[country], now, scope.market.timeZone);
  const fileRows = open.flatMap((row) => {
    const review = bankReview(finance, row.driverId ?? "");
    if (bankReady(review, holdOf(ops, row.id), failedOf(ops, row))) return [];
    return [{ id: row.id, driver: driverName(row.driverId), iban: review.iban, bic: review.bic, amount: row.fareOre ?? 0, reference: `Movera payout ${row.id}` }];
  });
  const blockPay = holdOf(ops, selected.id) ? "On hold." : failedOf(ops, selected) ? "Failed at the bank. Retry first." : null;

  return (
    <div className="dx-page fn-page po-page">
      <header className="dx-head">
        <button data-command="admin.payout.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Payouts</h2>
          <p>
            Weekly payouts. Wallet vouchers are 100, 200 and 500 kr. Refunds of {money(REFUND_APPROVAL_MINOR[scope.market.currency])} or more need a second authorised agent.
            Demo rows {rows.length}. Finance revision {finance.draftRev}.
          </p>
        </div>
      </header>
      <div className="dash-tabs dx-views" role="tablist" aria-label="Payout sections">
        {[["payouts", "Payouts"], ["schedule", "Schedule and rules"]].map(([id, label]) => <button data-command="admin.payout.view" key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : undefined} onClick={() => selectTab(id)}>{label}</button>)}
      </div>
      {tab === "schedule" ? <ScheduleView ops={ops} country={country} editable={Boolean(agent && can(agent.role, "approval.decide"))} /> : (
      <>
      <p className="state-line">{notice} {financeStore.message}</p>
      <RunCard run={`run-${country}-${next.slice(0, 10)}`} rows={open} ops={ops} country={country} next={next} money={money} fileRows={fileRows} startedBy="system" currency={scope.market.currency} />

      <DataTable
        head={["Payout", "Week", "Driver", "Amount", "Status", "Bank", "Hold"]}
        rowIds={rows.map((row) => row.id)}
        rows={rows.map((row) => {
          const payout = payoutState(finance, row);
          const review = bankReview(finance, row.driverId ?? "");
          return [row.id, row.name, row.driverId ?? "", formatZoneMoney(row.fareOre ?? 0, row.zoneId), failedOf(ops, row) ? "failed" : payout.status, review.status, holdOf(ops, row.id) ? "On hold" : "–"];
        })}
        onRow={(index) => {
          const id = rows[index]?.id;
          if (id) {
            setSelectedId(id);
            setBankDraft(null);
          }
        }}
        state={payouts.isError ? "error" : "ready"}
        onRetry={() => void payouts.refetch()}
      />

      <article className="panel fn-panel" data-testid="payout-detail">
        <h3>{selected.id}</h3>
        <p>
          {selected.driverId} · {formatZoneMoney(selected.fareOre ?? 0, selected.zoneId)} · payout {state.status}. Bank {bank.status}.
          {state.paidAt ? ` Paid ${state.paidAt} by ${state.paidBy}.` : ""}
        </p>

        <h4>Bank review</h4>
        <div className="field-grid">
          <label>
            Clearing number
            <input aria-label="Payout clearing number" value={bank.clearing} onChange={(event) => patchBank({ clearing: event.target.value })} />
          </label>
          <label>
            Account
            <input aria-label="Payout account number" value={bank.account} onChange={(event) => patchBank({ account: event.target.value })} />
          </label>
          <label>
            IBAN
            <input aria-label="Payout IBAN" value={bank.iban} onChange={(event) => patchBank({ iban: event.target.value })} />
          </label>
          <label>
            BIC
            <input aria-label="Payout BIC" value={bank.bic} onChange={(event) => patchBank({ bic: event.target.value.toUpperCase() })} />
          </label>
          <label>
            Review note
            <input aria-label="Bank review note" value={bankNote} onChange={(event) => setBankNote(event.target.value)} />
          </label>
        </div>
        <p data-testid="payout-bank-check">{validation ?? "Bank details pass the configured validation checks."}</p>

        <div className="actions">
          <CommandButton
            command="admin.payment.approveBank"
            className="secondary-btn"
            type="button"
            targetId={driverId}
            confirmTarget={false}
            scope={selected.zoneId}
            before={persistedBank.status}
            after="approved"
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={approved.book}
            disabled={Boolean(approved.error)}
            title={approved.error}
            onDone={() => {
              setBankDraft(null);
              setNotice("Bank details approved.");
            }}
          >
            Approve bank
          </CommandButton>
          <CommandButton
            command="admin.payment.rejectBank"
            className="secondary-btn"
            type="button"
            targetId={driverId}
            confirmTarget={false}
            scope={selected.zoneId}
            before={persistedBank.status}
            after="rejected"
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={rejected.book}
            disabled={Boolean(rejected.error)}
            title={rejected.error}
            onDone={() => {
              setBankDraft(null);
              setNotice(`Bank details rejected for ${driverId}.`);
            }}
          >
            Reject bank
          </CommandButton>
          <CommandButton
            command="admin.payment.markPaid"
            className="primary-btn"
            type="button"
            targetId={selected.id}
            confirmTarget={false}
            scope={selected.zoneId}
            before={state.status}
            after="paid"
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={paid.book}
            disabled={state.status === "paid" || Boolean(blockPay)}
            validationError={paid.error}
            onValidationError={(message) => setNotice(message)}
            title={state.status === "paid" ? "Already paid." : blockPay ?? undefined}
            onDone={() => setNotice("Payout marked paid once. Reusing the operation key cannot pay it twice.")}
          >
            Mark paid
          </CommandButton>
        </div>
      </article>
      <PayoutLines record={selected} fleet={selectedFleet} ops={ops} country={countryOfPayout(selected)} money={(minor) => formatMoney(minor, countryOfPayout(selected))} onNotice={setNotice} cash={selectedCash} />
      </>
      )}
    </div>
  );
}
