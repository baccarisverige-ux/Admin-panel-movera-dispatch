import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Clock, Radar, Send, Target, UserRound, XCircle, Zap } from "lucide-react";
import { useCommand, useSlice } from "../api/hooks";
import type { TripOffersView } from "../api/dispatchSim";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import type { Candidate, RideRequest } from "../dashboard/riders";
import { driverCode } from "../fleet/codes";
import { marketOfZone, zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { canAssign, RADAR_GROUP_MAX } from "./assign";
import { useAssignPanel } from "./assignContext";
import { DriverBonusBox, EMPTY_MONEY, moneyForSend, seesLabel, seesSentence, useTripOffers, type MoneyDraft } from "./DriverBonusBox";
import { RideProgress } from "./RideProgress";
import { actionKindFor, defaultTarget, driversInTarget, groupIssue, handledOf, nearestAble, radarTimerFor, radarZonesFor, recordLiveAction, targetName, zoneChoicesFor, type RadarScope, type RadarTarget } from "./handle";
import { DISPATCH_KEY, emptyDispatchBook, normalizeDispatchBook, type DispatchBook, type LiveAction } from "./rules";
import { tr, trn, trx } from "../i18n";
import { isLiveData } from "../live/realData";
import { radarRuleFor } from "./radarZones";
import { useActiveRadarSend } from "./radarSends";

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

/** What a send carries besides the target: the trip's offers (for the price the driver sees) and the typed money. */
type Money = { view?: TripOffersView; draft?: MoneyDraft; onSent?: () => void };

/**
 * Records a send in the dispatch book so every place (Dispatch, Dashboard, both maps) shows "Sent to … by …".
 * It follows the offer command, which already asked for the reason.
 */
function useRecordSend() {
  const book = useDispatchBook();
  const { agent } = useSession();
  const send = useCommand("admin.dispatch.send");
  return (ride: HandledRide, kind: LiveAction["kind"], target: string) => {
    // G4 (live admin): on live the server keeps the offers sent by hand (GET /admin/trips/{id}/offers shows them in
    // "Offers sent"); the demo's own record has no server path, so it is not sent there.
    if (isLiveData()) return;
    void send.run({
      targetId: ride.tripId,
      scope: ride.zoneId,
      before: ride.status,
      after: `${kind} ${target}`,
      reason: "Recorded with the offer sent",
      sliceKey: DISPATCH_KEY,
      expectedSliceRev: book.draftRev,
      value: recordLiveAction(book, { tripId: ride.tripId, kind, target, by: agent?.id ?? "", at: new Date().toISOString() }),
    });
  };
}

/** An exclusive offer to the nearest free driver who may drive the requested category. */
export function NearestExclusiveButton({ request, candidates, onDone, className = "dash-btn small ghost", view, draft, onSent }: { request: RideRequest; candidates: Candidate[]; onDone: (message: string) => void; className?: string } & Money) {
  const best = nearestAble(candidates);
  return <ExclusiveOfferButton ride={rideOf(request)} target={best} className={className} label={tr("Exclusive to nearest")} title={best ? tr("Exclusive offer to the nearest free driver who can drive {0}: {1}, {2} km", [request.categoryLabel, best.driver.name, String(best.km)]) : tr("No free driver nearby")} onDone={onDone} view={view} draft={draft} onSent={onSent} />;
}

/**
 * A real exclusive offer to one driver (admin.trip.assign): an offer record with the fare the driver sees (the money
 * added for exclusive offers included), the zone's exclusive countdown, and a line in "Offers sent".
 */
function ExclusiveOfferButton({ ride, target, className, label, title, onDone, view, draft = EMPTY_MONEY, onSent }: { ride: HandledRide; target: Candidate | null; className: string; label: string; title: string; onDone: (message: string) => void } & Money) {
  const record = useRecordSend();
  const money = moneyForSend(draft, view, ride.zoneId, "assigned");
  const sees = seesLabel(money, ride.zoneId);
  const status = view?.status ?? ride.status;
  const why = !target ? title : !canAssign(status) ? tr("This trip cannot be assigned now.") : money.blocked ? trx(money.blocked) : title;
  return (
    <CommandButton
      command="admin.trip.assign"
      className={className}
      type="button"
      targetId={ride.tripId}
      confirmTarget={false}
      entityState={status}
      scope={ride.zoneId}
      collection="trips"
      patch={{ status: "offered" }}
      before={status}
      after={target ? `exclusive offer to ${target.driver.id}` : "exclusive offer"}
      value={target ? { driverId: target.driver.id, ...money.params } : undefined}
      disabled={!target || !canAssign(status) || Boolean(money.blocked)}
      title={why}
      summary={target ? <>{trn("Send an exclusive offer for {0} to {1}, about {2} min away.", <b>{ride.rider}</b>, <b>{target.driver.name}</b>, target.etaMin)}{sees ? ` ${seesSentence(money, ride.zoneId)}` : ""}</> : undefined}
      onDone={() => {
        if (!target) return;
        record(ride, "exclusive", target.driver.name);
        if (money.used) onSent?.();
        onDone(`${ride.rider}'s ride offered to ${target.driver.name} (${driverCode(target.driver)}), about ${target.etaMin} min away.`);
      }}
    >
      {label}{sees ? <small className="hq-sees"> · {sees}</small> : null}
    </CommandButton>
  );
}

/** Quick action: pick one of the nearest free drivers and send the exclusive offer from here. */
export function QuickNearbyPick({ request, candidates, onDone, view, draft, onSent }: { request: RideRequest; candidates: Candidate[]; onDone: (message: string) => void } & Money) {
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
      <ExclusiveOfferButton ride={rideOf(request)} target={pick} className="dash-btn small" label={tr("Send exclusive offer")} title={pick ? tr("Exclusive offer to {0}", [pick.driver.name]) : tr("No free driver nearby")} onDone={onDone} view={view} draft={draft} onSent={onSent} />
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
  const live = isLiveData();
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
            {groups.length ? groups.map((group) => <option key={group.id} value={group.id}>{trn("{0} · {1} drivers", trx(group.name), group.driverIds.length)}</option>) : <option value="">{tr("No group yet")}</option>}
          </select>
        </label>
      ) : null}
      <div className="hq-timer">
        {/* v0.18.6 (G4-F3, F4): on live the server picks the drivers of a group (free ones, nearest first, up to 10) and
            of a radar zone (its rule's most drivers), so only a radar to whole zones takes a number here. */}
        {live && mode !== "zone" ? (
          <small data-testid="radar-server-picks">{mode === "group" ? tr("The free drivers of the group get it, nearest first, up to {0}.", [RADAR_GROUP_MAX]) : timer.ruleName ? tr("Up to {0} free drivers inside get it.", [timer.maxDrivers]) : tr("This radar zone has no rule yet. Make one in Radar zone rules.")}</small>
        ) : (
          <label className="hq-field inline">
            <span>{tr("Max drivers who can see it")}</span>
            <input type="number" min={1} max={RADAR_GROUP_MAX} step={1} value={max} aria-label={tr("Max drivers who can see it")} onChange={(event) => onMax(Math.min(RADAR_GROUP_MAX, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
          </label>
        )}
        <small>{trn("{0} Timer {1} s{2}", <Clock size={11} aria-hidden="true" />, timer.seconds, timer.ruleName ? tr(" · rule “{0}”", [timer.ruleName]) : tr(" · the zone's radar"))}{timer.repeat ? tr(" · sends again by itself") : ""}</small>
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
} & Money;

/**
 * Sends the ride to the radar target as a real radar (admin.trip.radarGroup): the free drivers inside the target
 * right now get the offer (at most `max`), with the money added for radar offers and the countdown; when nobody is
 * inside yet the radar still goes out and shows "On the radar · waiting for drivers" until its timer ends.
 * The send is also recorded in the dispatch book, so every place shows "Sent to … by …".
 */
export function SendRadarButton({ ride, book, candidates, target, max, onNotice, className = "dash-btn small", view, draft = EMPTY_MONEY, onSent }: SendProps) {
  const record = useRecordSend();
  const name = targetName(target, book);
  const drivers = driversInTarget(target, candidates, book, max);
  const kind = actionKindFor(target);
  const label = kind === "group" ? name : `radar ${name}`;
  const money = moneyForSend(draft, view, ride.zoneId, "radar");
  const sees = seesLabel(money, ride.zoneId);
  const status = view?.status ?? ride.status;
  const live = isLiveData();
  const country = marketOfZone(ride.zoneId)?.id;
  // v0.18.6 (G4-F4): a radar zone is sent with the rule that covers it; the server needs both.
  const rule = target.kind === "radar_zone" && country ? radarRuleFor(book, target.id, country) : null;
  const issue = target.kind === "group" ? groupIssue(book.groups.find((group) => group.id === target.id)) : target.kind === "zone" && target.ids.length === 0 ? "Pick at least one zone." : !name ? "Choose where the radar goes." : target.kind === "radar_zone" && live && !rule ? "This radar zone has no rule yet. Make one in Radar zone rules." : !canAssign(status) ? "This trip cannot be assigned now." : money.blocked;
  // On live, a group or a radar zone goes to the server as it is (it picks the free drivers); whole zones as the drivers.
  const serverTarget = !live ? {} : target.kind === "group" ? { groupId: target.id } : target.kind === "radar_zone" && rule ? { radarZoneId: target.id, ruleId: rule.id, radarZoneName: name } : {};
  const byServer = Object.keys(serverTarget).length > 0;
  return (
    <CommandButton
      command="admin.trip.radarGroup"
      className={className}
      targetId={ride.tripId}
      confirmTarget={false}
      scope={ride.zoneId}
      entityState={status}
      collection="trips"
      patch={{ status: "offered" }}
      before={status}
      after={`radar ${label}: ${drivers.map((item) => item.driver.id).join(", ") || "nobody inside yet"}`}
      value={byServer ? { ...serverTarget, target: label, ...money.params } : { driverIds: drivers.map((item) => item.driver.id), target: label, maxDrivers: max, ...money.params }}
      disabled={Boolean(issue) || (live && !byServer && drivers.length === 0)}
      title={issue ? trx(issue) : drivers.length ? tr("{0} free driver(s) inside right now get the radar", [String(drivers.length)]) : !live ? tr("No free driver inside right now. The radar still goes out and reaches drivers who come in.") : rule?.repeat ? tr("Nobody free inside right now. It goes out again every {0} s and reaches drivers who come in.", [rule.seconds]) : byServer ? tr("Nobody seems free right now; the server checks again when you send.") : tr("No free driver inside right now.")}
      summary={<>{trn("Send {0}'s ride to the radar for {1}: up to {2} drivers see it, {3} right now.", <b>{ride.rider}</b>, <b>{name}</b>, max, drivers.length)}{sees ? ` ${seesSentence(money, ride.zoneId)}` : ""}</>}
      onDone={(result) => {
        record(ride, kind, label);
        if (money.used) onSent?.();
        onNotice(result?.notice ?? tr("{0}'s ride was sent to {1}.", [ride.rider, kind === "group" ? name : tr("the radar for {0}", [name])]));
      }}
    >{trn("{0} Send radar", <Send size={12} aria-hidden="true" />)}{sees ? <small className="hq-sees"> · {sees}</small> : null}</CommandButton>
  );
}

/**
 * v0.18.6 (owner G4-F4 "Repeat until taken"): while a radar zone send goes out again by itself (its rule repeats), the
 * panel says so and offers Stop. The server also stops it when a driver accepts or the rider's search ends (8 min).
 */
export function RadarRepeatLine({ tripId, book, view, onNotice }: { tripId: string; book: Pick<DispatchBook, "radarZones">; view?: TripOffersView; onNotice: (text: string) => void }) {
  const local = useActiveRadarSend(tripId);
  const canAct = useCanHandle();
  // The server's trip decides (it survives a reload and shows other admins' sends); what this session just sent is
  // only the instant state until the next read. An older server that says nothing leaves this session's state.
  const server = view?.radarRepeat;
  const send = server ? { radarZoneName: book.radarZones.find((zone) => zone.id === server.radarZoneId)?.name ?? local?.radarZoneName ?? server.radarZoneId, seconds: server.seconds, rounds: server.rounds } : server === null ? null : local;
  if (!send) return null;
  return (
    <div className="hq-repeat" data-testid="radar-repeat" role="status">
      <span>{trn("{0} {1}: sending again every {2} s to the free drivers inside, newcomers too{3}", <Radar size={12} aria-hidden="true" />, send.radarZoneName, send.seconds, send.rounds > 1 ? tr(" · round {0}", [send.rounds]) : "")}</span>
      <CommandButton command="admin.trip.radarZoneStop" className="dash-btn small ghost danger" targetId={tripId} confirmTarget={false} before="repeating" after="stopped" disabled={!canAct} onDone={() => onNotice(tr("The radar for {0} was stopped.", [send.radarZoneName]))}>{tr("Stop")}</CommandButton>
    </div>
  );
}

/** Cancels the waiting request; recorded like every Handle action. */
export function CancelRequestButton({ ride, book, onNotice, className = "dash-btn small ghost danger" }: { ride: HandledRide; book: DispatchBook; onNotice: (text: string) => void; className?: string }) {
  const { agent } = useSession();
  // G4 (live admin): this button only records the cancel in the demo's book; the trip page's admin cancel (with a
  // reason) is the real one (driver group 7). Not offered on live, so it never says "Not connected yet".
  if (isLiveData()) return null;
  const next = recordLiveAction(book, { tripId: ride.tripId, kind: "cancel", target: "cancel", by: agent?.id ?? "", at: new Date().toISOString() });
  return (
    <CommandButton command="admin.dispatch.send" className={className} targetId={ride.tripId} confirmTarget={false} scope={ride.zoneId} before={ride.status} after="cancel" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next} onDone={() => onNotice(tr("{0}'s request was cancelled.", [ride.rider]))}>
      {trn("{0} Cancel request", <XCircle size={12} aria-hidden="true" />)}
    </CommandButton>
  );
}

/** "Radar" with the target picker and its Send button, the same in the small pop-up and the big panel. */
export function RadarSender({ ride, book, candidates, onNotice, compact = false, view, draft, onSent }: { ride: HandledRide; book: DispatchBook; candidates: Candidate[]; onNotice: (text: string) => void; compact?: boolean } & Money) {
  const [target, setTarget] = useState<RadarTarget>(() => defaultTarget(book, ride.zoneId));
  const [max, setMax] = useState(() => radarTimerFor(book, defaultTarget(book, ride.zoneId), ride.zoneId).maxDrivers);
  const change = (next: RadarTarget) => {
    setTarget(next);
    setMax(radarTimerFor(book, next, ride.zoneId).maxDrivers);
  };
  return (
    <div className="hq-block" data-testid="radar-sender">
      <RadarTargetPicker ride={ride} book={book} candidates={candidates} value={target} onChange={change} max={max} onMax={setMax} compact={compact} />
      <SendRadarButton ride={ride} book={book} candidates={candidates} target={target} max={max} onNotice={onNotice} view={view} draft={draft} onSent={onSent} />
      <RadarRepeatLine tripId={ride.tripId} book={book} view={view} onNotice={onNotice} />
    </div>
  );
}

type QuickKind = "radar" | "nearby";

/**
 * The rider pop-up on the map (Dashboard and Dispatch). On top, the money for the driver (typed once, used by the next
 * Exclusive or Radar send); then the quick actions: Radar, Nearby driver, Cancel request, and the big panel. Below,
 * the live state of the offers: who sees it on the radar, ignored, refused — and, once a driver accepts, who is on the
 * way. The quick actions stay while the ride can still be sent again; they go once it is accepted or cancelled.
 */
export function RiderQuickActions({ request, candidates, onNotice }: { request: RideRequest; candidates: Candidate[]; onNotice: (text: string) => void }) {
  const book = useDispatchBook();
  const canAct = useCanHandle();
  const ride = rideOf(request);
  const done = handledOf(book, request.tripId);
  const offers = useTripOffers(request.tripId, canAct);
  const view = offers.data;
  const [open, setOpen] = useState<QuickKind | null>(null);
  const [draft, setDraft] = useState<MoneyDraft>(EMPTY_MONEY);
  if (!canAct) return null;
  const status = view?.status ?? request.status;
  const finished = Boolean(view?.accepted) || done?.kind === "cancel" || !canAssign(status);
  const sent = () => setDraft((value) => ({ ...value, amount: "" }));
  const toggle = (kind: QuickKind, icon: ReactNode, label: string) => (
    <button data-command="admin.dispatch.view" type="button" className={open === kind ? "dash-btn small active" : "dash-btn small ghost"} aria-pressed={open === kind} aria-expanded={open === kind} onClick={() => setOpen(open === kind ? null : kind)}>{icon} {label}</button>
  );
  return (
    <div className="hq" data-testid="rider-quick-actions">
      {done ? <HandledLine action={done} /> : null}
      {!finished && view ? <DriverBonusBox compact trip={{ id: ride.tripId, zoneId: ride.zoneId, status }} view={view} canAct={canAct} onDone={onNotice} draft={draft} onDraft={setDraft} /> : null}
      <div className="hq-actions" role="group" aria-label={tr("Quick actions")}>
        {finished ? null : (
          <>
            {toggle("radar", <Radar size={13} aria-hidden="true" />, tr("Radar"))}
            {toggle("nearby", <Target size={13} aria-hidden="true" />, tr("Nearby driver"))}
            {done?.kind === "cancel" ? null : <CancelRequestButton ride={ride} book={book} onNotice={onNotice} />}
          </>
        )}
        <HandleButton ride={ride} candidates={candidates} className="dash-btn small ghost">{trn("{0} Nearby drivers", <UserRound size={13} aria-hidden="true" />)}</HandleButton>
      </div>
      {!finished && open === "radar" ? <RadarSender ride={ride} book={book} candidates={candidates} onNotice={onNotice} compact view={view} draft={draft} onSent={sent} /> : null}
      {!finished && open === "nearby" ? <QuickNearbyPick request={request} candidates={candidates} onDone={onNotice} view={view} draft={draft} onSent={sent} /> : null}
      <RideProgress view={view} />
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
