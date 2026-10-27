import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, MapPin, Radar, Send, Target, UserRound, X } from "lucide-react";
import { statusLabel, statusPresentation } from "../domain/labels";
import { RADAR_GROUP_MAX, RADIUS_PRESETS_KM, canAssign, distanceLabel, isLocked } from "../dispatch/assign";
import { zoneById } from "../markets/markets";
import { StatusDot } from "../ui/kit";
import { useDialogFocus } from "../ui/useDialogFocus";
import { tr, trn, trx, trSentences } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { liveMoney, parseMinor } from "./format";
import { LiveCommandDialog, useTripCommand } from "./LiveTripDialogs";
import { categoryName, wordText } from "./LiveTripsPage";
import { ErrorLine } from "./ui";
import type { NearbyDriver, Page, Trip, TripOffer } from "./types";

type Scope = { scope: "radius"; radiusKm: number } | { scope: "zone" } | { scope: "zone_and_neighbours" };

/** The money typed for the driver, as the driverBonus of the next send (null: nothing typed; undefined: not a number). */
export function bonusOf(text: string, currency: string): { amountMinor: number; currency: string } | null | undefined {
  if (!text.trim()) return null;
  const minor = parseMinor(text, currency);
  return minor && minor > 0 ? { amountMinor: minor, currency } : undefined;
}

export function useTripOffers(tripId: string, enabled = true) {
  const { client, can } = useLiveSession();
  return useQuery({
    queryKey: ["live", "trip-offers", tripId],
    queryFn: () => client.json<Page<TripOffer>>(`/admin/trips/${encodeURIComponent(tripId)}/offers?limit=50`),
    enabled: enabled && can("trips.read") && Boolean(tripId),
  });
}

/**
 * The demo's assign panel (dispatch/AssignPanel.tsx) on the server: drivers near the pickup
 * (GET /admin/trips/{id}/nearby-drivers, 5 / 7 / 10 km, the zone, or the zone and around it), an Exclusive offer to one
 * (POST …/assign), a Radar to up to 10 (POST …/radar-group), money added for the driver with the next send
 * (driverBonus), and the offers sent (GET …/offers).
 */
