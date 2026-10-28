import type { CSSProperties } from "react";
import { formatDateTime, tr } from "../i18n";

/** One row of GET /admin/content/legal/acceptances (contract v0.10.0 §19, server src/content/routes.ts). */
export type Acceptance = { actor: "rider" | "driver"; subjectId: string; zoneId: string; contentVersion: number; acceptedAt: string };

const cell: CSSProperties = { padding: "6px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" };

/** "28 okt. 09:15" in the admin's language. */
export function acceptedAt(at: string): string {
  return formatDateTime(at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Content › Terms and privacy (live): who accepted which version of the terms, and when. Fits 390 px without side scroll. */
export function AcceptanceTable({ rows }: { rows: readonly Acceptance[] }) {
  return (
    <table className="data-table" data-testid="live-acceptances" style={{ width: "100%", minWidth: 0, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
      <colgroup><col style={{ width: "50%" }} /><col style={{ width: "50%" }} /></colgroup>
      <thead><tr><th scope="col" style={cell}>{tr("Who")}</th><th scope="col" style={cell}>{tr("Accepted")}</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.actor}-${row.subjectId}-${row.contentVersion}`}>
            <td style={cell}><b>{row.actor === "driver" ? tr("Driver") : tr("Rider")}</b><br /><small title={row.subjectId} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{row.subjectId}</small></td>
            <td style={cell} title={row.acceptedAt}><time dateTime={row.acceptedAt}>{acceptedAt(row.acceptedAt)}</time><br /><small>{tr("Version")} {row.contentVersion}</small></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
