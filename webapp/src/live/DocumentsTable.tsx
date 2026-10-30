import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { tr, trn } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { useSlice } from "../api/hooks";
import { ONBOARDING_SETTINGS_KEY, emptySettingsBook, normalizeSettingsBook } from "../drivers/onboardingSettings";
import type { MarketId } from "../markets/markets";
import { documentHasFile, documentRows, documentTypeName, isAdminCheck, viewableMediaType, type DocumentRow } from "./format";
import { DateText, DecisionDialog, ErrorLine, Status } from "./ui";
import type { DocumentRecord, DocumentSummary } from "./types";

type Props = {
  /** The required types, in the contract's order. */
  required: readonly string[];
  documents: readonly DocumentSummary[] | undefined;
  /** Called after a decision so the owner (driver, vehicle) is reloaded. */
  onChanged: () => void;
  title?: string;
  /** The account the documents belong to: an admin_check type is marked held with POST /admin/drivers/{driverId}/documents/{type}/check. */
  driverId?: string;
  /** The country whose onboarding settings say which types expire (owner items 1, 14, 15). */
  country?: string;
};

type Viewer = { row: DocumentRow; url: string | null; mediaType: string; error: unknown; loading: boolean };

/**
 * One row per required document type (plus any extra upload): status, expiry and, for uploads, Open (the file is
 * fetched with the bearer token into a blob URL; the token never goes in a URL), Approve and Reject (a note is required).
 */
