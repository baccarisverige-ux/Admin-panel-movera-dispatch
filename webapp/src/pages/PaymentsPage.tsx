import { METHOD_LABELS } from "../payments/desk";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import {
  PAYMENT_METHODS,
  defaultFinanceBook,
  issueWalletVoucher,
  normalizeFinanceBook,
  paymentPolicy,
  runReconciliation,
  savePaymentPolicy,
  useRecords,
  useSlice,
  voidWalletVoucher,
  WALLET_TOP_UPS_ORE,
  type FinanceBook,
  type PaymentMethod,
} from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { CATEGORIES } from "../domain/contract";
import { formatMoney, formatZoneMoney, marketIdOfZone } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { accountOk, bicOk, clearingBank, ibanOk } from "../payments/ledger";
import { CommandButton } from "../ui/CommandButton";
import { PaymentsDesk } from "../payments/PaymentsDesk";
import { tr, trn, trx, trSentences } from "../i18n";

type Tab = "payments" | "failed" | "disputes" | "numbers" | "rules" | "tools";
const TABS: { id: Tab; label: string }[] = [
  { id: "payments", get label() { return tr("Payments"); } },
  { id: "failed", get label() { return tr("Failed and retries"); } },
  { id: "disputes", get label() { return tr("Disputes"); } },
  { id: "numbers", get label() { return tr("Numbers"); } },
  { id: "rules", get label() { return tr("Rules"); } },
  { id: "tools", get label() { return tr("Methods and tools"); } },
];

