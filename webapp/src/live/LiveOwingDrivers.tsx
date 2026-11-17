import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { tr } from "../i18n";
import { zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { ConfirmInfo } from "../ui/ConfirmInfo";
import { Modal } from "../ui/Modal";
import { useLiveSession } from "./LiveSessionContext";
import { errorText, liveMoney, parseMinor } from "./format";
import { listCountText } from "./listPages";
import { afterPaidMoveraKeys, PAID_MOVERA_REASON_MAX, paidMoveraProblem, payMovera, readOwingDrivers, type OwingDriver } from "./owingDrivers";
import { DateText, ErrorLine, LoadMore } from "./ui";
import { zoneFilterOf } from "./zoneFilter";

/**
 * S5 J9 (contract v0.18.84 debtModel.driverOwes; owner Q-S5-1a "Both", 2026-11-13 14:54 / 14:59): Drivers › "Drivers who
 * owe Movera" — the server's list (largest owed first, the zones picked at the top, "50 of N · Load more") and the
 * "Driver paid Movera" dialog (finance.edit): the amount he paid another way (Swish, bank) and why. The server writes a
 * correction entry (payout line "Paid to Movera"), audited; past entries never change. Live builds only.
 */
export function LiveOwingDrivers() {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const scope = useMarketScope();
  const zoneFilter = zoneFilterOf(scope.effective);
  const zoneQuery = new URLSearchParams(zoneFilter.params).toString();
  const key = ["live", "drivers-owing", zoneQuery];
  const first = useQuery({ queryKey: key, queryFn: () => (zoneFilter.denied ? Promise.resolve({ items: [], nextCursor: null }) : readOwingDrivers(client, zoneFilter.params, null)) });
  const [more, setMore] = useState<{ query: string; items: OwingDriver[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paying, setPaying] = useState<OwingDriver | null>(null);
  const [notice, setNotice] = useState("");
  const extra = more?.query === zoneQuery ? more : null;
  const items = [...(first.data?.items ?? []), ...(extra?.items ?? [])];
  const cursor = extra ? extra.cursor : first.data?.nextCursor ?? null;
  const total = first.data?.total;

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await readOwingDrivers(client, zoneFilter.params, cursor);
      setMore({ query: zoneQuery, items: [...(extra?.items ?? []), ...page.items], cursor: page.nextCursor });
    } catch (error) {
      setMoreError(error);
    } finally {
      setLoadingMore(false);
    }
  }
  function reload() {
    setMore(null);
    void queryClient.invalidateQueries({ queryKey: key });
  }

  return (
    <section className="panel fn-panel" aria-label={tr("Drivers who owe Movera")} data-testid="live-owing-drivers">
      <h3>{tr("Drivers who owe Movera")}</h3>
      <p className="op-help">{tr("What each driver owes Movera now: the commission and rider debt he kept in cash, minus what Movera holds for him, plus what is left from earlier payouts. Over the country's owes-limit he gets no cash trips; he can still go online.")}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {first.isLoading ? <p className="state-line">{tr("Loading.")}</p> : first.error ? <ErrorLine error={first.error} onRetry={reload} /> : items.length === 0 ? <p className="dx-calm">{tr("No driver owes Movera.")}</p> : (
        <table className="data-table" data-testid="live-owing-list">
          <thead><tr><th scope="col">{tr("Driver")}</th><th scope="col">{tr("Zone")}</th><th scope="col">{tr("Owes Movera")}</th><th scope="col">{tr("Owes-limit")}</th><th scope="col">{tr("Last paid Movera")}</th><th scope="col"><span className="sr-only">{tr("Actions")}</span></th></tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={`${row.driverId}:${row.owed.currency}`} data-owing={row.driverId}>
                <td><Link to={`/drivers/${encodeURIComponent(row.driverId)}`}>{row.driverName ?? row.driverId}</Link></td>
                <td>{row.zoneId ? zoneById(row.zoneId)?.name ?? row.zoneId : "—"}</td>
                <td className="minus">{liveMoney(row.owed)}</td>
                <td>{row.limit ? liveMoney(row.limit) : tr("Off")}{row.overLimit ? <> · <b data-testid="owing-over-limit">{tr("Over the limit: no cash trips")}</b></> : null}</td>
                <td><DateText value={row.lastPaidMoveraAt} /></td>
                <td>{can("finance.edit") ? <button type="button" className="dash-btn small" data-command="admin.server.driverPaidMovera" onClick={() => { setNotice(""); setPaying(row); }}>{tr("Driver paid Movera")}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total !== undefined && items.length ? <small className="live-list-count" data-testid="owing-count">{listCountText(items.length, total)}</small> : null}
      {moreError ? <ErrorLine error={moreError} /> : null}
      <LoadMore hasMore={Boolean(cursor) && !first.isLoading} loading={loadingMore} onClick={() => void loadMore()} />
      {paying ? <PaidMoveraDialog row={paying} onClose={() => setPaying(null)} onDone={(text) => { setPaying(null); setNotice(text); setMore(null); for (const queryKey of afterPaidMoveraKeys(zoneQuery)) void queryClient.invalidateQueries({ queryKey }); }} /> : null}
    </section>
  );
}

/** "Driver paid Movera": amount (at most the owed the admin sees) and a reason; 409 owed_changed shows the new owed. */
function PaidMoveraDialog({ row: start, onClose, onDone }: { row: OwingDriver; onClose: () => void; onDone: (notice: string) => void }) {
  const { client } = useLiveSession();
  const [row, setRow] = useState(start);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const minor = parseMinor(amount, row.owed.currency);
  const problem = paidMoveraProblem(row.owed.amountMinor, minor, reason);
  const name = row.driverName ?? row.driverId;
  const paidText = minor !== null ? liveMoney({ amountMinor: minor, currency: row.owed.currency }) : tr("the amount you write");

  async function send() {
    if (problem || minor === null || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const answer = await payMovera(client, row, minor, reason);
      if (answer.ok) {
        onDone(tr("Saved: {0} paid Movera {1}. He now owes {2}.", [name, liveMoney({ amountMinor: minor, currency: row.owed.currency }), liveMoney(answer.row.owed)]));
        return;
      }
      // Nothing was written: what he owes changed since the list was read; the admin checks the new amount.
      setRow(answer.row);
      setMessage(tr("What the driver owes changed to {0}. Check the amount and save again.", [liveMoney(answer.row.owed)]));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={tr("Driver paid Movera")} onClose={onClose}>
      <form className="live-form" data-testid="paid-movera-dialog" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <p>{tr("{0} owes Movera {1}. Write what he paid Movera another way (Swish, bank).", [name, liveMoney(row.owed)])}</p>
        <label className="field"><span>{tr("Amount")} ({row.owed.currency})</span><input aria-label={tr("Amount paid to Movera")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label className="field"><span>{tr("Why")}</span><textarea aria-label={tr("Reason")} maxLength={PAID_MOVERA_REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <ConfirmInfo
          what={tr("{0} paid Movera {1} another way (Swish, bank). The server writes a correction entry \"Paid to Movera\" with your reason, in the audit log; past entries never change.", [name, paidText])}
          change={minor !== null && !problem ? tr("Owes Movera: {0} → {1}", [liveMoney(row.owed), liveMoney({ amountMinor: row.owed.amountMinor - minor, currency: row.owed.currency })]) : tr("Owes Movera: {0} → {0} minus the amount you write", [liveMoney(row.owed)])}
          where={tr("Only this driver: {0} ({1}). The server settles his open payouts below 0 oldest first and marks one it covers in full as paid. No other driver, zone or country changes.", [name, row.zoneId ? zoneById(row.zoneId)?.name ?? row.zoneId : "—"])}
          who={tr("Admins with Finance: in this list, in Payouts and in the audit log. The driver: the \"Paid to Movera\" line on his payout.")}
          when={tr("At once: it is saved when you confirm and applies from then on.")}
          money={tr("No money moves through Movera now: it records that the driver already paid Movera {0} by hand. What he owes goes down by that amount; under the country's owes-limit he gets cash trips again.", [paidText])}
          undo={tr("There is no undo in the panel: the correction entry stays (past entries never change). Check the amount and the driver before you save.")}
          command="admin.server.driverPaidMovera"
        />
        {message ? <p className="state-line live-error" role="alert">{message}</p> : problem && (amount || reason) ? <small className="fine">{problem}</small> : null}
        <div className="actions">
          <button type="submit" className="primary-btn" data-command="admin.server.driverPaidMovera" disabled={busy || Boolean(problem)} title={problem ?? undefined}>{busy ? tr("Saving.") : tr("Save")}</button>
        </div>
      </form>
    </Modal>
  );
}

