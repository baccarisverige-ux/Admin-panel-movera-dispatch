import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Settings2 } from "lucide-react";
import {
  emptyReservationBook,
  normalizeReservationBook,
  reservationOps,
  reservationWarning,
  zonedLabel,
  useRecords,
  useSlice,
  type ReservationBook,
} from "../api/hooks";
import { DataTable } from "../ui/DataTable";
import { market, marketOfZone } from "../markets/markets";
import { ScheduledAccessCard } from "../drivers/ScheduledAccess";
import { tr, trn } from "../i18n";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "assigned", label: "Assigned" },
  { id: "warning", label: "Needs attention" },
  { id: "return", label: "Return rides" },
  { id: "cancelled", label: "Cancelled" },
  { id: "no_show", label: "No-show" },
] as const;

const timeZoneOf = (zoneId: string) => (marketOfZone(zoneId) ?? market("SE")).timeZone;

export function ReservationsPage() {
  const navigate = useNavigate();
  const reservations = useRecords("reservations", null);
  const store = useSlice<ReservationBook>("reservationOps", emptyReservationBook());
  const book = useMemo(() => normalizeReservationBook(store.value), [store.value]);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const nowIso = new Date().toISOString();
  const needle = query.trim().toLowerCase();

  const rows = useMemo(() => (reservations.data ?? []).filter((record) => {
    const ops = reservationOps(book, record);
    const warning = reservationWarning(record, ops, nowIso);
    if (view === "waiting" && !["waiting", "booked"].includes(record.status)) return false;
    if (view === "assigned" && record.status !== "assigned") return false;
    if (view === "warning" && !warning) return false;
    if (view === "return" && !ops.returnPickupAt) return false;
    if (view === "cancelled" && record.status !== "cancelled") return false;
    if (view === "no_show" && record.status !== "no_show") return false;
    if (!needle) return true;
    return [record.id, record.name, record.phone, record.driverId ?? "", ops.category ?? "", ops.policy.version]
      .some((value) => value.toLowerCase().includes(needle));
  }), [book, needle, nowIso, reservations.data, view]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{tr("Reservations")}</h2>
          <p>{trn("{0} Pickup times display in each zone's local time. Each booking keeps its policy snapshot after policy changes or cancellation.", reservations.isLoading || store.loading ? tr("Loading reservations.") : tr("{0} reservations in this view.", [rows.length]))}</p>
        </div>
      </div>

      <p className="state-line">{trn("Existing reservations keep the policy version they were booked with. {0}", store.message)}</p>

      <p className="resv-settings-link" data-testid="reservation-settings-link">
        <Settings2 size={14} aria-hidden="true" />
        <span>{trn("Reservation settings and the reservation policy (now {0}) are in Dispatch › Reservations.", book.currentPolicy.version)}</span>
        <Link className="dash-btn small ghost" to="/dispatch?tab=reservations">{tr("Open reservation settings")}</Link>
      </p>

      <div className="actions" aria-label={tr("Reservation views")}>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            data-command="admin.table.filter"
            type="button"
            className={view === item.id ? "primary-btn" : "secondary-btn"}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label>{tr("Find reservation")}<input
          aria-label={tr("Find reservation")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr("Reservation, rider, phone, driver, category or policy")}
        />
      </label>

      <DataTable
        head={["Reservation", "Rider", "Pickup", "Return", "Category", "Driver", "Status", "Warning", "Policy", "Zone"]}
        rowIds={rows.map((row) => row.id)}
        rows={rows.map((record) => {
          const ops = reservationOps(book, record);
          return [
            record.id,
            record.name,
            zonedLabel(ops.pickupAt, timeZoneOf(record.zoneId)),
            ops.returnPickupAt ? zonedLabel(ops.returnPickupAt, timeZoneOf(record.zoneId)) : "—",
            ops.category ?? "economy",
            record.driverId ?? "Unassigned",
            record.status,
            reservationWarning(record, ops, nowIso) ?? "—",
            ops.policy.version,
            record.zoneId,
          ];
        })}
        state={reservations.isLoading || store.loading ? "loading" : reservations.isError ? "error" : "ready"}
        onRetry={() => {
          void reservations.refetch();
          void store.refetch();
        }}
        onRow={(index) => {
          const id = rows[index]?.id;
          if (id) navigate(`/reservations/${id}`);
        }}
      />

      <div className="resv-access">
        <ScheduledAccessCard />
      </div>
    </>
  );
}
