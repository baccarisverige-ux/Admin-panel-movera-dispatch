import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { liveMoney } from "./format";
import { ErrorLine } from "./ui";
import type { Driver, LiveMoney, Page } from "./types";
import { NotConnected } from "./NotConnected";
import { useMarketScope } from "../markets/useMarketScope";
import { zoneFilterOf } from "./liveAdminApi";

/**
 * Live builds only, in the demo Payouts page (contract v0.9.0 §16, owner real-data decisions part 3): the server's
 * payouts with the lines behind each amount, Create payout by hand, Mark as paid, and the refunds to send by hand
 * (Swish / bank) with Mark as paid. Bank review, holds and payout runs have no server source yet.
 */

export type PayoutLine = { code: string; amount: LiveMoney; count?: number };
export type LivePayout = {
  payoutId: string;
  driverId: string;
  driverName?: string;
  amount: LiveMoney;
  status: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  paidAt?: string;
  paidBy?: string;
  source: "weekly" | "manual";
  tripCount: number;
  lines: PayoutLine[];
  note?: string;
};
type RefundToSend = { refundId: string; tripId?: string; amount: LiveMoney; reason?: string; createdAt?: string; riderName: string; riderPhone: string; payoutTo?: unknown };

export const PAYOUT_LINE_LABEL: Record<string, string> = {
  trips: "Trips",
  waiting: "Waiting",
  pickup_pay: "Pickup pay",
  bonus: "Bonus",
  tips: "Tips",
  cash_collected: "Cash collected",
  fees: "Cancel and no-show fees",
};

export function payoutLineLabel(code: string): string {
  const label = PAYOUT_LINE_LABEL[code];
  return label ? tr(label as Parameters<typeof tr>[0]) : code;
}

const day = (iso: string) => iso.slice(0, 10);

function payoutTo(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const to = value as { method?: string; phone?: string; swish?: { phone?: string }; bank?: { iban?: string; accountNumber?: string } };
    if (to.swish?.phone || to.method === "swish") return `Swish ${to.swish?.phone ?? to.phone ?? ""}`.trim();
    if (to.bank) return `${tr("Bank")} ${to.bank.iban ?? to.bank.accountNumber ?? ""}`.trim();
  }
  return tr("Not connected yet");
}

