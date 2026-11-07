import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { tr, trx } from "../i18n";
import { marketOfZone, market } from "../markets/markets";
import { useLiveRefetch, zonedLabel } from "../api/hooks";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { atRisk, inView, isOverdue, needsAttention, notStarted, reservationActions, reservationCall, reservationStateLabel, RESERVATIONS_PATH, sortReservations, type ReservationAction, type ServerReservation, type View } from "./reservations";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "assigned", label: "Assigned" },
  { id: "warning", label: "Needs attention" },
  { id: "cancelled", label: "Cancelled" },
  { id: "failed", label: "Failed" },
  { id: "no_show", label: "No-show" },
];

const timeZoneOf = (zoneId: string) => (marketOfZone(zoneId) ?? market("SE")).timeZone;
type Act = Exclude<ReservationAction, "open">;
type ButtonProps = { disabled: boolean; onClick: () => void; children: string };
/** One button per action, each with its own registered command (src/commands/registry.ts). */
function ActButton({ action, ...props }: ButtonProps & { action: Act }) {
  if (action === "dispatchNow") return <button type="button" className="dash-btn small" data-command="admin.reservation.dispatchNow" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "unassign") return <button type="button" className="dash-btn small" data-command="admin.reservation.unassign" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "assign") return <button type="button" className="dash-btn small" data-command="admin.reservation.assign" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "offer") return <button type="button" className="dash-btn small" data-command="admin.reservation.offer" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "raise") return <button type="button" className="dash-btn small" data-command="admin.reservation.raise" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "noShow") return <button type="button" className="dash-btn small" data-command="admin.reservation.noShow" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  if (action === "contact") return <button type="button" className="dash-btn small" data-command="admin.reservation.contact" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
  return <button type="button" className="dash-btn small" data-command="admin.reservation.cancel" disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
}
const BUTTON: Record<Exclude<ReservationAction, "open">, string> = { dispatchNow: "Send to drivers now", unassign: "Take the driver off", assign: "Give to a driver", offer: "Offer to drivers", raise: "Raise the driver's fare", noShow: "Mark no-show", contact: "Log a contact", cancel: "Cancel the ride" };

