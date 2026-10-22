import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, MapPin, Radar, Send, Star, Target, UserRound, X, Zap } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import { useTrips } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import type { Candidate } from "../dashboard/riders";
import { CATEGORIES } from "../domain/contract";
import { statusLabel, statusPresentation } from "../domain/labels";
import { zoneById } from "../markets/markets";
import { categoryOf } from "../trips/present";
import { CommandButton } from "../ui/CommandButton";
import { StatusDot } from "../ui/kit";
import { useDialogFocus } from "../ui/useDialogFocus";
import {
  RADAR_GROUP_MAX,
  RADIUS_PRESETS_KM,
  canAssign,
  distanceLabel,
  isLocked,
  radiusIssue,
  type AdminOffer,
  type NearbyQuery,
} from "./assign";
import { AssignPanelContext, useAssignPanel, type AssignExtras } from "./assignContext";
import { DriverBonusBox, EMPTY_MONEY, moneyForSend, seesLabel, seesSentence, useClock, useTripOffers, type MoneyDraft } from "./DriverBonusBox";
import { AcceptedCard, OfferStatus, OffersSection } from "./RideProgress";
import { handledOf } from "./handle";
import { CancelRequestButton, HandledLine, RadarSender, useDispatchBook, type HandledRide } from "./HandlePanel";
import { tr, trn, trx, trSentences } from "../i18n";

export { useAssignPanel } from "./assignContext";
export { DriverBonusBox, useTripOffers } from "./DriverBonusBox";
export { OfferStatus, OffersSection } from "./RideProgress";

/**
 * The admin assign tool (owner Q13–Q18), the big "Handle" panel: opened from a waiting rider on the Dispatch live
 * list and map, the Dashboard, the Trips list or the Trip page. Two clear sections — EXCLUSIVE (nearby drivers, one
 * offer to one driver) and RADAR (radar zones, zones, driver groups, or drivers ticked by hand, up to 10, again and
 * again until one accepts). On top the money for the driver: typed once, it goes with the next Exclusive or Radar send
 * (or both), and every send button shows what the driver will see. Then the offers sent and "Cancel request".
 */

const CATEGORY_LABEL = new Map(CATEGORIES.map((category) => [category.id, category.label]));

/** One assign panel for the whole admin: any screen opens it with useAssignPanel().open(tripId). */
export function AssignPanelProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<{ tripId: string; extras: AssignExtras } | null>(null);
  const open = useCallback((id: string, extras: AssignExtras = {}) => setOpened({ tripId: id, extras }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <AssignPanelContext.Provider value={value}>
      {children}
      {opened ? <AssignPanel key={opened.tripId} tripId={opened.tripId} candidates={opened.extras.candidates ?? []} onClose={() => setOpened(null)} /> : null}
    </AssignPanelContext.Provider>
  );
}

/** Opens the assign panel for a waiting rider. */
export function NearbyButton({ tripId, rider, candidates, className = "dash-btn small" }: { tripId: string; rider: string; candidates?: Candidate[]; className?: string }) {
  const panel = useAssignPanel();
  return (
    <button data-command="admin.dispatch.view" type="button" className={className} aria-label={tr("Nearby drivers for {0}", [rider])} title={tr("See the active drivers near the pickup: send an exclusive offer or a radar")} onClick={() => panel.open(tripId, { candidates })}>{trn("{0} Nearby drivers", <Radar size={13} aria-hidden="true" />)}</button>
  );
}

/** The rider's name as a button that opens the assign panel (Q13: "click on the rider … or his name"). */
export function RiderAssignName({ tripId, rider, candidates }: { tripId: string; rider: string; candidates?: Candidate[] }) {
  const panel = useAssignPanel();
  return (
    <button data-command="admin.dispatch.view" type="button" className="link-action as-rider-name" title={tr("Assign a driver")} aria-label={tr("{0}, assign a driver", [rider])} onClick={(event) => { event.stopPropagation(); panel.open(tripId, { candidates }); }}>
      {rider}
    </button>
  );
}

type Scope = { kind: "preset"; km: number } | { kind: "custom" } | { kind: "zone" } | { kind: "zone_and_neighbours" };

function queryOf(scope: Scope, custom: string): NearbyQuery | null {
  if (scope.kind === "preset") return { scope: "radius", radiusKm: scope.km };
  if (scope.kind === "custom") return radiusIssue(Number(custom)) || custom.trim() === "" ? null : { scope: "radius", radiusKm: Number(custom) };
  return { scope: scope.kind };
}