export function DocumentsTable({ required, documents, onChanged, title, driverId, country }: Props) {
  const { client, can } = useLiveSession();
  const settings = useSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook());
  const countryDoc = country && country in normalizeSettingsBook(settings.value).countries ? normalizeSettingsBook(settings.value).countries[country as MarketId].document : null;
  const expiring = new Set(countryDoc?.expiringTypes ?? []);
  const [check, setCheck] = useState<DocumentRow | null>(null);
  const mayReview = can("documents.approve");
  const rows = documentRows(required, documents);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [decision, setDecision] = useState<{ row: DocumentRow; kind: "approved" | "rejected" } | null>(null);

  useEffect(() => {
    const url = viewer?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewer?.url]);

  async function open(row: DocumentRow) {
    if (!row.document) return;
    setViewer({ row, url: null, mediaType: "", error: null, loading: true });
    try {
      const { blob, mediaType } = await client.blob(`/admin/documents/${encodeURIComponent(row.document.documentId)}/file`);
      setViewer({ row, url: URL.createObjectURL(blob), mediaType: mediaType || blob.type, error: null, loading: false });
    } catch (error) {
      setViewer({ row, url: null, mediaType: "", error, loading: false });
    }
  }

  const kind = viewer?.mediaType ? viewableMediaType(viewer.mediaType) : "download";
  const name = (row: DocumentRow) => documentTypeName(row.type, undefined, country);

  return (
    <section className="panel live-documents">
      <div className="panel-title-row">
        <h3>{title ?? tr("Documents")}</h3>
        <p>{trn("{0} of {1} approved", rows.filter((row) => row.required && row.status === "approved").length, rows.filter((row) => row.required).length)}</p>
      </div>
      {rows.length === 0 ? <p className="state-line">{tr("No documents are required.")}</p> : (
        <div className="table-wrap">
          <table className="live-table">
            <thead>
              <tr>
                <th>{tr("Document")}</th>
                <th>{tr("Status")}</th>
                <th>{tr("Valid until")}</th>
                <th>{tr("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const uploaded = row.document && row.status !== "missing";
                const adminCheck = isAdminCheck(row.type);
                const canOpen = Boolean(uploaded && documentHasFile(row.type));
                const canDecide = Boolean(uploaded && mayReview && row.status !== "approved" && !adminCheck);
                // v0.17.0 (owner items 8, 13): the info session is held by Movera; the driver sees "Waiting for Movera".
                const canMarkHeld = Boolean(adminCheck && mayReview && driverId && row.status !== "approved");
                return (
                  <tr key={row.type} data-document-type={row.type}>
                    <td>
                      {name(row)}
                      {!row.required ? <span className="chip">{tr("Extra")}</span> : null}
                    </td>
                    <td>{adminCheck && row.status !== "approved" ? <span className="chip warn" data-testid="waiting-for-movera">{tr("Waiting for Movera")}</span> : <Status code={row.status} />}{expiring.has(row.type) ? <span className="chip">{tr("Expires")}</span> : null}</td>
                    <td><DateText value={row.document?.expiresAt} /></td>
                    <td className="live-actions">
                      {canOpen && mayReview ? <button data-command="admin.server.documentOpen" type="button" className="link-action" onClick={() => void open(row)}>{tr("Open")}</button> : null}
                      {canMarkHeld ? <button data-command="admin.server.documentCheck" type="button" className="link-action" onClick={() => setCheck(row)}>{tr("Mark held")}</button> : null}
                      {canDecide ? <button data-command="admin.server.documentReview" type="button" className="link-action" onClick={() => setDecision({ row, kind: "approved" })}>{tr("Approve")}</button> : null}
                      {canDecide ? <button data-command="admin.server.documentReview" type="button" className="link-action live-danger-link" onClick={() => setDecision({ row, kind: "rejected" })}>{tr("Reject")}</button> : null}
                      {!uploaded && !adminCheck ? <span className="live-muted">{tr("Nothing uploaded yet")}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(viewer)} title={viewer ? name(viewer.row) : ""} onClose={() => setViewer(null)}>
        {viewer?.loading ? <p className="state-line">{tr("Loading the file.")}</p> : null}
        {viewer?.error ? <ErrorLine error={viewer.error} onRetry={() => void open(viewer.row)} /> : null}
        {viewer?.url && kind === "image" ? <img className="live-file" src={viewer.url} alt={name(viewer.row)} /> : null}
        {viewer?.url && kind === "pdf" ? <iframe className="live-file live-pdf" src={viewer.url} title={name(viewer.row)} /> : null}
        {viewer?.url && kind === "download" ? (
          <p className="state-line">
            {tr("This file type cannot be shown here.")}{" "}
            <a className="link-action" href={viewer.url} download={`${viewer.row.type}`}>{tr("Download")}</a>
          </p>
        ) : null}
        {viewer?.url && mayReview && viewer.row.status !== "approved" ? (
          <div className="actions">
            <button data-command="admin.server.documentReview" type="button" className="primary-btn" onClick={() => setDecision({ row: viewer.row, kind: "approved" })}>{tr("Approve")}</button>
            <button data-command="admin.server.documentReview" type="button" className="secondary-btn" onClick={() => setDecision({ row: viewer.row, kind: "rejected" })}>{tr("Reject")}</button>
          </div>
        ) : null}
      </Modal>

      <DecisionDialog
        open={Boolean(decision)}
        title={decision?.kind === "rejected" ? tr("Reject document") : tr("Approve document")}
        summary={decision ? (decision.kind === "rejected" ? trn("Reject {0}. The driver sees the note and uploads again.", <strong>{name(decision.row)}</strong>) : trn("Approve {0}.", <strong>{name(decision.row)}</strong>)) : null}
        confirmLabel={decision?.kind === "rejected" ? tr("Reject") : tr("Approve")}
        note={decision?.kind === "rejected" ? "required" : "optional"}
        expiry={decision?.kind === "approved"}
        expiryRequired={Boolean(decision && expiring.has(decision.row.type))}
        {...(decision && countryDoc?.validMonths?.[decision.row.type] ? { validMonths: countryDoc.validMonths[decision.row.type] } : {})}
        danger={decision?.kind === "rejected"}
        onClose={() => setDecision(null)}
        onConfirm={async ({ note, expiresAt, issuedAt }) => {
          if (!decision?.row.document) return;
          await client.post<DocumentRecord>(`/admin/documents/${encodeURIComponent(decision.row.document.documentId)}/review`, {
            decision: decision.kind,
            ...(note ? { note } : {}),
            ...(issuedAt ? { issuedAt: new Date(`${issuedAt}T00:00:00Z`).toISOString() } : {}),
            ...(expiresAt ? { expiresAt } : {}),
          });
          setViewer(null);
          onChanged();
        }}
      />
      <DecisionDialog
        open={Boolean(check)}
        title={tr("Mark held")}
        summary={check ? trn("{0} was held. It then counts as approved for activation.", <strong>{name(check)}</strong>) : null}
        confirmLabel={tr("Mark held")}
        note="optional"
        onClose={() => setCheck(null)}
        onConfirm={async ({ note }) => {
          if (!check || !driverId) return;
          await client.post<DocumentRecord>(`/admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(check.type)}/check`, { decision: "approved", ...(note ? { note } : {}) });
          onChanged();
        }}
      />
    </section>
  );
}
