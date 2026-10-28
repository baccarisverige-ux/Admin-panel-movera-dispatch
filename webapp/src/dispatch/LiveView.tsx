import { useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Car, Clock, Pause, Play, Radar, Target, Undo2, UserRound, Users } from "lucide-react";
import { DriversMap } from "../dashboard/DriversMap";
import type { RideCheck } from "../safety/rideCheck";
import type { LiveDriver, LiveState } from "../dashboard/live";
import type { Candidate, RideRequest } from "../dashboard/riders";
import type { Market, MarketZone } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { RiderQuickActions, RiderRowActions } from "./HandlePanel";
import { OnTheWayGroup, useOnTheWay } from "./RideProgress";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import { supplyDemand } from "../dashboard/insights";
import { LiveMapLayerChips, LiveMapQuickPopup, useLiveMapExtras, type QuickTarget } from "../pricing/LiveMapExtras";
import { DriverSurgeLegend, SurgeLegend } from "../pricing/SurgeControls";
import { MapPanel } from "./maps";
import { useLiveDispatchControls } from "../live/useLiveDispatchControl";
import { RiderAssignName, useAssignPanel } from "./AssignPanel";
import { DISPATCH_KEY, modeLabel, modeNow, requestControl, type DispatchBook, type ZoneDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";
import { SupplyDemandDrill } from "../dashboard/SupplyDemandDrill";
import type { MapLocate } from "../dashboard/supplyDrill";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { offersLink } from "./MovedCard";

type Props = {
  book: DispatchBook;
  market: Market;
  zones: MarketZone[];
  drivers: LiveDriver[];
  requests: RideRequest[];
  candidatesOf: (request: RideRequest) => Candidate[];
  rulesOf: (zoneId: string) => ZoneDispatch;
  busyOf: (zoneId: string) => number;
  hhmm: string;
  canControl: boolean;
  agentId: string;
  withScope: (path: string) => string;
  onNotice: (text: string) => void;
  /** When set, shown instead of this tab's own alert list (the shared one from Alerts). */
  sharedAlerts?: ReactNode;
  /** Open ride checks to pin on the cars, for admins who may see incidents. */
  rideChecks?: { checks: RideCheck[]; demoShift: number; now: number } | null;
};

type Alert = { id: string; zoneId: string; tone: "red" | "orange"; text: string; tripId?: string };

const NO_HIDDEN = new Set<LiveState>();

export function LiveView({ book, market, zones, drivers, requests, candidatesOf, rulesOf, busyOf, hhmm, canControl, agentId, withScope, onNotice, sharedAlerts, rideChecks = null }: Props) {
  const assignPanel = useAssignPanel();
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [locate, setLocate] = useState<MapLocate | null>(null);
  const [showBalance, setShowBalance] = useState(false);
  const role = useSession().agent?.role;
  // Contract §3.6: the zone switch (pause, force a mode) needs dispatch.edit.
  const canSwitch = Boolean(role && can(role, "dispatch.edit"));
  const ids = new Set(zones.map((zone) => zone.id));
  const handled = new Map(book.liveActions.map((action) => [action.tripId, action]));
  const now = new Date().toISOString();
  const waiting = requests.filter((request) => ids.has(request.zoneId));
  // Surge layer, driver bonus areas and their quick pop-ups: the same as on the Dashboard map.
  const [quick, setQuick] = useState<QuickTarget>(null);
  // Live: the zones' switches are the server's (GET/PUT /admin/zones/{zoneId}/dispatch-control).
  const liveControls = useLiveDispatchControls(zones.map((zone) => zone.id));
  const extras = useLiveMapExtras({ prefKey: "dispatch", country: market.id, market, zoneIds: zones.map((zone) => zone.id), balance: supplyDemand(market.id, zones.map((zone) => zone.id), waiting, drivers), now: Date.now() });
  // Rides a driver just accepted: listed apart and still on the map, so "See on map" shows who is on the way.
  const allOnTheWay = useOnTheWay();
  const onTheWay = allOnTheWay.filter((item) => ids.has(item.zoneId) && !waiting.some((request) => request.tripId === item.tripId));
  const onMap = onTheWay.length ? [...waiting, ...onTheWay] : waiting;
  const alerts: Alert[] = [];
  for (const zone of zones) {
    const rules = rulesOf(zone.id);
    const zoneWaiting = waiting.filter((request) => request.zoneId === zone.id && !handled.has(request.tripId));
    const free = drivers.filter((driver) => driver.zoneId === zone.id && driver.state === "free").length;
    for (const alert of rules.alerts.filter((item) => item.on && item.panel)) {
      if (alert.id === "long_wait") for (const request of zoneWaiting.filter((item) => item.waitingMin >= alert.limit)) alerts.push({ id: `${alert.id}:${request.tripId}`, zoneId: zone.id, tone: "red", text: `${request.rider} has waited ${request.waitingMin} min in ${zone.name}`, tripId: request.tripId });
      if (alert.id === "few_drivers" && free <= alert.limit) alerts.push({ id: `${alert.id}:${zone.id}`, zoneId: zone.id, tone: "orange", text: `Only ${free} free driver${free === 1 ? "" : "s"} in ${zone.name}` });
      if (alert.id === "no_driver" && zoneWaiting.length >= alert.limit) alerts.push({ id: `${alert.id}:${zone.id}`, zoneId: zone.id, tone: "red", text: `${zoneWaiting.length} requests without a driver in ${zone.name}` });
    }
  }

  const balance = supplyDemand(market.id, zones.map((zone) => zone.id), waiting, drivers);
  const surgeLink = (zoneId: string) => (role && can(role, "settings.read") ? withScope(`/pricing?zone=${zoneId}&tab=surge`) : null);

  return (
    <div className="dx-live">
      {sharedAlerts ?? <section className="dx-alerts" aria-label={tr("Alerts")}>
        <h3>{trn("{0} Alerts {1}", <Bell size={15} aria-hidden="true" />, <span className="dx-count">{alerts.length}</span>)}</h3>
        {alerts.length === 0 ? <p className="dx-calm">{tr("No alerts right now. Limits are set per zone in Rules → Alerts.")}</p> : (
          <ul>
            {alerts.slice(0, 8).map((alert) => (
              <li key={alert.id} className={alert.tone}>
                <AlertTriangle size={14} aria-hidden="true" /> <span>{alert.text}</span>
                {alert.tripId ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => { const request = waiting.find((item) => item.tripId === alert.tripId); setFocus({ id: alert.tripId!, nonce: Date.now() }); document.getElementById(`dx-req-${alert.tripId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); assignPanel.open(alert.tripId!, { candidates: request ? candidatesOf(request) : [] }); }}>{tr("Handle")}</button> : null}
              </li>
            ))}
          </ul>
        )}
      </section>}

      <section aria-label={tr("Zone control")}>
        <h3 className="dx-h3">{trn("{0} Zones right now", <Radar size={15} aria-hidden="true" />)}</h3>
        <ul className="dx-control-grid">
          {zones.map((zone) => {
            const serverControl = liveControls?.byZone.get(zone.id);
            const control = liveControls ? (serverControl ? { paused: serverControl.paused, mode: serverControl.mode, by: serverControl.by ?? "", at: serverControl.at ?? "" } : undefined) : book.control[zone.id];
            const rules = rulesOf(zone.id);
            const mode = modeNow(rules, control, busyOf(zone.id), hhmm);
            const free = drivers.filter((driver) => driver.zoneId === zone.id && driver.state === "free").length;
            const count = waiting.filter((request) => request.zoneId === zone.id && !handled.has(request.tripId)).length;
            const pending = liveControls ? undefined : book.approvals.find((item) => item.kind === "control" && item.control?.zoneId === zone.id);
            const button = (label: string, value: { paused: boolean; mode: "radar" | "exclusive" | null }, icon: ReactNode, className = "dash-btn small ghost") => {
              const before = control?.paused ? "paused" : control?.mode ?? "rules";
              const after = value.paused ? "paused" : value.mode ?? "rules";
              if (liveControls) {
                // Live: the server's switch, one admin is enough (contract v0.7.2).
                return (
                  <CommandButton command="admin.dispatch.control" className={className} targetId={zone.id} confirmTarget={false} scope={zone.id} before={before} after={after} disabled={!canSwitch} aria-label={`${label} ${zone.name}`} onDone={(result) => { liveControls.refresh(); onNotice(result?.status === "pending_approval" ? tr("{0} {1}: waiting for a second admin to approve.", [label, zone.name]) : tr("{0}: {1} done.", [zone.name, label.toLowerCase()])); /* the 202 line is only a fallback for an older server */ }}>
                    {icon} {trx(label)}
                  </CommandButton>
                );
              }
              const result = requestControl(book, zone.id, value, agentId, now);
              return (
                <CommandButton command="admin.dispatch.control" className={className} targetId={zone.id} confirmTarget={false} scope={zone.id} before={before} after={after} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={result.book} disabled={!canSwitch || Boolean(pending)} aria-label={`${label} ${zone.name}`} onDone={() => onNotice(result.waiting ? tr("{0} {1}: waiting for a second admin to approve.", [label, zone.name]) : tr("{0}: {1} done.", [zone.name, label.toLowerCase()]))}>
                  {icon} {trx(label)}
                </CommandButton>
              );
            };
            return (
              <li key={zone.id} className={control?.paused ? "dx-control paused" : "dx-control"}>
                <div className="dx-control-head">
                  <b>{zone.name}</b>
                  <span className={`dx-mode-tag ${mode.mode ?? "paused"}`}>{mode.mode ? modeLabel(mode.mode) : tr("Paused")}</span>
                </div>
                <small>{trx(mode.why)}</small>
                <span className="dx-control-facts"><span>{trn("{0} {1} free", <Car size={12} aria-hidden="true" />, free)}</span><span>{trn("{0} {1} waiting", <UserRound size={12} aria-hidden="true" />, count)}</span><span>{trn("{0} {1} per driver", <Clock size={12} aria-hidden="true" />, busyOf(zone.id).toFixed(1))}</span></span>
                {pending ? <span className="dx-dot waiting">{trn("Waiting for a second admin: {0}", pending.lines[0])}</span> : null}
                <span className="dx-control-actions">
                  {control?.paused ? button("Resume", { paused: false, mode: null }, <Play size={12} aria-hidden="true" />, "dash-btn small") : button("Pause", { paused: true, mode: null }, <Pause size={12} aria-hidden="true" />)}
                  {!control?.paused && control?.mode !== "radar" && rules.radar.on ? button("Radar now", { paused: false, mode: "radar" }, <Radar size={12} aria-hidden="true" />) : null}
                  {!control?.paused && control?.mode !== "exclusive" && rules.exclusive.on ? button("Exclusive now", { paused: false, mode: "exclusive" }, <Target size={12} aria-hidden="true" />) : null}
                  {!control?.paused && control?.mode ? button("Back to rules", { paused: false, mode: null }, <Undo2 size={12} aria-hidden="true" />) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <RideCheckSettingsCard where="dispatch" />

      <MapPanel title={tr("Live map · {0}", [trx(market.name)])} note={<span className="dx-legend">{trn("{0} Free {1} To pickup {2} On trip {3} Rider waiting {4} Driver offered", <i className="car free" />, <i className="car pickup" />, <i className="car trip" />, <i className="rider waiting" />, <i className="rider offered" />)}</span>}>
        <div className="dx-map-layers" role="toolbar" aria-label={tr("Map layers")}>
          <LiveMapLayerChips bonusCount={extras.bonusAreas.length} showBonus={extras.showBonus} onBonus={extras.setShowBonus} surgePref={extras.surgePref} surgeLive={extras.surgeLive} />
        </div>
        <DriversMap drivers={drivers} requests={onMap} showRequests focusRequest={focus} locate={locate} balance={balance} showBalance={showBalance} market={market} zones={zones.map((zone) => zone.id)} hidden={NO_HIDDEN} withScope={withScope} rideChecks={rideChecks} renderAssign={canControl ? (request) => <RiderQuickActions request={request} candidates={candidatesOf(request)} onNotice={onNotice} /> : undefined}
          surge={extras.surge} surgeShown={extras.surgePref.shown} surgeStyle={extras.surgePref.style} surgeDriver={extras.surgeLive} bonusAreas={extras.bonusAreas} bonusShown={extras.showBonus}
          onSurgeZone={(zoneId) => setQuick({ kind: "surge", zoneId })} onBonusArea={(id) => setQuick({ kind: "bonus", id })}
          overlay={<LiveMapQuickPopup target={quick} surge={extras.surge} country={market.id} market={market} withScope={withScope} onClose={() => setQuick(null)} onNotice={onNotice} />} />
        {extras.surgePref.shown ? (extras.surgeLive ? <DriverSurgeLegend failed={extras.surgeFailed} /> : <SurgeLegend />) : null}
      </MapPanel>

      <SupplyDemandDrill rows={balance} showOnMap={showBalance} onToggleMap={() => setShowBalance((value) => !value)} surgeLink={surgeLink} drivers={drivers} requests={waiting} radarZones={book.radarZones} onLocate={setLocate} radarZoneLink={(zoneId) => withScope(offersLink("radar", zoneId))} />

      <section className="dash-card" aria-labelledby="dx-waiting-title">
        <div className="card-head"><h3 id="dx-waiting-title">{trn("{0} Riders waiting for a driver {1}", <Users size={16} aria-hidden="true" />, <span className="dx-count">{waiting.filter((item) => !handled.has(item.tripId)).length}</span>)}</h3></div>
        {waiting.length === 0 ? <p className="dx-calm">{tr("Nobody is waiting right now.")}</p> : (
          <ul className="dx-waiting" aria-label={tr("Riders waiting")}>
            {waiting.map((request) => (
              <li key={request.tripId} id={`dx-req-${request.tripId}`} className={request.waitingMin >= 5 ? "long" : undefined}>
                <div className="dx-waiting-head">
                  <span className="dx-avatar"><UserRound size={16} aria-hidden="true" /></span>
                  <span><b>{canControl ? <RiderAssignName tripId={request.tripId} rider={request.rider} candidates={candidatesOf(request)} /> : request.rider}</b><small>{request.zoneName} · {request.categoryLabel} · {request.tripId}</small></span>
                  <span className={request.waitingMin >= 5 ? "dx-wait-chip long" : "dx-wait-chip"}>{trn("{0} {1} min", <Clock size={11} aria-hidden="true" />, request.waitingMin)}</span>
                  <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setFocus({ id: request.tripId, nonce: Date.now() })}>{tr("See on map")}</button>
                </div>
                <RiderRowActions request={request} candidates={candidatesOf(request)} onNotice={onNotice} />
              </li>
            ))}
          </ul>
        )}
        <OnTheWayGroup items={onTheWay} onLocate={(tripId) => setFocus({ id: tripId, nonce: Date.now() })} />
        <p className="fine-print">{tr("Handle opens the same panel as on the Dashboard: Exclusive (one offer to one nearby driver) and Radar (a radar zone, whole zones, a driver group or drivers you tick, up to 10), again and again until one accepts. Exclusive to nearest offers the ride to the nearest free driver now.")}</p>
      </section>
    </div>
  );
}
