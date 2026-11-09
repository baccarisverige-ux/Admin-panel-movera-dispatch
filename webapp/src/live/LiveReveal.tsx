import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Phone } from "lucide-react";
import { tr, trn } from "../i18n";
import { useDialogFocus } from "../ui/useDialogFocus";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { REVEAL_REASON_MAX, incidentRevealAllowed, incidentRevealPath, phoneHref, revealPath, revealReasonOk, type RevealKind, type Revealed, type RevealedIncidentContacts } from "./masking";

/**
 * Step 36 (contract v0.18.54 §76, contract.json#adminMasking; owner 2026-11-09 Q40 yes): a live record the server
 * masked (`sensitiveMasked: true`) shows its masked values as text (a masked phone is never a tel: link) and one
 * Reveal button. The button opens "Why do you need the full value?" (reason 3–200 characters, required), sends
 * POST /admin/{riders|drivers|fleets}/{id}/reveal { reason } and shows the full values in place for this page view
 * only: component state, never the query cache, never the browser's storage. The audit is written by the server.
 */

export function RevealSensitive({ kind, id, onRevealed, className = "dash-btn small ghost" }: { kind: RevealKind; id: string; onRevealed: (values: Revealed) => void; className?: string }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dialogRoot = useDialogFocus(open, () => setOpen(false));
  if (!live) return null;
  const ok = revealReasonOk(reason);

  async function send() {
    if (!live || !ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await live.client.post<Revealed>(revealPath(kind, id), { reason: reason.trim() });
      setOpen(false);
      setReason("");
      onRevealed(answer);
      // The server audited the reveal: "Who did what" shows it at once.
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const openDialog = () => { setReason(""); setError(null); setOpen(true); };
  const label = trn("{0} Reveal", <Eye size={13} aria-hidden="true" />);
  return (
    <>
      {/* One literal data-command per kind, so commands/registry.test.ts can read it. */}
      {kind === "rider" ? <button type="button" data-command="admin.server.revealRider" data-testid="reveal-sensitive" className={className} onClick={openDialog}>{label}</button>
        : kind === "driver" ? <button type="button" data-command="admin.server.revealDriver" data-testid="reveal-sensitive" className={className} onClick={openDialog}>{label}</button>
        : <button type="button" data-command="admin.server.revealFleet" data-testid="reveal-sensitive" className={className} onClick={openDialog}>{label}</button>}
      {open ? (
        <div ref={dialogRoot} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={tr("Reveal the full value")}>
          <form className="modal-card" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <h3>{tr("Reveal the full value")}</h3>
            <p>{tr("The server shows the full phone, e-mail and date of birth once, for this page only, and saves who asked and why.")}</p>
            <label>
              {tr("Why do you need the full value?")}
              <input aria-label={tr("Why do you need the full value?")} value={reason} maxLength={REVEAL_REASON_MAX} required minLength={3} autoFocus placeholder={tr("At least 3 characters")} onChange={(event) => setReason(event.target.value)} />
            </label>
            {error ? <ErrorLine error={error} /> : null}
            <button data-command="admin.confirm.submit" className="primary-btn" type="submit" disabled={!ok || busy}>
              {busy ? trn("{0} Please wait", <Loader2 size={13} className="cmd-spin" aria-hidden="true" />) : tr("Confirm")}
            </button>
            <button data-command="admin.confirm.cancel" className="secondary-btn" type="button" onClick={() => setOpen(false)}>{tr("Cancel")}</button>
          </form>
        </div>
      ) : null}
    </>
  );
}

/**
 * A phone, e-mail or date of birth that may be masked: the masked text (no link) until revealed, then the full value
 * (a full phone gets its tel: link). `field` names the test ids: masked-<field> / revealed-<field>.
 */
export function MaskedText({ value, revealed, field, dash = "—" }: { value: string | null | undefined; revealed: string | null | undefined; field: "phone" | "email" | "dob"; dash?: string }) {
  if (revealed) {
    const href = field === "phone" ? phoneHref(revealed) : null;
    return <span data-testid={`revealed-${field}`}>{href ? <a href={href}>{revealed}</a> : revealed}</span>;
  }
  return <span data-testid={`masked-${field}`} title={tr("Masked by the server for your role. Press Reveal to see the full value.")}>{value || dash}</span>;
}

/**
 * Owner Q41 "Yes, logged" (§76): on an OPEN safety case one button reveals the rider's and the driver's phone through
 * POST /admin/incidents/{incidentId}/reveal-contacts (reason "SOS" by default; one audit row). Hidden when the case
 * is closed (the server answers 409 incident_closed). null-safe: a side without an account or a phone says so.
 */
export function LiveRevealContacts({ incidentId, status, children }: { incidentId: string; status: string | null | undefined; children?: ReactNode }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [shown, setShown] = useState<RevealedIncidentContacts | null>(null);
  if (!live || !incidentRevealAllowed(status)) return null;
  const allowed = live.can("incidents.read");

  async function reveal() {
    if (!live || busy) return;
    setBusy(true);
    setError(null);
    try {
      setShown(await live.client.post<RevealedIncidentContacts>(incidentRevealPath(incidentId), { reason: "SOS" }));
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const side = (who: string, part: { phone: string | null } | null) => {
    if (!part) return <li>{who}: {tr("no account on this case")}</li>;
    if (!part.phone) return <li>{who}: {tr("no phone number on the record")}</li>;
    const href = phoneHref(part.phone);
    return <li>{who}: {href ? <a href={href}>{part.phone}</a> : part.phone}</li>;
  };

  return (
    <div data-testid="incident-reveal-contacts">
      <h4 className="op-sub"><Phone size={13} aria-hidden="true" /> {tr("Phones of the people on this case")}</h4>
      {!allowed ? <p className="op-help">{tr("Your role cannot reveal the phones.")}</p>
        : shown ? (
          <ul className="op-past" data-testid="incident-revealed-contacts">
            {side(tr("Rider"), shown.rider)}
            {side(tr("Driver"), shown.driver)}
          </ul>
        ) : (
          <>
            <p className="op-help">{tr("One click shows both numbers while the case is open. It is saved in the audit as an SOS reveal.")}</p>
            <button type="button" className="dash-btn small danger" data-command="admin.server.revealIncidentContacts" disabled={busy} onClick={() => void reveal()}>
              {busy ? trn("{0} Please wait", <Loader2 size={13} className="cmd-spin" aria-hidden="true" />) : trn("{0} Reveal both phones (SOS)", <Phone size={13} aria-hidden="true" />)}
            </button>
          </>
        )}
      {error ? <ErrorLine error={error} onRetry={() => void reveal()} /> : null}
      {children}
    </div>
  );
}
