import { useMemo, useState, type ReactNode } from "react";
import { LiveListBar } from "../live/LiveListBar";
import { useNavigate, useSearchParams } from "react-router";
import { Building2, CalendarClock, Car, PauseCircle, UserCheck, Users } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { countHealth } from "../fleet/documents";
import { useDocWarnDays } from "../drivers/useDocWarnDays";
import { emptyOwnerOpsBook, OWNER_DOCUMENTS, ownerOps, type OwnerOpsBook } from "../fleet/ownerOps";
import { ownerCode } from "../fleet/codes";
import { ContactActions, DocSummary } from "../fleet/ui";
import { marketOfZone } from "../markets/markets";
import { DataTable } from "../ui/DataTable";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On hold" },
  { id: "pending", label: "Pending" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function FleetOwnersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const owners = useRecords("fleetOwners", null);
  const fleets = useRecords("fleets", null);
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const store = useSlice<OwnerOpsBook>("fleetOwnerOps", emptyOwnerOpsBook());
  const warnDaysFor = useDocWarnDays();
  const [view, setView] = useState<View>("all");
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => (owners.data ?? []).map((owner) => {
    const ops = ownerOps(store.value, { id: owner.id, name: owner.name, status: owner.status, kind: owner.kind });
    const docs = OWNER_DOCUMENTS.map((id) => ops.documents[id]);
    const ownFleets = (fleets.data ?? []).filter((fleet) => fleet.ownerId === owner.id);
    const fleetIds = new Set(ownFleets.map((fleet) => fleet.id));
    const crew = (drivers.data ?? []).filter((driver) => driver.fleetId && fleetIds.has(driver.fleetId));
    return {
      owner,
      fleets: ownFleets,
      crew,
      cars: (vehicles.data ?? []).filter((car) => car.fleetId && fleetIds.has(car.fleetId)).length,
      counts: countHealth(docs, now, warnDaysFor(owner.zoneId)),
      total: docs.length,
    };
  }), [owners.data, fleets.data, drivers.data, vehicles.data, store.value, now, warnDaysFor]);

  const shown = rows.filter((row) => view === "all" || row.owner.status === view);
  const count = (status: string) => rows.filter((row) => row.owner.status === status).length;
  const keep = params.get("country") || params.get("scope") ? `?${params.toString()}` : "";

  return (
    <div className="fd-page">
      <div className="fd-head">
        <div>
          <h2>Fleet owners</h2>
          <p>Companies and people who own fleets. Open an owner to see their documents, each fleet and its drivers, performance and earnings.</p>
        </div>
      </div>

      <section className="fd-cards" aria-label="Fleet owner summary">
        <Card icon={<Building2 size={18} />} tone="blue" label="Fleet owners" value={rows.length} />
        <Card icon={<UserCheck size={18} />} tone="green" label="Active" value={count("active")} />
        <Card icon={<PauseCircle size={18} />} tone="amber" label="On hold" value={count("on_hold")} />
        <Card icon={<CalendarClock size={18} />} tone="violet" label="Pending approval" value={count("pending")} />
        <Card icon={<Users size={18} />} tone="aqua" label="Drivers in fleets" value={rows.reduce((sum, row) => sum + row.crew.length, 0)} />
        <Card icon={<Car size={18} />} tone="orange" label="Fleet vehicles" value={rows.reduce((sum, row) => sum + row.cars, 0)} />
      </section>

      <div className="fd-toolbar">
        <div className="fd-views" role="group" aria-label="Fleet owner views">
          {VIEWS.map((item) => (
            <button key={item.id} type="button" data-command="admin.table.filter" aria-label={item.label} aria-pressed={view === item.id} className={view === item.id ? "fd-view active" : "fd-view"} onClick={() => setView(item.id)}>
              {item.label}<span>{item.id === "all" ? rows.length : count(item.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <LiveListBar list="fleets" records="fleetOwners" />
      <DataTable
          serverSearch="fleets"
        className="fd-table"
        head={["Code", "Name", "Company", "Country", "Fleets", "Drivers", "Active drivers", "On hold", "Vehicles", "Documents", "Status", "Contact"]}
        rowIds={shown.map((row) => row.owner.id)}
        rows={shown.map(({ owner, fleets: own, crew, cars, counts, total }) => [
          ownerCode(owner),
          owner.name,
          owner.company ?? "",
          marketOfZone(owner.zoneId)?.name ?? "",
          own.map((fleet) => fleet.name).join(", ") || "No fleet yet",
          String(crew.length),
          String(crew.filter((driver) => driver.status === "active").length),
          String(crew.filter((driver) => driver.status === "on_hold").length),
          String(cars),
          <DocSummary key={`${owner.id}-docs`} counts={counts} total={total} />,
          owner.status,
          <ContactActions key={`${owner.id}-contact`} kind="owner" compact id={owner.id} name={owner.name} phone={owner.phone} zoneId={owner.zoneId} messageTo={`/fleets/${owner.id}?tab=messages`} />,
        ])}
        state={owners.isLoading ? "loading" : owners.isError ? "error" : "ready"}
        onRetry={() => void owners.refetch()}
        onRow={(index) => {
          const id = shown[index]?.owner.id;
          if (id) navigate({ pathname: `/fleets/${id}`, search: keep });
        }}
      />
    </div>
  );
}

function Card({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: number }) {
  return (
    <article className={`fd-card tone-${tone}`}>
      <span className="fd-card-icon" aria-hidden="true">{icon}</span>
      <span className="fd-card-label">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
