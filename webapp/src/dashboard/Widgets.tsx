import { useEffect, useState, type ReactNode } from "react";
import { useDashboardAccess } from "./access";
import { Link } from "react-router";
import { Activity, AlertTriangle, Bell, BellOff, Plane, Star, TrendingUp, XCircle, Zap } from "lucide-react";
import { driverCode } from "../fleet/codes";
import type { AirportQueue, BoostZone, CancelRow, RatingSummary, ZoneBalance } from "./insights";

/** "Live now" tag for cards that ignore the period picker. */
export function LiveTag() {
  return <span className="live-tag"><i aria-hidden="true" />Live now</span>;
}

/** When the dashboard last heard from the server, ticking every second. */
export function LiveStamp({ updatedAt, offline }: { updatedAt: number; offline: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const ago = seconds === null ? "not loaded yet" : seconds < 60 ? `${seconds} s ago` : `${Math.floor(seconds / 60)} min ago`;
  return (
    <span className={offline ? "live-stamp off" : "live-stamp"} role="status">
      <i aria-hidden="true" />{offline ? `Offline · last update ${ago}` : `Live · updated ${ago}`}
    </span>
  );
}

export function SoundToggle({ muted, onToggle, permission, onAsk }: { muted: boolean; onToggle: () => void; permission: string; onAsk: () => void }) {
  return (
    <span className="sound-toggle">
      <button data-command="admin.ui.alertSound" type="button" className="dash-btn ghost icon" aria-pressed={!muted} aria-label={muted ? "Turn alert sound on" : "Turn alert sound off"} title={muted ? "Alert sound off" : "Alert sound on"} onClick={onToggle}>
        {muted ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
      </button>
      {permission === "default" ? <button data-command="admin.ui.alertSound" type="button" className="link-action" onClick={onAsk}>Allow notifications</button> : null}
    </span>
  );
}

export function SupplyDemandCard({ rows, showOnMap, onToggleMap, surgeLink }: { rows: ZoneBalance[]; showOnMap: boolean; onToggleMap: () => void; surgeLink: (zoneId: string) => string | null }) {
  const label = { ok: "Enough drivers", tight: "Tight", short: "More drivers needed" };
  return (
    <section className="dash-card" aria-labelledby="sd-title">
      <div className="card-head">
        <h3 id="sd-title"><TrendingUp size={16} aria-hidden="true" /> Supply vs demand</h3>
        <LiveTag />
      </div>
      <button data-command="admin.ui.mapLayer" type="button" className={showOnMap ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={showOnMap} onClick={onToggleMap}>
        {showOnMap ? "Hide on map" : "Show on map"}
      </button>
      <ul className="sd-list" aria-label="Zones by drivers needed">
        {rows.slice(0, 8).map((row) => {
          const surge = row.level === "short" ? surgeLink(row.zoneId) : null;
          return (
            <li key={row.zoneId} className={`sd-${row.level}`}>
              <i aria-hidden="true" />
              <span className="sd-name">{row.name}</span>
              <span className="sd-nums">{row.waiting} waiting · {row.free} free</span>
              <span className="sd-level">{label[row.level]}</span>
              {surge ? <Link className="link-action" to={surge}><Zap size={12} aria-hidden="true" />Start surge</Link> : <span />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AirportCard({ rows }: { rows: AirportQueue[] }) {
  return (
    <section className="dash-card" aria-labelledby="airport-title">
      <div className="card-head">
        <h3 id="airport-title"><Plane size={16} aria-hidden="true" /> Airport queue</h3>
        <LiveTag />
      </div>
      {rows.length === 0 ? <p className="state-line">No airport in this selection.</p> : (
        <ul className="mini-list">
          {rows.map((row) => (
            <li key={row.zoneId}>
              <strong>{row.name}</strong>
              <span><b>{row.waiting}</b> drivers waiting</span>
              <span>~{row.waitMin} min wait · {row.pickupsLastHour} pickups last hour</span>
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
        <h3 id="boost-title"><Zap size={16} aria-hidden="true" /> Surge and boost zones</h3>
        <LiveTag />
      </div>
      {rows.length === 0 ? <p className="state-line">No boost running and no zone short of drivers.</p> : (
        <ul className="mini-list">
          {rows.map((row) => {
            const link = surgeLink(row.zoneId);
            return (
              <li key={`${row.kind}-${row.zoneId}-${row.detail}`}>
                <strong>{row.name}</strong>
                <span className={row.kind === "Boost" ? "boost-chip" : row.kind === "Surge" ? "boost-chip surge" : "boost-chip warn"}>{row.kind}</span>
                <span>{row.detail}</span>
                {row.kind !== "Boost" && link ? <Link className="link-action" to={link}>{row.kind === "Surge" ? "Open" : "Start surge"}</Link> : null}
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
        <h3 id="activity-title"><Activity size={16} aria-hidden="true" /> Recent activity</h3>
        <LiveTag />
      </div>
      {items.length === 0 ? <p className="state-line">Nothing has happened yet.</p> : (
        <ul className="activity-list" aria-label="Recent activity">
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

export function InsightsCard({ tab, onTab, top, cancel, rating, periodLabel, topLabel, money }: {
  tab: "drivers" | "cancellations" | "ratings";
  onTab: (tab: "drivers" | "cancellations" | "ratings") => void;
  top: { rated: DriverRank[]; busiest: DriverRank[]; cancelling: DriverRank[] } | null;
  cancel: CancelRow[];
  rating: RatingSummary;
  periodLabel: string;
  topLabel: string;
  money: ReactNode;
}) {
  const totalCancelled = cancel.reduce((sum, row) => sum + row.count, 0) || 1;
  return (
    <section className="dash-card insights-card" aria-labelledby="insights-title">
      <div className="card-head">
        <h3 id="insights-title">Insights</h3>
        <span className="fine-print">{tab === "drivers" ? topLabel : periodLabel}</span>
      </div>
      <div className="tabs-row" role="tablist" aria-label="Insights">
        {(["drivers", "cancellations", "ratings"] as const).map((item) => (
          <button data-command="admin.ui.dashboardTab" key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : undefined} onClick={() => onTab(item)}>
            {item === "drivers" ? "Top drivers" : item === "cancellations" ? "Cancellations" : "Ratings & complaints"}
          </button>
        ))}
      </div>
      {tab === "drivers" ? (
        top ? (
          <div className="rank-grid">
            <Rank title="Best rating" icon={<Star size={14} aria-hidden="true" />} rows={top.rated} value={(row) => row.rating.toFixed(2)} />
            <Rank title="Most trips" icon={<TrendingUp size={14} aria-hidden="true" />} rows={top.busiest} value={(row) => `${row.trips} trips`} />
            <Rank title="Highest cancellation" icon={<XCircle size={14} aria-hidden="true" />} rows={top.cancelling} value={(row) => `${row.cancellationPct}%`} warn />
          </div>
        ) : <p className="state-line">Working out the ranking…</p>
      ) : tab === "cancellations" ? (
        <ul className="cancel-list">
          {cancel.map((row) => (
            <li key={row.who}>
              <div className="share-head"><span>By {row.who.toLowerCase()}</span><strong>{row.count}</strong><small>{Math.round((row.count / totalCancelled) * 100)}%</small></div>
              <div className="share-track"><i style={{ width: `${(row.count / totalCancelled) * 100}%` }} /></div>
              <p>{row.reasons.map((reason) => `${reason.label} ${reason.count}`).join(" · ")}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rating-grid">
          <div><span>Average rating</span><strong>{rating.average ? rating.average.toFixed(2) : "—"}</strong><small>{rating.rated} rated trips</small></div>
          <div className={rating.low ? "warn" : undefined}><span>Low ratings (1–2 stars)</span><strong>{rating.low}</strong><small><AlertTriangle size={12} aria-hidden="true" /> follow up</small></div>
          <div><span>Complaints</span><strong>{rating.complaints}</strong><small>{rating.topComplaints.filter((item) => item.count).map((item) => `${item.label} ${item.count}`).join(" · ") || "None"}</small></div>
        </div>
      )}
      {money}
    </section>
  );
}

function Rank({ title, icon, rows, value, warn = false }: { title: string; icon: ReactNode; rows: DriverRank[]; value: (row: DriverRank) => string; warn?: boolean }) {
  const access = useDashboardAccess();
  return (
    <div className="rank">
      <h4>{icon}{title}</h4>
      {rows.length === 0 ? <p className="state-line">No data yet.</p> : (
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