export function AssignPanel({ tripId, candidates, onClose }: { tripId: string; candidates: Candidate[]; onClose: () => void }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const canAct = can(role, "trips.intervene");
  const trips = useTrips(null);
  const trip = trips.data?.find((row) => row.id === tripId);
  const offers = useTripOffers(tripId);
  const book = useDispatchBook();
  const now = useClock();
  const [scope, setScope] = useState<Scope>({ kind: "preset", km: RADIUS_PRESETS_KM[0] });
  const [custom, setCustom] = useState("15");
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<MoneyDraft>(EMPTY_MONEY);
  const root = useDialogFocus(true, onClose);
  const query = queryOf(scope, custom);
  const nearby = useQuery({
    queryKey: ["assign-nearby", tripId, query?.scope ?? "none", query?.radiusKm ?? 0],
    queryFn: () => api.nearbyDrivers(tripId, query!),
    enabled: Boolean(query),
    refetchInterval: 5000,
  });
  const view = offers.data;
  const status = view?.status ?? trip?.status ?? "";

  // A driver's answer changes the trip on the server: read the trip list again so every screen shows the new status.
  useEffect(() => {
    if (view && trip && view.status !== trip.status) void client.invalidateQueries({ queryKey: ["records", "trips"] });
  }, [view, trip, client]);

  const locked = isLocked(status);
  const assignable = canAssign(status) && canAct;
  const lockName = view?.lockedTo?.driverName ?? null;
  const latest = new Map<string, AdminOffer>();
  for (const offer of view?.offers ?? []) latest.set(offer.driverId, offer);
  const drivers = nearby.data?.items ?? [];
  const pickable = (id: string) => {
    const row = drivers.find((item) => item.driverId === id);
    return Boolean(row && row.onlineStatus === "online" && !row.openOfferId && assignable);
  };
  const selected = picked.filter(pickable);
  const presentation = statusPresentation(status);
  const timers = view?.timers;
  const refresh = () => {
    void offers.refetch();
    void nearby.refetch();
  };
  const ride: HandledRide = { tripId, zoneId: trip?.zoneId ?? "", rider: trip?.name ?? tripId, status };
  const handled = handledOf(book, tripId);
  // The button that sent the ride is gone once the ride is handled; keep the focus in the drawer so Escape still closes it.
  const handledId = handled?.id;
  useEffect(() => {
    if (handledId && !root.current?.contains(document.activeElement)) root.current?.focus();
  }, [handledId, root]);
  const say = (text: string) => { setNotice(text); refresh(); };
  const sent = () => setDraft((value) => ({ ...value, amount: "" }));
  const zoneId = trip?.zoneId ?? "";
  const exclusiveMoney = moneyForSend(draft, view, zoneId, "assigned");
  const radarMoney = moneyForSend(draft, view, zoneId, "radar");
  const exclusiveSees = seesLabel(exclusiveMoney, zoneId);
  const radarSees = seesLabel(radarMoney, zoneId);

  const scopeButton = (label: string, next: Scope, active: boolean) => (
    <button data-command="admin.dispatch.view" type="button" className={active ? "as-chip active" : "as-chip"} aria-pressed={active} onClick={() => setScope(next)}>{trx(label)}</button>
  );

  return (
    <div className="as-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={root} tabIndex={-1} className="as-drawer" role="dialog" aria-modal="true" aria-label={tr("Assign {0}", [trip?.name ?? tripId])} data-testid="assign-panel">
        <header className="as-head">
          <span className="as-avatar"><UserRound size={18} aria-hidden="true" /></span>
          <div>
            <h3>{tr("Assign a driver")}</h3>
            <p>
              <b>{trip?.name ?? tr("Rider")}</b> · <Link to={`/trips/${tripId}`} onClick={onClose}>{tripId}</Link> · {zoneById(trip?.zoneId ?? "")?.name ?? trip?.zoneId ?? ""} · {trx(categoryOf(tripId).label)}
              {" "}{presentation ? <StatusDot tone={presentation.tone}><span data-testid="assign-trip-status" data-status={status}>{trx(presentation.label)}</span></StatusDot> : null}
            </p>
          </div>
          <button data-command="admin.modal.close" type="button" className="fd-icon-btn" aria-label={tr("Close")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </header>

        {locked ? (
          <p className="as-locked" role="status" data-testid="assign-locked">
            <Lock size={14} aria-hidden="true" /> {lockName || trip?.driverId ? <>{trn("Assigned to {0}. The assignment is locked: the open offers were withdrawn.", <b>{lockName ?? trip?.driverId}</b>)}</> : <>{trn("The trip is {0}: it cannot be assigned.", statusLabel(status).toLowerCase())}</>}
          </p>
        ) : !canAssign(status) && view ? (
          <p className="as-locked" role="status">{trn("The trip is {0}: it cannot be assigned.", statusLabel(status).toLowerCase())}</p>
        ) : !canAct ? (
          <p className="dx-note">{tr("Your role can see the offers but cannot assign.")}</p>
        ) : (
          <p className="as-help">{trn("The rider only sees “Searching” until a driver accepts. Exclusive: one offer to one driver. Radar: several drivers at once, up to {0}. Repeat until someone accepts.", RADAR_GROUP_MAX)}</p>
        )}
        {handled ? <HandledLine action={handled} /> : null}
        {notice ? <p className="dx-note" role="status">{trSentences(notice)}</p> : null}
        {view?.accepted ? <AcceptedCard view={view} /> : null}

        {view && trip && canAssign(status) ? <DriverBonusBox trip={{ id: trip.id, zoneId: trip.zoneId, status }} view={view} canAct={canAct} onDone={say} draft={draft} onDraft={setDraft} /> : null}

        <section className="as-section as-exclusive" aria-label={tr("Exclusive")} data-testid="assign-exclusive">
          <div className="as-section-head">
            <h4>{trn("{0} Exclusive · one driver at a time", <Target size={14} aria-hidden="true" />)}</h4>
            <div className="as-chips" role="group" aria-label={tr("How far")}>
              {RADIUS_PRESETS_KM.map((km) => scopeButton(`${km} km`, { kind: "preset", km }, scope.kind === "preset" && scope.km === km))}
              {scopeButton("Custom", { kind: "custom" }, scope.kind === "custom")}
              {scopeButton("Whole zone", { kind: "zone" }, scope.kind === "zone")}
              {scopeButton("Zone + neighbours", { kind: "zone_and_neighbours" }, scope.kind === "zone_and_neighbours")}
              {scope.kind === "custom" ? (
                <label className="as-custom">{trn("{0} km", <input aria-label={tr("Custom distance in km")} type="number" min="0.1" max="100" step="0.5" value={custom} onChange={(event) => setCustom(event.target.value)} />)}</label>
              ) : null}
            </div>
          </div>
          <p className="as-help">{trn("{0} Active drivers near the pickup. Click a driver’s name to send the exclusive offer; the driver has {1} s to accept.", <MapPin size={12} aria-hidden="true" />, timers?.exclusiveSeconds ?? 15)}{exclusiveSees ? <b className="hq-sees" data-testid="exclusive-sees"> {seesSentence(exclusiveMoney, zoneId)}</b> : null}</p>
          {scope.kind === "custom" && radiusIssue(Number(custom)) ? <p className="pl-warn" role="alert">{radiusIssue(Number(custom))}</p> : null}
          {nearby.isLoading ? <p className="state-line">{tr("Looking for drivers.")}</p> : nearby.isError ? <p className="pl-warn" role="alert">{trSentences(nearby.error.message)}</p> : drivers.length === 0 && query ? (
            <p className="dx-calm">{trn("No active driver {0}. Try a wider distance.", query.scope === "radius" ? tr("within {0} km", [query.radiusKm]) : query.scope === "zone" ? tr("in this zone") : tr("in this zone or the zones next to it"))}</p>
          ) : (
            <table className="as-drivers" aria-label={tr("Nearby drivers")}>
              <thead>
                <tr><th scope="col">{tr("Driver")}</th><th scope="col">{tr("Distance")}</th><th scope="col">ETA</th><th scope="col">{tr("Category")}</th><th scope="col">{tr("Rating")}</th><th scope="col">{tr("Status")}</th><th scope="col">{tr("Offer")}</th></tr>
              </thead>
              <tbody>
                {drivers.map((row) => {
                  const offer = latest.get(row.driverId);
                  const free = row.onlineStatus === "online";
                  return (
                    <tr key={row.driverId} data-driver={row.driverId} className={free ? undefined : "busy"}>
                      <td>
                        <CommandButton
                          command="admin.trip.assign"
                          className="link-action as-driver-name"
                          aria-label={tr("Assign {0}", [row.name])}
                          targetId={tripId}
                          scope={trip?.zoneId}
                          confirmTarget={false}
                          entityState={status}
                          collection="trips"
                          patch={{ status: "offered" }}
                          before={status}
                          after={`exclusive offer to ${row.driverId}`}
                          value={{ driverId: row.driverId, ...exclusiveMoney.params }}
                          disabled={!pickable(row.driverId) || Boolean(exclusiveMoney.blocked)}
                          title={!assignable ? tr("This trip cannot be assigned now.") : !free ? tr("{0} is on a trip.", [row.name]) : row.openOfferId ? tr("{0} already has an open offer.", [row.name]) : tr("Send an exclusive offer to {0}", [row.name])}
                          summary={<>{trn("Send an exclusive offer for {0} to {1}, {2} away. {3} has {4} s to accept or decline.", <b>{trip?.name ?? tripId}</b>, <b>{row.name}</b>, distanceLabel(row.distanceMeters), row.name, timers?.exclusiveSeconds ?? 15)}{exclusiveSees ? ` ${seesSentence(exclusiveMoney, zoneId)}` : ""}</>}
                          onDone={() => { if (exclusiveMoney.used) sent(); setNotice(`Exclusive offer sent to ${row.name}.`); refresh(); }}
                        >
                          {row.name}
                        </CommandButton>
                        <small>{row.zoneName}</small>
                      </td>
                      <td>{distanceLabel(row.distanceMeters)}</td>
                      <td>{trn("{0} min", Math.round(row.pickupEtaSeconds / 60))}</td>
                      <td>
                        <span className="as-cats">{row.categoryIds.map((id) => <span key={id} className={id === categoryOf(tripId).id ? "fd-chip on" : "fd-chip"}>{CATEGORY_LABEL.get(id as never) ?? id}</span>)}</span>
                        {!row.categoryOk ? <small className="as-warn">{trn("Not {0}", trx(categoryOf(tripId).label))}</small> : null}
                      </td>
                      <td><Star size={11} aria-hidden="true" /> {row.rating.toFixed(1)}</td>
                      <td><StatusDot tone={free ? "green" : "amber"}>{statusLabel(row.onlineStatus)}</StatusDot></td>
                      <td>{offer ? <OfferStatus offer={offer} now={now} /> : <span className="as-none">–</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="as-section as-radar" aria-label={tr("Radar")} data-testid="assign-radar">
          <h4>{trn("{0} Radar · several drivers at once", <Radar size={14} aria-hidden="true" />)}</h4>
          <p className="as-help">{tr("Send the ride to a radar zone, to whole zones or to a driver group; or tick the drivers yourself. The first to accept takes it.")}</p>
          {trip ? <RadarSender ride={ride} book={book} candidates={candidates} onNotice={say} view={view} draft={draft} onSent={sent} /> : null}
          <div className="as-pick">
            <b>{tr("Or tick drivers yourself")}</b>
            <div className="as-chips" role="group" aria-label={tr("Drivers for the radar")}>
              {drivers.filter((row) => row.onlineStatus === "online").length === 0 ? <small className="as-none">{tr("No free driver in the list above.")}</small> : null}
              {drivers.filter((row) => row.onlineStatus === "online").map((row) => {
                const checked = selected.includes(row.driverId);
                const full = !checked && selected.length >= RADAR_GROUP_MAX;
                return (
                  <button key={row.driverId} data-driver={row.driverId} data-command="admin.dispatch.view" type="button" className={checked ? "as-chip active" : "as-chip"} role="checkbox" aria-checked={checked} aria-label={tr("Select {0} for the radar", [row.name])} disabled={!pickable(row.driverId) || full} title={full ? tr("At most {0} drivers in one radar group.", [RADAR_GROUP_MAX]) : row.openOfferId ? tr("{0} already has an open offer.", [row.name]) : undefined} onClick={() => setPicked((list) => (list.includes(row.driverId) ? list.filter((id) => id !== row.driverId) : [...list, row.driverId]))}>
                    {row.name} · {distanceLabel(row.distanceMeters)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="as-radar-bar">
            <span>{trn("{0} of {1} selected{2}", <b>{selected.length}</b>, RADAR_GROUP_MAX, timers ? tr(" · radar timer {0} s (the zone's normal timer)", [timers.radarSeconds]) : "")}</span>
            <CommandButton
              command="admin.trip.radarGroup"
              className="dash-btn small"
              targetId={tripId}
              scope={trip?.zoneId}
              confirmTarget={false}
              entityState={status}
              collection="trips"
              patch={{ status: "offered" }}
              before={status}
              after={`radar group: ${selected.join(", ")}`}
              value={{ driverIds: selected, ...radarMoney.params }}
              disabled={!assignable || selected.length === 0 || Boolean(radarMoney.blocked)}
              title={!assignable ? tr("This trip cannot be assigned now.") : selected.length === 0 ? tr("Tick 1 to 10 drivers first.") : radarMoney.blocked ? trx(radarMoney.blocked) : radarSees || undefined}
              onDone={() => { if (radarMoney.used) sent(); setNotice(`Sent to the radar of ${selected.length} driver${selected.length === 1 ? "" : "s"}.`); setPicked([]); refresh(); }}
            >{trn("{0} Send to radar", <Send size={13} aria-hidden="true" />)}</CommandButton>
          </div>
        </section>

        <OffersSection view={view} now={now} />

        {trip && canAct && canAssign(status) ? (
          <section className="as-section as-cancel" aria-label={tr("Cancel request")}>
            <div className="as-section-head">
              <h4>{trn("{0} Cancel request", <Zap size={14} aria-hidden="true" />)}</h4>
              <CancelRequestButton ride={ride} book={book} onNotice={say} />
            </div>
            <p className="as-help">{tr("Ends the search. The rider is told that no driver was found.")}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
