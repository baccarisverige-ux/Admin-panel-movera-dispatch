import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign, Pencil } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { driverBonusSettingLink } from "../live/tripLive";
import { useAdminApi } from "../api/AdminApiContext";
import type { TripOffersView } from "../api/dispatchSim";
import { formatMoney, market, marketOfCurrency, marketOfZone, MARKETS, type Market } from "../markets/markets";
import { countryOf } from "../trips/file";
import { CommandButton } from "../ui/CommandButton";
import { BONUS_SCOPES, bonusInScope, bonusIssue, bonusOf, canAssign, scopeCovers, type AdminOffer, type BonusIssue, type BonusScope } from "./assign";
import { tr, trn, trSentences, trx } from "../i18n";


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

/** The money an admin is about to add for the driver: typed once, used by the next Exclusive or Radar send. */
export type MoneyDraft = { amount: string; scope: BonusScope; priority: boolean };

export const EMPTY_MONEY: MoneyDraft = { amount: "", scope: "both", priority: true };

export const SCOPE_LABEL: Record<BonusScope, string> = { exclusive: "Exclusive", radar: "Radar", both: "Both" };

type Bonused = Pick<TripOffersView, "bonusExclusiveMinor" | "bonusRadarMinor" | "limits">;

/** The typed amount in minor units, and what is wrong with it for its scope (limit, hard max, decimals). */
export function draftMoney(draft: MoneyDraft, view: Bonused, zoneId: string): { addMinor: number; issue: BonusIssue | null } {
  const country = countryOf(zoneId);
  const minor = market(country).minorUnits;
  if (draft.amount.trim() === "") return { addMinor: 0, issue: null };
  const raw = Number(draft.amount) * minor;
  const addMinor = Number.isFinite(raw) ? Math.round(raw) : 0;
  if (Number.isFinite(raw) && Math.abs(raw - addMinor) > 1e-6) return { addMinor: 0, issue: { code: "invalid", message: "Too many decimals for this currency." } };
  const issue = bonusIssue(Number.isFinite(raw) ? addMinor : Number.NaN, bonusInScope(view, draft.scope), view.limits, (value) => formatMoney(value, country));
  return { addMinor: issue ? 0 : addMinor, issue };
}

/**
 * What one send carries for the driver: the typed money when it applies to this kind of offer, the fare the driver
 * will see (with the money already added for this kind), and a reason not to send when the typed amount is wrong.
 */
export function moneyForSend(draft: MoneyDraft, view: (Bonused & Pick<TripOffersView, "fareMinor" | "driverNetMinor" | "pickupPayOn">) | undefined, zoneId: string, kind: AdminOffer["kind"]) {
  if (!view) return { params: {} as Record<string, unknown>, used: false, seesMinor: null as number | null, bonusMinor: 0, blocked: null as string | null, plusPickupPay: false };
  const covers = scopeCovers(draft.scope, kind);
  const { addMinor, issue } = draftMoney(draft, view, zoneId);
  const used = covers && addMinor > 0;
  const bonusMinor = bonusOf(view, kind) + (used ? addMinor : 0);
  return {
    params: used ? { driverBonusMinor: addMinor, bonusScope: draft.scope, priority: draft.priority } : {},
    used,
    // Owner live test 2026-11-01: the driver app shows his share ("Din andel"), never the rider's fare.
    seesMinor: view.driverNetMinor + bonusMinor,
    bonusMinor,
    blocked: covers && issue ? issue.message : null,
    // Checker M1: the pickup pay is per driver (his distance), so it is only named, never guessed.
    plusPickupPay: Boolean(view.pickupPayOn?.[kind === "assigned" ? "assigned" : "radar"]),
  };
}

function seesAmount(money: { seesMinor: number | null; bonusMinor: number; plusPickupPay?: boolean }, zoneId: string): string {
  if (money.seesMinor === null) return "";
  const country = countryOf(zoneId);
  const total = formatMoney(money.seesMinor, country);
  const base = money.bonusMinor ? `${total} (+${formatMoney(money.bonusMinor, country)})` : total;
  return money.plusPickupPay ? `${base} ${tr("+ pickup pay")}` : base;
}

