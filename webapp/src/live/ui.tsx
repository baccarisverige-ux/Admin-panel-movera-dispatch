import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { statusPresentation, statusLabel } from "../domain/labels";
import { StatusDot } from "../ui/kit";
import { Modal } from "../ui/Modal";
import { tr, trx, uiLocale } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { errorText, shortDate, shortDateTime } from "./format";
import type { Page } from "./types";

/** A failed call, in words: the server's message, "Your role cannot do that." on 403, the request id when unexpected. */
export function ErrorLine({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <p className="state-line live-error" role="alert">
      {errorText(error)}
      {onRetry ? (
        <>
          {" "}
          <button data-command="admin.server.reload" type="button" className="link-action" onClick={onRetry}>{tr("Try again")}</button>
        </>
      ) : null}
    </p>
  );
}

export function Status({ code }: { code: string }) {
  const status = statusPresentation(code);
  if (!status) return <>{statusLabel(code)}</>;
  return <StatusDot tone={status.tone}>{trx(status.label)}</StatusDot>;
}

export function DateText({ value, withTime = false }: { value: string | undefined; withTime?: boolean }) {
  if (!value) return <span className="live-muted">—</span>;
  return <time dateTime={value}>{withTime ? shortDateTime(value, uiLocale()) : shortDate(value, uiLocale())}</time>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="live-field">
      <span>{trx(label)}</span>
      <strong>{children ?? "—"}</strong>
    </div>
  );
}

/**
 * A cursor-paged list: the first page replaces on filter changes, "Load more" appends with nextCursor. The query key
 * carries the filters, so TanStack keeps one cache entry per tab.
 */
export function useLivePage<T>(key: QueryKey, path: (cursor: string | null) => string, enabled = true) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [extra, setExtra] = useState<T[]>([]);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useQuery({ queryKey: [...key, "first"], queryFn: () => client.json<Page<T>>(path(null)), enabled });
  const serialized = JSON.stringify(key);
  useEffect(() => {
    setExtra([]);
    setMoreError(null);
    setCursor(null);
  }, [serialized]);
  const nextCursor = cursor ?? first.data?.nextCursor ?? null;
  const items = [...(first.data?.items ?? []), ...extra];
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await client.json<Page<T>>(path(nextCursor));
      setExtra((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      setMoreError(error);
    } finally {
      setLoadingMore(false);
    }
  }
  function reload() {
    setExtra([]);
    setCursor(null);
    void queryClient.invalidateQueries({ queryKey: key });
  }
  return { items, isLoading: first.isLoading, error: first.error ?? moreError, hasMore: Boolean(nextCursor) && !first.isLoading, loadMore, loadingMore, reload, refetch: first.refetch };
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="actions live-load-more">
      <button data-command="admin.server.loadMore" type="button" className="secondary-btn" disabled={loading} onClick={onClick}>
        {loading ? tr("Loading.") : tr("Load more")}
      </button>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (next: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <form
      className="live-search"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(text.trim());
      }}
    >
      <input className="table-search" value={text} placeholder={placeholder} aria-label={placeholder} onChange={(event) => setText(event.target.value)} />
      <button data-command="admin.server.reload" type="submit" className="secondary-btn">{tr("Search")}</button>
    </form>
  );
}

export type DecisionDialogProps = {
  open: boolean;
  title: string;
  /** What the action does, shown above the fields. */
  summary: ReactNode;
  confirmLabel: string;
  /** "required" asks for a note (1..1000); "optional" offers one; "none" shows no note field. */
  note: "required" | "optional" | "none";
  noteLabel?: string;
  /** Offer an expiry date (document approval). */
  expiry?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (input: { note: string; expiresAt?: string }) => Promise<void>;
};

/** One dialog for every live decision: a summary, a note when the contract needs one, Confirm and Cancel. */
export function DecisionDialog({ open, title, summary, confirmLabel, note, noteLabel, expiry = false, danger = false, onClose, onConfirm }: DecisionDialogProps) {
  const [text, setText] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setText("");
      setExpiresAt("");
      setError(null);
      setBusy(false);
    }
  }, [open]);
  const trimmed = text.trim();
  const noteMissing = note === "required" && trimmed.length === 0;
  const tooLong = trimmed.length > 1000;
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form
        className="live-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (noteMissing || tooLong || busy) return;
          setBusy(true);
          setError(null);
          try {
            await onConfirm({ note: trimmed, ...(expiry && expiresAt ? { expiresAt: new Date(`${expiresAt}T00:00:00Z`).toISOString() } : {}) });
            onClose();
          } catch (caught) {
            setError(caught);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{summary}</p>
        {note !== "none" ? (
          <label>
            {noteLabel ?? (note === "required" ? tr("Note (required)") : tr("Note (optional)"))}
            <textarea value={text} maxLength={1000} rows={3} onChange={(event) => setText(event.target.value)} aria-invalid={noteMissing || tooLong} />
          </label>
        ) : null}
        {expiry ? (
          <label>
            {tr("Valid until (optional)")}
            <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
        ) : null}
        {error ? <ErrorLine error={error} /> : null}
        <div className="actions">
          <button data-command="admin.server.dialogConfirm" type="submit" className={danger ? "primary-btn live-danger" : "primary-btn"} disabled={noteMissing || tooLong || busy}>
            {busy ? tr("Sending.") : confirmLabel}
          </button>
          <button data-command="admin.server.dialogCancel" type="button" className="secondary-btn" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** True for the 409 that means the record moved under us: the screen reloads and says so. */
export function isVersionMismatch(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === "version_mismatch";
}
