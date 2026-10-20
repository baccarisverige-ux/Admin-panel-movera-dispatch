import { useState, type ReactNode } from "react";
import { AlertTriangle, Bell, Car, Clock, Pause, Play, Radar, Send, Target, Undo2, UserRound, Users } from "lucide-react";
import { DriversMap } from "../dashboard/DriversMap";
import { AssignControls } from "../dashboard/LiveRiders";
import type { LiveDriver, LiveState } from "../dashboard/live";
import type { Candidate, RideRequest } from "../dashboard/riders";
import type { Market, MarketZone } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import { MapPanel } from "./maps";
import { RiderAssignName, useAssignPanel } from "./AssignPanel";
import { DISPATCH_KEY, modeLabel, modeNow, requestControl, type DispatchBook, type ZoneDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";

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
};

type Alert = { id: string; zoneId: string; tone: "red" | "orange"; text: string; tripId?: string };

const NO_HIDDEN = new Set<LiveState>();

type ActionProps = { request: RideRequest; book: DispatchBook; zones: MarketZone[]; groups: DispatchBook["groups"]; candidates: Candidate[]; canControl: boolean; agentId: string; now: string; onNotice: (text: string) => void };

/** What an admin can do with one waiting ride: assign a driver, send to a group, put it on a radar, or cancel it. */
function RequestActions({ request, book, zones, groups, candidates, canControl, agentId, now, onNotice }: ActionProps) {
  const handled = new Map(book.liveActions.map((action) => [action.tripId, action]));
  const send = (request: RideRequest, kind: "group" | "radar_group" | "cancel", target: string, label: string) => {
    const next: DispatchBook = { ...book, draftRev: book.draftRev + 1, liveActions: [{ id: `LA-${book.draftRev + 1}`, tripId: request.tripId, kind, target, by: agentId, at: now }, ...book.liveActions].slice(0, 200) };
    return (
      <CommandButton command="admin.dispatch.send" className={kind === "cancel" ? "dash-btn small ghost" : "dash-btn small"} targetId={request.tripId} confirmTarget={false} scope={request.zoneId} before="searching" after={`${kind} ${target}`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next} disabled={!canControl || !target || (kind === "group" && !groups.find((item) => item.name === target)?.driverIds.length)} title={kind === "group" && !groups.find((item) => item.name === target)?.driverIds.length ? tr("This group has no drivers yet. Add drivers in Events & groups.") : undefined} onDone={() => onNotice(kind === "cancel" ? tr("{0}'s request was cancelled.", [request.rider]) : tr("{0}'s ride was sent to {1}.", [request.rider, label]))}>
        {kind === "cancel" ? tr("Cancel request") : <>{trn("{0} Send", <Send size={12} aria-hidden="true" />)}</>}
      </CommandButton>
    );
  };
  const [group, setGroup] = useState(groups[0]?.id ?? "");
  const [area, setArea] = useState(`zone:${request.zoneId}`);
  const done = handled.get(request.tripId);
  if (done) return <p className="dx-handled">{trn("{0} by {1}", done.kind === "cancel" ? tr("Cancelled") : tr("Sent to {0}", [done.target]), done.by)}</p>;
  const groupName = groups.find((item) => item.id === group)?.name ?? "";
  const areaName = area.startsWith("zone:") ? zones.find((item) => `zone:${item.id}` === area)?.name ?? "" : groups.find((item) => `group:${item.id}` === area)?.name ?? "";
  return (
    <div className="dx-live-actions">
      <div className="dx-live-line"><b>{tr("Assign by hand")}</b><AssignControls request={request} candidates={candidates} onDone={onNotice} /></div>
      <div className="dx-live-line">
        <b>{tr("Send to a group")}</b>
        <select aria-label={tr("Driver group for {0}", [request.rider])} value={group} onChange={(event) => setGroup(event.target.value)}>
          {groups.length ? groups.map((item) => <option key={item.id} value={item.id}>{trn("{0} · {1} drivers", item.name, item.driverIds.length)}</option>) : <option value="">{tr("No group yet")}</option>}
        </select>
        {send(request, "group", groupName, groupName)}
      </div>
      <div className="dx-live-line">
        <b>{tr("Radar for")}</b>
        <select aria-label={tr("Radar area for {0}", [request.rider])} value={area} onChange={(event) => setArea(event.target.value)}>
          <optgroup label={tr("Zones")}>{zones.map((item) => <option key={item.id} value={`zone:${item.id}`}>{trn("All drivers in {0}", item.name)}</option>)}</optgroup>
          {groups.length ? <optgroup label={tr("Groups")}>{groups.map((item) => <option key={item.id} value={`group:${item.id}`}>{item.name}</option>)}</optgroup> : null}
        </select>
        {send(request, "radar_group", `radar ${areaName}`, `the radar for ${areaName}`)}
        {send(request, "cancel", "cancel", "")}
      </div>
    </div>
  );
}

