import { Link, useParams } from "react-router";
import { formatZoneMoney } from "../markets/markets";
import { useRecords } from "../api/hooks";
import { statusLabel } from "../domain/labels";
import { CommandButton } from "../ui/CommandButton";
import { StatusDot } from "../ui/kit";

export function RecordPage({ kind, label, list }: { kind?: string; label: string; list: string }) {
  const params = useParams();
  const id = params.driverId ?? params.riderId ?? params.tripId ?? params.zoneId ?? params.id ?? "";
  const records = useRecords(kind ?? "", null);
  const row = kind ? records.data?.find((item) => item.id === id) : undefined;

  return (
    <div className="page-heading">
      <div>
        <h2>
          {label} {id}
        </h2>
        {row ? (
          <article className="panel">
            <p>
              <StatusDot tone={row.status === "blocked" || row.status?.includes("cancel") ? "red" : "green"}>{statusLabel(row.status)}</StatusDot>
            </p>
            <p>{row.name} · {row.phone || "no phone"} · {row.zoneId}</p>
            <p>Fare or wallet {formatZoneMoney(row.fareOre ?? 0, row.zoneId)}. Driver {row.driverId ?? "none"}.</p>
            {kind === "trips" ? (
              <div className="actions">
                <CommandButton command="admin.trip.cancel" className="secondary-btn" targetId={row.id} collection="trips" before={row.status} after="cancelled_by_admin" patch={{ status: "cancelled_by_admin" }}>Cancel</CommandButton>
                <CommandButton command="admin.trip.adjust" className="secondary-btn" targetId={row.id} collection="trips" before={formatZoneMoney(row.fareOre ?? 0, row.zoneId)} after={formatZoneMoney(Math.round((row.fareOre ?? 0) * 1.1), row.zoneId)} patch={{ fareOre: Math.round((row.fareOre ?? 0) * 1.1) }}>Adjust +10%</CommandButton>
                <CommandButton command="admin.trip.offer" className="secondary-btn" targetId={row.id} collection="trips" before={row.driverId ?? "none"} after="D0001" patch={{ driverId: "D0001" }}>Offer D0001</CommandButton>
              </div>
            ) : null}
            {kind === "riders" ? (
              <div className="actions">
                <CommandButton command="admin.rider.block" className="secondary-btn" targetId={row.id} collection="riders" before={row.status} after={row.status === "blocked" ? "active" : "blocked"} patch={{ status: row.status === "blocked" ? "active" : "blocked" }}>{row.status === "blocked" ? "Unblock" : "Block"}</CommandButton>
                <CommandButton command="admin.rider.signOut" className="secondary-btn" targetId={row.id} collection="riders" before="signed in" after="signed out" patch={{ status: "signed_out" }}>Sign out</CommandButton>
                <CommandButton command="admin.rider.credit" className="secondary-btn" targetId={row.id} collection="riders" before={formatZoneMoney(row.fareOre ?? 0, row.zoneId)} after={formatZoneMoney((row.fareOre ?? 0) + 10000, row.zoneId)} patch={{ fareOre: (row.fareOre ?? 0) + 10000 }}>Credit {formatZoneMoney(10000, row.zoneId)}</CommandButton>
                <CommandButton command="admin.rider.privacy" className="primary-btn" targetId={row.id} collection="riders" before={row.status} after="privacy" patch={{ status: "privacy" }}>Privacy step</CommandButton>
              </div>
            ) : null}
          </article>
        ) : (
          <p>Demo data. This address stays after refresh.</p>
        )}
        <Link to={list}>Back</Link>
      </div>
    </div>
  );
}
