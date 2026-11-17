import { useState } from "react";
import { Wallet } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { liveMoney } from "./format";
import { walletCreditMinor, walletCreditProblem } from "./walletCredit";

/**
 * v0.18.29 A2 (fix job 0) (owner G12 Q5 "Real credit + limit", Q-D "Max 250 euro and equivalent", build-spec Q2 "One button on
 * rider page", Q1 "One admin always"; contract.json#walletCredit): the one way to give a rider money. The amount is
 * in the rider's currency; the server checks the country's limit (Trip settings) and tells the rider (push + history).
 * v0.18.82 S5 J4a (moneyBase.versionGuard, owner 106): sends the rider version this page shows; a second click gets 409,
 * the page reloads and says so. The button is off while a request is sending (CommandButton "Please wait").
 */
const SYMBOL: Record<string, string> = { SEK: "kr", EUR: "€", TND: "DT" };

export function LiveWalletCredit({ riderId, version, walletMinor, currency }: { riderId: string; version?: number; walletMinor: number | null; currency: string | null }) {
  const session = useLiveSessionMaybe();
  const canEdit = session?.can("finance.edit") ?? false;
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  // BQ-A30b SF1: no known rider currency → nothing is sent (never "SEK"); the box says so and the button stays off.
  const minor = walletCreditMinor(amount, currency);
  const problemKey = walletCreditProblem(amount, currency);
  const problem = problemKey ? tr(problemKey) : null;
  const symbol = currency ? SYMBOL[currency] ?? currency : "";
  // GM item 13: the currency's own decimals ("200,00 kr", "12.500 DT"), with the one formatter (C-23).
  // S5 J9 (v0.18.84 debtModel.riderWallet): a balance below 0 is what the rider owes (unpaid fees), "Owes 50,00 kr".
  const balance = walletMinor === null || currency === null ? "—" : walletMinor < 0 ? tr("Owes {0}", [liveMoney({ amountMinor: -walletMinor, currency })]) : liveMoney({ amountMinor: walletMinor, currency });
  return (
    <section className="fd-box rd-wallet" data-testid="live-wallet-credit">
      <h3>{trn("{0} Movera wallet", <Wallet size={16} aria-hidden="true" />)}</h3>
      <strong className="rd-wallet-balance" data-testid="live-wallet-balance">{balance}</strong>
      <div className="rd-form-grid">
        <label className="field"><span>{tr("Amount")}{symbol ? ` (${symbol})` : ""}</span><input aria-label={tr("Wallet amount")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!canEdit} /></label>
      </div>
      {currency === null ? <p className="dx-warn" data-testid="live-wallet-no-currency">{tr("The rider's currency is not known.")}</p> : null}
      <small className="fine">{tr("The rider gets a notice and sees it in the wallet as Credit from Movera.")}</small>
      <CommandButton
        command="admin.rider.walletCredit"
        className="dash-btn"
        targetId={riderId}
        confirmTarget={false}
        before={balance}
        after={`+${amount} ${symbol}`}
        value={{ ...(typeof version === "number" ? { expectedVersion: version } : {}), amount: { amountMinor: minor ?? 0, currency: currency ?? "" } }}
        disabled={!canEdit || Boolean(problem)}
        title={problem ?? undefined}
        onDone={() => { setNotice(tr("Added {0} {1} to the wallet.", [amount, symbol])); setAmount(""); }}
      >
        {tr("Add money to wallet")}
      </CommandButton>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
