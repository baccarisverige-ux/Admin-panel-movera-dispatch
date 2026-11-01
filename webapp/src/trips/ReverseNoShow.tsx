import { useState } from "react";
import { useCommand } from "../api/hooks";
import { tr, trn, trSentences } from "../i18n";
import { useDialogFocus } from "../ui/useDialogFocus";

/**
 * v0.18.8 (G6, contract.json#arrivedWaiting.reverseNoShow, owner decisions 3 + 34): "Reverse no-show" on a no-show
 * trip. The admin writes why (required) and may tick "Take back the driver's share" (off: the driver keeps it).
 * POST /admin/trips/{tripId}/reverse-no-show, with the command's own Idempotency-Key; the server is idempotent too.
 */
export function ReverseNoShowButton({ tripId, zoneId, onDone }: { tripId: string; zoneId: string; onDone: (message: string) => void }) {
  const command = useCommand("admin.trip.reverseNoShow");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [takeBack, setTakeBack] = useState(false);
  const root = useDialogFocus(open, () => setOpen(false));
  const busy = command.phase === "submitting";
  const ready = reason.trim().length > 0 && !busy;

  return (
    <>
      <button type="button" className="dash-btn small ghost" data-command="admin.trip.reverseNoShow" disabled={busy} onClick={() => { setReason(""); setTakeBack(false); setOpen(true); }}>{tr("Reverse no-show")}</button>
      {command.message && !open ? <p className="state-line" data-testid="reverse-no-show-result">{trSentences(command.message)}</p> : null}
      {open ? (
        <div ref={root} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={tr("Reverse no-show")} data-testid="reverse-no-show-dialog">
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ready) return;
              setOpen(false);
              void command.run({ targetId: tripId, scope: zoneId, reason: reason.trim(), before: "no_show", after: takeBack ? "reversed, driver share taken back" : "reversed", value: { takeBackDriverShare: takeBack } }).then((result) => {
                if (result) onDone(result.message);
              });
            }}
          >
            <h3>{tr("Reverse no-show")}</h3>
            <p>{tr("The rider pays nothing for this trip: an owed fee is waived, a paid fee goes back to the rider's wallet. The trip stays a no-show.")}</p>
            <label>{trn("Reason (required){0}", <textarea aria-label={tr("Reason (required)")} value={reason} maxLength={1000} required rows={3} onChange={(event) => setReason(event.target.value)} />)}</label>
            <label className="check-row">{trn("{0} Take back the driver’s share", <input type="checkbox" checked={takeBack} onChange={(event) => setTakeBack(event.target.checked)} data-testid="reverse-take-back" />)}</label>
            <p className="op-help">{takeBack ? tr("The driver's share of the no-show fee is taken from his earnings.") : tr("The driver keeps his share of the no-show fee. Movera pays it.")}</p>
            <button data-command="admin.confirm.submit" className="primary-btn" type="submit" disabled={!ready}>{tr("Confirm")}</button>
            <button data-command="admin.confirm.cancel" className="secondary-btn" type="button" onClick={() => setOpen(false)}>{tr("Cancel")}</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