export function PaymentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const payments = useRecords("payments", null);
  const zones = useRecords("zones", null);
  const riders = useRecords("riders", null);
  const refunds = useRecords("refunds", null);
  const wallet = useRecords("wallet", null);
  const payouts = useRecords("payouts", null);
  const financeStore = useSlice<FinanceBook>("finance", defaultFinanceBook());
  const finance = useMemo(() => normalizeFinanceBook(financeStore.value), [financeStore.value]);
  const rows = payments.data ?? [];
  // Totals only add up amounts of one currency: the country chosen in the top bar.
  const { country } = useMarketScope();
  const money = (minor: number) => formatMoney(minor, country);
  const inCountry = (row: { zoneId: string }) => marketIdOfZone(row.zoneId) === country;
  const riderZone = (riderId: string) => (riders.data ?? []).find((rider) => rider.id === riderId.trim())?.zoneId;
  const voucherMoney = (minor: number, riderId: string) => formatZoneMoney(minor, riderZone(riderId), country);

  const [zone, setZone] = useState("Z001");
  const [category, setCategory] = useState("economy");
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [policyDraft, setPolicyDraft] = useState<Record<PaymentMethod, boolean> | null>(null);
  const [notice, setNotice] = useState(tr("Turning a method off stops new checkouts only. Existing authorisations continue."));
  const [clearing, setClearing] = useState("5000");
  const [account, setAccount] = useState("1234567");
  const [iban, setIban] = useState("SE4550000000058398257466");
  const [bic, setBic] = useState("ESSESESS");
  const [voucherRider, setVoucherRider] = useState("R0001");
  const [voucherAmountOre, setVoucherAmountOre] = useState(10_000);
  const [voucherReason, setVoucherReason] = useState(tr("Service recovery"));
  const [reconciliationNote, setReconciliationNote] = useState(tr("Daily close"));

  const context = { zoneId: zone, category, platform };
  const persistedPolicy = paymentPolicy(finance, context);
  const shownPolicy = policyDraft ?? persistedPolicy;
  const policyDirty = JSON.stringify(shownPolicy) !== JSON.stringify(persistedPolicy);
  const policyNext = savePaymentPolicy(finance, context, shownPolicy);

  const countryRows = rows.filter(inCountry);
  const captured = countryRows.filter((row) => row.status === "captured").reduce((sum, row) => sum + (row.fareOre ?? 0), 0);
  const failed = countryRows.filter((row) => row.status === "failed").length;
  const refundedOre =
    (refunds.data ?? []).filter(inCountry).reduce((sum, row) => sum + (row.fareOre ?? 0), 0) +
    countryRows.filter((row) => row.status === "refunded").reduce((sum, row) => sum + (row.fareOre ?? 0), 0);
  const payoutOre = (payouts.data ?? []).filter(inCountry).reduce((sum, row) => sum + (row.fareOre ?? 0), 0);
  const seededWalletOre = (wallet.data ?? []).filter(inCountry).reduce((sum, row) => sum + (row.fareOre ?? 0), 0);
  const voucherWalletOre = finance.vouchers
    .filter((item) => item.status === "posted" && marketIdOfZone(riderZone(item.riderId), country) === country)
    .reduce((sum, item) => sum + item.amountOre, 0);
  const walletOre = seededWalletOre + voucherWalletOre;
  const bankName = clearingBank(clearing);

  const voucherRiderExists = Boolean((riders.data ?? []).some((rider) => rider.id === voucherRider.trim()));
  const voucher = agent
    ? issueWalletVoucher(finance, voucherRider, voucherAmountOre, agent.id, voucherReason, new Date().toISOString())
    : { book: finance, error: "Sign in again." };
  const voucherError = voucherRiderExists ? voucher.error : "Rider id was not found.";
  const reconciliation = agent
    ? runReconciliation(
        finance,
        { capturedOre: captured, refundedOre, payoutOre, walletOre, failedCount: failed },
        agent.id,
        reconciliationNote,
        new Date().toISOString(),
      )
    : { book: finance, run: null };

  if (financeStore.loading) return <p className="state-line">{tr("Loading finance controls.")}</p>;

  function resetPolicyContext(next: Partial<typeof context>) {
    if (next.zoneId) setZone(next.zoneId);
    if (next.category) setCategory(next.category);
    if (next.platform) setPlatform(next.platform);
    setPolicyDraft(null);
  }

  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "payments") as Tab;
  const selectTab = (id: Tab) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    if (id === "payments") next.delete("tab");
    else next.set("tab", id);
    return next;
  }, { replace: true });

  return (
    <div className="dx-page fn-page pm-page">
      <header className="dx-head">
        <button data-command="admin.payment.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}>{trn("{0} Back", <ArrowLeft size={16} aria-hidden="true" />)}</button>
        <div className="dx-head-text">
          <h2>{tr("Payments")}</h2>
          <p data-testid="payment-count">{trn("{0} payments in the demo ledger. Amounts are in each record's own currency; totals are for the chosen country. Wallet vouchers are constrained to 100, 200 and 500 kr. Finance revision {1}.", rows.length, finance.draftRev)}</p>
        </div>
      </header>
      <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Payment sections")}>
        {TABS.map((item) => <button data-command="admin.payment.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => selectTab(item.id)}>{trx(item.label)}</button>)}
      </div>
      {tab !== "tools" ? <PaymentsDesk tab={tab} rows={rows} loading={payments.isLoading} /> : (
      <>
      <p className="state-line">{trSentences(notice)} {trSentences(financeStore.message)}</p>

      <article className="panel" data-testid="payment-policy">
        <h3>{tr("Payment methods")}</h3>
        <p>{tr("Policy is persisted by zone, category and platform. Existing authorised checkouts continue after a method is switched off.")}</p>
        <div className="field-grid">
          <label>{trn("Zone{0}", <select aria-label={tr("Method zone")} value={zone} onChange={(event) => resetPolicyContext({ zoneId: event.target.value })}>
              {(zones.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>)}</label>
          <label>{trn("Category{0}", <select aria-label={tr("Method category")} value={category} onChange={(event) => resetPolicyContext({ category: event.target.value })}>
              {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
            </select>)}</label>
          <label>{trn("Platform{0}", <select aria-label={tr("Method platform")} value={platform} onChange={(event) => resetPolicyContext({ platform: event.target.value as "ios" | "android" })}>
              <option value="ios">{tr("iOS")}</option>
              <option value="android">{tr("Android")}</option>
            </select>)}</label>
        </div>
        <div className="field-grid">
          {PAYMENT_METHODS.map((method) => (
            <label key={method} className="check-row">
              <input
                type="checkbox"
                aria-label={tr("{0} method", [method])}
                checked={shownPolicy[method] ?? false}
                onChange={(event) => {
                  setPolicyDraft({ ...shownPolicy, [method]: event.target.checked });
                  setNotice(tr("{0} will be {1} for new checkouts in {2}, {3}, {4} after saving.", [method, event.target.checked ? tr("on") : tr("off"), zone, category, platform]));
                }}
              />
              {trx(METHOD_LABELS[method])}{method === "wallet" ? tr(" (one balance per currency)") : ""}
            </label>
          ))}
        </div>
        <div className="actions">
          <CommandButton
            command="admin.payment.savePolicy"
            className="primary-btn"
            type="button"
            targetId={`policy-${zone}-${category}-${platform}`}
            confirmTarget={false}
            scope={zone}
            before={`finance rev ${finance.draftRev}`}
            after={`${zone} ${category} ${platform} payment methods`}
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={policyNext}
            disabled={!policyDirty}
            title={!policyDirty ? tr("No unsaved payment-method change.") : undefined}
            onDone={() => {
              setPolicyDraft(null);
              setNotice(tr("Payment-method policy saved. Existing authorisations continue."));
            }}
          >{tr("Save payment methods")}</CommandButton>
          <button data-command="admin.card.action" className="secondary-btn" type="button" disabled={!policyDirty} onClick={() => setPolicyDraft(null)}>{tr("Discard unsaved")}</button>
        </div>
      </article>

      <div className="split">
        <article className="panel">
          <h3>{tr("Wallet ledger and vouchers")}</h3>
          <p>{tr("Balances are ledger-derived. No operator can type a balance directly.")}</p>
          <ul aria-label={tr("Wallet ledger")}>
            {(wallet.data ?? []).slice(0, 12).map((row) => (
              <li key={row.id}>{row.name} · {formatZoneMoney(row.fareOre ?? 0, row.zoneId)} · {row.status}</li>
            ))}
            {finance.vouchers.map((item) => (
              <li key={item.id}>
                {item.id} · {item.riderId} · {voucherMoney(item.amountOre, item.riderId)} · {item.status} · {item.reason}
                {item.status === "posted" ? (
                  <CommandButton
                    command="admin.payment.voidVoucher"
                    className="link-action"
                    type="button"
                    targetId={item.id}
                    confirmTarget={false}
                    before="posted"
                    after="void"
                    expectedSliceRev={finance.draftRev}
                    sliceKey="finance"
                    value={voidWalletVoucher(finance, item.id, agent?.id ?? "", "Manual void").book}
                    onDone={() => setNotice(tr("{0} voided; the ledger entry remains visible.", [item.id]))}
                  >{tr("void")}</CommandButton>
                ) : null}
              </li>
            ))}
          </ul>

          <h4>{tr("Issue wallet voucher")}</h4>
          <div className="field-grid">
            <label>{trn("Rider id{0}", <input aria-label={tr("Voucher rider")} value={voucherRider} onChange={(event) => setVoucherRider(event.target.value)} />)}</label>
            <label>{trn("Amount{0}", <select aria-label={tr("Voucher amount")} value={voucherAmountOre} onChange={(event) => setVoucherAmountOre(Number(event.target.value))}>
                {WALLET_TOP_UPS_ORE.map((amount) => <option key={amount} value={amount}>{voucherMoney(amount, voucherRider)}</option>)}
              </select>)}</label>
            <label>{trn("Voucher reason{0}", <input aria-label={tr("Voucher reason")} value={voucherReason} onChange={(event) => setVoucherReason(event.target.value)} />)}</label>
          </div>
          <CommandButton
            command="admin.payment.issueVoucher"
            className="primary-btn"
            type="button"
            targetId={`voucher-${voucherRider}`}
            confirmTarget={false}
            before={`${finance.vouchers.length} vouchers`}
            after={`${voucherRider} +${voucherMoney(voucherAmountOre, voucherRider)}`}
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={voucher.book}
            disabled={Boolean(voucherError)}
            title={voucherError}
            onDone={() => setNotice(tr("Wallet voucher {0} posted for {1}.", [voucherMoney(voucherAmountOre, voucherRider), voucherRider]))}
          >{tr("Issue wallet voucher")}</CommandButton>
        </article>

        <article className="panel" data-testid="reconciliation">
          <h3>{tr("Reconciliation")}</h3>
          <p>{trn("Captured {0}. Failed count {1}. Refunded {2}. Payouts {3}. Wallet ledger {4}.", money(captured), failed, money(refundedOre), money(payoutOre), money(walletOre))}</p>
          <p>{trn("Current settlement difference {0}.", money(captured - refundedOre - payoutOre))}</p>
          <label>{trn("Reconciliation note{0}", <input aria-label={tr("Reconciliation note")} value={reconciliationNote} onChange={(event) => setReconciliationNote(event.target.value)} />)}</label>
          <CommandButton
            command="admin.payment.reconcile"
            className="secondary-btn"
            type="button"
            targetId={`reconciliation-${finance.reconciliations.length + 1}`}
            confirmTarget={false}
            before={`${finance.reconciliations.length} runs`}
            after={reconciliation.run ? `difference ${money(reconciliation.run.differenceOre)}` : "reconciliation"}
            expectedSliceRev={finance.draftRev}
            sliceKey="finance"
            value={reconciliation.book}
            onDone={() => setNotice(tr("Reconciliation snapshot saved."))}
          >{tr("Save reconciliation")}</CommandButton>
          {finance.reconciliations.length === 0 ? <p className="state-line">{tr("No saved reconciliation run.")}</p> : (
            <ol aria-label={tr("Reconciliation history")} className="version-list">
              {finance.reconciliations.map((item) => (
                <li key={item.id}>{trn("{0} · {1} · {2} · difference {3} · {4}", item.id, item.at, item.actorId, money(item.differenceOre), item.note)}</li>
              ))}
            </ol>
          )}
        </article>
      </div>

      <article className="panel">
        <h3>{tr("Bank validation tool")}</h3>
        <p>{tr("Approval itself is performed on the payout workspace for the payout driver.")}</p>
        <div className="field-grid">
          <label>{trn("Clearing number{0}", <input aria-label={tr("Clearing number")} value={clearing} onChange={(event) => setClearing(event.target.value)} />)}</label>
          <label>{trn("Account{0}", <input aria-label={tr("Account number")} value={account} onChange={(event) => setAccount(event.target.value)} />)}</label>
          <label>{trn("IBAN{0}", <input aria-label="IBAN" value={iban} onChange={(event) => setIban(event.target.value)} />)}</label>
          <label>{trn("BIC{0}", <input aria-label="BIC" value={bic} onChange={(event) => setBic(event.target.value.toUpperCase())} />)}</label>
        </div>
        <p data-testid="bank-check">
          {bankName ? tr("Bank {0}.", [bankName]) : tr("Clearing number does not match a bank.")}
          {" "}
          {accountOk(account) ? tr("Account length is valid.") : tr("Account must be 6 to 10 digits.")}
          {" "}
          {ibanOk(iban) ? tr("IBAN checks.") : tr("IBAN failed the mod 97 check.")}
          {" "}
          {bicOk(bic) ? tr("BIC length is valid.") : tr("BIC must be 8 or 11 characters.")}
        </p>
      </article>
      </>
      )}
    </div>
  );
}
