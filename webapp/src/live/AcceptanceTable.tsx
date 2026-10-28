import { tr } from "../i18n";

/** One row of GET /admin/content/legal/acceptances (contract v0.10.0 §19). */
export type Acceptance = { userId?: string; name?: string; app?: string; role?: string; contentVersion: number; acceptedAt: string };

/** Content › Terms and privacy (live): who accepted which version of the terms, and when. */
export function AcceptanceTable({ rows }: { rows: readonly Acceptance[] }) {
  return (
    <div style={{ overflowX: "auto" }}><table className="data-table" data-testid="live-acceptances">
      <thead><tr><th scope="col">{tr("Name")}</th><th scope="col">{tr("App")}</th><th scope="col">{tr("Version")}</th><th scope="col">{tr("Accepted")}</th></tr></thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.userId ?? index}-${row.contentVersion}`}>
            <td>{row.name ?? row.userId ?? ""}</td>
            <td>{(row.app ?? row.role) === "driver" ? tr("Driver app") : tr("Rider app")}</td>
            <td>v{row.contentVersion}</td>
            <td>{row.acceptedAt.slice(0, 16).replace("T", " ")}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
