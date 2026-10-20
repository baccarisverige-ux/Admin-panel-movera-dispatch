import { useDialogFocus } from "./useDialogFocus";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useCommands } from "../api/hooks";
import type { CommandResult } from "../api/create";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { OTHER_REASON, auditReason, initialReason, mustChooseReason, reasonsFor } from "../commands/reasons";
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
  /**
   * Large changes to confirm (A-O3): when the list is not empty the dialog asks "Are you sure?", lists them and
   * keeps Confirm disabled until "Yes, I'm sure" is ticked.
   */
  largeChanges?: readonly string[];
  /**
   * The dialog's reason list as codes with their texts (Q27: the trip cancel reason codes). None is preselected;
   * the chosen code goes into the patch under `reasonField`, and its text is the audit reason.
   */
  reasonChoices?: readonly { value: string; label: string }[];
  reasonField?: string;
  /** The label of the reason list ("Reason" by default). */
  reasonLabel?: string;
  /** Also offer an optional note in the same dialog; it is added to the audit reason. */
  optionalNote?: boolean;
  /** What the dialog says it will do, instead of "This acts on <target>" (for example "Send an exclusive offer to Erik"). */
  summary?: ReactNode;
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
  largeChanges,
  reasonChoices,
  reasonField,
  reasonLabel = "Reason",
  optionalNote = false,
  summary,
  children,
  "aria-label": ariaLabel,
}: CommandButtonProps) {
  const commands = useCommands();
  const session = useSession();
  const spec = commandById(command);
  const denied = Boolean(spec && session.agent && !can(session.agent.role, spec.permission));
  const disabledReason = !spec ? "Action is not registered." : denied ? "Your role cannot perform this action." : undefined;
  const reasons = reasonsFor(command);
  const coded = Boolean(reasonChoices);
  const choose = coded || mustChooseReason(command);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(() => initialReason(command));
  const [otherText, setOtherText] = useState("");
  const [typed, setTyped] = useState("");
  const [lastReason, setLastReason] = useState("");
  const [sure, setSure] = useState(false);
  const [note, setNote] = useState("");
  const askSure = Boolean(largeChanges && largeChanges.length);
  const mustType = confirmTarget ? (targetId ?? "") : "";
  const dialogRoot=useDialogFocus(open,()=>setOpen(false));
  const codeLabel = reasonChoices?.find((item) => item.value === reason)?.label ?? "";
  const chosen = coded ? (codeLabel ? [codeLabel, note.trim()].filter(Boolean).join(" · ") : "") : [auditReason(reason, otherText), optionalNote ? note.trim() : ""].filter(Boolean).join(" · ");
  const confirmed = (mustType.length === 0 || typed === mustType) && chosen.length > 0 && (!askSure || sure);
  // While any command runs, every command button waits (C-16, Q31): disabled, with a spinner and "Please wait".
  const waiting = commands.busy || commands.phase === "submitting";
  const blocked = disabled || waiting || !spec || denied;

  // Every opening starts clean: no half-typed id or reason carried over from a cancelled dialog.
  // Cancel and refund dialogs open with no reason, so Confirm waits until one is picked (A-O1).
  function openDialog() {
    setReason(coded ? "" : initialReason(command));
    setNote("");
    setOtherText("");
    setTyped("");
    setSure(false);
    setOpen(true);
  }

  function fire(why: string, code?: string) {
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
      patch: patch ? { ...patch, ...(storeReason ? { notes: why } : {}), ...(reasonField && code ? { [reasonField]: code } : {}) } : undefined,
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
        aria-busy={waiting || undefined}
        title={waiting && !disabled ? "Please wait: another action is still running." : title ?? disabledReason}
        onClick={(event) => {
          event.currentTarget.focus();
          if (!spec) return;
          if (spec.reason) openDialog();
          else fire("No person affected");
        }}
      >
        {children}
        {waiting && !disabled ? <span className="cmd-wait" data-testid="command-wait"><Loader2 size={13} className="cmd-spin" aria-hidden="true" /> Please wait</span> : null}
      </button>
      {retryLabel ? (
        <button
          data-command={command}
          className="secondary-btn"
          type="button"
          disabled={blocked || !lastReason || commands.phase !== "rejected"}
          title={title ?? disabledReason ?? (commands.phase === "rejected" ? undefined : "Nothing to retry.")}
          onClick={() => fire(lastReason)}
        >
          {retryLabel}
        </button>
      ) : null}
      {commands.message ? <p className="state-line" role={commands.phase === "checking" ? "status" : undefined}>{commands.message}</p> : null}
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
              fire(chosen, coded ? reason : undefined);
            }}
          >
            <h3>{spec?.label}</h3>
            <p>{summary ?? <>This acts on {targetId ?? spec?.label}.</>}</p>
            {askSure ? (
              <div className="state-line" role="alert" data-testid="large-change-warning">
                <strong>Are you sure?</strong> {largeChanges!.length === 1 ? "This value changes" : "These values change"} by more than 50% from the published value:
                <ul>
                  {largeChanges!.slice(0, 8).map((line) => <li key={line}>{line}</li>)}
                  {largeChanges!.length > 8 ? <li>and {largeChanges!.length - 8} more</li> : null}
                </ul>
              </div>
            ) : null}
            <label>
              {reasonLabel}
              <select aria-label={reasonLabel} value={reason} required={choose} onChange={(event) => setReason(event.target.value)}>
                {choose ? <option value="" disabled>Choose a reason</option> : null}
                {reasonChoices
                  ? reasonChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)
                  : reasons.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
              </select>
            </label>
            {coded || optionalNote ? (
              <label>
                Note (optional)
                <input aria-label="Note (optional)" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Anything the next admin should know" />
              </label>
            ) : null}
            {!coded && reason === OTHER_REASON ? (
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
            {askSure ? (
              <label className="check-row">
                <input type="checkbox" checked={sure} onChange={(event) => setSure(event.target.checked)} /> Yes, I'm sure
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
