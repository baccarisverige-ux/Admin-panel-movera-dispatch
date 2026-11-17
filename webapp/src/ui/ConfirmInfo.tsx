import { lazy, Suspense, useState, type ReactNode } from "react";
import { tr } from "../i18n";
import type { ChangeOf } from "./fromTo";

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

/**
 * `command`: who it affects and how to undo it come from the command (ui/confirmInfo.ts) when not given.
 * `changeOf`: the values of the "From → to" line, written in the admin's language by ui/fromTo.ts (cfgundo SF-R4-3);
 * `change` (already translated) wins over it.
 * Round 2 (supervisor MF-1): `money` and `when` are the dialog's own words for those parts; they win over the command's.
 * A dialog gives its command or its own money words (ui/confirmDetails.test.ts fails otherwise).
 */
export type ConfirmInfoProps = { what: ReactNode; where?: ReactNode; change?: ReactNode; changeOf?: ChangeOf; who?: ReactNode; when?: ReactNode; money?: ReactNode; undo?: ReactNode; command?: string };

/**
 * The words are loaded when the "!" is first pressed (audit bundle budget, scripts/check-bundle.mjs): the explanation
 * and the zone texts are in their own file (ui/ConfirmInfoBody.tsx), not in the admin's first download.
 */
const loadBody = () => import("./ConfirmInfoBody");
const Body = lazy(() => loadBody().catch(() => ({ default: () => <p className="state-line" role="alert">{tr("The explanation could not be loaded. Reload the page to see it.")}</p> })));

export function ConfirmInfo(props: ConfirmInfoProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="confirm-info">
      <button type="button" data-command="admin.confirm.info" data-skip-initial-focus className="confirm-info-btn" aria-expanded={open} aria-label={tr("What will happen")} title={tr("What will happen? Open the explanation")} onPointerEnter={() => void loadBody()} onFocus={() => void loadBody()} onClick={() => setOpen((value) => !value)}>
        <svg className="confirm-info-icon" width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" data-testid="confirm-info-icon">
          <path d="M10 1 19 17H1Z" fill={INFO_ORANGE} stroke={INFO_ORANGE} strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 6.2v5.2" stroke={INFO_MARK} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="10" cy="14.2" r="1.25" fill={INFO_MARK} />
        </svg>
        {tr("What will happen?")}
      </button>
      {open ? <Suspense fallback={<p className="fine-print" data-testid="confirm-info-loading">{tr("Loading…")}</p>}><Body {...props} /></Suspense> : null}
    </div>
  );
}
