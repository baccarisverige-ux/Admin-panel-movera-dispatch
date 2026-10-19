import { Link, useParams } from "react-router";
import { formatZoneMoney } from "../markets/markets";
import { useRecords } from "../api/hooks";
import { statusLabel } from "../domain/labels";
import { StatusDot } from "../ui/kit";

type Kind = "payouts" | "incidents";

/** Detail address of a payout or an incident (linked from drivers, riders and alerts). */
export function RecordPage({ kind, label, list }: { kind: Kind; label: string; list: string }) {
  const params = useParams();
  const id = params.id ?? "";
  const records = useRecords(kind, null);
  const row = records.data?.find((item) => item.id === id);

  if (records.isLoading) return <p className="state-line">Loading {label.toLowerCase()}.</p>;

  if (!row) {
    return (
      <div className="page-heading">
        <div>
          <h2>
            {label} {id}
          </h2>
          <p className="state-line" data-testid="record-missing">
            No {label.toLowerCase()} {id} in this country. It may belong to another country, or the address is wrong.
          </p>
          <Link to={list}>Back</Link>
        </div>
      </div>
    );
  }

  const tone = row.status === "blocked" || row.status === "failed" || row.status?.includes("cancel") ? "red" : row.status === "queued" ? "amber" : "green";
  const open = kind === "payouts" ? `/payouts?payout=${encodeURIComponent(row.id)}` : `/incidents?case=${encodeURIComponent(row.id)}`;

  return (
    <div className="page-heading">
      <div>
        <h2>
          {label} {id}
        </h2>
        <article className="panel" data-testid="record-detail">
          <p>
            <StatusDot tone={tone}>{statusLabel(row.status)}</StatusDot>
          </p>
          {kind === "payouts" ? (
            <>
              <p>{row.name} · {formatZoneMoney(row.fareOre ?? 0, row.zoneId)} · {row.zoneId}</p>
              <p>Driver {row.driverId ? <Link to={`/drivers/${row.driverId}`}>{row.driverId}</Link> : "none"}.</p>
            </>
          ) : (
            <>
              <p>Rider {row.name} · {row.zoneId}</p>
              <p>Driver {row.driverId ? <Link to={`/drivers/${row.driverId}`}>{row.driverId}</Link> : "none"}.</p>
            </>
          )}
          <p>
            <Link to={open}>{kind === "payouts" ? "Open in Payouts" : "Open the case"}</Link>
          </p>
        </article>
        <Link to={list}>Back</Link>
      </div>
    </div>
  );
}
