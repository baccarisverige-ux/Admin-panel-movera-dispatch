import { Link, useParams } from "react-router";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { formatZoneMoney } from "../markets/markets";
import { useRecords } from "../api/hooks";
import { statusLabel } from "../domain/labels";
import { StatusDot } from "../ui/kit";
import { trn, tr } from "../i18n";

type Kind = "payouts" | "incidents";

/** Detail address of a payout or an incident (linked from drivers, riders and alerts). */
export function RecordPage({ kind, label, list }: { kind: Kind; label: string; list: string }) {
  const params = useParams();
  const id = params.id ?? "";
  const records = useRecords(kind, null);
  const row = records.data?.find((item) => item.id === id);

  if (records.isLoading) return <p className="state-line">{trn("Loading {0}.", label.toLowerCase())}</p>;

  if (!row) {
    return <NotFoundRecord kind={label} id={id} list={list} listLabel={`${label.toLowerCase()}s`} />;
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
              <p>{trn("Driver {0}.", row.driverId ? <Link to={`/drivers/${row.driverId}`}>{row.driverId}</Link> : tr("none"))}</p>
            </>
          ) : (
            <>
              <p>{trn("Rider {0} · {1}", row.name, row.zoneId)}</p>
              <p>{trn("Driver {0}.", row.driverId ? <Link to={`/drivers/${row.driverId}`}>{row.driverId}</Link> : tr("none"))}</p>
            </>
          )}
          <p>
            <Link to={open}>{kind === "payouts" ? tr("Open in Payouts") : tr("Open the case")}</Link>
          </p>
        </article>
        <Link to={list}>{tr("Back")}</Link>
      </div>
    </div>
  );
}
