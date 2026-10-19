import { useDialogFocus } from "./useDialogFocus";
import { useState, type ReactNode } from "react";
import { useCommands } from "../api/hooks";
import type { CommandResult } from "../api/create";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { OTHER_REASON, auditReason, reasonsFor } from "../commands/reasons";
import { commandById } from "../commands/registry";

type CommandButtonProps = {
  command: string;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  targetId?: string;
  before?: string;
  after?: string;
  entityState?: string;
  amountOre?: number;
  collection?: string;
  patch?: Record<string, string | number | boolean | null>;
  scope?: string;
  expectedRev?: number;
  expectedSliceRev?: number;
  idempotencyKey?: string;
  validationError?: string;
  onValidationError?: (message: string) => void;
  sliceKey?: string;
  value?: unknown;
  confirmTarget?: boolean;
  storeReason?: boolean;
  onDone?: (result?: CommandResult) => void;
  /** Also render a retry button. It is enabled only after an attempt that did not commit (unknown or rejected), re-sends with the same reason, and reuses the operation key when the outcome is unknown. */
  retryLabel?: string;
  children: ReactNode;
  "aria-label"?: string;
};

export function CommandButton({
  command,
  className,
  type = "button",
  disabled,
  title,
  targetId,
  before,
  after,
  entityState,
  amountOre,
  collection,
  patch,
  scope,
  expectedRev,
  expectedSliceRev,
  idempotencyKey,
  validationError,
  onValidationError,
  sliceKey,
  value,
  confirmTarget = true,
  storeReason,
  onDone,
  retryLabel,
  children,
  "aria-label": ariaLabel,
}: CommandButtonProps) {
  const commands = useCommands();
  const session = useSession();
  const spec = commandById(command);
  const denied = Boolean(spec && session.agent && !can(session.agent.role, spec.permission));
  const disabledReason = !spec ? "Action is not registered." : denied ? "Your role cannot perform this action." : undefined;
  const reasons = reasonsFor(command);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(reasons[0]);
  const [otherText, setOtherText] = useState("");
  const [typed, setTyped] = useState("");
  const [lastReason, setLastReason] = useState("");
  const mustType = confirmTarget ? (targetId ?? "") : "";
  const dialogRoot=useDialogFocus(open,()=>setOpen(false));
  const chosen = auditReason(reason, otherText);
  const confirmed = (mustType.length === 0 || typed === mustType) && chosen.length > 0;
  const blocked = disabled || commands.busy || commands.phase === "submitting" || !spec || denied;

  // Every opening starts clean: no half-typed id or reason carried over from a cancelled dialog.
  function openDialog() {
    setReason(reasons[0]);
    setOtherText("");
    setTyped("");
    setOpen(true);
  }

  function fire(why: string) {
    if (!session.agent && command === "admin.auth.pickAgent") {
      onDone?.();
      return;
    }
    setLastReason(why);
    void commands.run(command, {
      reason: why,
      targetId,
      before,
      after,
      entityState,
      amountOre,
      collection,
      patch: patch ? { ...patch, ...(storeReason ? { notes: why } : {}) } : undefined,
      scope,
      expectedRev,
      expectedSliceRev,
      idempotencyKey,
      sliceKey,
      value,
    }).then((result) => {
      if (result) onDone?.(result);
    });
  }

  return (
    <>
      <button
        data-command={command}
        className={className}
        type={type}
        aria-label={ariaLabel}
        disabled={blocked}
        title={title ?? disabledReason}
        onClick={(event) => {
          event.currentTarget.focus();
          if (!spec) return;
          if (spec.reason) openDialog();
          else fire("No person affected");
        }}
      >
        {children}
      </button>
      {retryLabel ? (
        <button
          data-command={command}
          className="secondary-btn"
          type="button"
          disabled={blocked || !lastReason || (commands.phase !== "unknown" && commands.phase !== "rejected")}
          title={title ?? disabledReason ?? (commands.phase === "unknown" || commands.phase === "rejected" ? undefined : "Nothing to retry.")}
          onClick={() => fire(lastReason)}
        >
          {retryLabel}
        </button>
      ) : null}
      {commands.message ? <p className="state-line">{commands.message}</p> : null}
      {open ? (
        <div ref={dialogRoot} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={spec?.label}>
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmed) return;
              setOpen(false);
              if (validationError) {
                onValidationError?.(validationError);
                return;
              }
              fire(chosen);
            }}
          >
            <h3>{spec?.label}</h3>
            <p>This acts on {targetId ?? spec?.label}.</p>
            <label>
              Reason
              <select aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)}>
                {reasons.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {reason === OTHER_REASON ? (
              <label>
                Describe the reason
                <input aria-label="Describe the reason" value={otherText} maxLength={200} required onChange={(event) => setOtherText(event.target.value)} />
              </label>
            ) : null}
            {mustType ? (
              <label>
                Type {mustType} to confirm
                <input value={typed} onChange={(event) => setTyped(event.target.value)} />
              </label>
            ) : null}
            <button data-command="admin.confirm.submit" className="primary-btn" type="submit" disabled={!confirmed}>Confirm</button>
            <button data-command="admin.confirm.cancel" className="secondary-btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
