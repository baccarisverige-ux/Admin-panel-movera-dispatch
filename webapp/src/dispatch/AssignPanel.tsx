import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, Clock, Lock, MapPin, Radar, Send, Star, UserRound, X, Zap } from "lucide-react";
import { useAdminApi } from "../api/AdminApiContext";
import { useTrips } from "../api/hooks";
import type { TripOffersView } from "../api/dispatchSim";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { CATEGORIES } from "../domain/contract";
import { statusLabel, statusPresentation } from "../domain/labels";
import { MARKETS, formatMoney, market, zoneById } from "../markets/markets";
import { countryOf } from "../trips/file";
import { categoryOf } from "../trips/present";
import { CommandButton } from "../ui/CommandButton";
import { StatusDot } from "../ui/kit";
import { useDialogFocus } from "../ui/useDialogFocus";
import {
  EVENT_LABEL,
  OFFER_STATUS_LABEL,
  RADAR_GROUP_MAX,
  RADIUS_PRESETS_KM,
  bonusIssue,
  canAssign,
  countdownLabel,
  distanceLabel,
  isLocked,
  radiusIssue,
  secondsLeft,
  type AdminOffer,
  type NearbyQuery,
} from "./assign";

/**
 * The admin assign tool (owner Q13–Q18): opened from a waiting rider on the Dispatch live map, the Trips list or the
 * Trip page. Nearby active drivers, a direct exclusive offer to one driver, radar groups of up to 10 drivers (again
 * and again until one accepts), the lock once a driver accepts, and "Add money for driver".
 */

const PRICING_LINK = "/pricing?tab=extras&section=driver-bonus";
const CATEGORY_LABEL = new Map(CATEGORIES.map((category) => [category.id, category.label]));

type AssignPanelApi = { open: (tripId: string) => void };

const AssignPanelContext = createContext<AssignPanelApi>({ open: () => undefined });

/** One assign panel for the whole admin: any screen opens it with useAssignPanel().open(tripId). */
export function AssignPanelProvider({ children }: { children: ReactNode }) {
  const [tripId, setTripId] = useState<string | null>(null);
  const open = useCallback((id: string) => setTripId(id), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <AssignPanelContext.Provider value={value}>
      {children}
      {tripId ? <AssignPanel key={tripId} tripId={tripId} onClose={() => setTripId(null)} /> : null}
    </AssignPanelContext.Provider>
  );
}

export function useAssignPanel(): AssignPanelApi {
  return useContext(AssignPanelContext);
}

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

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Opens the assign panel for a waiting rider. */
export function NearbyButton({ tripId, rider, className = "dash-btn small" }: { tripId: string; rider: string; className?: string }) {
  const panel = useAssignPanel();
  return (
    <button data-command="admin.dispatch.view" type="button" className={className} aria-label={`Nearby drivers for ${rider}`} title="See the active drivers near the pickup: assign one or send a radar group" onClick={() => panel.open(tripId)}>
      <Radar size={13} aria-hidden="true" /> Nearby drivers
    </button>
  );
}

