import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, RotateCcw, Scale, Wallet } from "lucide-react";
import { tr } from "../i18n";
import { useLiveSession, useLiveSessionMaybe } from "./LiveSessionContext";
import { liveMoney, parseMinor } from "./format";
import { ErrorLine } from "./ui";

/**
 * v0.18.10 (driver group 8 "Finish & cash", contract.json#finish; Rules decisions/admin-fake-by-group.md G8): the trip
 * page's money on live, every number from the server — who gets what (TripProjection.moneySplit: rider paid, driver's
 * one number with its lines, Movera, an earlier unpaid fee as its own line, tip, refunded), ended early, and three real
 * calls: Give money back (POST …/refund, optional "take from the driver"), Change the driver's pay (POST …/driver-pay,
 * reason, audited) and Resend receipt (POST …/receipt/resend, reason). Returns null in a demo build.
 */
type M = { amountMinor: number; currency: string };
type MoneyTrip = {
  tripId: string;
  version: number;
  status: string;
  paymentStatus?: string;
  fare: M;
  driverId?: string;
  driverTotal?: M;
  earningsBreakdown?: { code: string; amount: M }[];
  debtCollected?: M;
  moneySplit?: { riderPaid: M; driverTotal: M; movera: M; debtCollected: M; tip?: M; refunded: M };
  tip?: { amount: M; method: string; at: string };
  finish?: { endedEarly: boolean; endedBy?: string; reasonCode?: string; repriced?: boolean };
};

const ENDED = ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

function lineLabel(code: string): string {
  if (code === "trip") return tr("Trip");
  if (code === "pickup_pay") return tr("Pickup pay");
  if (code === "bonus") return tr("Bonus");
  if (code === "tip") return tr("Tip");
  if (code === "adjustment") return tr("Changed by Movera");
  return code;
}

export function LiveTripMoney({ tripId }: { tripId: string }) {
  const live = useLiveSessionMaybe();
  if (!live) return null;
  return <Money tripId={tripId} />;
}