export function LiveView({ book, market, zones, drivers, requests, candidatesOf, rulesOf, busyOf, hhmm, canControl, agentId, withScope, onNotice, sharedAlerts }: Props) {
  const assignPanel = useAssignPanel();
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const ids = new Set(zones.map((zone) => zone.id));
  const handled = new Map(book.liveActions.map((action) => [action.tripId, action]));
  const waiting = requests.filter((request) => ids.has(request.zoneId));
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

  const groups = book.groups.filter((group) => group.country === market.id);
  const now = new Date().toISOString();

  return (
    <div className="dx-live">
      {sharedAlerts ?? <section className="dx-alerts" aria-label={tr("Alerts")}>
        <h3>{trn("{0} Alerts {1}", <Bell size={15} aria-hidden="true" />, <span className="dx-count">{alerts.length}</span>)}</h3>
        {alerts.length === 0 ? <p className="dx-calm">{tr("No alerts right now. Limits are set per zone in Rules → Alerts.")}</p> : (
          <ul>
            {alerts.slice(0, 8).map((alert) => (
              <li key={alert.id} className={alert.tone}>
                <AlertTriangle size={14} aria-hidden="true" /> <span>{alert.text}</span>
                {alert.tripId ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => { setOpenId(alert.tripId!); setFocus({ id: alert.tripId!, nonce: Date.now() }); document.getElementById(`dx-req-${alert.tripId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>{tr("Handle")}</button> : null}
              </li>
            ))}
          </ul>
        )}
      </section>}

      <section aria-label={tr("Zone control")}>
        <h3 className="dx-h3">{trn("{0} Zones right now", <Radar size={15} aria-hidden="true" />)}</h3>
        <ul className="dx-control-grid">
          {zones.map((zone) => {
            const control = book.control[zone.id];
            const rules = rulesOf(zone.id);
            const mode = modeNow(rules, control, busyOf(zone.id), hhmm);
            const free = drivers.filter((driver) => driver.zoneId === zone.id && driver.state === "free").length;
            const count = waiting.filter((request) => request.zoneId === zone.id && !handled.has(request.tripId)).length;
            const pending = book.approvals.find((item) => item.kind === "control" && item.control?.zoneId === zone.id);
            const button = (label: string, value: { paused: boolean; mode: "radar" | "exclusive" | null }, icon: ReactNode, className = "dash-btn small ghost") => {
              const result = requestControl(book, zone.id, value, agentId, now);
              return (
                <CommandButton command="admin.dispatch.control" className={className} targetId={zone.id} confirmTarget={false} scope={zone.id} before={control?.paused ? "paused" : control?.mode ?? "rules"} after={value.paused ? "paused" : value.mode ?? "rules"} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={result.book} disabled={!canControl || Boolean(pending)} aria-label={`${label} ${zone.name}`} onDone={() => onNotice(result.waiting ? tr("{0} {1}: waiting for a second admin to approve.", [label, zone.name]) : tr("{0}: {1} done.", [zone.name, label.toLowerCase()]))}>
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

      <MapPanel title={tr("Live map · {0}", [trx(market.name)])} note={<span className="dx-legend">{trn("{0} Free {1} To pickup {2} On trip {3} Rider waiting", <i className="free" />, <i className="pickup" />, <i className="trip" />, <i className="rider" />)}</span>}>
        <DriversMap drivers={drivers} requests={waiting} showRequests focusRequest={focus} onRequestOpen={canControl ? assignPanel.open : undefined} market={market} zones={zones.map((zone) => zone.id)} hidden={NO_HIDDEN} withScope={withScope} renderAssign={canControl ? (request) => <AssignControls request={request} candidates={candidatesOf(request)} onDone={onNotice} /> : undefined} />
      </MapPanel>

      <section className="dash-card" aria-labelledby="dx-waiting-title">
        <div className="card-head"><h3 id="dx-waiting-title">{trn("{0} Riders waiting for a driver {1}", <Users size={16} aria-hidden="true" />, <span className="dx-count">{waiting.filter((item) => !handled.has(item.tripId)).length}</span>)}</h3></div>
        {waiting.length === 0 ? <p className="dx-calm">{tr("Nobody is waiting right now.")}</p> : (
          <ul className="dx-waiting" aria-label={tr("Riders waiting")}>
            {waiting.map((request) => (
              <li key={request.tripId} id={`dx-req-${request.tripId}`} className={request.waitingMin >= 5 ? "long" : undefined}>
                <div className="dx-waiting-head">
                  <span className="dx-avatar"><UserRound size={16} aria-hidden="true" /></span>
                  <span><b>{canControl ? <RiderAssignName tripId={request.tripId} rider={request.rider} /> : request.rider}</b><small>{request.zoneName} · {request.categoryLabel} · {request.tripId}</small></span>
                  <span className={request.waitingMin >= 5 ? "dx-wait-chip long" : "dx-wait-chip"}>{trn("{0} {1} min", <Clock size={11} aria-hidden="true" />, request.waitingMin)}</span>
                  <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setFocus({ id: request.tripId, nonce: Date.now() })}>{tr("See on map")}</button>
                  {canControl && !handled.has(request.tripId) ? <button data-command="admin.dispatch.view" type="button" className="dash-btn small" aria-expanded={openId === request.tripId} onClick={() => setOpenId(openId === request.tripId ? null : request.tripId)}>{openId === request.tripId ? tr("Close") : tr("Handle")}</button> : null}
                </div>
                {handled.has(request.tripId) ? <p className="dx-handled">{trn("{0} by {1}", handled.get(request.tripId)!.kind === "cancel" ? tr("Cancelled") : tr("Sent to {0}", [handled.get(request.tripId)!.target]), handled.get(request.tripId)!.by)}</p> : null}
                {canControl && openId === request.tripId && !handled.has(request.tripId) ? <RequestActions request={request} book={book} zones={zones} groups={groups} candidates={candidatesOf(request)} canControl={canControl} agentId={agentId} now={now} onNotice={onNotice} /> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="fine-print">{tr("Click a rider (on the map or here) to see the active drivers near the pickup: send an exclusive offer to one, or a radar group of up to 10, again and again until one accepts. Assign by hand offers the ride to that driver now. Send to a group: the first driver in the group to accept takes it.")}</p>
      </section>
    </div>
  );
}
