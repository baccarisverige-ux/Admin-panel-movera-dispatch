import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BadgeDollarSign, Clock, Radar, Send, Target, UserRound, XCircle, Zap } from "lucide-react";
import { useCommand, useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import type { Candidate, RideRequest } from "../dashboard/riders";
import { driverCode } from "../fleet/codes";
import { marketOfZone, zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { canAssign, RADAR_GROUP_MAX } from "./assign";
import { useAssignPanel } from "./assignContext";
import { DriverBonusBox, useTripOffers } from "./DriverBonusBox";
import { actionKindFor, defaultTarget, driversInTarget, groupIssue, handledOf, nearestAble, radarTimerFor, radarZonesFor, recordLiveAction, targetName, zoneChoicesFor, type RadarScope, type RadarTarget } from "./handle";
import { DISPATCH_KEY, emptyDispatchBook, normalizeDispatchBook, type DispatchBook, type LiveAction } from "./rules";
import { tr, trn, trx } from "../i18n";

/**
 * The ONE "Handle" system for a rider waiting for a driver. The same pieces are used in four places: the Dispatch ›
 * Live list, the Dashboard riders list, and the rider pop-up on both maps. What an admin does in one place is
 * recorded in the dispatch book (liveActions), so every place shows "Sent to … by …" or "Cancelled by …".
 */

export const RADAR_SECTION_LINK = "/offers?tab=radar";

/** A ride the Handle tools act on: the waiting rider, or the trip the assign panel is open for. */
export type HandledRide = { tripId: string; zoneId: string; rider: string; status: string };

export function rideOf(request: RideRequest): HandledRide {
  return { tripId: request.tripId, zoneId: request.zoneId, rider: request.rider, status: request.status };
}

/** The dispatch book as every Handle place reads it (one query for the whole admin). */
export function useDispatchBook(): DispatchBook {
  const slice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  return useMemo(() => normalizeDispatchBook(slice.value), [slice.value]);
}

export function useCanHandle(): boolean {
  const { agent } = useSession();
  return Boolean(agent && can(agent.role, "trips.intervene"));
}

/** "Sent to radar Södermalm by nora" / "Cancelled by nora": the same line in every place. */
export function HandledLine({ action }: { action: LiveAction }) {
  return <p className="dx-handled" data-testid="handled-line">{trn("{0} by {1}", action.kind === "cancel" ? tr("Cancelled") : tr("Sent to {0}", [action.target]), action.by)}</p>;
}

/** Opens the big panel (Nearby drivers: Exclusive and Radar) for a waiting rider. */
export function HandleButton({ ride, candidates, className = "dash-btn small", children }: { ride: HandledRide; candidates?: Candidate[]; className?: string; children?: ReactNode }) {
  const panel = useAssignPanel();
  return (
    <button data-command="admin.dispatch.view" type="button" className={className} aria-label={tr("Nearby drivers for {0}", [ride.rider])} title={tr("See the active drivers near the pickup: send an exclusive offer or a radar")} onClick={() => panel.open(ride.tripId, { candidates })}>
      {children ?? trn("{0} Handle", <Radar size={13} aria-hidden="true" />)}
    </button>
  );
}

/** An exclusive offer to the nearest free driver who may drive the requested category. */
export function NearestExclusiveButton({ request, candidates, onDone, className = "dash-btn small ghost" }: { request: RideRequest; candidates: Candidate[]; onDone: (message: string) => void; className?: string }) {
  const best = nearestAble(candidates);
  return <ExclusiveOfferButton request={request} target={best} className={className} label={tr("Exclusive to nearest")} title={best ? tr("Exclusive offer to the nearest free driver who can drive {0}: {1}, {2} km", [request.categoryLabel, best.driver.name, String(best.km)]) : tr("No free driver nearby")} onDone={onDone} />;
}

function ExclusiveOfferButton({ request, target, className, label, title, onDone }: { request: RideRequest; target: Candidate | null; className: string; label: string; title: string; onDone: (message: string) => void }) {
  return (
    <CommandButton
      command="admin.trip.offer"
      className={className}
      type="button"
      targetId={request.tripId}
      confirmTarget={false}
      entityState="searching"
      scope={request.zoneId}
      collection="trips"
      before={request.status}
      after={target ? `offered to ${target.driver.id}` : "offered"}
      patch={target ? { driverId: target.driver.id, status: "offered" } : undefined}
      disabled={!target}
      title={title}
      onDone={() => target && onDone(`${request.rider}'s ride offered to ${target.driver.name} (${driverCode(target.driver)}), about ${target.etaMin} min away.`)}
    >
      {label}
    </CommandButton>
  );
}

/** Quick action: pick one of the nearest free drivers and send the exclusive offer from here. */
export function QuickNearbyPick({ request, candidates, onDone }: { request: RideRequest; candidates: Candidate[]; onDone: (message: string) => void }) {
  const best = nearestAble(candidates);
  const [chosen, setChosen] = useState("");
  const pick = candidates.find((item) => item.driver.id === chosen) ?? best ?? candidates[0] ?? null;
  return (
    <div className="hq-block" data-testid="quick-nearby">
      <label className="hq-field">
        <span>{tr("Nearest free drivers")}</span>
        <select aria-label={tr("Choose a driver for {0}", [request.rider])} value={pick?.driver.id ?? ""} onChange={(event) => setChosen(event.target.value)} disabled={candidates.length === 0}>
          {candidates.length === 0 ? <option value="">{tr("No free driver nearby")}</option> : null}
          {candidates.slice(0, 8).map((item) => (
            <option key={item.driver.id} value={item.driver.id}>{trn("{0} · {1} km · {2} min{3}", item.driver.name, item.km, item.etaMin, item.categoryOk ? "" : tr(" · cannot drive {0}", [request.categoryLabel]))}</option>
          ))}
        </select>
      </label>
      <ExclusiveOfferButton request={request} target={pick} className="dash-btn small" label={tr("Send exclusive offer")} title={pick ? tr("Exclusive offer to {0}", [pick.driver.name]) : tr("No free driver nearby")} onDone={onDone} />
    </div>
  );
}

type PickerProps = {
  ride: HandledRide;
  book: DispatchBook;
  candidates: Candidate[];
  value: RadarTarget;
  onChange: (target: RadarTarget) => void;
  max: number;
  onMax: (max: number) => void;
  compact?: boolean;
};

type Mode = RadarTarget["kind"];

/**
 * Where a radar goes: a radar zone (this zone, or with the zones around it), one or more market zones, or a saved
 * driver group; plus how many drivers may see the ride. Shows the timer and size that apply to the choice.
 */
export function RadarTargetPicker({ ride, book, candidates, value, onChange, max, onMax, compact = false }: PickerProps) {
  const [scope, setScope] = useState<RadarScope>("zone");
  const mode: Mode = value.kind;
  const radarZones = radarZonesFor(book.radarZones, ride.zoneId, scope);
  const zones = zoneChoicesFor(ride.zoneId);
  const country = marketOfZone(ride.zoneId)?.id;
  const groups = book.groups.filter((group) => !country || group.country === country);
  const timer = radarTimerFor(book, value, ride.zoneId);
  const inside = (target: RadarTarget) => driversInTarget(target, candidates, book).length;
  const setMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "radar_zone") onChange(radarZones[0] ? { kind: "radar_zone", id: radarZones[0].id } : defaultTarget(book, ride.zoneId));
    if (next === "zone") onChange({ kind: "zone", ids: [ride.zoneId] });
    if (next === "group") onChange({ kind: "group", id: groups[0]?.id ?? "" });
  };
  const chip = (label: string, active: boolean, onClick: () => void, name?: string) => (
    <button data-command="admin.dispatch.view" type="button" className={active ? "as-chip active" : "as-chip"} aria-pressed={active} onClick={onClick} aria-label={name}>{label}</button>
  );
  return (
    <div className={compact ? "hq-radar compact" : "hq-radar"} data-testid="radar-target">
      <div className="as-chips" role="group" aria-label={tr("Radar for")}>
        {chip(tr("Radar zones"), mode === "radar_zone", () => setMode("radar_zone"))}
        {chip(tr("Zones"), mode === "zone", () => setMode("zone"))}
        {chip(tr("Driver groups"), mode === "group", () => setMode("group"))}
      </div>
      {mode === "radar_zone" ? (
        <div className="hq-list">
          <div className="as-chips" role="group" aria-label={tr("Which radar zones")}>
            {chip(tr("This zone only"), scope === "zone", () => setScope("zone"))}
            {chip(tr("This zone + zones around"), scope === "around", () => setScope("around"))}
          </div>
          {radarZones.length === 0 ? (
            <p className="dx-calm">{trn("No radar zone here yet. {0}", <Link to={RADAR_SECTION_LINK}>{tr("Draw one in Radar · Exclusive · Reservations")}</Link>)}</p>
          ) : (
            <ul className="hq-options" aria-label={tr("Radar zones")}>
              {radarZones.map((zone) => {
                const target: RadarTarget = { kind: "radar_zone", id: zone.id };
                const count = inside(target);
                return (
                  <li key={zone.id}>
                    <label>
                      <input type="radio" name={`radar-zone-${ride.tripId}`} checked={value.kind === "radar_zone" && value.id === zone.id} onChange={() => onChange(target)} />
                      <b>{zone.name}</b>
                      <small>{zoneNameOf(zone.zoneId)} · {trn("{0} free driver{1} inside", count, count === 1 ? "" : tr("s"))}</small>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
      {mode === "zone" ? (
        <ul className="hq-options" aria-label={tr("Zones")}>
          {zones.map((zone) => {
            const ids = value.kind === "zone" ? value.ids : [];
            const checked = ids.includes(zone.id);
            return (
              <li key={zone.id} className={zone.near ? undefined : "far"}>
                <label>
                  <input type="checkbox" checked={checked} onChange={() => onChange({ kind: "zone", ids: checked ? ids.filter((id) => id !== zone.id) : [...ids, zone.id] })} />
                  <b>{zone.name}</b>
                  <small>{zone.id === ride.zoneId ? tr("Pickup zone") : zone.near ? tr("Next to it") : ""}</small>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      {mode === "group" ? (
        <label className="hq-field">
          <span>{tr("Driver group")}</span>
          <select aria-label={tr("Driver group for {0}", [ride.rider])} value={value.kind === "group" ? value.id : ""} onChange={(event) => onChange({ kind: "group", id: event.target.value })}>
            {groups.length ? groups.map((group) => <option key={group.id} value={group.id}>{trn("{0} · {1} drivers", group.name, group.driverIds.length)}</option>) : <option value="">{tr("No group yet")}</option>}
          </select>
        </label>
      ) : null}
      <div className="hq-timer">
        <label className="hq-field inline">
          <span>{tr("Max drivers who can see it")}</span>
          <input type="number" min={1} max={RADAR_GROUP_MAX} step={1} value={max} aria-label={tr("Max drivers who can see it")} onChange={(event) => onMax(Math.min(RADAR_GROUP_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
        </label>
        <small>{trn("{0} Timer {1} s{2}", <Clock size={11} aria-hidden="true" />, timer.seconds, timer.ruleName ? tr(" · rule “{0}”", [timer.ruleName]) : tr(" · the zone's radar"))}</small>
      </div>
    </div>
  );
}

function zoneNameOf(zoneId: string): string {
  return zoneById(zoneId)?.name ?? zoneId;
}

type SendProps = {
  ride: HandledRide;
  book: DispatchBook;
  candidates: Candidate[];
  target: RadarTarget;
  max: number;
  onNotice: (text: string) => void;
  className?: string;
};

/**
 * Sends the ride to the radar target: recorded in the dispatch book (so every place shows "Sent to … by …"), and
 * when free drivers are inside the target right now, a real radar group goes to them so the countdown shows.
 */
export function SendRadarButton({ ride, book, candidates, target, max, onNotice, className = "dash-btn small" }: SendProps) {
  const { agent } = useSession();
  const radarGroup = useCommand("admin.trip.radarGroup");
  const name = targetName(target, book);
  const drivers = driversInTarget(target, candidates, book, max);
  const kind = actionKindFor(target);
  const label = kind === "group" ? name : `radar ${name}`;
  const issue = target.kind === "group" ? groupIssue(book.groups.find((group) => group.id === target.id)) : target.kind === "zone" && target.ids.length === 0 ? "Pick at least one zone." : !name ? "Choose where the radar goes." : null;
  const next = recordLiveAction(book, { tripId: ride.tripId, kind, target: label, by: agent?.id ?? "", at: new Date().toISOString() });
  return (
    <CommandButton
      command="admin.dispatch.send"
      className={className}
      targetId={ride.tripId}
      confirmTarget={false}
      scope={ride.zoneId}
      before={ride.status}
      after={`${kind} ${label}`}
      expectedSliceRev={book.draftRev}
      sliceKey={DISPATCH_KEY}
      value={next}
      disabled={Boolean(issue)}
      title={issue ? trx(issue) : drivers.length ? tr("{0} free driver(s) inside right now get the radar", [String(drivers.length)]) : tr("No free driver inside right now. The radar still goes out and reaches drivers who come in.")}
      summary={<>{trn("Send {0}'s ride to the radar for {1}: up to {2} drivers see it, {3} right now.", <b>{ride.rider}</b>, <b>{name}</b>, max, drivers.length)}</>}
      onDone={() => {
        onNotice(tr("{0}'s ride was sent to {1}.", [ride.rider, kind === "group" ? name : tr("the radar for {0}", [name])]));
        if (drivers.length && canAssign(ride.status)) {
          void radarGroup.run({ targetId: ride.tripId, scope: ride.zoneId, entityState: ride.status, collection: "trips", patch: { status: "offered" }, before: ride.status, after: `radar group: ${drivers.map((item) => item.driver.id).join(", ")}`, value: { driverIds: drivers.map((item) => item.driver.id) } });
        }
      }}
    >{trn("{0} Send radar", <Send size={12} aria-hidden="true" />)}</CommandButton>
  );
}

/** Cancels the waiting request; recorded like every Handle action. */
export function CancelRequestButton({ ride, book, onNotice, className = "dash-btn small ghost danger" }: { ride: HandledRide; book: DispatchBook; onNotice: (text: string) => void; className?: string }) {
  const { agent } = useSession();
  const next = recordLiveAction(book, { tripId: ride.tripId, kind: "cancel", target: "cancel", by: agent?.id ?? "", at: new Date().toISOString() });
  return (
    <CommandButton command="admin.dispatch.send" className={className} targetId={ride.tripId} confirmTarget={false} scope={ride.zoneId} before={ride.status} after="cancel" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next} onDone={() => onNotice(tr("{0}'s request was cancelled.", [ride.rider]))}>
      {trn("{0} Cancel request", <XCircle size={12} aria-hidden="true" />)}
    </CommandButton>
  );
}

/** "Radar" with the target picker and its Send button, the same in the small pop-up and the big panel. */
export function RadarSender({ ride, book, candidates, onNotice, compact = false }: { ride: HandledRide; book: DispatchBook; candidates: Candidate[]; onNotice: (text: string) => void; compact?: boolean }) {
  const [target, setTarget] = useState<RadarTarget>(() => defaultTarget(book, ride.zoneId));
  const [max, setMax] = useState(() => radarTimerFor(book, defaultTarget(book, ride.zoneId), ride.zoneId).maxDrivers);
  const change = (next: RadarTarget) => {
    setTarget(next);
    setMax(radarTimerFor(book, next, ride.zoneId).maxDrivers);
  };
  return (
    <div className="hq-block" data-testid="radar-sender">
      <RadarTargetPicker ride={ride} book={book} candidates={candidates} value={target} onChange={change} max={max} onMax={setMax} compact={compact} />
      <SendRadarButton ride={ride} book={book} candidates={candidates} target={target} max={max} onNotice={onNotice} />
    </div>
  );
}

function QuickMoney({ ride, onNotice }: { ride: HandledRide; onNotice: (text: string) => void }) {
  const offers = useTripOffers(ride.tripId);
  const canAct = useCanHandle();
  if (!offers.data) return <p className="state-line">{tr("Loading.")}</p>;
  return <DriverBonusBox compact trip={{ id: ride.tripId, zoneId: ride.zoneId, status: offers.data.status }} view={offers.data} canAct={canAct} onDone={onNotice} />;
}

type QuickKind = "money" | "radar" | "nearby";

/**
 * The quick actions in the rider pop-up on the map (Dashboard and Dispatch): add money for the driver, radar,
 * nearby driver, cancel request. Always shown; once the ride is handled they give way to the "Sent to …" line.
 */
export function RiderQuickActions({ request, candidates, onNotice }: { request: RideRequest; candidates: Candidate[]; onNotice: (text: string) => void }) {
  const book = useDispatchBook();
  const canAct = useCanHandle();
  const ride = rideOf(request);
  const done = handledOf(book, request.tripId);
  const [open, setOpen] = useState<QuickKind | null>(null);
  if (!canAct) return null;
  const toggle = (kind: QuickKind, icon: ReactNode, label: string) => (
    <button data-command="admin.dispatch.view" type="button" className={open === kind ? "dash-btn small active" : "dash-btn small ghost"} aria-pressed={open === kind} aria-expanded={open === kind} onClick={() => setOpen(open === kind ? null : kind)}>{icon} {label}</button>
  );
  return (
    <div className="hq" data-testid="rider-quick-actions">
      {done ? <HandledLine action={done} /> : null}
      <div className="hq-actions" role="group" aria-label={tr("Quick actions")}>
        {done ? null : (
          <>
            {toggle("money", <BadgeDollarSign size={13} aria-hidden="true" />, tr("Add money"))}
            {toggle("radar", <Radar size={13} aria-hidden="true" />, tr("Radar"))}
            {toggle("nearby", <Target size={13} aria-hidden="true" />, tr("Nearby driver"))}
            <CancelRequestButton ride={ride} book={book} onNotice={onNotice} />
          </>
        )}
        <HandleButton ride={ride} candidates={candidates} className="dash-btn small ghost">{trn("{0} Nearby drivers", <UserRound size={13} aria-hidden="true" />)}</HandleButton>
      </div>
      {!done && open === "money" ? <QuickMoney ride={ride} onNotice={onNotice} /> : null}
      {!done && open === "radar" ? <RadarSender ride={ride} book={book} candidates={candidates} onNotice={onNotice} compact /> : null}
      {!done && open === "nearby" ? <QuickNearbyPick request={request} candidates={candidates} onDone={onNotice} /> : null}
    </div>
  );
}

/** The actions of one row in a riders list (Dispatch › Live and the Dashboard): Handle opens the big panel. */
export function RiderRowActions({ request, candidates, onNotice }: { request: RideRequest; candidates: Candidate[]; onNotice: (text: string) => void }) {
  const book = useDispatchBook();
  const canAct = useCanHandle();
  const done = handledOf(book, request.tripId);
  if (!canAct) return null;
  const ride = rideOf(request);
  return (
    <div className="hq-row">
      {done ? <HandledLine action={done} /> : <NearestExclusiveButton request={request} candidates={candidates} onDone={onNotice} />}
      <HandleButton ride={ride} candidates={candidates}>{done ? trn("{0} Send again", <Zap size={13} aria-hidden="true" />) : trn("{0} Handle", <Radar size={13} aria-hidden="true" />)}</HandleButton>
    </div>
  );
}
