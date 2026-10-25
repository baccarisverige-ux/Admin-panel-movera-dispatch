import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { NoAccess } from "../ui/kit";
import { tr, trn, type MessageKey } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { fullName, placeLabel } from "./format";
import { DateText, DecisionDialog, ErrorLine, Field, Status, isVersionMismatch } from "./ui";
import { REVIEW_ACTIONS, VehicleReviewButtons, type ReviewDecision } from "./VehicleReview";
import type { Fleet, FleetDriver, FleetView } from "./types";

const STALE: MessageKey = "Someone else changed this record. It was reloaded; check it and try again.";

/**
 * GET /api/v1/admin/fleets/{fleetId} → FleetView: the company, its owner, the join code (after approval), Approve /
 * Reject / Block, New code, the linked drivers (Remove from fleet) and the cars (Approve / Reject / Block).
 */
export function LiveFleetDetailPage() {
  const { ownerId: fleetId = "" } = useParams();
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "fleet", fleetId];
  const [review, setReview] = useState<(typeof REVIEW_ACTIONS)[number] | null>(null);
  const [newCode, setNewCode] = useState(false);
  const [removing, setRemoving] = useState<FleetDriver | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => client.json<FleetView>(`/admin/fleets/${encodeURIComponent(fleetId)}`),
    enabled: can("drivers.read") && Boolean(fleetId),
  });
  const reload = () => void queryClient.invalidateQueries({ queryKey: key });
  const stale = () => {
    reload();
    setNotice(tr(STALE));
  };
  const setFleet = (fleet: Fleet) => {
    queryClient.setQueryData<FleetView>(key, (current) => (current ? { ...current, fleet } : current));
    setNotice(null);
    void queryClient.invalidateQueries({ queryKey: ["live", "fleets"] });
  };

  if (!can("drivers.read")) return <NoAccess />;
  if (query.isLoading) return <p className="state-line">{tr("Loading fleet.")}</p>;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundRecord kind="Fleet" list="/fleets" listLabel="Fleet owners" />;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;

  const { fleet, drivers, vehicles } = query.data;
  const mayAct = can("drivers.activate");

  async function copyCode() {
    if (!fleet.code) return;
    try {
      await navigator.clipboard.writeText(fleet.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="crumb"><Link to="/fleets">{tr("Fleet owners")}</Link> · {fleet.fleetId}</p>
          <h2>{fleet.name}</h2>
          <p><Status code={fleet.status} /> · {placeLabel(fleet.country, fleet.cityId)} · {trn("{0} drivers, {1} vehicles", fleet.driverCount, fleet.vehicleCount)}</p>
        </div>
        {mayAct ? (
          <div className="actions">
            {REVIEW_ACTIONS.filter((item) => item.to !== fleet.status).map((item) => (
              <button key={item.to} data-command="admin.server.fleetReview" type="button" className={item.to === "approved" ? "primary-btn" : item.danger ? "secondary-btn live-danger-link" : "secondary-btn"} onClick={() => setReview(item)}>
                {tr(item.label)}
              </button>
            ))}
            {fleet.status === "approved" ? <button data-command="admin.server.fleetCode" type="button" className="secondary-btn" onClick={() => setNewCode(true)}>{tr("New code")}</button> : null}
          </div>
        ) : null}
      </div>
      {notice ? <p className="state-line" role="status">{notice}</p> : null}

      <div className="live-grid">
        <section className="panel">
          <h3>{tr("Company")}</h3>
          <div className="live-fields">
            <Field label={tr("Org. number")}>{fleet.orgNumber}</Field>
            <Field label={tr("Address")}>{fleet.address}</Field>
            <Field label={tr("Country / city")}>{placeLabel(fleet.country, fleet.cityId)}</Field>
            <Field label={tr("Signed up")}><DateText value={fleet.createdAt} /></Field>
            <Field label={tr("Version")}>{fleet.version}</Field>
          </div>
          <h3>{tr("Owner")}</h3>
          <div className="live-fields">
            <Field label={tr("Name")}><Link to={`/drivers/${encodeURIComponent(fleet.ownerDriverId)}`}>{fleet.ownerName}</Link></Field>
            <Field label={tr("E-mail")}>{fleet.ownerEmail}</Field>
          </div>
        </section>
        <section className="panel live-code-panel">
          <h3>{tr("Join code")}</h3>
          {fleet.code ? (
            <>
              <p className="live-code" data-testid="fleet-code">{fleet.code}</p>
              <p className="live-muted">{tr("A driver joins with this code plus the owner's full name and e-mail, exactly as registered.")}</p>
              <div className="actions">
                <button data-command="admin.server.copyCode" type="button" className="secondary-btn" onClick={() => void copyCode()}>{copied ? tr("Copied") : tr("Copy code")}</button>
              </div>
            </>
          ) : (
            <p className="state-line">{fleet.status === "approved" ? tr("No code yet.") : tr("The code is made when the fleet is approved.")}</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-title-row">
          <h3>{tr("Drivers")}</h3>
          <p>{trn("{0} linked", drivers.length)}</p>
        </div>
        {drivers.length === 0 ? <p className="state-line">{tr("No linked drivers.")}</p> : (
          <div className="table-wrap">
            <table className="live-table">
              <thead>
                <tr>
                  <th>{tr("Name")}</th>
                  <th>{tr("Status")}</th>
                  <th>{tr("Online")}</th>
                  <th>{tr("Vehicle")}</th>
                  <th>{tr("Linked")}</th>
                  <th>{tr("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.driverId} data-driver-id={driver.driverId}>
                    <td><Link to={`/drivers/${encodeURIComponent(driver.driverId)}`}>{fullName(driver.firstName, driver.lastName, driver.driverId)}</Link>{driver.driverId === fleet.ownerDriverId ? <span className="chip">{tr("Owner")}</span> : null}</td>
                    <td><Status code={driver.accountStatus} /></td>
                    <td><Status code={driver.onlineStatus} /></td>
                    <td>{driver.vehicleId ?? "—"}</td>
                    <td><DateText value={driver.linkedAt} /></td>
                    <td className="live-actions">
                      {mayAct && driver.driverId !== fleet.ownerDriverId ? <button data-command="admin.server.removeDriver" type="button" className="link-action live-danger-link" onClick={() => setRemoving(driver)}>{tr("Remove from fleet")}</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <h3>{tr("Vehicles")}</h3>
          <p>{trn("{0} cars", vehicles.length)}</p>
        </div>
        {vehicles.length === 0 ? <p className="state-line">{tr("No cars yet.")}</p> : (
          <div className="table-wrap">
            <table className="live-table">
              <thead>
                <tr>
                  <th>{tr("Vehicle")}</th>
                  <th>{tr("Plate")}</th>
                  <th>{tr("Seats")}</th>
                  <th>{tr("Categories")}</th>
                  <th>{tr("Status")}</th>
                  <th>{tr("Driver")}</th>
                  <th>{tr("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.vehicleId} data-vehicle-id={vehicle.vehicleId}>
                    <td><Link to={`/vehicles/${encodeURIComponent(vehicle.vehicleId)}`}>{vehicle.make} {vehicle.model} {vehicle.year}</Link> <span className="live-muted">{vehicle.color}</span></td>
                    <td>{vehicle.plate}</td>
                    <td>{vehicle.seats}</td>
                    <td>{vehicle.categoryIds.join(", ") || "—"}</td>
                    <td><Status code={vehicle.status} /></td>
                    <td>{vehicle.driverId ? <>{vehicle.driverId}{vehicle.inUse ? <span className="chip">{tr("In use")}</span> : null}</> : "—"}</td>
                    <td className="live-actions">
                      <VehicleReviewButtons
                        vehicle={vehicle}
                        onStale={stale}
                        onChanged={(next) => {
                          queryClient.setQueryData<FleetView>(key, (current) => (current ? { ...current, vehicles: current.vehicles.map((item) => (item.vehicleId === next.vehicleId ? next : item)) } : current));
                          setNotice(null);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DecisionDialog
        open={Boolean(review)}
        title={tr("Decide fleet")}
        summary={review ? (
          <>
            {trn("{0}: {1} → {2}.", <strong>{fleet.name}</strong>, <Status code={fleet.status} />, <Status code={review.to} />)}
            {review.to === "approved" ? <> {tr("The first approval makes the join code and lets drivers join.")}</> : null}
            {review.to === "blocked" ? <> {tr("Blocking takes every linked driver offline and withdraws their offers.")}</> : null}
          </>
        ) : null}
        confirmLabel={review ? tr(review.label) : ""}
        note={review?.to === "blocked" ? "required" : "optional"}
        danger={Boolean(review?.danger)}
        onClose={() => setReview(null)}
        onConfirm={async ({ note }) => {
          if (!review) return;
          try {
            setFleet(await client.post<Fleet>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/review`, { expectedVersion: fleet.version, decision: review.to as ReviewDecision, ...(note ? { note } : {}) }));
          } catch (error) {
            if (isVersionMismatch(error)) stale();
            throw error;
          }
        }}
      />

      <DecisionDialog
        open={newCode}
        title={tr("New join code")}
        summary={tr("A new code is made and the old one stops working at once. Drivers already linked stay linked.")}
        confirmLabel={tr("Make a new code")}
        note="none"
        danger
        onClose={() => setNewCode(false)}
        onConfirm={async () => {
          try {
            setFleet(await client.post<Fleet>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/code`, { expectedVersion: fleet.version }));
          } catch (error) {
            if (isVersionMismatch(error)) stale();
            throw error;
          }
        }}
      />

      <DecisionDialog
        open={Boolean(removing)}
        title={tr("Remove from fleet")}
        summary={removing ? trn("Remove {0} from {1}. The car is released, the driver goes offline and may join another fleet with a new code.", <strong>{fullName(removing.firstName, removing.lastName, removing.driverId)}</strong>, <strong>{fleet.name}</strong>) : null}
        confirmLabel={tr("Remove from fleet")}
        note="none"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await client.post<void>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/drivers/${encodeURIComponent(removing.driverId)}/remove`);
          reload();
          void queryClient.invalidateQueries({ queryKey: ["live", "drivers"] });
        }}
      />
    </>
  );
}
