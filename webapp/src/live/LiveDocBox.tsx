import { useQuery } from "@tanstack/react-query";
import { tr, trn, uiLocale } from "../i18n";
import { statusLabel } from "../domain/labels";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { documentRows, documentTypeName, liveRowHealth, requiredFor, shortDate } from "./format";
import { EXPIRY_WARNING_DAYS } from "../fleet/documents";
import type { Driver } from "./types";



/** Live driver Overview: the documents box from the server's Driver.documents (no demo values). */
export function LiveDocBox({ driverId }: { driverId: string }) {
  const live = useLiveSessionMaybe();
  const query = useQuery({ queryKey: ["live", "driver", driverId], queryFn: () => live!.client.json<Driver>(`/admin/drivers/${encodeURIComponent(driverId)}`), enabled: Boolean(live && driverId) });
  if (!live) return null;
  if (!query.data) return <p className="state-line">{query.error ? tr("Something failed.") : tr("Loading driver.")}</p>;
  const lists = requiredFor(query.data);
  const rows = documentRows([...new Set([...lists.person, ...lists.company])], query.data.documents).filter((row) => row.required);
  const now = Date.now();
  const health = (row: (typeof rows)[number]) => liveRowHealth(row, now, EXPIRY_WARNING_DAYS);
  const count = (value: string) => rows.filter((row) => health(row) === value).length;
  return (
    <div data-testid="live-doc-box">
      <div className="fd-health-big">
        <span className="h-valid">{trn("{0}Valid", <strong>{count("valid")}</strong>)}</span>
        <span className="h-expiring">{trn("{0}Expiring", <strong>{count("expiring")}</strong>)}</span>
        <span className="h-invalid">{trn("{0}Missing or wrong", <strong>{count("invalid")}</strong>)}</span>
        <span className="h-review">{trn("{0}Waiting review", <strong>{count("review")}</strong>)}</span>
      </div>
      <ul className="fd-mini-docs">
        {rows.filter((row) => health(row) !== "valid").map((row) => <li key={row.type} className={`h-${health(row)}`}><i aria-hidden="true" />{documentTypeName(row.type, undefined, query.data.country)} · {health(row) === "expiring" && row.document?.expiresAt ? trn("Until {0}", shortDate(row.document.expiresAt, uiLocale())) : statusLabel(row.status, "documentStatus")}</li>)}
      </ul>
    </div>
  );
}