function Money({ tripId }: { tripId: string }) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const path = `/admin/trips/${encodeURIComponent(tripId)}`;
  const trip = useQuery({ queryKey: ["live", "trip", tripId], queryFn: () => client.json<MoneyTrip>(path) });
  const [refund, setRefund] = useState("");
  const [refundWhy, setRefundWhy] = useState("");
  const [fromDriver, setFromDriver] = useState(false);
  const [pay, setPay] = useState("");
  const [payWhy, setPayWhy] = useState("");
  const [receiptWhy, setReceiptWhy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (trip.error) return <ErrorLine error={trip.error} onRetry={() => void trip.refetch()} />;
  const t = trip.data;
  if (!t) return <p className="state-line">{tr("Loading.")}</p>;
  const currency = t.fare.currency;
  const ended = ENDED.includes(t.status);
  const paid = ended && (t.paymentStatus === "captured" || t.paymentStatus === "partially_refunded");
  const split = t.moneySplit;

  const run = async (work: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      setNotice(await work());
      void queryClient.invalidateQueries({ queryKey: ["live", "trip", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["records"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  const refundMinor = parseMinor(refund, currency);
  const payNegative = pay.trim().startsWith("-") || pay.trim().startsWith("−");
  const payAbs = parseMinor(pay.trim().replace(/^[-−+]/, ""), currency);
  const payMinor = payAbs === null ? null : payNegative ? -payAbs : payAbs;

  return (
    <div className="op-actions-grid" data-testid="live-trip-money">
      <div className="op-action green" data-testid="trip-who-gets-what">
        <h4><Scale size={15} aria-hidden="true" /> {tr("Who gets what")}</h4>
        {split ? (
          <ul className="cx-lines">
            <li>{tr("Rider paid")}: <b>{liveMoney(split.riderPaid)}</b></li>
            <li>{tr("Driver gets")}: <b>{liveMoney(split.driverTotal)}</b></li>
            {(t.earningsBreakdown ?? []).map((line) => <li key={line.code} className="dx-note">· {lineLabel(line.code)}: {liveMoney(line.amount)}</li>)}
            <li>{tr("Movera commission")}: <b>{liveMoney(split.movera)}</b></li>
            {split.debtCollected.amountMinor > 0 ? <li data-testid="trip-debt-line">{tr("Earlier unpaid fee (to that trip)")}: <b>{liveMoney(split.debtCollected)}</b></li> : null}
            {split.tip ? <li>{tr("Tip")}: <b>{liveMoney(split.tip)}</b>{t.tip ? ` (${t.tip.method === "cash" ? tr("Pay in car") : t.tip.method})` : ""}</li> : null}
            {split.refunded.amountMinor > 0 ? <li>{tr("Refunded")}: <b>{liveMoney(split.refunded)}</b></li> : null}
          </ul>
        ) : <p className="dx-note">{tr("The server sends no money split for this trip yet.")}</p>}
        {t.finish?.endedEarly ? (
          <p className="dx-warn" data-testid="trip-ended-early">
            {t.finish.endedBy === "rider" ? tr("The rider ended the trip early.") : tr("The driver ended the trip before the destination.")}
            {t.finish.repriced === false ? ` ${tr("The booked price applies.")}` : t.finish.repriced ? ` ${tr("The price is for the distance driven.")}` : ""}
          </p>
        ) : null}
      </div>

      <div className="op-action green">
        <h4><RotateCcw size={15} aria-hidden="true" /> {tr("Give money back")}</h4>
        <div className="op-inline wrap">
          <label className="op-money"><input aria-label={tr("Refund amount")} inputMode="decimal" value={refund} placeholder="0" onChange={(e) => setRefund(e.target.value)} disabled={!paid} /><span>{currency}</span></label>
          <input aria-label={tr("Why")} value={refundWhy} placeholder={tr("Why?")} onChange={(e) => setRefundWhy(e.target.value)} disabled={!paid} />
          <label className="check-row"><input type="checkbox" checked={fromDriver} onChange={(e) => setFromDriver(e.target.checked)} disabled={!paid || !t.driverId} /> {tr("Take it from the driver's share")}</label>
          <button type="button" className="dash-btn small" data-command="admin.trip.partRefund" disabled={busy || !paid || !refundMinor || !refundWhy.trim()} title={!paid ? tr("Only a paid, finished trip can be refunded.") : undefined}
            onClick={() => void run(async () => {
              await client.post(`${path}/refund`, { expectedVersion: t.version, amount: { amountMinor: refundMinor!, currency }, reason: refundWhy.trim(), ...(fromDriver ? { fromDriver: true } : {}) });
              setRefund(""); setRefundWhy(""); setFromDriver(false);
              return tr("Refund made: {0}.", [liveMoney({ amountMinor: refundMinor!, currency })]);
            })}>{tr("Give money back")}</button>
        </div>
      </div>

      <div className="op-action blue">
        <h4><Wallet size={15} aria-hidden="true" /> {tr("Change the driver's pay")}</h4>
        <p className="op-help">{tr("Use + to add, − to take away.")}</p>
        <div className="op-inline wrap">
          <label className="op-money"><input aria-label={tr("Driver pay change")} inputMode="decimal" value={pay} placeholder="+0" onChange={(e) => setPay(e.target.value)} disabled={!ended || !t.driverId} /><span>{currency}</span></label>
          <input aria-label={tr("Reason for the pay change")} value={payWhy} placeholder={tr("Why?")} onChange={(e) => setPayWhy(e.target.value)} disabled={!ended || !t.driverId} />
          <button type="button" className="dash-btn small" data-command="admin.trip.pay" disabled={busy || !ended || !t.driverId || !payMinor || !payWhy.trim()} title={!ended ? tr("The trip is not finished.") : undefined}
            onClick={() => void run(async () => {
              await client.post(`${path}/driver-pay`, { change: { amountMinor: payMinor!, currency }, reason: payWhy.trim() });
              setPay(""); setPayWhy("");
              return tr("Driver pay changed.");
            })}>{tr("Change pay")}</button>
        </div>
      </div>

      <div className="op-action grey">
        <h4><Receipt size={15} aria-hidden="true" /> {tr("Resend receipt")}</h4>
        <div className="op-inline wrap">
          <input aria-label={tr("Reason for resending")} value={receiptWhy} placeholder={tr("Why?")} onChange={(e) => setReceiptWhy(e.target.value)} disabled={!ended} />
          <button type="button" className="dash-btn small ghost" data-command="admin.trip.receipt" disabled={busy || !ended || !receiptWhy.trim()} title={!ended ? tr("The trip is not finished.") : undefined}
            onClick={() => void run(async () => {
              await client.post(`${path}/receipt/resend`, { reason: receiptWhy.trim() });
              setReceiptWhy("");
              return tr("Receipt sent again to the rider (in the app).");
            })}>{tr("Resend receipt")}</button>
        </div>
      </div>
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      {error ? <ErrorLine error={error} /> : null}
    </div>
  );
}
