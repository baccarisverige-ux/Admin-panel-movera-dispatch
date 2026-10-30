import { Fragment, useEffect, useState } from "react";
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
type FileView = { url: string | null; mediaType: string; error: unknown; loading: boolean };
/** v0.18.5 (owner G2-D1): the approved document and its renewal, side by side. */
type Compare = { row: DocumentRow; current: FileView; next: FileView };
const LOADING: FileView = { url: null, mediaType: "", error: null, loading: true };

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
  const [decision, setDecision] = useState<{ row: DocumentRow; kind: "approved" | "rejected"; renewal?: boolean } | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);

  useEffect(() => {
    const url = viewer?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewer?.url]);
  const currentUrl = compare?.current.url;
  const nextUrl = compare?.next.url;
  useEffect(() => () => {
    for (const url of [currentUrl, nextUrl]) if (url) URL.revokeObjectURL(url);
  }, [currentUrl, nextUrl]);

  async function fileOf(documentId: string): Promise<FileView> {
    try {
      const { blob, mediaType } = await client.blob(`/admin/documents/${encodeURIComponent(documentId)}/file`);
      return { url: URL.createObjectURL(blob), mediaType: mediaType || blob.type, error: null, loading: false };
    } catch (error) {
      return { url: null, mediaType: "", error, loading: false };
    }
  }

  /** G2-D1: the current (approved) file and the new one side by side; the new one is reviewed with its own id. */
  async function openCompare(row: DocumentRow) {
    if (!row.document || !row.renewal) return;
    setCompare({ row, current: LOADING, next: LOADING });
    const [current, next] = await Promise.all([fileOf(row.document.documentId), fileOf(row.renewal.documentId)]);
    setCompare((value) => (value && value.row.type === row.type ? { row, current, next } : value));
  }

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
                // G2-D1: with a renewal the new upload is reviewed (Compare and review), not the current document.
                const canDecide = Boolean(uploaded && mayReview && row.status !== "approved" && !adminCheck && !row.renewal);
                // v0.17.0 (owner items 8, 13): the info session is held by Movera; the driver sees "Waiting for Movera".
                const canMarkHeld = Boolean(adminCheck && mayReview && driverId && row.status !== "approved");
                const renewal = row.renewal;
                const renewalWaiting = renewal?.status === "in_review";
                return (
                  <Fragment key={row.type}>
                  <tr data-document-type={row.type}>
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
                      {renewal && mayReview ? <button data-command="admin.server.documentOpen" type="button" className="link-action" onClick={() => void openCompare(row)}>{renewalWaiting ? tr("Compare and review") : tr("Compare")}</button> : null}
                    </td>
                  </tr>
                  {renewal ? (
                    <tr className="live-renewal-row" data-renewal-of={row.type} data-testid="renewal-row">
                      <td colSpan={4}>
                        <span className={renewalWaiting ? "chip warn" : "chip"}>{renewalWaiting ? tr("Renewal waiting") : tr("Renewal rejected")}</span>{" "}
                        {renewalWaiting
                          ? trn("New document waiting for review – the current one stays valid until {0}.", <DateText value={row.document?.expiresAt} />)
                          : trn("The new document was rejected – the current one stays valid until {0}.", <DateText value={row.document?.expiresAt} />)}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
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

      <Modal open={Boolean(compare)} title={compare ? tr("{0}: current and new", [name(compare.row)]) : ""} onClose={() => setCompare(null)}>
        {compare ? (
          <div className="live-compare" data-testid="renewal-compare">
            <figure className="live-compare-side" data-side="current">
              <figcaption><strong>{tr("Current")}</strong> · <Status code={compare.row.status} /> · {trn("valid until {0}", <DateText value={compare.row.document?.expiresAt} />)}</figcaption>
              <FilePreview view={compare.current} name={name(compare.row)} type={compare.row.type} />
            </figure>
            <figure className="live-compare-side" data-side="new">
              <figcaption><strong>{tr("New")}</strong> · <Status code={compare.row.renewal?.status ?? "in_review"} />{compare.row.renewal?.expiresAt ? <> · {trn("end date sent: {0}", <DateText value={compare.row.renewal.expiresAt} />)}</> : null}</figcaption>
              <FilePreview view={compare.next} name={name(compare.row)} type={compare.row.type} />
            </figure>
          </div>
        ) : null}
        {compare && mayReview && compare.row.renewal?.status === "in_review" ? (
          <div className="actions">
            <button data-command="admin.server.documentReview" type="button" className="primary-btn" onClick={() => setDecision({ row: compare.row, kind: "approved", renewal: true })}>{tr("Approve the new one")}</button>
            <button data-command="admin.server.documentReview" type="button" className="secondary-btn" onClick={() => setDecision({ row: compare.row, kind: "rejected", renewal: true })}>{tr("Reject the new one")}</button>
          </div>
        ) : null}
      </Modal>

      <DecisionDialog
        open={Boolean(decision)}
        title={decision?.kind === "rejected" ? tr("Reject document") : tr("Approve document")}
        summary={decision ? (decision.renewal
          ? (decision.kind === "rejected"
            ? trn("Reject the new {0}. The current one stays valid until {1}; the driver sees the note.", <strong>{name(decision.row)}</strong>, <DateText value={decision.row.document?.expiresAt} />)
            : trn("Approve the new {0}. It replaces the current one (valid until {1}).", <strong>{name(decision.row)}</strong>, <DateText value={decision.row.document?.expiresAt} />))
          : (decision.kind === "rejected" ? trn("Reject {0}. The driver sees the note and uploads again.", <strong>{name(decision.row)}</strong>) : trn("Approve {0}.", <strong>{name(decision.row)}</strong>))) : null}
        confirmLabel={decision?.kind === "rejected" ? tr("Reject") : tr("Approve")}
        note={decision?.kind === "rejected" ? "required" : "optional"}
        expiry={decision?.kind === "approved"}
        expiryRequired={Boolean(decision && expiring.has(decision.row.type))}
        {...(decision && countryDoc?.validMonths?.[decision.row.type] ? { validMonths: countryDoc.validMonths[decision.row.type] } : {})}
        danger={decision?.kind === "rejected"}
        onClose={() => setDecision(null)}
        onConfirm={async ({ note, expiresAt, issuedAt }) => {
          // G2-D1: a renewal is reviewed with its own documentId; approving it moves its file onto the approved one.
          if (!decision) return;
          const target = decision.renewal ? decision.row.renewal : decision.row.document;
          if (!target) return;
          await client.post<DocumentRecord>(`/admin/documents/${encodeURIComponent(target.documentId)}/review`, {
            decision: decision.kind,
            ...(note ? { note } : {}),
            ...(issuedAt ? { issuedAt: new Date(`${issuedAt}T00:00:00Z`).toISOString() } : {}),
            ...(expiresAt ? { expiresAt } : {}),
          });
          setViewer(null);
          setCompare(null);
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

/** One file in the window: a picture, a PDF, or a download link for anything else. */
function FilePreview({ view, name, type }: { view: FileView; name: string; type: string }) {
  if (view.loading) return <p className="state-line">{tr("Loading the file.")}</p>;
  if (view.error) return <ErrorLine error={view.error} />;
  if (!view.url) return null;
  const kind = viewableMediaType(view.mediaType);
  if (kind === "image") return <img className="live-file" src={view.url} alt={name} />;
  if (kind === "pdf") return <iframe className="live-file live-pdf" src={view.url} title={name} />;
  return (
    <p className="state-line">
      {tr("This file type cannot be shown here.")}{" "}
      <a className="link-action" href={view.url} download={type}>{tr("Download")}</a>
    </p>
  );
}
