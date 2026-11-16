import { useState, type ReactNode } from "react";
import { tr } from "../i18n";

/**
 * The "!" in an orange triangle of every confirm dialog (owner 2026-11-16: "When confirm anything u add info ? When clic understand what's
 * going to happen and where and which zone and all info"). One shared button; a click opens, in plain words: what
 * will happen, where (the Standard and / or which zones, by name), from → to when known, who it affects and how to
 * undo it. ui/confirmInfo.test.ts fails when a confirm dialog of the admin does not render it.
 */
/**
 * Owner 2026-11-16: "instead of ? Put ! Inside orange triangle" and "The ! Also white". The orange is dark enough for
 * the white mark: 5.18 : 1 (WCAG text level AA is 4.5 : 1; ui/confirmInfo.test.ts computes it and fails under 4.5),
 * and the triangle stands out from a white card (5.18 : 1) and from a dark one (3.4 : 1, over the 3 : 1 for icons).
 */
export const INFO_ORANGE = "#C2410C";
export const INFO_MARK = "#FFFFFF";

export type ConfirmInfoProps = { what: ReactNode; where?: ReactNode; change?: ReactNode; who?: ReactNode; undo?: ReactNode };

export function ConfirmInfo({ what, where, change, who, undo }: ConfirmInfoProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="confirm-info">
      <button type="button" data-command="admin.confirm.info" className="confirm-info-btn" aria-expanded={open} aria-label={tr("What will happen")} title={tr("What will happen? Open the explanation")} onClick={() => setOpen((value) => !value)}>
        <svg className="confirm-info-icon" width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" data-testid="confirm-info-icon">
          <path d="M10 1 19 17H1Z" fill={INFO_ORANGE} stroke={INFO_ORANGE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 6.2v5.2" stroke={INFO_MARK} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="10" cy="14.2" r="1.25" fill={INFO_MARK} />
        </svg>
        {tr("What will happen?")}
      </button>
      {open ? (
        <dl className="confirm-info-body" data-testid="confirm-info">
          <dt>{tr("What happens")}</dt><dd>{what}</dd>
          <dt>{tr("Where")}</dt><dd>{where ?? tr("Only what this dialog names. No other zone, person or setting changes.")}</dd>
          {change ? <><dt>{tr("From → to")}</dt><dd>{change}</dd></> : null}
          <dt>{tr("Who it affects")}</dt><dd>{who ?? tr("Only what this dialog names. Nobody else.")}</dd>
          <dt>{tr("How to undo")}</dt><dd>{undo ?? tr("There is no one-press undo. The action is written in the Audit log with your name and your reason; do the opposite action on the same page to take it back.")}</dd>
        </dl>
      ) : null}
    </div>
  );
}
