import { Link, useNavigate } from "react-router";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { RIDE_CHECK_KEY, openCheck } from "../safety/rideCheck";
import { CommandButton } from "../ui/CommandButton";
import { useAlertsData } from "./AlertsContext";
import type { OpenAlert } from "./engine";
import { trx } from "../i18n";

/** Open a ride check alert: the first admin to open it stops the banner for everyone. */
export function OpenRideCheck({ alert, label, className = "dash-btn small" }: { alert: OpenAlert; label: string; className?: string }) {
  const data = useAlertsData();
  const { agent } = useSession();
  const navigate = useNavigate();
  const ops = data.rideCheck.ops;
  const id = alert.rideCheckId ?? "";
  const check = data.rideCheck.checks.find((item) => item.id === id);
  // The safety team opens the case; a dispatcher, who cannot open Incidents, opens the trip.
  const to = agent && can(agent.role, "incidents.read") ? alert.path : check ? `/trips/${check.tripId}` : "/alerts";
  if (!id || ops.opened[id]) return <Link className={className} to={to}>{trx(label)}</Link>;
  return (
    <CommandButton command="admin.rideCheck.open" className={className} targetId={id} scope={alert.zoneId ?? "all"} confirmTarget={false} before="new" after="opened" sliceKey={RIDE_CHECK_KEY} value={openCheck(ops, id, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={ops.draftRev} disabled={data.rideCheck.loading} onDone={() => navigate(to)}>
      {trx(label)}
    </CommandButton>
  );
}
