import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { NoAccess } from "../ui/kit";
import { tr, trn, type MessageKey } from "../i18n";
import { DocumentsTable } from "./DocumentsTable";
import { useLiveSession } from "./LiveSessionContext";
import { fullName, placeLabel, requiredFor, splitDocuments } from "./format";
import { DateText, DecisionDialog, ErrorLine, Field, Status, isVersionMismatch } from "./ui";
import type { Driver, DriverAccountStatus } from "./types";

type StatusAction = { to: DriverAccountStatus; label: MessageKey; title: MessageKey; danger: boolean };

const ACTIONS: readonly StatusAction[] = [
  { to: "active", label: "Activate", title: "Activate driver", danger: false },
  { to: "on_hold", label: "Put on hold", title: "Put driver on hold", danger: false },
  { to: "suspended", label: "Suspend", title: "Suspend driver", danger: true },
];

/**
 * GET /api/v1/admin/drivers/{driverId}: the driver's details, fleet, documents (person and, for a fleet account, company)
 * and the account actions (POST /admin/drivers/{driverId}/status with expectedVersion and a note).
 */
export function LiveDriverDetailPage() {
  const { driverId = "" } = useParams();
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<StatusAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["live", "driver", driverId],
    queryFn: () => client.json<Driver>(`/admin/drivers/${encodeURIComponent(driverId)}`),
    enabled: can("drivers.read") && Boolean(driverId),
  });
  const reload = () => void queryClient.invalidateQueries({ queryKey: ["live", "driver", driverId] });

  if (!can("drivers.read")) return <NoAccess />;
  if (query.isLoading) return <p className="state-line">{tr("Loading driver.")}</p>;
  if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundRecord kind="Driver" list="/drivers" listLabel="Drivers" />;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;

  const driver = query.data;
  const name = fullName(driver.firstName, driver.lastName, driver.driverId);
  const required = requiredFor(driver);
  const split = splitDocuments(driver.documents, required);
  const available = ACTIONS.filter((item) => item.to !== driver.accountStatus);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="crumb"><Link to="/drivers">{tr("Drivers")}</Link> · {driver.driverId}</p>
          <h2>{name}</h2>
          <p>
            <Status code={driver.accountStatus} /> · <Status code={driver.onlineStatus} />
            {driver.accountType ? <> · {driver.accountType === "fleet" ? tr("Fleet account") : tr("Driver")}</> : null}
          </p>
        </div>
        {can("drivers.activate") ? (
          <div className="actions">
            {available.map((item) => (
              <button key={item.to} data-command="admin.server.driverStatus" type="button" className={item.danger ? "secondary-btn live-danger-link" : item.to === "active" ? "primary-btn" : "secondary-btn"} onClick={() => setAction(item)}>
                {tr(item.label)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {notice ? <p className="state-line" role="status">{notice}</p> : null}

      <div className="live-grid">
        <section className="panel">
          <h3>{tr("Details")}</h3>
          <div className="live-fields">
            <Field label={tr("E-mail")}>{driver.email}</Field>
            <Field label={tr("Date of birth")}><DateText value={driver.dateOfBirth} /></Field>
            <Field label={tr("Country / city")}>{placeLabel(driver.country, driver.cityId) || "—"}</Field>
            <Field label={tr("Language")}>{driver.language}</Field>
            <Field label={tr("Zones")}>{driver.zoneIds.join(", ") || "—"}</Field>
            <Field label={tr("Categories")}>{driver.categoryIds.join(", ") || "—"}</Field>
            <Field label={tr("Vehicle")}>{driver.vehicleId ? <Link to={`/vehicles/${encodeURIComponent(driver.vehicleId)}`}>{driver.vehicleId}</Link> : "—"}</Field>
            <Field label={tr("Paid to")}>{driver.payoutTo === "fleet" ? tr("The fleet") : driver.payoutTo === "self" ? tr("Own account") : "—"}</Field>
            <Field label={tr("Terms accepted")}><DateText value={driver.termsAcceptedAt} /></Field>
            <Field label={tr("Last position")}><DateText value={driver.lastFixAt} /></Field>
            <Field label={tr("Version")}>{driver.version}</Field>
          </div>
        </section>
        <section className="panel">
          <h3>{tr("Fleet")}</h3>
          {driver.fleet ? (
            <div className="live-fields">
              <Field label={tr("Company")}><Link to={`/fleets/${encodeURIComponent(driver.fleet.fleetId)}`}>{driver.fleet.name}</Link></Field>
              <Field label={tr("Role")}>{driver.fleet.role === "owner" ? tr("Owner") : tr("Member")}</Field>
              <Field label={tr("Fleet status")}><Status code={driver.fleet.status} /></Field>
              <Field label={tr("Linked")}><DateText value={driver.fleet.linkedAt} /></Field>
            </div>
          ) : (
            <p className="state-line">{driver.accountType === "driver" ? tr("No fleet yet. The driver joins one with a fleet code.") : tr("No fleet.")}</p>
          )}
          {driver.pendingFleetInvitations ? <p className="live-muted" data-testid="pending-invitations">{tr("Pending fleet invitations: {0}", [driver.pendingFleetInvitations])}</p> : null}
        </section>
      </div>

      <DocumentsTable title={tr("Documents of the person")} required={required.person} documents={split.person} onChanged={reload} />
      {driver.accountType === "fleet" ? <DocumentsTable title={tr("Documents of the company")} required={required.company} documents={split.company} onChanged={reload} /> : null}

      <DecisionDialog
        open={Boolean(action)}
        title={action ? tr(action.title) : ""}
        summary={action ? trn("{0}: {1} → {2}. The note is written in the audit.", <strong>{name}</strong>, <Status code={driver.accountStatus} />, <Status code={action.to} />) : null}
        confirmLabel={action ? tr(action.label) : ""}
        note="required"
        danger={Boolean(action?.danger)}
        onClose={() => setAction(null)}
        onConfirm={async ({ note }) => {
          if (!action) return;
          try {
            const next = await client.post<Driver>(`/admin/drivers/${encodeURIComponent(driver.driverId)}/status`, { expectedVersion: driver.version, accountStatus: action.to, note });
            queryClient.setQueryData(["live", "driver", driverId], next);
            setNotice(null);
            void queryClient.invalidateQueries({ queryKey: ["live", "drivers"] });
          } catch (error) {
            if (isVersionMismatch(error)) {
              reload();
              setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
            }
            throw error;
          }
        }}
      />
    </>
  );
}