/** v0.18.17 Book later: Admin › Reservations on live — the server's booked rides and real buttons (contract.json#bookLater.admin). */
export function LiveReservations() {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  // Live test MED 7: the admin picks drivers by name (the zone's drivers from the server), never a raw id.
  const drivers = useQuery({ queryKey: ["live", "reservationDrivers"], queryFn: () => client.json<{ items: { driverId: string; firstName?: string; lastName?: string; onlineStatus?: string; zoneIds?: string[] }[] }>("/admin/drivers?accountStatus=active&limit=200"), staleTime: 60_000 });
  const refetchInterval = useLiveRefetch("reservations", 30_000);
  const list = useQuery({ queryKey: ["live", "reservations"], queryFn: () => client.json<{ items: ServerReservation[] }>(RESERVATIONS_PATH), refetchInterval });
  const [view, setView] = useState<View>("all");
  const [open, setOpen] = useState<{ tripId: string; action: Exclude<ReservationAction, "open"> } | null>(null);
  const [reason, setReason] = useState("");
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => sortReservations((list.data?.items ?? []).filter((trip) => trip.kind === "scheduled" && inView(trip, view))), [list.data, view]);
  const canAct = can("trips.intervene");

  async function run(trip: ServerReservation, action: Exclude<ReservationAction, "open">) {
    setBusy(true);
    setError(null);
    try {
      const call = reservationCall(action, trip, { reason, driverId, amountMinor: Math.round(Number(amount.replace(",", ".")) * 100) || 0 });
      await client.post(call.path, call.body);
      setNotice(tr("Done: {0}.", [trx(BUTTON[action])]));
      setOpen(null);
      setReason("");
      setDriverId("");
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["live", "reservations"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="live-reservations">
      <div className="actions" aria-label={tr("Reservation views")}>
        {VIEWS.map((item) => (
          <button key={item.id} data-command="admin.table.filter" type="button" className={view === item.id ? "primary-btn" : "secondary-btn"} onClick={() => setView(item.id)}>{trx(item.label)}</button>
        ))}
      </div>
      {notice ? <p className="dx-note" role="status">{notice}</p> : null}
      {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
      {list.isLoading ? <p className="state-line">{tr("Loading reservations.")}</p> : list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? <p className="state-line">{tr("No booked rides in this view.")}</p> : (
        <table className="data-table">
          <thead>
            <tr><th>{tr("Pickup")}</th><th>{tr("Route")}</th><th>{tr("Category")}</th><th>{tr("Driver")}</th><th>{tr("Status")}</th><th>{tr("Zone")}</th><th>{tr("Actions")}</th></tr>
          </thead>
          <tbody>
            {rows.map((trip) => (
              <tr key={trip.tripId} data-testid={`resv-${trip.tripId}`}>
                <td><CalendarClock size={13} aria-hidden="true" /> {trip.scheduledAt ? zonedLabel(trip.scheduledAt, timeZoneOf(trip.zoneId)) : "—"}</td>
                <td>{trip.pickup?.address ?? "—"} → {trip.dropoff?.address ?? "—"}</td>
                <td>{trip.categoryId}</td>
                <td>{trip.driver ? <Link to={`/drivers/${trip.driver.driverId}`}>{trip.driver.firstName || trip.driver.driverId}</Link> : tr("No driver yet")}</td>
                <td>
                  {reservationStateLabel(trip)}
                  {atRisk(trip) && !notStarted(trip) ? <span className="dx-note warn"> <AlertTriangle size={12} aria-hidden="true" /> {tr("Driver may be late for this booked ride")}</span> : null}
                  {notStarted(trip) ? <span className="dx-note warn"> <AlertTriangle size={12} aria-hidden="true" /> {tr("Pickup time, driver has not started: handle it")}</span> : null}
                  {isOverdue(trip) ? <span className="dx-note warn"> <AlertTriangle size={12} aria-hidden="true" /> {tr("Pickup time passed, no driver: handle it")}</span> : null}
                  {needsAttention(trip) && !isOverdue(trip) ? <span className="dx-note warn"> <AlertTriangle size={12} aria-hidden="true" /> {tr("Booked ride soon with no driver")}</span> : null}
                </td>
                <td>{trip.zoneId}</td>
                <td>
                  <span className="op-inline">
                    <Link className="dash-btn small ghost" to={`/trips/${trip.tripId}`}>{tr("Open")}</Link>
                    {canAct ? reservationActions(trip).filter((a): a is Exclude<ReservationAction, "open"> => a !== "open").map((action) => (
                      <ActButton key={action} action={action} disabled={busy} onClick={() => (action === "dispatchNow" ? void run(trip, action) : setOpen({ tripId: trip.tripId, action }))}>{trx(BUTTON[action])}</ActButton>
                    )) : null}
                  </span>
                  {open?.tripId === trip.tripId ? (
                    <span className="op-inline">
                      {open.action === "assign" || open.action === "offer" ? (
                        <select aria-label={tr("Driver")} multiple={open.action === "offer"} value={open.action === "offer" ? driverId.split(",").filter(Boolean) : driverId} onChange={(event) => setDriverId(open.action === "offer" ? Array.from(event.target.selectedOptions).map((o) => o.value).slice(0, 10).join(",") : event.target.value)}>
                          {open.action === "assign" ? <option value="">{tr("Pick a driver")}</option> : null}
                          {(drivers.data?.items ?? []).filter((d) => !d.zoneIds || d.zoneIds.includes(trip.zoneId)).map((d) => (
                            <option key={d.driverId} value={d.driverId}>{[d.firstName, d.lastName].filter(Boolean).join(" ") || d.driverId}{d.onlineStatus === "online" ? "" : ` · ${tr("offline")}`}</option>
                          ))}
                        </select>
                      ) : null}
                      {open.action === "raise" ? <input aria-label={tr("Amount to add")} inputMode="decimal" value={amount} maxLength={10} onChange={(event) => setAmount(event.target.value)} /> : null}
                      <input aria-label={tr("Reason")} value={reason} maxLength={500} placeholder={open.action === "assign" || open.action === "offer" || open.action === "raise" ? tr("Note (optional)") : tr("Reason")} onChange={(event) => setReason(event.target.value)} />
                      <ActButton action={open.action} disabled={busy || (["unassign", "cancel", "noShow", "contact"].includes(open.action) && !reason.trim()) || ((open.action === "assign" || open.action === "offer") && !driverId.trim()) || (open.action === "raise" && !(Number(amount.replace(",", ".")) > 0))} onClick={() => void run(trip, open.action)}>{tr("Confirm")}</ActButton>
                      <button type="button" className="dash-btn small ghost" data-command="admin.table.filter" onClick={() => setOpen(null)}>{tr("Close")}</button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