/** The rider's name as a button that opens the assign panel (Q13: "click on the rider … or his name"). */
export function RiderAssignName({ tripId, rider }: { tripId: string; rider: string }) {
  const panel = useAssignPanel();
  return (
    <button data-command="admin.dispatch.view" type="button" className="link-action as-rider-name" title="Assign a driver" aria-label={`${rider}, assign a driver`} onClick={(event) => { event.stopPropagation(); panel.open(tripId); }}>
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

function offerTone(status: AdminOffer["status"]): "green" | "amber" | "red" | "muted" {
  if (status === "claimed") return "green";
  if (status === "open") return "amber";
  if (status === "declined" || status === "expired") return "red";
  return "muted";
}

export function OfferStatus({ offer, now }: { offer: AdminOffer; now: number }) {
  return (
    <span className="as-offer-status" data-status={offer.status}>
      <StatusDot tone={offerTone(offer.status)}>{OFFER_STATUS_LABEL[offer.status]}</StatusDot>
      {offer.status === "open" ? <span className="as-countdown" aria-label={`${secondsLeft(offer.expiresAt, now)} seconds left`}><Clock size={11} aria-hidden="true" /> {countdownLabel(secondsLeft(offer.expiresAt, now))}</span> : null}
    </span>
  );
}

export function AssignPanel({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const canAct = can(role, "trips.intervene");
  const trips = useTrips(null);
  const trip = trips.data?.find((row) => row.id === tripId);
  const offers = useTripOffers(tripId);
  const now = useClock();
  const [scope, setScope] = useState<Scope>({ kind: "preset", km: RADIUS_PRESETS_KM[0] });
  const [custom, setCustom] = useState("15");
  const [picked, setPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
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

  const scopeButton = (label: string, next: Scope, active: boolean) => (
    <button data-command="admin.dispatch.view" type="button" className={active ? "as-chip active" : "as-chip"} aria-pressed={active} onClick={() => setScope(next)}>{label}</button>
  );

  return (
    <div className="as-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={root} tabIndex={-1} className="as-drawer" role="dialog" aria-modal="true" aria-label={`Assign ${trip?.name ?? tripId}`} data-testid="assign-panel">
        <header className="as-head">
          <span className="as-avatar"><UserRound size={18} aria-hidden="true" /></span>
          <div>
            <h3>Assign a driver</h3>
            <p>
              <b>{trip?.name ?? "Rider"}</b> · <Link to={`/trips/${tripId}`} onClick={onClose}>{tripId}</Link> · {zoneById(trip?.zoneId ?? "")?.name ?? trip?.zoneId ?? ""} · {categoryOf(tripId).label}
              {" "}{presentation ? <StatusDot tone={presentation.tone}><span data-testid="assign-trip-status" data-status={status}>{presentation.label}</span></StatusDot> : null}
            </p>
          </div>
          <button data-command="admin.modal.close" type="button" className="fd-icon-btn" aria-label="Close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </header>

        {locked ? (
          <p className="as-locked" role="status" data-testid="assign-locked">
            <Lock size={14} aria-hidden="true" /> {lockName || trip?.driverId ? <>Assigned to <b>{lockName ?? trip?.driverId}</b>. The assignment is locked: the open offers were withdrawn.</> : <>The trip is {statusLabel(status).toLowerCase()}: it cannot be assigned.</>}
          </p>
        ) : !canAssign(status) && view ? (
          <p className="as-locked" role="status">The trip is {statusLabel(status).toLowerCase()}: it cannot be assigned.</p>
        ) : !canAct ? (
          <p className="dx-note">Your role can see the offers but cannot assign.</p>
        ) : (
          <p className="as-help">The rider only sees “Searching” until a driver accepts. Click a driver’s name to send an exclusive offer, or tick up to {RADAR_GROUP_MAX} drivers and send them to the radar. Repeat until someone accepts.</p>
        )}
        {notice ? <p className="dx-note" role="status">{notice}</p> : null}

        <section className="as-section" aria-label="Nearby drivers">
          <div className="as-section-head">
            <h4><MapPin size={14} aria-hidden="true" /> Active drivers near the pickup</h4>
            <div className="as-chips" role="group" aria-label="How far">
              {RADIUS_PRESETS_KM.map((km) => scopeButton(`${km} km`, { kind: "preset", km }, scope.kind === "preset" && scope.km === km))}
              {scopeButton("Custom", { kind: "custom" }, scope.kind === "custom")}
              {scopeButton("Whole zone", { kind: "zone" }, scope.kind === "zone")}
              {scopeButton("Zone + neighbours", { kind: "zone_and_neighbours" }, scope.kind === "zone_and_neighbours")}
              {scope.kind === "custom" ? (
                <label className="as-custom">
                  <input aria-label="Custom distance in km" type="number" min="0.1" max="100" step="0.5" value={custom} onChange={(event) => setCustom(event.target.value)} /> km
                </label>
              ) : null}
            </div>
          </div>
          {scope.kind === "custom" && radiusIssue(Number(custom)) ? <p className="pl-warn" role="alert">{radiusIssue(Number(custom))}</p> : null}
          {nearby.isLoading ? <p className="state-line">Looking for drivers.</p> : nearby.isError ? <p className="pl-warn" role="alert">{nearby.error.message}</p> : drivers.length === 0 && query ? (
            <p className="dx-calm">No active driver {query.scope === "radius" ? `within ${query.radiusKm} km` : query.scope === "zone" ? "in this zone" : "in this zone or the zones next to it"}. Try a wider distance.</p>
          ) : (
            <table className="as-drivers" aria-label="Nearby drivers">
              <thead>
                <tr><th scope="col"><span className="sr-only">Radar</span></th><th scope="col">Driver</th><th scope="col">Distance</th><th scope="col">ETA</th><th scope="col">Category</th><th scope="col">Rating</th><th scope="col">Status</th><th scope="col">Offer</th></tr>
              </thead>
              <tbody>
                {drivers.map((row) => {
                  const offer = latest.get(row.driverId);
                  const free = row.onlineStatus === "online";
                  const checked = selected.includes(row.driverId);
                  const full = !checked && selected.length >= RADAR_GROUP_MAX;
                  return (
                    <tr key={row.driverId} data-driver={row.driverId} className={free ? undefined : "busy"}>
                      <td>
                        <input type="checkbox" aria-label={`Select ${row.name} for the radar`} checked={checked} disabled={!pickable(row.driverId) || full} title={full ? `At most ${RADAR_GROUP_MAX} drivers in one radar group.` : undefined} onChange={() => setPicked((list) => (list.includes(row.driverId) ? list.filter((id) => id !== row.driverId) : [...list, row.driverId]))} />
                      </td>
                      <td>
                        <CommandButton
                          command="admin.trip.assign"
                          className="link-action as-driver-name"
                          aria-label={`Assign ${row.name}`}
                          targetId={tripId}
                          scope={trip?.zoneId}
                          confirmTarget={false}
                          entityState={status}
                          collection="trips"
                          patch={{ status: "offered" }}
                          before={status}
                          after={`exclusive offer to ${row.driverId}`}
                          value={{ driverId: row.driverId }}
                          disabled={!pickable(row.driverId)}
                          title={!assignable ? "This trip cannot be assigned now." : !free ? `${row.name} is on a trip.` : row.openOfferId ? `${row.name} already has an open offer.` : `Send an exclusive offer to ${row.name}`}
                          summary={<>Send an exclusive offer for <b>{trip?.name ?? tripId}</b> to <b>{row.name}</b>, {distanceLabel(row.distanceMeters)} away. {row.name} has {timers?.exclusiveSeconds ?? 15} s to accept or decline.</>}
                          onDone={() => { setNotice(`Exclusive offer sent to ${row.name}.`); refresh(); }}
                        >
                          {row.name}
                        </CommandButton>
                        <small>{row.zoneName}</small>
                      </td>
                      <td>{distanceLabel(row.distanceMeters)}</td>
                      <td>{Math.round(row.pickupEtaSeconds / 60)} min</td>
                      <td>
                        <span className="as-cats">{row.categoryIds.map((id) => <span key={id} className={id === categoryOf(tripId).id ? "fd-chip on" : "fd-chip"}>{CATEGORY_LABEL.get(id as never) ?? id}</span>)}</span>
                        {!row.categoryOk ? <small className="as-warn">Not {categoryOf(tripId).label}</small> : null}
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
          <div className="as-radar-bar">
            <span><b>{selected.length}</b> of {RADAR_GROUP_MAX} selected{timers ? ` · radar timer ${timers.radarSeconds} s (the zone's normal timer)` : ""}</span>
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
              value={{ driverIds: selected }}
              disabled={!assignable || selected.length === 0}
              title={!assignable ? "This trip cannot be assigned now." : selected.length === 0 ? "Tick 1 to 10 drivers first." : undefined}
              onDone={() => { setNotice(`Sent to the radar of ${selected.length} driver${selected.length === 1 ? "" : "s"}.`); setPicked([]); refresh(); }}
            >
              <Send size={13} aria-hidden="true" /> Send to radar
            </CommandButton>
          </div>
        </section>

        <OffersSection view={view} now={now} />

        {view && trip ? <DriverBonusBox trip={{ id: trip.id, zoneId: trip.zoneId, status }} view={view} canAct={canAct} onDone={(text) => { setNotice(text); refresh(); }} /> : null}
      </div>
    </div>
  );
}

/** Offers sent (direct and radar groups), with the countdown of each group, and the dispatch events of the trip. */
export function OffersSection({ view, now }: { view: TripOffersView | undefined; now: number }) {
  if (!view) return null;
  const direct = view.offers.filter((offer) => offer.kind === "assigned");
  return (
    <section className="as-section" aria-label="Offers sent">
      <h4><Radar size={14} aria-hidden="true" /> Offers sent</h4>
      {view.offers.length === 0 ? <p className="dx-calm">No offer sent from here yet.</p> : (
        <ul className="as-offers" aria-label="Offers">
          {direct.length ? (
            <li>
              <b><Zap size={12} aria-hidden="true" /> Direct assign (exclusive)</b>
              <ul>{direct.map((offer) => <OfferLine key={offer.offerId} offer={offer} now={now} />)}</ul>
            </li>
          ) : null}
          {view.groups.map((group) => {
            const left = secondsLeft(group.expiresAt, now);
            const items = view.offers.filter((offer) => offer.groupId === group.groupId);
            const open = items.some((offer) => offer.status === "open");
            return (
              <li key={group.groupId} data-group={group.groupId}>
                <b><Radar size={12} aria-hidden="true" /> Radar group {group.number} · {group.driverIds.length} driver{group.driverIds.length === 1 ? "" : "s"}</b>
                <span className="as-countdown" data-testid={`group-countdown-${group.number}`}>{open ? <><Clock size={11} aria-hidden="true" /> {countdownLabel(left)} left</> : "Ended"}</span>
                <ul>{items.map((offer) => <OfferLine key={offer.offerId} offer={offer} now={now} />)}</ul>
              </li>
            );
          })}
        </ul>
      )}
      {view.events.length ? (
        <ol className="as-events" aria-label="Dispatch events">
          {view.events.slice(-8).reverse().map((event) => (
            <li key={event.eventId} data-kind={event.kind}>
              <time>{new Date(event.occurredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              <span>{EVENT_LABEL[event.kind]}{event.driverName ? ` · ${event.driverName}` : ""}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function OfferLine({ offer, now }: { offer: AdminOffer; now: number }) {
  const country = MARKETS.find((item) => item.currency === offer.currency)?.id ?? "SE";
  const money = (minor: number) => formatMoney(minor, country);
  return (
    <li data-offer={offer.offerId} data-driver={offer.driverId}>
      <span>{offer.driverName}</span>
      <OfferStatus offer={offer} now={now} />
      <small>Driver sees {money(offer.fareMinor)}{offer.driverBonusMinor ? ` (incl. +${money(offer.driverBonusMinor)})` : ""}</small>
      {offer.priority ? <span className="as-priority">Priority</span> : null}
    </li>
  );
}

/**
 * "Add money for driver" (Q16, Q17): on the trip and in the assign panel, while the trip is requested, searching or
 * offered. Movera pays it from its commission, and may pay more than its commission; the rider never pays it.
 * The total per trip may not pass the country's limit from Pricing › Tips & limits (never above the hard max).
 */
export function DriverBonusBox({ trip, view, canAct, onDone }: { trip: { id: string; zoneId: string; status: string }; view: TripOffersView; canAct: boolean; onDone?: (text: string) => void }) {
  const country = countryOf(trip.zoneId);
  const place = market(country);
  const money = (minor: number) => formatMoney(minor, country);
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState(true);
  const raw = amount.trim() === "" ? 0 : Number(amount) * place.minorUnits;
  const addMinor = Number.isFinite(raw) ? Math.round(raw) : 0;
  const tooFine = Number.isFinite(raw) && Math.abs(raw - addMinor) > 1e-6;
  const issue = amount.trim() === "" ? null : tooFine ? { code: "invalid" as const, message: "Too many decimals for this currency." } : bonusIssue(Number.isFinite(raw) ? addMinor : Number.NaN, view.bonusMinor, view.limits, money);
  const open = canAssign(trip.status);
  const total = view.bonusMinor + (issue ? 0 : addMinor);
  const moveraKeeps = view.commissionMinor - total;
  return (
    <section className="as-section as-bonus" aria-label="Add money for driver" data-testid="driver-bonus-box">
      <h4><BadgeDollarSign size={14} aria-hidden="true" /> Add money for driver</h4>
      <p className="as-help">Movera pays it from its commission, and can pay more than its commission. The rider never pays it. The driver sees the total fare with it and a red “Priority” badge.</p>
      {view.bonusMinor ? <p className="as-bonus-now" data-testid="driver-bonus-now">Added so far: <b>{money(view.bonusMinor)}</b>{view.priority ? <span className="as-priority">Priority</span> : null}</p> : null}
      <div className="as-bonus-row">
        <label>
          Amount ({place.currency})
          <input aria-label="Money for the driver" type="number" min="0" step={1 / place.minorUnits} value={amount} disabled={!canAct || !open} onChange={(event) => setAmount(event.target.value)} placeholder={`Up to ${money(Math.max(0, view.limits.limitMinor - view.bonusMinor))}`} />
        </label>
        <label className="check-row"><input type="checkbox" checked={priority} disabled={!canAct || !open} onChange={(event) => setPriority(event.target.checked)} /> Priority badge</label>
        <CommandButton
          command="admin.trip.driverBonus"
          className="dash-btn small"
          targetId={trip.id}
          scope={trip.zoneId}
          confirmTarget={false}
          entityState={trip.status}
          before={money(view.bonusMinor)}
          after={money(view.bonusMinor + addMinor)}
          value={{ amountMinor: addMinor, priority }}
          disabled={!canAct || !open || addMinor <= 0 || Boolean(issue)}
          title={!open ? "Money can be added only while the trip is requested, searching or offered." : issue?.message}
          summary={<>Add <b>{money(addMinor)}</b> for the driver on {trip.id}. Movera pays it; the rider’s price does not change.</>}
          onDone={() => { setAmount(""); onDone?.(`${money(addMinor)} added for the driver.`); }}
        >
          Add money
        </CommandButton>
      </div>
      {issue ? (
        <p className="pl-warn" role="alert" data-testid="driver-bonus-issue">
          {issue.message}{issue.code === "over_limit" ? <> <Link to={PRICING_LINK}>Open Pricing › Tips &amp; limits</Link></> : null}
        </p>
      ) : (
        <p className="as-help">Limit {money(view.limits.limitMinor)} per trip, set in <Link to={PRICING_LINK}>Pricing › Tips &amp; limits</Link> (hard max {money(view.limits.hardMaxMinor)}).</p>
      )}
      <dl className="as-split" aria-label="Money split with the bonus" data-testid="driver-bonus-split">
        <div><dt>Rider pays</dt><dd>{money(view.fareMinor)}</dd></div>
        <div><dt>Driver gets</dt><dd>{money(view.driverNetMinor + total)}</dd></div>
        <div><dt>Movera commission</dt><dd>{money(view.commissionMinor)}</dd></div>
        <div className={total ? "minus" : undefined}><dt>Bonus paid by Movera</dt><dd>− {money(total)}</dd></div>
        <div className={moveraKeeps < 0 ? "total minus" : "total"}><dt>Movera keeps</dt><dd>{money(moveraKeeps)}</dd></div>
      </dl>
      {moveraKeeps < 0 ? <p className="dx-note" data-testid="driver-bonus-beyond">Movera pays {money(-moveraKeeps)} more than its commission on this trip.</p> : null}
    </section>
  );
}
