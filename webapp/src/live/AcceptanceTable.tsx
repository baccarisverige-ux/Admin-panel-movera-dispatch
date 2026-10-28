import { tr } from "../i18n";

/** One row of GET /admin/content/legal/acceptances (contract v0.10.0 §19, server src/content/routes.ts). */
export type Acceptance = { actor: "rider" | "driver"; subjectId: string; zoneId: string; contentVersion: number; acceptedAt: string };

/** Content › Terms and privacy (live): who accepted which version of the terms, and when. */
export function AcceptanceTable({ rows }: { rows: readonly Acceptance[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" data-testid="live-acceptances">
        <thead><tr><th scope="col">{tr("Who")}</th><th scope="col">{tr("ID")}</th><th scope="col">{tr("Version")}</th><th scope="col">{tr("Accepted")}</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.actor}-${row.subjectId}-${row.contentVersion}`}>
              <td>{row.actor === "driver" ? tr("Driver") : tr("Rider")}</td>
              <td>{row.subjectId}</td>
              <td>v{row.contentVersion}</td>
              <td>{row.acceptedAt.slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
