import { NotConnected } from "../live/NotConnected";
import { useEffect, useState, type ReactNode } from "react";
import { useDashboardAccess } from "./access";
import { Link } from "react-router";
import { Activity, AlertTriangle, Bell, BellOff, Plane, Star, TrendingUp, XCircle, Zap } from "lucide-react";
import { driverCode } from "../fleet/codes";
import type { AirportQueue, BoostZone, CancelRow, RatingSummary, ZoneBalance } from "./insights";
import { tr, trn, trx } from "../i18n";

/** "Live now" tag for cards that ignore the period picker. */
export function LiveTag() {
  return <span className="live-tag">{trn("{0}Live now", <i aria-hidden="true" />)}</span>;
}

/** When the dashboard last heard from the server, ticking every second. */
export function LiveStamp({ updatedAt, offline }: { updatedAt: number; offline: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const ago = seconds === null ? tr("not loaded yet") : seconds < 60 ? tr("{0} s ago", [seconds]) : tr("{0} min ago", [Math.floor(seconds / 60)]);
  return (
    <span className={offline ? "live-stamp off" : "live-stamp"} role="status">
      <i aria-hidden="true" />{offline ? tr("Offline · last update {0}", [ago]) : tr("Live · updated {0}", [ago])}
    </span>
  );
}

export function SoundToggle({ muted, onToggle, permission, onAsk }: { muted: boolean; onToggle: () => void; permission: string; onAsk: () => void }) {
  return (
    <span className="sound-toggle">
      <button data-command="admin.ui.alertSound" type="button" className="dash-btn ghost icon" aria-pressed={!muted} aria-label={muted ? tr("Turn alert sound on") : tr("Turn alert sound off")} title={muted ? tr("Alert sound off") : tr("Alert sound on")} onClick={onToggle}>
        {muted ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
      </button>
      {permission === "default" ? <button data-command="admin.ui.alertSound" type="button" className="link-action" onClick={onAsk}>{tr("Allow notifications")}</button> : null}
    </span>
  );
}

export function SupplyDemandCard({ rows, showOnMap, onToggleMap, surgeLink }: { rows: ZoneBalance[]; showOnMap: boolean; onToggleMap: () => void; surgeLink: (zoneId: string) => string | null }) {
  const label = { ok: "Enough drivers", tight: "Tight", short: "More drivers needed" };
  return (
    <section className="dash-card" aria-labelledby="sd-title">
      <div className="card-head">
        <h3 id="sd-title">{trn("{0} Supply vs demand", <TrendingUp size={16} aria-hidden="true" />)}</h3>
        <LiveTag />
      </div>
      <button data-command="admin.ui.mapLayer" type="button" className={showOnMap ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={showOnMap} onClick={onToggleMap}>
        {showOnMap ? tr("Hide on map") : tr("Show on map")}
      </button>
      <ul className="sd-list" aria-label={tr("Zones by drivers needed")}>
        {rows.slice(0, 8).map((row) => {
          const surge = row.level === "short" ? surgeLink(row.zoneId) : null;
          return (
            <li key={row.zoneId} className={`sd-${row.level}`}>
              <i aria-hidden="true" />
              <span className="sd-name">{row.name}</span>
              <span className="sd-nums">{trn("{0} waiting · {1} free", row.waiting, row.free)}</span>
              <span className="sd-level">{label[row.level]}</span>
              {surge ? <Link className="link-action" to={surge}>{trn("{0}Start surge", <Zap size={12} aria-hidden="true" />)}</Link> : <span />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AirportCard({ rows }: { rows: AirportQueue[] | null }) {
  return (
    <section className="dash-card" aria-labelledby="airport-title">
      <div className="card-head">
        <h3 id="airport-title">{trn("{0} Airport queue", <Plane size={16} aria-hidden="true" />)}</h3>
        <LiveTag />
      </div>
      {rows === null ? <NotConnected block /> : rows.length === 0 ? <p className="state-line">{tr("No airport in this selection.")}</p> : (
        <ul className="mini-list">
          {rows.map((row) => (
            <li key={row.zoneId}>
              <strong>{row.name}</strong>
              <span>{trn("{0} drivers waiting", <b>{row.waiting}</b>)}</span>
              <span>{trn("~{0} min wait · {1} pickups last hour", row.waitMin, row.pickupsLastHour)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BoostCard({ rows, surgeLink }: { rows: BoostZone[]; surgeLink: (zoneId: string) => string | null }) {
  return (
    <section className="dash-card" aria-labelledby="boost-title">
      <div className="card-head">
        <h3 id="boost-title">{trn("{0} Surge and boost zones", <Zap size={16} aria-hidden="true" />)}</h3>
        <LiveTag />
      </div>
      {rows.length === 0 ? <p className="state-line">{tr("No boost running and no zone short of drivers.")}</p> : (
        <ul className="mini-list">
          {rows.map((row) => {
            const link = surgeLink(row.zoneId);
            return (
              <li key={`${row.kind}-${row.zoneId}-${row.detail}`}>
                <strong>{row.name}</strong>
                <span className={row.kind === "Boost" ? "boost-chip" : row.kind === "Surge" ? "boost-chip surge" : "boost-chip warn"}>{row.kind}</span>
                <span>{trx(row.detail)}</span>
                {row.kind !== "Boost" && link ? <Link className="link-action" to={link}>{row.kind === "Surge" ? tr("Open") : tr("Start surge")}</Link> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export type ActivityItem = { id: string; at: number; who: string; text: string; link?: string; system: boolean };

export function ActivityFeed({ items, format }: { items: ActivityItem[]; format: (at: number) => string }) {
  return (
    <section className="dash-card" aria-labelledby="activity-title">
      <div className="card-head">
        <h3 id="activity-title">{trn("{0} Recent activity", <Activity size={16} aria-hidden="true" />)}</h3>
        <LiveTag />
      </div>
      {items.length === 0 ? <p className="state-line">{tr("Nothing has happened yet.")}</p> : (
        <ul className="activity-list" aria-label={tr("Recent activity")}>
          {items.slice(0, 12).map((item) => (
            <li key={item.id} className={item.system ? "system" : undefined}>
              <i aria-hidden="true" />
              <div>
                <span>{item.link ? <Link to={item.link}>{item.text}</Link> : item.text}</span>
                <small>{item.who} · {format(item.at)}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type DriverRank = { id: string; name: string; zoneId: string; trips: number; rating: number; cancellationPct: number };

export function InsightsCard({ tab, onTab, top, cancel, rating, periodLabel, topLabel, money, rankingConnected = true }: {
  tab: "drivers" | "cancellations" | "ratings";
  onTab: (tab: "drivers" | "cancellations" | "ratings") => void;
  top: { rated: DriverRank[]; busiest: DriverRank[]; cancelling: DriverRank[] } | null;
  /** null: not sent by the server yet (live). */
  cancel: CancelRow[] | null;
  rating: RatingSummary | null;
  periodLabel: string;
  topLabel: string;
  money: ReactNode;
  /** Live: the driver ranking has no source yet. */
  rankingConnected?: boolean;
}) {
  const totalCancelled = (cancel ?? []).reduce((sum, row) => sum + row.count, 0) || 1;
  return (
    <section className="dash-card insights-card" aria-labelledby="insights-title">
      <div className="card-head">
        <h3 id="insights-title">{tr("Insights")}</h3>
        <span className="fine-print">{tab === "drivers" ? topLabel : periodLabel}</span>
      </div>
      <div className="tabs-row" role="tablist" aria-label={tr("Insights")}>
        {(["drivers", "cancellations", "ratings"] as const).map((item) => (
          <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : undefined} onClick={() => onTab(item)}>
            {item === "drivers" ? tr("Top drivers") : item === "cancellations" ? tr("Cancellations") : tr("Ratings & complaints")}
          </button>
        ))}
      </div>
      {tab === "drivers" && !rankingConnected ? <NotConnected block /> : tab === "cancellations" && cancel === null ? <NotConnected block /> : tab === "ratings" && rating === null ? <NotConnected block /> : tab === "drivers" ? (
        top ? (
          <div className="rank-grid">
            <Rank title={tr("Best rating")} icon={<Star size={14} aria-hidden="true" />} rows={top.rated} value={(row) => row.rating.toFixed(2)} />
            <Rank title={tr("Most trips")} icon={<TrendingUp size={14} aria-hidden="true" />} rows={top.busiest} value={(row) => `${row.trips} trips`} />
            <Rank title={tr("Highest cancellation")} icon={<XCircle size={14} aria-hidden="true" />} rows={top.cancelling} value={(row) => `${row.cancellationPct}%`} warn />
          </div>
        ) : <p className="state-line">{tr("Working out the ranking…")}</p>
      ) : tab === "cancellations" ? (
        <ul className="cancel-list">
          {(cancel ?? []).map((row) => (
            <li key={row.who}>
              <div className="share-head"><span>{trn("By {0}", row.who.toLowerCase())}</span><strong>{row.count}</strong><small>{Math.round((row.count / totalCancelled) * 100)}%</small></div>
              <div className="share-track"><i style={{ width: `${(row.count / totalCancelled) * 100}%` }} /></div>
              <p>{row.reasons.map((reason) => `${reason.label} ${reason.count}`).join(" · ")}</p>
            </li>
          ))}
        </ul>
      ) : rating ? (
        <div className="rating-grid">
          <div><span>{tr("Average rating")}</span><strong>{rating.average ? rating.average.toFixed(2) : "—"}</strong><small>{trn("{0} rated trips", rating.rated)}</small></div>
          <div className={rating.low ? "warn" : undefined}><span>{tr("Low ratings (1–2 stars)")}</span><strong>{rating.low}</strong><small>{trn("{0} follow up", <AlertTriangle size={12} aria-hidden="true" />)}</small></div>
          <div><span>{tr("Complaints")}</span><strong>{rating.complaints}</strong><small>{rating.topComplaints.filter((item) => item.count).map((item) => `${item.label} ${item.count}`).join(" · ") || tr("None")}</small></div>
        </div>
      ) : null}
      {money}
    </section>
  );
}

function Rank({ title, icon, rows, value, warn = false }: { title: string; icon: ReactNode; rows: DriverRank[]; value: (row: DriverRank) => string; warn?: boolean }) {
  const access = useDashboardAccess();
  return (
    <div className="rank">
      <h4>{icon}{trx(title)}</h4>
      {rows.length === 0 ? <p className="state-line">{tr("No data yet.")}</p> : (
        <ol>
          {rows.map((row) => (
            <li key={row.id}>
              {access.drivers ? <Link to={`/drivers/${row.id}`}>{row.name}</Link> : <span>{row.name}</span>}
              <small>{driverCode(row)}</small>
              <strong className={warn ? "warn" : undefined}>{value(row)}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
