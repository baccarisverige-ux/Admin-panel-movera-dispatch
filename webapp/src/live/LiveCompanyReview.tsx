import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { tr, trn } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { DecisionDialog, ErrorLine, Status } from "./ui";
import { fleetCarLine, fleetNeedsCarOn } from "./fleetNeedsCar";
import type { Fleet, FleetView } from "./types";

/**
 * Contract v0.17.0 §25 (owner item 7: "his account become like fleet company account … and wait for admin approv"): a
 * driver who pressed "Start my own company" is a fleet account on hold with a new pending fleet. The admin approves the
 * company here like any new fleet (POST /admin/fleets/{fleetId}/review), then activates the account on the driver's page.
 */
export function LiveCompanyReview({ fleetId }: { fleetId: string }) {
  const { client, can } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "fleet", fleetId];
  const query = useQuery({ queryKey: key, queryFn: () => client.json<FleetView>(`/admin/fleets/${encodeURIComponent(fleetId)}`), enabled: Boolean(fleetId) });
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  // v0.18.159 (contract.json#fleetNeedsCar): the country's "Fleet needs at least 1 car before approval" (unreadable = on).
  const country = query.data?.fleet.country;
  const setting = useQuery({ queryKey: ["live", "onboarding-setting", country], queryFn: () => client.json<{ document?: { fleetNeedsCarForApproval?: unknown } }>(`/admin/config/onboarding?country=${encodeURIComponent(country ?? "")}`), enabled: Boolean(country), retry: false });
  if (query.isLoading) return <p className="state-line">{tr("Loading the company.")}</p>;
  if (query.error || !query.data) return <ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} />;
  const fleet = query.data.fleet;
  const pending = fleet.status === "pending";
  const mayDecide = can("drivers.activate") && fleet.status !== "approved";
  const cars = fleetCarLine(query.data.vehicles?.length ?? fleet.vehicleCount ?? 0, fleetNeedsCarOn(setting.data?.document));
  return (
    <section className="panel live-company" data-testid="company-review" data-fleet-status={fleet.status} aria-label={tr("New company")}>
      <div className="panel-title-row">
        <h4><Building2 size={14} aria-hidden="true" /> {tr("Company")}: {fleet.name}</h4>
        <Status code={fleet.status} />
      </div>
      <p className="fd-sub">{trn("Org. number {0}. Approve the company like a new fleet; the account is activated when its documents are approved.", fleet.orgNumber)}</p>
      {pending ? <p className="fd-banner amber">{tr("Waiting for Movera: the company has not been approved yet.")}</p> : null}
      <p className={`fd-sub fleet-cars-line ${cars.tone}`} data-testid="fleet-cars-line" data-tone={cars.tone}><strong>{tr("Cars")}</strong> · {cars.text}</p>
      {cars.locked && mayDecide ? <p className="fd-banner red" data-testid="fleet-approve-locked">{cars.lockText}</p> : null}
      {mayDecide ? (
        <div className="actions">
          <button data-command="admin.server.fleetReview" type="button" className="primary-btn" disabled={cars.locked} aria-disabled={cars.locked} title={cars.locked ? cars.lockText : undefined} onClick={() => setDecision("approved")}>{tr("Approve the company")}</button>
          <button data-command="admin.server.fleetReview" type="button" className="secondary-btn" onClick={() => setDecision("rejected")}>{tr("Reject the company")}</button>
        </div>
      ) : null}
      <DecisionDialog
        open={Boolean(decision)}
        command="admin.server.fleetReview"
        title={decision === "rejected" ? tr("Reject the company") : tr("Approve the company")}
        summary={trn("{0} · {1}", fleet.name, fleet.orgNumber)}
        confirmLabel={decision === "rejected" ? tr("Reject") : tr("Approve")}
        note={decision === "rejected" ? "required" : "optional"}
        danger={decision === "rejected"}
        onClose={() => setDecision(null)}
        onConfirm={async ({ note }) => {
          if (!decision) return;
          await client.post<Fleet>(`/admin/fleets/${encodeURIComponent(fleet.fleetId)}/review`, { expectedVersion: fleet.version, decision, ...(note ? { note } : {}) });
          void queryClient.invalidateQueries({ queryKey: key });
          void queryClient.invalidateQueries({ queryKey: ["records"] });
        }}
      />
    </section>
  );
}
