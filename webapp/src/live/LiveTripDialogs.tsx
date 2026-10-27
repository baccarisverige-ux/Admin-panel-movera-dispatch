import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../ui/Modal";
import { tr, trx } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine, isVersionMismatch } from "./ui";
import type { Trip } from "./types";

export type DialogAnswer = { reasonCode: string; note: string; checked: boolean };

/**
 * The demo's action dialog (ui/CommandButton.tsx: what it acts on, the reason list with none chosen, a note, Confirm and
 * Cancel) for a server command. The server's trip commands need a note (admin/tripRoutes.ts: note min 1), so the note
 * is required where the server says so. One send at a time: a double click sends once.
 */
export function LiveCommandDialog({
  open,
  title,
  summary,
  reasons,
  reasonLabel,
  note = "required",
  noteLabel,
  checkbox,
  children,
  ready = true,
  confirmLabel,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  summary: ReactNode;
  reasons?: readonly { value: string; label: string }[];
  reasonLabel?: string;
  note?: "required" | "optional" | "none";
  noteLabel?: string;
  checkbox?: string;
  children?: ReactNode;
  ready?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onSend: (answer: DialogAnswer) => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open) {
      setReasonCode("");
      setText("");
      setChecked(false);
      setError(null);
      setBusy(false);
      sending.current = false;
    }
  }, [open]);
  const noteText = text.trim();
  const valid = ready && (!reasons || reasonCode !== "") && (note !== "required" || noteText.length > 0) && noteText.length <= 1000;
  return (
    <Modal open={open} title={title} onClose={() => { if (!busy) onClose(); }}>
      <form
        className="live-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || sending.current) return;
          sending.current = true;
          setBusy(true);
          setError(null);
          try {
            await onSend({ reasonCode, note: noteText, checked });
            onClose();
          } catch (caught) {
            setError(caught);
            sending.current = false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{summary}</p>
        {reasons ? (
          <label>
            {reasonLabel ?? tr("Reason")}
            <select aria-label={reasonLabel ?? tr("Reason")} value={reasonCode} required onChange={(event) => setReasonCode(event.target.value)}>
              <option value="" disabled>{tr("Choose a reason")}</option>
              {reasons.map((item) => <option key={item.value} value={item.value}>{trx(item.label)}</option>)}
            </select>
          </label>
        ) : null}
        {children}
        {checkbox ? <label className="check-row"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> {checkbox}</label> : null}
        {note !== "none" ? (
          <label>
            {noteLabel ?? (note === "required" ? tr("Note (required)") : tr("Note (optional)"))}
            <textarea aria-label={noteLabel ?? (note === "required" ? tr("Note (required)") : tr("Note (optional)"))} value={text} maxLength={1000} rows={2} placeholder={tr("Anything the next admin should know")} onChange={(event) => setText(event.target.value)} />
          </label>
        ) : null}
        {error ? <ErrorLine error={error} /> : null}
        <div className="actions">
          <button data-command="admin.confirm.submit" className="primary-btn" type="submit" disabled={!valid || busy}>{busy ? tr("Sending.") : confirmLabel ?? tr("Confirm")}</button>
          <button data-command="admin.confirm.cancel" className="secondary-btn" type="button" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** A 202 answer: the change waits for a second admin (CONTRACT.md §3.1). */
export function isPending(answer: unknown): boolean {
  const body = (answer ?? {}) as { approvalId?: string; refundId?: string; tripId?: string };
  return Boolean(body.approvalId) && !body.refundId && !body.tripId;
}

/**
 * POST /admin/trips/{tripId}/{command} with the trip's version. A trip answer replaces the cached trip; a 202 says it
 * waits for a second admin; a version mismatch reloads the trip and says so. Errors go back to the dialog.
 */
export function useTripCommand(trip: Pick<Trip, "tripId" | "version">, onNotice: (text: string) => void) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const key = ["live", "trip", trip.tripId];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["live", "trip-offers", trip.tripId] });
    void queryClient.invalidateQueries({ queryKey: ["live", "trip-audit", trip.tripId] });
    void queryClient.invalidateQueries({ queryKey: ["live", "trips"] });
  };
  return async function run(command: string, body: Record<string, unknown>, done: string): Promise<unknown> {
    try {
      const answer = await client.post<unknown>(`/admin/trips/${encodeURIComponent(trip.tripId)}/${command}`, { expectedVersion: trip.version, ...body });
      const projection = (answer as { projection?: Trip })?.projection ?? answer;
      if (projection && typeof projection === "object" && (projection as Trip).tripId === trip.tripId && typeof (projection as Trip).status === "string") queryClient.setQueryData(key, projection);
      onNotice(isPending(answer) ? tr("The change waits for a second admin.") : done);
      refresh();
      return answer;
    } catch (error) {
      if (isVersionMismatch(error)) {
        refresh();
        onNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
      }
      throw error;
    }
  };
}
