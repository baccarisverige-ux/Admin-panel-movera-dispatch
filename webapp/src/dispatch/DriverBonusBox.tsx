import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import type { TripOffersView } from "../api/dispatchSim";
import { formatMoney, market } from "../markets/markets";
import { countryOf } from "../trips/file";
import { CommandButton } from "../ui/CommandButton";
import { bonusIssue, canAssign } from "./assign";
import { tr, trn, trSentences } from "../i18n";

const PRICING_LINK = "/pricing?tab=extras&section=driver-bonus";

/** The admin offers of a trip, read every second while the panel is open (countdowns, answers, the lock). */
export function useTripOffers(tripId: string, enabled = true) {
  const api = useAdminApi();
  return useQuery({
    queryKey: ["assign-offers", tripId],
    queryFn: () => api.tripOffers(tripId),
    // Every second while offers can still change; a trip past assigning is read again only now and then.
    refetchInterval: (query) => {
      const data = query.state.data;
      return !data || canAssign(data.status) || data.offers.some((offer) => offer.status === "open") ? 1000 : 15_000;
    },
    enabled: enabled && Boolean(tripId),
  });
}

export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * "Add money for driver" (Q16, Q17): on the trip, in the assign panel and in the rider pop-up on the map, while the
 * trip is requested, searching or offered. Movera pays it from its commission, and may pay more than its commission;
 * the rider never pays it. The total per trip may not pass the country's limit from Pricing › Tips & limits.
 */
export function DriverBonusBox({ trip, view, canAct, onDone, compact = false }: { trip: { id: string; zoneId: string; status: string }; view: TripOffersView; canAct: boolean; onDone?: (text: string) => void; compact?: boolean }) {
  const country = countryOf(trip.zoneId);
  const place = market(country);
  const money = (minor: number) => formatMoney(minor, country);
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState(true);
  const raw = amount.trim() === "" ? 0 : Number(amount) * place.minorUnits;
  const addMinor = Number.isFinite(raw) ? Math.round(raw) : 0;
  const tooFine = Number.isFinite(raw) && Math.abs(raw - addMinor) > 1e-6;
  const issue = amount.trim() === "" ? null : tooFine ? { code: "invalid" as const, message: "Too many decimals for this currency." } : bonusIssue(Number.isFinite(raw) ? addMinor : Number.NaN, view.bonusMinor, view.limits, money);
  const open = canAssign(trip.status);
  const total = view.bonusMinor + (issue ? 0 : addMinor);
  const moveraKeeps = view.commissionMinor - total;
  return (
    <section className={compact ? "as-section as-bonus compact" : "as-section as-bonus"} aria-label={tr("Add money for driver")} data-testid="driver-bonus-box">
      <h4>{trn("{0} Add money for driver", <BadgeDollarSign size={14} aria-hidden="true" />)}</h4>
      {compact ? null : <p className="as-help">{tr("Movera pays it from its commission, and can pay more than its commission. The rider never pays it. The driver sees the total fare with it and a red “Priority” badge.")}</p>}
      {view.bonusMinor ? <p className="as-bonus-now" data-testid="driver-bonus-now">{trn("Added so far: {0}{1}", <b>{money(view.bonusMinor)}</b>, view.priority ? <span className="as-priority">{tr("Priority")}</span> : null)}</p> : null}
      <div className="as-bonus-row">
        <label>{trn("Amount ({0}){1}", place.currency, <input aria-label={tr("Money for the driver")} type="number" min="0" step={1 / place.minorUnits} value={amount} disabled={!canAct || !open} onChange={(event) => setAmount(event.target.value)} placeholder={tr("Up to {0}", [money(Math.max(0, view.limits.limitMinor - view.bonusMinor))])} />)}</label>
        <label className="check-row">{trn("{0} Priority badge", <input type="checkbox" checked={priority} disabled={!canAct || !open} onChange={(event) => setPriority(event.target.checked)} />)}</label>
        <CommandButton
          command="admin.trip.driverBonus"
          className="dash-btn small"
          targetId={trip.id}
          scope={trip.zoneId}
          confirmTarget={false}
          entityState={trip.status}
          before={money(view.bonusMinor)}
          after={money(view.bonusMinor + addMinor)}
          value={{ amountMinor: addMinor, priority }}
          disabled={!canAct || !open || addMinor <= 0 || Boolean(issue)}
          title={!open ? tr("Money can be added only while the trip is requested, searching or offered.") : issue?.message}
          summary={<>{trn("Add {0} for the driver on {1}. Movera pays it; the rider’s price does not change.", <b>{money(addMinor)}</b>, trip.id)}</>}
          onDone={() => { setAmount(""); onDone?.(`${money(addMinor)} added for the driver.`); }}
        >{tr("Add money")}</CommandButton>
      </div>
      {issue ? (
        <p className="pl-warn" role="alert" data-testid="driver-bonus-issue">
          {trSentences(issue.message)}{issue.code === "over_limit" ? <> <Link to={PRICING_LINK}>{tr("Open Pricing › Tips & limits")}</Link></> : null}
        </p>
      ) : (
        <p className="as-help">{trn("Limit {0} per trip, set in {1} (hard max {2}).", money(view.limits.limitMinor), <Link to={PRICING_LINK}>{tr("Pricing › Tips & limits")}</Link>, money(view.limits.hardMaxMinor))}</p>
      )}
      <dl className="as-split" aria-label={tr("Money split with the bonus")} data-testid="driver-bonus-split">
        <div><dt>{tr("Rider pays")}</dt><dd>{money(view.fareMinor)}</dd></div>
        <div><dt>{tr("Driver gets")}</dt><dd>{money(view.driverNetMinor + total)}</dd></div>
        <div><dt>{tr("Movera commission")}</dt><dd>{money(view.commissionMinor)}</dd></div>
        <div className={total ? "minus" : undefined}><dt>{tr("Bonus paid by Movera")}</dt><dd>− {money(total)}</dd></div>
        <div className={moveraKeeps < 0 ? "total minus" : "total"}><dt>{tr("Movera keeps")}</dt><dd>{money(moveraKeeps)}</dd></div>
      </dl>
      {moveraKeeps < 0 ? <p className="dx-note" data-testid="driver-bonus-beyond">{trn("Movera pays {0} more than its commission on this trip.", money(-moveraKeeps))}</p> : null}
    </section>
  );
}