export function LiveAssignDialog({ trip: given, rider, onClose, onChanged }: { trip: Trip; rider: string; onClose: () => void; onChanged?: () => void }) {
  const { client, can } = useLiveSession();
  const root = useDialogFocus(true, onClose);
  const fresh = useQuery({ queryKey: ["live", "trip", given.tripId], queryFn: () => client.json<Trip>(`/admin/trips/${encodeURIComponent(given.tripId)}`) });
  const trip = fresh.data ?? given;
  const [scope, setScope] = useState<Scope>({ scope: "radius", radiusKm: RADIUS_PRESETS_KM[0] });
  const [picked, setPicked] = useState<string[]>([]);
  const [money, setMoney] = useState("");
  const [notice, setNotice] = useState("");
  const [send, setSend] = useState<{ kind: "assign"; driver: NearbyDriver } | { kind: "radar" } | null>(null);
  const offers = useTripOffers(trip.tripId);
  const nearby = useQuery({
    queryKey: ["live", "trip-nearby", trip.tripId, scope.scope, scope.scope === "radius" ? scope.radiusKm : 0],
    queryFn: () => client.json<Page<NearbyDriver>>(`/admin/trips/${encodeURIComponent(trip.tripId)}/nearby-drivers?scope=${scope.scope}${scope.scope === "radius" ? `&radiusKm=${scope.radiusKm}` : ""}`),
    refetchInterval: 5000,
  });
  const run = useTripCommand(trip, (text) => { setNotice(text); onChanged?.(); });
  const canAct = can("trips.intervene");
  const assignable = canAssign(trip.status) && canAct;
  const drivers = nearby.data?.items ?? [];
  const pickable = (row: NearbyDriver) => assignable && row.onlineStatus === "online" && !row.openOfferId;
  const selected = picked.filter((id) => drivers.some((row) => row.driverId === id && pickable(row)));
  const bonus = bonusOf(money, trip.fare.currency);
  const presentation = statusPresentation(trip.status);
  const scopeButton = (label: string, next: Scope) => {
    const active = next.scope === scope.scope && (next.scope !== "radius" || (scope.scope === "radius" && scope.radiusKm === next.radiusKm));
    return <button key={label} data-command="admin.dispatch.view" type="button" className={active ? "as-chip active" : "as-chip"} aria-pressed={active} onClick={() => setScope(next)}>{label}</button>;
  };
  const withMoney = bonus ? { driverBonus: bonus } : {};

  return (
    <div className="as-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={root} tabIndex={-1} className="as-drawer" role="dialog" aria-modal="true" aria-label={tr("Assign {0}", [rider])} data-testid="assign-panel">
        <header className="as-head">
          <span className="as-avatar"><UserRound size={18} aria-hidden="true" /></span>
          <div>
            <h3>{tr("Assign a driver")}</h3>
            <p>
              <b>{rider}</b> · <Link to={`/trips/${encodeURIComponent(trip.tripId)}`} onClick={onClose}>{trip.tripId}</Link> · {zoneById(trip.zoneId)?.name ?? trip.zoneId} · {categoryName(trip.categoryId)}
              {" "}{presentation ? <StatusDot tone={presentation.tone}><span data-testid="assign-trip-status" data-status={trip.status}>{trx(presentation.label)}</span></StatusDot> : null}
            </p>
          </div>
          <button data-command="admin.modal.close" type="button" className="fd-icon-btn" aria-label={tr("Close")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </header>

        {isLocked(trip.status) ? (
          <p className="as-locked" role="status" data-testid="assign-locked"><Lock size={14} aria-hidden="true" /> {trn("Assigned to {0}. The assignment is locked: the open offers were withdrawn.", <b>{trip.driver?.firstName ?? trip.driverId ?? ""}</b>)}</p>
        ) : !canAssign(trip.status) ? (
          <p className="as-locked" role="status">{trn("The trip is {0}: it cannot be assigned.", statusLabel(trip.status).toLowerCase())}</p>
        ) : !canAct ? (
          <p className="dx-note">{tr("Your role can see the offers but cannot assign.")}</p>
        ) : (
          <p className="as-help">{trn("The rider only sees “Searching” until a driver accepts. Exclusive: one offer to one driver. Radar: several drivers at once, up to {0}. Repeat until someone accepts.", RADAR_GROUP_MAX)}</p>
        )}
        {notice ? <p className="dx-note" role="status">{trSentences(notice)}</p> : null}

        {assignable ? (
          <section className="as-section" aria-label={tr("Money for the driver")} data-testid="assign-money">
            <h4>{tr("Money for the driver")}</h4>
            <p className="as-help">{tr("Paid by Movera, never by the rider. It goes with the next Exclusive or Radar send.")}{trip.driverBonus ? ` ${tr("Already added: {0}.", [liveMoney(trip.driverBonus)])}` : ""}</p>
            <label className="op-money"><input aria-label={tr("Money for the driver")} inputMode="decimal" value={money} placeholder="0" onChange={(event) => setMoney(event.target.value)} /><span>{trip.fare.currency}</span></label>
            {bonus === undefined ? <p className="pl-warn" role="alert">{tr("Enter an amount above 0.")}</p> : null}
          </section>
        ) : null}

        <section className="as-section as-exclusive" aria-label={tr("Exclusive")} data-testid="assign-exclusive">
          <div className="as-section-head">
            <h4>{trn("{0} Exclusive · one driver at a time", <Target size={14} aria-hidden="true" />)}</h4>
            <div className="as-chips" role="group" aria-label={tr("How far")}>
              {RADIUS_PRESETS_KM.map((km) => scopeButton(`${km} km`, { scope: "radius", radiusKm: km }))}
              {scopeButton(tr("Whole zone"), { scope: "zone" })}
              {scopeButton(tr("Zone + neighbours"), { scope: "zone_and_neighbours" })}
            </div>
          </div>
          <p className="as-help">{trn("{0} Active drivers near the pickup. Click a driver’s name to send the exclusive offer.", <MapPin size={12} aria-hidden="true" />)}</p>
          {nearby.isLoading ? <p className="state-line">{tr("Looking for drivers.")}</p> : nearby.error ? <ErrorLine error={nearby.error} onRetry={() => void nearby.refetch()} /> : drivers.length === 0 ? (
            <p className="dx-calm">{trn("No active driver {0}. Try a wider distance.", scope.scope === "radius" ? tr("within {0} km", [scope.radiusKm]) : scope.scope === "zone" ? tr("in this zone") : tr("in this zone or the zones next to it"))}</p>
          ) : (
            <table className="as-drivers" aria-label={tr("Nearby drivers")}>
              <thead>
                <tr><th scope="col">{tr("Driver")}</th><th scope="col">{tr("Distance")}</th><th scope="col">ETA</th><th scope="col">{tr("Category")}</th><th scope="col">{tr("Status")}</th><th scope="col">{tr("Offer")}</th></tr>
              </thead>
              <tbody>
                {drivers.map((row) => (
                  <tr key={row.driverId} data-driver={row.driverId} className={row.onlineStatus === "online" ? undefined : "busy"}>
                    <td>
                      <button data-command="admin.trip.assign" type="button" className="link-action as-driver-name" aria-label={tr("Assign {0}", [row.firstName])} disabled={!pickable(row) || bonus === undefined} title={!assignable ? tr("This trip cannot be assigned now.") : row.onlineStatus !== "online" ? tr("{0} is on a trip.", [row.firstName]) : row.openOfferId ? tr("{0} already has an open offer.", [row.firstName]) : tr("Send an exclusive offer to {0}", [row.firstName])} onClick={() => setSend({ kind: "assign", driver: row })}>{row.firstName}</button>
                    </td>
                    <td>{distanceLabel(row.distanceMeters)}</td>
                    <td>{trn("{0} min", Math.round(row.pickupEtaSeconds / 60))}</td>
                    <td><span className="as-cats">{row.categoryIds.map((id) => <span key={id} className={id === trip.categoryId ? "fd-chip on" : "fd-chip"}>{categoryName(id)}</span>)}</span></td>
                    <td><StatusDot tone={row.onlineStatus === "online" ? "green" : "amber"}>{statusLabel(row.onlineStatus)}</StatusDot></td>
                    <td>{row.openOfferId ? tr("Open offer") : <span className="as-none">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="as-section as-radar" aria-label={tr("Radar")} data-testid="assign-radar">
          <h4>{trn("{0} Radar · several drivers at once", <Radar size={14} aria-hidden="true" />)}</h4>
          <div className="as-pick">
            <b>{tr("Or tick drivers yourself")}</b>
            <div className="as-chips" role="group" aria-label={tr("Drivers for the radar")}>
              {drivers.filter((row) => row.onlineStatus === "online").length === 0 ? <small className="as-none">{tr("No free driver in the list above.")}</small> : null}
              {drivers.filter((row) => row.onlineStatus === "online").map((row) => {
                const checked = selected.includes(row.driverId);
                const full = !checked && selected.length >= RADAR_GROUP_MAX;
                return (
                  <button key={row.driverId} data-driver={row.driverId} data-command="admin.dispatch.view" type="button" className={checked ? "as-chip active" : "as-chip"} role="checkbox" aria-checked={checked} aria-label={tr("Select {0} for the radar", [row.firstName])} disabled={!pickable(row) || full} onClick={() => setPicked((list) => (list.includes(row.driverId) ? list.filter((id) => id !== row.driverId) : [...list, row.driverId]))}>
                    {row.firstName} · {distanceLabel(row.distanceMeters)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="as-radar-bar">
            <span>{trn("{0} of {1} selected{2}", <b>{selected.length}</b>, RADAR_GROUP_MAX, "")}</span>
            <button data-command="admin.trip.radarGroup" type="button" className="dash-btn small" disabled={!assignable || selected.length === 0 || bonus === undefined} title={!assignable ? tr("This trip cannot be assigned now.") : selected.length === 0 ? tr("Tick 1 to 10 drivers first.") : undefined} onClick={() => setSend({ kind: "radar" })}>{trn("{0} Send to radar", <Send size={13} aria-hidden="true" />)}</button>
          </div>
        </section>

        <LiveOffers offers={offers.data?.items} loading={offers.isLoading} error={offers.error} onRetry={() => void offers.refetch()} />

        <LiveCommandDialog
          open={send !== null}
          title={send?.kind === "assign" ? tr("Offer to driver") : tr("Send to radar")}
          summary={send?.kind === "assign"
            ? tr("Send an exclusive offer for {0} to {1}, {2} away.", [rider, send.driver.firstName, distanceLabel(send.driver.distanceMeters)])
            : tr("Send the ride to the radar of {0} drivers. The first to accept takes it.", [selected.length])}
          note="optional"
          onClose={() => setSend(null)}
          onSend={async ({ note }) => {
            const extra = { ...withMoney, ...(note ? { note } : {}) };
            if (send?.kind === "assign") await run("assign", { driverId: send.driver.driverId, ...extra }, tr("Exclusive offer sent to {0}.", [send.driver.firstName]));
            else await run("radar-group", { driverIds: selected, ...extra }, tr("Sent to the radar of {0} drivers.", [selected.length]));
            setMoney("");
            setPicked([]);
            void nearby.refetch();
          }}
        />
      </div>
    </div>
  );
}

/** The offers sent for a trip (GET /admin/trips/{id}/offers), newest first. */
export function LiveOffers({ offers, loading, error, onRetry }: { offers: readonly TripOffer[] | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  return (
    <section className="as-section" aria-label={tr("Offers sent")} data-testid="trip-offers">
      <h4>{tr("Offers sent")}</h4>
      {loading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={error} onRetry={onRetry} />
      {offers && offers.length === 0 ? <p className="state-line">{tr("No offers sent.")}</p> : null}
      {offers && offers.length > 0 ? (
        <div className="table-wrap">
          <table className="live-table">
            <thead><tr><th>{tr("Kind")}</th><th>{tr("Driver")}</th><th>{tr("Status")}</th><th>{tr("Driver earns")}</th></tr></thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.offerId} data-offer-id={offer.offerId}>
                  <td>{offerKindLabel(offer.kind)}</td>
                  <td>{offer.driverId ?? "–"}</td>
                  <td>{wordText(offer.status)}</td>
                  <td>{liveMoney(offer.driverEarnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/** contract.json#offerKind, by name. */
export function offerKindLabel(kind: string): string {
  if (kind === "radar") return tr("Radar");
  if (kind === "exclusive") return tr("Exclusive");
  if (kind === "assigned") return tr("Assigned by Movera");
  if (kind === "reservation") return tr("Reservation");
  if (kind === "next_trip") return tr("Next trip");
  return kind;
}
