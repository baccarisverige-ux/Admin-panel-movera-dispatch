import { useMemo, useState, type ReactNode } from "react";
import { LiveListBar } from "../live/LiveListBar";
import { useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, Camera, Car, CheckCircle2, FileWarning, PauseCircle, Settings2 } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { emptyDriverOpsBook, driverOps, vehicleOps, type DriverOpsBook } from "../drivers/ops";
import { vehicleBlock } from "../drivers/gate";
import { overallHealth, type DocHealth } from "../fleet/documents";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { CATEGORY_LABELS, VEHICLE_RULES_KEY, carDocs, countryOfZone, emptyVehicleRules, fits, normalizeVehicleRules, photosOf, shouldHold, type VehicleRules } from "../vehicles/rules";
import { VehicleRulesView } from "../vehicles/RulesView";
import { DataTable } from "../ui/DataTable";

const VIEWS = [
  { id: "all", label: "All" },
  { id: "eligible", label: "Eligible" },
  { id: "ineligible", label: "Ineligible" },
  { id: "on_hold", label: "On hold" },
  { id: "expiring", label: "Papers expire soon" },
  { id: "invalid", label: "Papers missing or expired" },
  { id: "photos", label: "Photos to review" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const VIEW_ICON: Record<ViewId, ReactNode> = {
  all: <Car size={16} />,
  eligible: <CheckCircle2 size={16} />,
  ineligible: <AlertTriangle size={16} />,
  on_hold: <PauseCircle size={16} />,
  expiring: <FileWarning size={16} />,
  invalid: <FileWarning size={16} />,
  photos: <Camera size={16} />,
};
const VIEW_TONE: Record<ViewId, string> = { all: "blue", eligible: "green", ineligible: "orange", on_hold: "grey", expiring: "amber", invalid: "red", photos: "violet" };
const HEALTH_TEXT: Record<DocHealth, string> = { valid: "Papers OK", expiring: "Expires soon", invalid: "Missing or expired", review: "Waiting review" };

export function FleetPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const scope = useMarketScope();
  const vehicles = useRecords("vehicles", null);
  const drivers = useRecords("drivers", null);
  const fleets = useRecords("fleets", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const rulesSlice = useSlice<VehicleRules>(VEHICLE_RULES_KEY, emptyVehicleRules());
  const rules = normalizeVehicleRules(rulesSlice.value);
  const view = (VIEWS.find((item) => item.id === params.get("show"))?.id ?? "all") as ViewId;
  const [now] = useState(() => Date.now());

  const rows = useMemo(() => {
    const fleetPartnerId = agent?.scope.fleetPartnerId;
    const byId = new Map((drivers.data ?? []).map((row) => [row.id, row]));
    return (vehicles.data ?? [])
      .filter((vehicle) => !fleetPartnerId || vehicle.fleetId === fleetPartnerId)
      .map((record) => {
        const profile = vehicleOps(store.value, record);
        const driver = record.driverId ? byId.get(record.driverId) : undefined;
        const dops = driver ? driverOps(store.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status }) : null;
        const docs = carDocs(profile, dops ? { vehicle_insurance: dops.documents.vehicle_insurance, vehicle_registration: dops.documents.vehicle_registration } : {}, now, rules.countries[countryOfZone(record.zoneId)].warnDays);
        const health = overallHealth({ valid: 0, expiring: docs.filter((doc) => doc.health === "expiring").length, invalid: docs.filter((doc) => doc.health === "invalid").length, review: docs.filter((doc) => doc.health === "review").length });
        const country = rules.countries[countryOfZone(record.zoneId)];
        const car = { year: profile.year, seats: profile.seats, fuel: profile.fuel, category: profile.category };
        const photos = photosOf(rules, record.id);
        const photosWaiting = Object.values(photos).filter((photo) => photo.status !== "approved").length;
        return { record, profile, driver, docs, health, fitsList: fits(car, country), photosWaiting, hold: shouldHold(docs, country), issue: vehicleBlock(car) };
      });
  }, [agent?.scope.fleetPartnerId, vehicles.data, drivers.data, store.value, rules, now]);

  const inView = (row: (typeof rows)[number], id: ViewId) => {
    if (id === "all") return true;
    if (id === "expiring") return row.health === "expiring";
    if (id === "invalid") return row.health === "invalid";
    if (id === "photos") return row.photosWaiting > 0;
    return row.record.status === id;
  };
  const shown = rows.filter((row) => inView(row, view));
  const editable = Boolean(agent && can(agent.role, "vehicles.edit"));
  const set = (patch: Record<string, string | null>) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    return next;
  }, { replace: true });

  if (vehicles.isLoading || fleets.isLoading || store.loading) return <p className="state-line">Loading vehicles.</p>;

  if (params.get("view") === "rules") {
    return (
      <div className="dx-page vh-page">
        <header className="dx-head">
          <button data-command="admin.vehicle.view" type="button" className="dash-btn ghost dx-back" onClick={() => set({ view: null })}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <div className="dx-head-text">
            <h2>Vehicle rules for {scope.market.name}</h2>
            <p>Which car fits which category, when papers count as expiring, and what happens when they run out.</p>
          </div>
        </header>
        <VehicleRulesView rules={rules} country={scope.market.id} cars={rows.filter((row) => countryOfZone(row.record.zoneId) === scope.market.id).map((row) => ({ year: row.profile.year, seats: row.profile.seats, fuel: row.profile.fuel, category: row.profile.category }))} editable={editable} />
      </div>
    );
  }

  return (
    <div className="dx-page vh-page">
      <header className="dx-head">
        <button data-command="admin.vehicle.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>Vehicles</h2>
          <p>
            {shown.length} vehicles in this view. Eligibility uses year, seats, fuel/category rules, registration review and account state.
            {agent?.scope.fleetPartnerId ? ` Fleet partner scope: ${agent.scope.fleetPartnerId}.` : ""}
          </p>
        </div>
        <button data-command="admin.vehicle.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "rules" })}><Settings2 size={14} aria-hidden="true" /> Vehicle rules</button>
      </header>

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => String(value)}
        cards={[
          { id: "all", label: "Vehicles", value: rows.length, previous: null, format: "count", info: "Every car in your country and zones." },
          { id: "ok", label: "Eligible", value: rows.filter((row) => row.record.status === "eligible").length, previous: null, format: "count", info: "Cars that can take rides now." },
          { id: "soon", label: "Papers expire soon", value: rows.filter((row) => row.health === "expiring").length, previous: null, format: "count", info: `Insurance or inspection runs out within the warning time (${rules.countries[scope.market.id].warnDays} days).`, goodDown: true },
          { id: "bad", label: "Papers missing or expired", value: rows.filter((row) => row.health === "invalid").length, previous: null, format: "count", info: "Insurance, inspection or registration is missing, wrong or expired.", goodDown: true },
          { id: "hold", label: "Should be on hold", value: rows.filter((row) => row.hold && row.record.status !== "on_hold").length, previous: null, format: "count", info: "Expired insurance or inspection, still in service. Auto hold is in Vehicle rules.", goodDown: true },
          { id: "photos", label: "Photos to review", value: rows.filter((row) => row.photosWaiting > 0).length, previous: null, format: "count", info: "Cars with a photo waiting or rejected." },
        ]}
      />

      <nav className="vh-groups" aria-label="Vehicle views">
        {VIEWS.map((item) => (
          <button key={item.id} data-command="admin.table.filter" type="button" className={`vh-group ${VIEW_TONE[item.id]}${view === item.id ? " active" : ""}`} aria-pressed={view === item.id} onClick={() => set({ show: item.id === "all" ? null : item.id })}>
            <span className="vh-group-icon" aria-hidden="true">{VIEW_ICON[item.id]}</span>
            <span className="vh-group-text"><b>{item.label}</b><small>{rows.filter((row) => inView(row, item.id)).length}</small></span>
          </button>
        ))}
      </nav>

      <p className="state-line vh-help">
        Fleet partners: {(fleets.data ?? []).map((fleet) => `${fleet.id} ${fleet.name}`).join(" · ") || "none in scope"}.
      </p>

      <LiveListBar list="vehicles" />
      <DataTable
          serverSearch="vehicles"
        head={["Vehicle", "Plate", "Car", "Driver", "Fleet", "Category", "Fits", "Year", "Papers", "Status", "Rule check"]}
        rowIds={shown.map((row) => row.record.id)}
        rows={shown.map((row) => [
          row.record.id,
          row.record.plate ?? row.record.id,
          `${row.record.make ?? ""} ${row.record.model ?? ""}`.trim() || "–",
          row.driver ? row.driver.name : row.record.driverId ?? "Unassigned",
          row.profile.fleetId || row.record.fleetId || "Independent",
          CATEGORY_LABELS[row.profile.category] ?? row.profile.category,
          row.fitsList.map((id) => CATEGORY_LABELS[id]).join(", ") || "None",
          row.profile.year,
          HEALTH_TEXT[row.health] + (row.photosWaiting ? ` · ${row.photosWaiting} photo${row.photosWaiting === 1 ? "" : "s"}` : ""),
          row.record.status,
          row.issue ?? (row.profile.registrationStatus === "approved" ? "Eligible" : `Registration ${row.profile.registrationStatus}`),
        ])}
        state={vehicles.isError ? "error" : "ready"}
        onRetry={() => void vehicles.refetch()}
        onRow={(index) => {
          const id = shown[index]?.record.id;
          if (id) navigate(`/vehicles/${id}`);
        }}
      />
    </div>
  );
}
