import { useState } from "react";
import { Wallet } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * v0.18.29 A2 (fix job 0) (owner G12 Q5 "Real credit + limit", Q-D "Max 250 euro and equivalent", build-spec Q2 "One button on
 * rider page", Q1 "One admin always"; contract.json#walletCredit): the one way to give a rider money. The amount is
 * in the rider's currency; the server checks the country's limit (Trip settings) and tells the rider (push + history).
 */
const DIGITS: Record<string, number> = { SEK: 100, EUR: 100, TND: 1000 };
const SYMBOL: Record<string, string> = { SEK: "kr", EUR: "€", TND: "DT" };

export function LiveWalletCredit({ riderId, walletMinor, currency }: { riderId: string; walletMinor: number | null; currency: string | null }) {
  const session = useLiveSessionMaybe();
  const canEdit = session?.can("finance.edit") ?? false;
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const cur = currency ?? "SEK";
  const digits = DIGITS[cur] ?? 100;
  const symbol = SYMBOL[cur] ?? cur;
  const major = Number(amount.replace(",", "."));
  const minor = Number.isFinite(major) ? Math.round(major * digits) : NaN;
  const problem = !(minor > 0) ? tr("Enter an amount above 0.") : null;
  const balance = walletMinor === null ? "—" : `${(walletMinor / digits).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${symbol}`;
  return (
    <section className="fd-box rd-wallet" data-testid="live-wallet-credit">
      <h3>{trn("{0} Movera wallet", <Wallet size={16} aria-hidden="true" />)}</h3>
      <strong className="rd-wallet-balance" data-testid="live-wallet-balance">{balance}</strong>
      <div className="rd-form-grid">
        <label className="field"><span>{tr("Amount")} ({symbol})</span><input aria-label={tr("Wallet amount")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!canEdit} /></label>
      </div>
      <small className="fine">{tr("The rider gets a notice and sees it in the wallet as Credit from Movera.")}</small>
      <CommandButton
        command="admin.rider.walletCredit"
        className="dash-btn"
        targetId={riderId}
        confirmTarget={false}
        before={balance}
        after={`+${amount} ${symbol}`}
        value={{ amount: { amountMinor: minor, currency: cur } }}
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
