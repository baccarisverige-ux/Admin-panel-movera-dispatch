import { useQuery } from "@tanstack/react-query";
import { tr, trn } from "../i18n";
import { statusLabel } from "../domain/labels";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { documentRows, documentTypeName, requiredFor } from "./format";
import type { Driver } from "./types";

const HEALTH: Record<string, string> = { approved: "valid", in_review: "review", expired: "invalid", rejected: "invalid", missing: "invalid" };

/** Live driver Overview: the documents box from the server's Driver.documents (no demo values). */
export function LiveDocBox({ driverId }: { driverId: string }) {
  const live = useLiveSessionMaybe();
  const query = useQuery({ queryKey: ["live", "driver", driverId], queryFn: () => live!.client.json<Driver>(`/admin/drivers/${encodeURIComponent(driverId)}`), enabled: Boolean(live && driverId) });
  if (!live) return null;
  if (!query.data) return <p className="state-line">{query.error ? tr("Something failed.") : tr("Loading driver.")}</p>;
  const lists = requiredFor(query.data);
  const rows = documentRows([...new Set([...lists.person, ...lists.company])], query.data.documents).filter((row) => row.required);
  const count = (health: string) => rows.filter((row) => HEALTH[row.status] === health).length;
  return (
    <div data-testid="live-doc-box">
      <div className="fd-health-big">
        <span className="h-valid">{trn("{0}Valid", <strong>{count("valid")}</strong>)}</span>
        <span className="h-invalid">{trn("{0}Missing or wrong", <strong>{count("invalid")}</strong>)}</span>
        <span className="h-review">{trn("{0}Waiting review", <strong>{count("review")}</strong>)}</span>
      </div>
      <ul className="fd-mini-docs">
        {rows.filter((row) => row.status !== "approved").map((row) => <li key={row.type} className={`h-${HEALTH[row.status] ?? "invalid"}`}><i aria-hidden="true" />{documentTypeName(row.type)} · {statusLabel(row.status, "documentStatus")}</li>)}
      </ul>
    </div>
  );
}
