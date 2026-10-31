import type { ReactNode } from "react";
import { AlertTriangle, Crown, Gift, MessageCircleWarning, Sparkles, Star, Ticket, Wallet } from "lucide-react";
import { formatMoney, type MarketId } from "../markets/markets";
import type { PromoTicket } from "./care";
import { categoryName } from "./profile";
import type { LiveState, RiderRow } from "./segments";
import { tr, trn, uiLocale, trx } from "../i18n";
import { isLiveData, liveRiderOf } from "../live/realData";
import { owedByCurrency, owedText } from "../live/tripLive";

export const CURRENCY_SYMBOL: Record<MarketId, string> = { SE: "kr", FR: "€", TN: "DT" };

export function money(minor: number, country: MarketId, compact = false): string {
  return formatMoney(minor, country, { compact });
}

const LIVE_LABEL: Record<LiveState, string> = { waiting: "Waiting for a driver", on_trip: "On a trip", online: "Online now", offline: "Offline" };

export function LiveChip({ state }: { state: LiveState }) {
  return <span className={`rd-live l-${state}`}><i aria-hidden="true" />{trx(LIVE_LABEL[state])}</span>;
}

/** A count, or "Not connected yet" for a live value without a source (NaN). */
export function shown(value: number): string {
  return Number.isFinite(value) ? String(value) : tr("Not connected yet");
}

export function ScoreBadge({ score }: { score: number }) {
  if (!Number.isFinite(score)) return null;
  const tone = score >= 80 ? "good" : score >= 55 ? "mid" : "low";
  return <span className={`rd-score s-${tone}`} title={tr("Rider score from rating, cancellations, no-shows and payments")}>{trn("Score {0}", score)}</span>;
}

export function Stars({ value }: { value: number }) {
  return <span className="rd-stars"><Star size={12} aria-hidden="true" />{Number.isFinite(value) ? value.toFixed(2) : tr("Not connected yet")}</span>;
}

/** Small badges on a rider: new, top, waiting for reply, unpaid, promotion, flags. */
export function RiderBadges({ row, compact = false }: { row: RiderRow; compact?: boolean }) {
  const items: ReactNode[] = [];
  if (row.isNew) items.push(<span key="new" className="rd-badge new">{trn("{0}New", <Sparkles size={11} aria-hidden="true" />)}</span>);
  if (row.segments.has("top")) items.push(<span key="top" className="rd-badge top">{trn("{0}Top", <Crown size={11} aria-hidden="true" />)}</span>);
  if (row.waitingMin !== null) items.push(<span key="reply" className={`rd-badge reply t-${row.waitingMin < 60 ? "green" : row.waitingMin < 240 ? "orange" : "red"}`}>{trn("{0}Reply waiting{1}", <MessageCircleWarning size={11} aria-hidden="true" />, compact ? "" : ` · ${waitText(row.waitingMin)}`)}</span>);
  // v0.18.7 (G5 Q3): live, the owed fees per currency ("Owes 100,00 kr · 10,00 €"), never one sum across currencies.
  const owed = isLiveData() ? owedByCurrency(liveRiderOf(row.rider)) : [];
  if (owed.length) items.push(<span key="unpaid" className="rd-badge unpaid" data-testid="rider-owed-badge">{trn("{0}Owes {1}", <Wallet size={11} aria-hidden="true" />, owedText(owed))}</span>);
  else if (row.unpaidMinor > 0) items.push(<span key="unpaid" className="rd-badge unpaid">{trn("{0}Unpaid", <Wallet size={11} aria-hidden="true" />)}</span>);
  if (row.promos.length) items.push(<span key="promo" className="rd-badge promo">{trn("{0}Promo", <Gift size={11} aria-hidden="true" />)}</span>);
  if (row.profile.fraudFlags.length && !compact) items.push(<span key="flag" className="rd-badge flag">{trn("{0}Check", <AlertTriangle size={11} aria-hidden="true" />)}</span>);
  return items.length ? <span className="rd-badges">{items}</span> : null;
}

export function waitText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
  return `${Math.floor(minutes / 1440)} d`;
}

/** The promotion as riders see it in the app: a ticket with the deal, the limits and the dates. */
export function PromoTicketCard({ ticket, used }: { ticket: Pick<PromoTicket, "code" | "title" | "kind" | "value" | "rides" | "maxPerRide" | "minFare" | "validFrom" | "validTo" | "country" | "categories" | "status">; used?: number; locale: string }) {
  const symbol = CURRENCY_SYMBOL[ticket.country];
  const date = new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short" });
  const deal = ticket.kind === "percent" ? `${ticket.value}%` : `${ticket.value} ${symbol}`;
  const left = used === undefined ? null : Math.max(0, ticket.rides - used);
  return (
    <div className={`rd-ticket${ticket.status === "active" ? "" : ` ${ticket.status}`}`} aria-label={tr("Promotion {0}", [ticket.code])}>
      <div className="rd-ticket-deal">
        <Ticket size={16} aria-hidden="true" />
        <strong>{deal}</strong>
        <span>{tr("off")}</span>
      </div>
      <div className="rd-ticket-body">
        <b>{ticket.title || tr("Your promotion")}</b>
        <span>{ticket.kind === "percent" ? tr("{0} off your next {1} ride{2} · max {3} {4} per ride", [deal, ticket.rides, ticket.rides === 1 ? "" : "s", ticket.maxPerRide, symbol]) : tr("{0} off each of your next {1} ride{2}", [deal, ticket.rides, ticket.rides === 1 ? "" : "s"])}</span>
        <small>
          {ticket.validFrom && ticket.validTo ? `${date.format(Date.parse(ticket.validFrom))} – ${date.format(Date.parse(ticket.validTo))}` : tr("Pick dates")}
          {ticket.minFare ? tr(" · min fare {0} {1}", [ticket.minFare, symbol]) : ""}
          {ticket.categories.length ? ` · ${ticket.categories.map(categoryName).join(", ")}` : tr(" · all categories")}
        </small>
        {left !== null ? (
          <span className="rd-ticket-usage" aria-label={tr("{0} of {1} rides used", [used, ticket.rides])}>
            <i style={{ width: `${((used ?? 0) / ticket.rides) * 100}%` }} />
            <em>{trn("{0} of {1} used · {2} left", used, ticket.rides, left)}</em>
          </span>
        ) : null}
      </div>
      <div className="rd-ticket-code"><span>{tr("Code")}</span><b>{ticket.code || "CODE"}</b></div>
    </div>
  );
}