export function LivePayouts() {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  // v0.16.2: the payouts of the country and zones picked in the top bar.
  const zoneFilter = zoneFilterOf(useMarketScope().effective);
  const zoneQuery = new URLSearchParams(zoneFilter.params).toString();
  const payouts = useQuery({ queryKey: ["live", "payouts", zoneQuery], queryFn: () => (zoneFilter.denied ? Promise.resolve({ items: [], nextCursor: null } as Page<LivePayout>) : client.json<Page<LivePayout>>(`/admin/payouts?limit=100${zoneQuery ? `&${zoneQuery}` : ""}`)) });
  const refunds = useQuery({ queryKey: ["live", "refund-payouts"], queryFn: () => client.json<Page<RefundToSend>>("/admin/refunds/payouts?payoutStatus=pending") });
  const drivers = useQuery({ queryKey: ["live", "payout-drivers"], queryFn: () => client.json<Page<Driver>>("/admin/drivers?limit=200") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ driverId: "", from: "", to: "", note: "" });
  const items = payouts.data?.items ?? [];
  const selected = items.find((item) => item.payoutId === selectedId) ?? items[0];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["live", "payouts"] });
    void queryClient.invalidateQueries({ queryKey: ["live", "refund-payouts"] });
  };
  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setNotice(done);
      refresh();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const fromIso = form.from ? new Date(`${form.from}T00:00:00`).toISOString() : "";
  const toIso = form.to ? new Date(`${form.to}T00:00:00`).toISOString() : "";
  const formIssue = !form.driverId ? tr("Pick a driver.") : !form.from || !form.to ? tr("Pick the first and the last day.") : fromIso >= toIso ? tr("The first day must be before the last day.") : null;

  return (
    <div className="live-payouts" data-testid="live-payouts">
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}

      <section className="panel fn-panel" aria-label={tr("Payouts")}>
        <h3>{tr("Payouts")}</h3>
        <p className="op-help">{tr("Every week (Monday to Monday) the server makes one payout per driver. Amount = trips + waiting + pickup pay + bonus + tips + fees − cash collected; below zero, the driver owes Movera.")}</p>
        {payouts.isLoading ? <p className="state-line">{tr("Loading.")}</p> : payouts.error ? <ErrorLine error={payouts.error} onRetry={() => void payouts.refetch()} /> : items.length === 0 ? <p className="dx-calm">{tr("No payouts yet.")}</p> : (
          <table className="data-table" data-testid="live-payout-list">
            <thead><tr><th scope="col">{tr("Period")}</th><th scope="col">{tr("Driver")}</th><th scope="col">{tr("Trips")}</th><th scope="col">{tr("Amount")}</th><th scope="col">{tr("Status")}</th><th scope="col">{tr("Made by")}</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.payoutId} className={item.payoutId === selected?.payoutId ? "selected" : undefined} onClick={() => setSelectedId(item.payoutId)} data-payout={item.payoutId}>
                  <td>{day(item.periodStart)} – {day(item.periodEnd)}</td>
                  <td>{item.driverName ?? item.driverId}</td>
                  <td>{item.tripCount}</td>
                  <td className={item.amount.amountMinor < 0 ? "minus" : undefined}>{liveMoney(item.amount)}</td>
                  <td>{item.status === "paid" ? tr("Paid") : tr("To pay")}</td>
                  <td>{item.source === "weekly" ? tr("Weekly") : tr("By hand")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected ? (
        <article className="panel fn-panel" data-testid="live-payout-detail">
          <h3>{selected.driverName ?? selected.driverId} · {day(selected.periodStart)} – {day(selected.periodEnd)}</h3>
          <dl className="op-split-lines" data-testid="live-payout-lines">
            {selected.lines.map((line) => (
              <div key={line.code} className={line.amount.amountMinor < 0 ? "minus" : undefined} data-line={line.code}>
                <dt>{payoutLineLabel(line.code)}{line.count !== undefined ? ` (${line.count})` : ""}</dt>
                <dd>{liveMoney(line.amount)}</dd>
              </div>
            ))}
            <div className="total"><dt>{selected.amount.amountMinor < 0 ? tr("The driver owes Movera") : tr("Driver gets")}</dt><dd>{liveMoney(selected.amount)}</dd></div>
          </dl>
          <p className="op-help">{selected.status === "paid" ? tr("Paid {0}.", [selected.paidAt ? day(selected.paidAt) : ""]) : tr("Not paid yet.")} {selected.note ?? ""}</p>
          <p className="op-help">{tr("Bank details")}: <NotConnected /></p>
          <button type="button" className="primary-btn" data-command="admin.payment.markPaid" disabled={busy || selected.status === "paid"} onClick={() => void run(() => client.post(`/admin/payouts/${encodeURIComponent(selected.payoutId)}/paid`, {}), tr("Payout marked as paid."))}>{tr("Mark as paid")}</button>
        </article>
      ) : null}

      <section className="panel fn-panel" aria-label={tr("Create payout")} data-testid="live-payout-create">
        <h3>{tr("Create payout")}</h3>
        <p className="op-help">{tr("For one driver and a date range. Trips already in a payout are not counted again.")}</p>
        <div className="field-grid">
          <label>{tr("Driver")}
            <select aria-label={tr("Payout driver")} value={form.driverId} onChange={(event) => setForm({ ...form, driverId: event.target.value })}>
              <option value="">{tr("Pick a driver")}</option>
              {(drivers.data?.items ?? []).map((driver) => <option key={driver.driverId} value={driver.driverId}>{[driver.firstName, driver.lastName].filter(Boolean).join(" ")}</option>)}
            </select>
          </label>
          <label>{tr("First day")}<input type="date" aria-label={tr("First day")} value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label>
          <label>{tr("Up to (not included)")}<input type="date" aria-label={tr("Up to (not included)")} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label>
          <label>{tr("Note")}<input aria-label={tr("Payout note")} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        </div>
        {formIssue ? <p className="op-help">{formIssue}</p> : null}
        <button type="button" className="secondary-btn" data-command="admin.payout.schedule" disabled={busy || Boolean(formIssue)} onClick={() => void run(() => client.post("/admin/payouts", { driverId: form.driverId, from: fromIso, to: toIso, ...(form.note ? { note: form.note } : {}) }), tr("Payout created."))}>{tr("Create payout")}</button>
      </section>

      <section className="panel fn-panel" aria-label={tr("Refunds to send by hand")} data-testid="live-refunds-to-send">
        <h3>{tr("Refunds to send by hand")}</h3>
        {refunds.isLoading ? <p className="state-line">{tr("Loading.")}</p> : refunds.error ? <ErrorLine error={refunds.error} onRetry={() => void refunds.refetch()} /> : (refunds.data?.items ?? []).length === 0 ? <p className="dx-calm">{tr("No refund waits to be sent.")}</p> : (
          <ul className="pm-list">
            {(refunds.data?.items ?? []).map((item) => (
              <li key={item.refundId} data-refund={item.refundId}>
                <span className="pm-main"><b>{item.riderName} · {liveMoney(item.amount)}</b><small>{payoutTo(item.payoutTo)} · {item.reason ?? ""}{item.tripId ? ` · ${item.tripId}` : ""}</small></span>
                <button type="button" className="dash-btn small" data-command="admin.payment.markPaid" disabled={busy} onClick={() => void run(() => client.post(`/admin/refunds/${encodeURIComponent(item.refundId)}/paid`, {}), tr("Refund marked as paid."))}>{tr("Mark as paid")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
