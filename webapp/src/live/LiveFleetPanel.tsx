import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { useRecords } from "../api/hooks";
import { tr, trn, type MessageKey } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { fullName } from "./format";
import { DateText, DecisionDialog, ErrorLine, Status, isVersionMismatch } from "./ui";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import type { Fleet, FleetDriver, FleetInvitation, FleetView } from "./types";

const STALE: MessageKey = "Someone else changed this record. It was reloaded; check it and try again.";

type InvitationDecision = { action: "accept" | "cancel"; invitation: FleetInvitation };

/** Who the invitation concerns: the driver (a link), or the invited number while nobody has signed up with it. */
function InvitationWho({ invitation }: { invitation: FleetInvitation }) {
  if (invitation.driverId) return <Link to={`/drivers/${encodeURIComponent(invitation.driverId)}`}>{invitation.driverName || invitation.driverId}</Link>;
  return (
    <>
      {invitation.phone ?? "—"} <span className="live-muted">{tr("not signed up yet")}</span>
    </>
  );
}

/**
 * Live builds only, on the demo fleet owner page: the owner's fleet from GET /admin/fleets/{fleetId} with the join
 * code (Copy, New code), the pending invitations (Accept, Cancel; an expired one says so) and the linked drivers
 * (Remove from fleet). The demo page above keeps its own look.
 */
export function LiveFleetPanel({ ownerId }: { ownerId: string }) {
  const live = useLiveSessionMaybe();
  const fleets = useRecords("fleets", null);
  if (!live) return null;
  const fleetId = (fleets.data ?? []).find((row) => row.ownerId === ownerId)?.id;
  if (!fleetId) return null;
  return <Panel fleetId={fleetId} />;
}

function Panel({ fleetId }: { fleetId: string }) {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "fleet", fleetId];
  const [newCode, setNewCode] = useState(false);
  const [removing, setRemoving] = useState<FleetDriver | null>(null);
  const [deciding, setDeciding] = useState<InvitationDecision | null>(null);
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

  if (query.isLoading) return <p className="state-line">{tr("Loading fleet.")}</p>;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;

  const { fleet, drivers } = query.data;
  const invitations = (query.data.invitations ?? []).filter((item) => item.status === "pending");
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
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      <div className="live-grid" data-testid="live-fleet">
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
          {mayAct && fleet.status === "approved" ? <div className="actions"><button data-command="admin.server.fleetCode" type="button" className="secondary-btn" onClick={() => setNewCode(true)}>{tr("New code")}</button></div> : null}
        </section>
      </div>

      <section className="panel" data-testid="fleet-invitations">
        <div className="panel-title-row">
          <h3>{tr("Pending invitations")}</h3>
          <p>{trn("{0} pending", invitations.length)}</p>
        </div>
        {invitations.length === 0 ? <p className="state-line">{tr("No pending invitations.")}</p> : (
          <div className="table-wrap">
            <table className="live-table">
              <thead>
                <tr>
                  <th>{tr("Driver")}</th>
                  <th>{tr("Direction")}</th>
                  <th>{tr("Created")}</th>
                  <th>{tr("Expires")}</th>
                  <th>{tr("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.invitationId} data-invitation-id={invitation.invitationId}>
                    <td><InvitationWho invitation={invitation} /></td>
                    <td>{invitation.direction === "driver_request" ? tr("The driver asked to join") : tr("The owner invited")}</td>
                    <td><DateText value={invitation.createdAt} /></td>
                    <td><DateText value={invitation.expiresAt} /></td>
                    <td className="live-actions">
                      {mayAct ? (
                        <>
                          <button
                            data-command="admin.server.invitationAccept"
                            type="button"
                            className="link-action"
                            disabled={!invitation.driverId}
                            title={invitation.driverId ? undefined : tr("Accept is possible once that number has signed up.")}
                            onClick={() => setDeciding({ action: "accept", invitation })}
                          >
                            {tr("Accept")}
                          </button>
                          {invitation.driverId ? null : <span className="live-muted">{tr("Accept is possible once that number has signed up.")}</span>}
                          <button data-command="admin.server.invitationCancel" type="button" className="link-action live-danger-link" onClick={() => setDeciding({ action: "cancel", invitation })}>
                            {tr("Cancel invitation")}
                          </button>
                        </>
                      ) : null}
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
        open={Boolean(deciding)}
        title={deciding?.action === "accept" ? tr("Accept invitation") : tr("Cancel invitation")}
        summary={deciding ? (
          deciding.action === "accept"
            ? trn("Accept {0} into {1}. The driver is linked, paid through the fleet, and every other pending invitation of his closes.", <strong>{deciding.invitation.driverName || deciding.invitation.driverId || deciding.invitation.phone}</strong>, <strong>{fleet.name}</strong>)
            : trn("Withdraw the invitation for {0}. Nothing links; the other side is told.", <strong>{deciding.invitation.driverName || deciding.invitation.phone || deciding.invitation.driverId}</strong>)
        ) : null}
        confirmLabel={deciding?.action === "accept" ? tr("Accept") : tr("Cancel invitation")}
        note="none"
        danger={deciding?.action === "cancel"}
        onClose={() => setDeciding(null)}
        onConfirm={async () => {
          if (!deciding) return;
          const { action, invitation } = deciding;
          try {
            await client.post<FleetInvitation>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/invitations/${encodeURIComponent(invitation.invitationId)}/${action}`);
            queryClient.setQueryData<FleetView>(key, (current) => (current ? { ...current, invitations: (current.invitations ?? []).filter((item) => item.invitationId !== invitation.invitationId) } : current));
            setNotice(null);
            reload();
            void queryClient.invalidateQueries({ queryKey: ["live", "drivers"] });
            if (invitation.driverId) void queryClient.invalidateQueries({ queryKey: ["live", "driver", invitation.driverId] });
          } catch (error) {
            // Expired, already answered or gone: the row is stale, so the fleet is reloaded while the dialog says why.
            if (error instanceof ApiError && (error.status === 404 || error.status === 409)) reload();
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