/** "driver sees 103,00 kr (+50,00 kr)" for a send button. */
export function seesLabel(money: { seesMinor: number | null; bonusMinor: number; plusPickupPay?: boolean }, zoneId: string): string {
  const amount = seesAmount(money, zoneId);
  return amount ? tr("driver sees {0}", [amount]) : "";
}

/** "The driver sees 103,00 kr (+50,00 kr)." for a confirm dialog. */
export function seesSentence(money: { seesMinor: number | null; bonusMinor: number; plusPickupPay?: boolean }, zoneId: string): string {
  const amount = seesAmount(money, zoneId);
  return amount ? tr("The driver sees {0}.", [amount]) : "";
}

/**
 * "Add money for driver" (Q16, Q17), the money line at the top of the rider pop-up and the big panel, and on the
 * Trip page: while the trip is requested, searching or offered. The admin types an amount and picks where it applies
 * (Exclusive, Radar or both); the next send carries it, or "Add money" adds it at once to the offers already out.
 * Movera pays it from its commission, and may pay more than its commission; the rider never pays it. The total per
 * trip may not pass the country's limit from Pricing › Tips & limits.
 */
export function DriverBonusBox({ trip, view, canAct, onDone, compact = false, draft: controlled, onDraft }: { trip: { id: string; zoneId: string; status: string }; view: TripOffersView; canAct: boolean; onDone?: (text: string) => void; compact?: boolean; draft?: MoneyDraft; onDraft?: (draft: MoneyDraft) => void }) {
  // Checker round 2 (M2): a zone the panel does not know takes its country from the trip's currency.
  const country = marketOfZone(trip.zoneId)?.id ?? (MARKETS.some((item) => item.currency === view.currency) ? marketOfCurrency(view.currency as Market["currency"]) : countryOf(trip.zoneId));
  const place = market(country);
  const money = (minor: number) => formatMoney(minor, country);
  // Owner 2026-10-31: a small button straight to this country's "Driver bonus limit" field (admins who may change Pricing).
  const role = useSession().agent?.role;
  const liveSession = useLiveSessionMaybe();
  const canEditLimit = liveSession ? liveSession.can("settings.publish") : Boolean(role && can(role, "settings.publish"));
  const settingLink = driverBonusSettingLink(country, trip.zoneId);
  const limitsKnown = view.limitsKnown !== false;
  const [own, setOwn] = useState<MoneyDraft>(EMPTY_MONEY);
  const draft = controlled ?? own;
  const set = (patch: Partial<MoneyDraft>) => (onDraft ? onDraft({ ...draft, ...patch }) : setOwn({ ...draft, ...patch }));
  const { addMinor, issue } = draftMoney(draft, view, trip.zoneId);
  const open = canAssign(trip.status);
  const already = bonusInScope(view, draft.scope);
  const total = already + addMinor;
  const moveraKeeps = view.commissionMinor - total;
  const same = view.bonusExclusiveMinor === view.bonusRadarMinor;
  return (
    <section className={compact ? "as-section as-bonus compact" : "as-section as-bonus"} aria-label={tr("Add money for driver")} data-testid="driver-bonus-box">
      <h4>{trn("{0} Add money for driver", <BadgeDollarSign size={14} aria-hidden="true" />)}</h4>
      {compact ? null : <p className="as-help">{tr("Type the amount and choose where it applies: the next Exclusive or Radar send carries it, and every send button shows what the driver will see. Movera pays it from its commission; the rider never pays it.")}</p>}
      {view.bonusMinor ? (
        <p className="as-bonus-now" data-testid="driver-bonus-now">
          {same
            ? trn("Added so far: {0}{1}", <b>{money(view.bonusExclusiveMinor)}</b>, view.priority ? <span className="as-priority">{tr("Priority")}</span> : null)
            : trn("Added so far: Exclusive {0} · Radar {1}{2}", <b>{money(view.bonusExclusiveMinor)}</b>, <b>{money(view.bonusRadarMinor)}</b>, view.priority ? <span className="as-priority">{tr("Priority")}</span> : null)}
        </p>
      ) : null}
      <div className="as-bonus-row">
        <label>{trn("Amount ({0}){1}", place.currency, <input aria-label={tr("Money for the driver")} type="number" min="0" step={1 / place.minorUnits} value={draft.amount} disabled={!canAct || !open} onChange={(event) => set({ amount: event.target.value })} placeholder={limitsKnown ? tr("Up to {0}", [money(Math.max(0, view.limits.limitMinor - already))]) : undefined} />)}</label>
        <div className="as-chips" role="group" aria-label={tr("Apply to")} data-testid="driver-bonus-scope">
          <span className="as-chips-label">{tr("Apply to")}</span>
          {BONUS_SCOPES.map((scope) => (
            <button key={scope} data-command="admin.dispatch.view" type="button" className={draft.scope === scope ? "as-chip active" : "as-chip"} aria-pressed={draft.scope === scope} disabled={!canAct || !open} onClick={() => set({ scope })}>{trx(SCOPE_LABEL[scope])}</button>
          ))}
        </div>
        <label className="check-row">{trn("{0} Priority badge", <input type="checkbox" checked={draft.priority} disabled={!canAct || !open} onChange={(event) => set({ priority: event.target.checked })} />)}</label>
        <CommandButton
          command="admin.trip.driverBonus"
          className="dash-btn small ghost"
          targetId={trip.id}
          scope={trip.zoneId}
          confirmTarget={false}
          entityState={trip.status}
          before={money(already)}
          after={money(already + addMinor)}
          value={{ amountMinor: addMinor, priority: draft.priority, bonusScope: draft.scope }}
          disabled={!canAct || !open || addMinor <= 0 || Boolean(issue)}
          title={!open ? tr("Money can be added only while the trip is requested, searching or offered.") : issue?.message ?? tr("Adds it now to the offers already out, and keeps it for the next sends.")}
          summary={<>{trn("Add {0} for the driver on {1} ({2}). Movera pays it; the rider’s price does not change.", <b>{money(addMinor)}</b>, trip.id, trx(SCOPE_LABEL[draft.scope]))}</>}
          onDone={() => { set({ amount: "" }); onDone?.(`${money(addMinor)} added for the driver.`); }}
        >{tr("Add money")}</CommandButton>
      </div>
      {issue ? (
        <p className="pl-warn" role="alert" data-testid="driver-bonus-issue">
          {trSentences(issue.message)}{issue.code === "over_limit" ? <> <Link to={settingLink}>{tr("Open Pricing › Tips & limits")}</Link></> : null}
        </p>
      ) : !limitsKnown ? null : (
        <p className="as-help" data-testid="driver-bonus-limit">
          {trn("Limit {0} per trip, set in {1} (hard max {2}).", money(view.limits.limitMinor), <Link to={settingLink}>{tr("Pricing › Tips & limits")}</Link>, money(view.limits.hardMaxMinor))}
          {canEditLimit ? <> <Link className="dash-btn small ghost" to={settingLink} data-testid="driver-bonus-change-limit">{trn("{0} Change limit", <Pencil size={12} aria-hidden="true" />)}</Link></> : null}
        </p>
      )}
      {addMinor > 0 ? <p className="as-pending" data-testid="driver-bonus-pending">{trn("{0} goes with the next {1} send.", <b>{money(addMinor)}</b>, draft.scope === "both" ? tr("Exclusive or Radar") : trx(SCOPE_LABEL[draft.scope]))}</p> : null}
      {compact ? null : (
        <dl className="as-split" aria-label={tr("Money split with the bonus")} data-testid="driver-bonus-split">
          <div><dt>{tr("Rider pays")}</dt><dd>{money(view.fareMinor)}</dd></div>
          <div><dt>{tr("Driver gets")}</dt><dd>{money(view.driverNetMinor + total)}</dd></div>
          <div><dt>{tr("Movera commission")}</dt><dd>{money(view.commissionMinor)}</dd></div>
          <div className={total ? "minus" : undefined}><dt>{tr("Bonus paid by Movera")}</dt><dd>− {money(total)}</dd></div>
          <div className={moveraKeeps < 0 ? "total minus" : "total"}><dt>{tr("Movera keeps")}</dt><dd>{money(moveraKeeps)}</dd></div>
        </dl>
      )}
      {moveraKeeps < 0 ? <p className="dx-note" data-testid="driver-bonus-beyond">{trn("Movera pays {0} more than its commission on this trip.", money(-moveraKeeps))}</p> : null}
    </section>
  );
}
