import { Fragment, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../ui/Tabs";
import { NoAccess } from "../ui/kit";
import { tr, trn } from "../i18n";
import { DocumentsTable } from "./DocumentsTable";
import { useLiveSession } from "./LiveSessionContext";
import { listQuery, requiredForVehicle } from "./format";
import { ErrorLine, LoadMore, SearchBox, Status, useLivePage } from "./ui";
import { VehicleReviewButtons } from "./VehicleReview";
import type { Vehicle } from "./types";

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "blocked", label: "Blocked" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * GET /api/v1/admin/vehicles?status&fleetId&q&cursor: every car with Approve / Reject / Block and, unfolded, its
 * documents (Open / Approve / Reject). /vehicles/:id opens the list on the car and unfolds it.
 */
export function LiveVehiclesPage() {
  const { can } = useLiveSession();
  const { id: focusId } = useParams();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find((item) => item.id === params.get("status"))?.id ?? (focusId ? "all" : "pending")) as TabId;
  const q = params.get("q") ?? "";
  const fleetId = params.get("fleetId") ?? "";
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);
  useEffect(() => setOpenId(focusId ?? null), [focusId]);
  const path = (cursor: string | null) => `/admin/vehicles${listQuery({ status: tab === "all" ? "" : tab, q, fleetId, cursor, limit: 50 })}`;
  const page = useLivePage<Vehicle>(["live", "vehicles", tab, q, fleetId], path, can("drivers.read"));
  const [notice, setNotice] = useState<string | null>(null);

  if (!can("drivers.read")) return <NoAccess />;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  const stale = () => {
    page.reload();
    setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
  };
  const replace = (next: Vehicle) => {
    queryClient.setQueriesData<{ items: Vehicle[]; nextCursor: string | null }>({ queryKey: ["live", "vehicles"] }, (current) => (current ? { ...current, items: current.items.map((item) => (item.vehicleId === next.vehicleId ? next : item)) } : current));
    setNotice(null);
    page.reload();
  };
  const focused = focusId ? page.items.find((item) => item.vehicleId === focusId) : undefined;

  return (
    <>
      <div className="page-heading">
        <div>
          {focusId ? <p className="crumb"><Link to="/vehicles">{tr("Vehicles")}</Link> · {focusId}</p> : null}
          <h2>{tr("Vehicles")}</h2>
          <p>{tr("Cars added by fleet accounts. Each car is approved here before a driver can pick it and go online.")}</p>
        </div>
      </div>
      {focusId && !page.isLoading && !focused ? <p className="state-line">{trn("Vehicle {0} is not in this list. Search for its plate or choose another tab.", <b>{focusId}</b>)}</p> : null}
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      <Tabs tabs={TABS} activeId={tab} onChange={(id) => setParam("status", id === "pending" ? "" : id)} />
      <SearchBox value={q} onChange={(next) => setParam("q", next)} placeholder={tr("Search by plate, make or model")} />
      {page.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      <ErrorLine error={page.error} onRetry={page.reload} />
      {!page.isLoading && !page.error && page.items.length === 0 ? <p className="state-line">{tr("No vehicles match.")}</p> : null}
      {page.items.length > 0 ? (
        <div className="table-wrap">
          <table className="live-table">
            <thead>
              <tr>
                <th>{tr("Vehicle")}</th>
                <th>{tr("Plate")}</th>
                <th>{tr("Seats")}</th>
                <th>{tr("Categories")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Fleet")}</th>
                <th>{tr("Driver")}</th>
                <th>{tr("Documents")}</th>
                <th>{tr("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((vehicle) => {
                const required = requiredForVehicle(vehicle);
                const approved = required.filter((type) => vehicle.documents?.some((document) => document.type === type && document.status === "approved")).length;
                const open = openId === vehicle.vehicleId;
                return (
                  <Fragment key={vehicle.vehicleId}>
                    <tr data-vehicle-id={vehicle.vehicleId} className={open ? "live-open" : undefined}>
                      <td>{vehicle.make} {vehicle.model} {vehicle.year} <span className="live-muted">{vehicle.color}</span></td>
                      <td>{vehicle.plate}</td>
                      <td>{vehicle.seats}</td>
                      <td>{vehicle.categoryIds.join(", ") || "—"}</td>
                      <td><Status code={vehicle.status} /></td>
                      <td>{vehicle.fleetId ? <Link to={`/fleets/${encodeURIComponent(vehicle.fleetId)}`}>{vehicle.fleetId}</Link> : "—"}</td>
                      <td>{vehicle.driverId ? <Link to={`/drivers/${encodeURIComponent(vehicle.driverId)}`}>{vehicle.driverId}</Link> : "—"}{vehicle.inUse ? <span className="chip">{tr("In use")}</span> : null}</td>
                      <td>
                        <button data-command="admin.server.vehicleDocuments" type="button" className="link-action" aria-expanded={open} onClick={() => setOpenId(open ? null : vehicle.vehicleId)}>
                          {required.length ? `${approved}/${required.length}` : tr("Documents")}
                        </button>
                      </td>
                      <td className="live-actions"><VehicleReviewButtons vehicle={vehicle} onChanged={replace} onStale={stale} /></td>
                    </tr>
                    {open ? (
                      <tr className="live-details">
                        <td colSpan={9}>
                          <DocumentsTable title={tr("Documents of the car")} required={required} documents={vehicle.documents} onChanged={page.reload} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <LoadMore hasMore={page.hasMore} loading={page.loadingMore} onClick={() => void page.loadMore()} />
    </>
  );
}
