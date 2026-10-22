import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, MapPin, TrendingUp, Zap } from "lucide-react";
import type { RadarZone } from "../dispatch/rules";
import { tr, trn, trx } from "../i18n";
import type { ZoneBalance } from "./insights";
import type { LiveDriver } from "./live";
import type { RideRequest } from "./riders";
import { driverChip, driversIn, radarBalance, type DriverChip, type MapLocate } from "./supplyDrill";
import { LiveTag } from "./Widgets";

type Props = {
  rows: ZoneBalance[];
  showOnMap: boolean;
  onToggleMap: () => void;
  surgeLink: (zoneId: string) => string | null;
  drivers: readonly LiveDriver[];
  requests: readonly RideRequest[];
  radarZones: readonly RadarZone[];
  /** map pin: fly the map to a zone, a radar zone or a driver. */
  onLocate: (target: MapLocate) => void;
  /** Where "make a radar zone" goes; null hides the link (role cannot change dispatch rules). */
  radarZoneLink: ((zoneId: string) => string) | null;
};

type LocateTarget = MapLocate extends infer T ? (T extends MapLocate ? Omit<T, "nonce"> : never) : never;

const LEVEL = { ok: "Enough drivers", tight: "Tight", short: "More drivers needed" } as const;
const CHIP: Record<DriverChip, string> = { free: "Free", pickup: "To pickup", trip: "On trip", off: "Offline or no GPS" };

/**
 * Supply vs demand, the same card on the Dashboard and in Dispatch › Live. A zone opens its radar zones,
 * a radar zone opens the drivers inside it; map pin on any row shows it on the map.
 */
export function SupplyDemandDrill({ rows, showOnMap, onToggleMap, surgeLink, drivers, requests, radarZones, onLocate, radarZoneLink }: Props) {
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [radarId, setRadarId] = useState<string | null>(null);
  const zone = zoneId ? rows.find((row) => row.zoneId === zoneId) ?? null : null;
  const radars = zone ? radarBalance(zone.zoneId, radarZones, drivers, requests) : [];
  const radar = radarId ? radars.find((item) => item.id === radarId) ?? null : null;
  const pin = (label: string, target: LocateTarget) => (
    <button type="button" data-command="admin.ui.mapLayer" className="icon-ghost sd-pin" aria-label={tr("Show {0} on the map", [label])} title={tr("Show on the map")} onClick={(event) => { event.stopPropagation(); onLocate({ ...target, nonce: Date.now() } as MapLocate); }}>
      <MapPin size={14} aria-hidden="true" />
    </button>
  );
  const driverList = (list: LiveDriver[]) => (
    list.length === 0 ? <p className="state-line">{tr("No driver here right now.")}</p> : (
      <ul className="sd-drivers" aria-label={tr("Drivers here")}>
        {list.map((driver) => {
          const chip = driverChip(driver.state);
          return (
            <li key={driver.id}>
              <button type="button" data-command="admin.ui.mapLayer" className="sd-driver" onClick={() => onLocate({ kind: "driver", id: driver.id, nonce: Date.now() })}>{driver.name}</button>
              <span className={`sd-chip ${chip}`}>{trx(CHIP[chip])}</span>
              {pin(driver.name, { kind: "driver", id: driver.id })}
            </li>
          );
        })}
      </ul>
    )
  );

  return (
    <section className="dash-card" aria-labelledby="sd-title" data-testid="supply-demand">
      <div className="card-head">
        <h3 id="sd-title">{trn("{0} Supply vs demand", <TrendingUp size={16} aria-hidden="true" />)}</h3>
        <LiveTag />
      </div>
      <button data-command="admin.ui.mapLayer" type="button" className={showOnMap ? "dash-btn small" : "dash-btn small ghost"} aria-pressed={showOnMap} onClick={onToggleMap}>
        {showOnMap ? tr("Hide on map") : tr("Show on map")}
      </button>

      {zone ? (
        <nav className="sd-crumbs" aria-label={tr("Supply vs demand path")}>
          <button type="button" data-command="admin.ui.mapLayer" className="sd-back" onClick={() => (radar ? setRadarId(null) : setZoneId(null))}><ChevronLeft size={14} aria-hidden="true" />{tr("Back")}</button>
          <button type="button" data-command="admin.ui.mapLayer" className="sd-crumb" onClick={() => { setZoneId(null); setRadarId(null); }}>{tr("All zones")}</button>
          <span aria-hidden="true">›</span>
          {radar ? <button type="button" data-command="admin.ui.mapLayer" className="sd-crumb" onClick={() => setRadarId(null)}>{zone.name}</button> : <b>{zone.name}</b>}
          {radar ? <><span aria-hidden="true">›</span><b>{radar.name}</b></> : null}
        </nav>
      ) : null}

      {!zone ? (
        <ul className="sd-list" aria-label={tr("Zones by drivers needed")}>
          {rows.slice(0, 8).map((row) => {
            const surge = row.level === "short" ? surgeLink(row.zoneId) : null;
            return (
              <li key={row.zoneId} className={`sd-${row.level} sd-row`}>
                <i aria-hidden="true" />
                <button type="button" data-command="admin.ui.mapLayer" className="sd-name sd-open" onClick={() => setZoneId(row.zoneId)} aria-label={tr("Open {0}", [row.name])}>{row.name}<ChevronRight size={13} aria-hidden="true" /></button>
                <span className="sd-nums">{trn("{0} waiting · {1} free", row.waiting, row.free)}</span>
                <span className="sd-level">{trx(LEVEL[row.level])}</span>
                <span className="sd-tools">
                  {pin(row.name, { kind: "zone", zoneId: row.zoneId, center: row.center })}
                  {surge ? <Link className="link-action" to={surge}>{trn("{0}Start surge", <Zap size={12} aria-hidden="true" />)}</Link> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : radar ? (
        <>
          <p className="sd-summary">{trn("{0} waiting · {1} free · {2} drivers inside", radar.waiting, radar.free, radar.total)}</p>
          {driverList(driversIn({ ring: radar.ring }, drivers))}
        </>
      ) : radars.length ? (
        <ul className="sd-list" aria-label={tr("Radar zones in {0}", [zone.name])}>
          {radars.map((item) => {
            const level = item.waiting === 0 ? "ok" : item.free >= item.waiting ? "tight" : "short";
            return (
              <li key={item.id} className={`sd-${level} sd-row`}>
                <i aria-hidden="true" />
                <button type="button" data-command="admin.ui.mapLayer" className="sd-name sd-open" onClick={() => setRadarId(item.id)} aria-label={tr("Open {0}", [item.name])}>{item.name}<ChevronRight size={13} aria-hidden="true" /></button>
                <span className="sd-nums">{trn("{0} waiting · {1} free", item.waiting, item.free)}</span>
                <span className="sd-level">{trx(LEVEL[level])}</span>
                <span className="sd-tools">{pin(item.name, { kind: "radar", ring: item.ring })}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="sd-summary">
            {tr("No radar zone yet in this zone.")}{" "}
            {radarZoneLink ? <Link to={radarZoneLink(zone.zoneId)}>{tr("Make one ›")}</Link> : null}
          </p>
          {driverList(driversIn({ zoneId: zone.zoneId }, drivers))}
        </>
      )}
    </section>
  );
}
