import { useState, type ReactNode } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { CommandButton } from "../ui/CommandButton";
import { tr } from "./core";
import type { AppLanguage } from "./languages";

type Props = {
  agentId: string;
  next: AppLanguage | undefined;
  before: string;
  after: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  /** Demo only: writes the choice into the demo agents (the demo command logs it in My activity). */
  onDemoDone: () => void;
  children: ReactNode;
};

/**
 * Saves the admin's own panel language. Demo: the admin.profile.language command, as before. Live (contract v0.16.1
 * §9): PATCH /admin/auth/me { language }; the server's AdminMe then switches the panel at once and keeps the choice
 * after reload, sign-in and on other devices. The server writes the audit line.
 */
export function LanguageSaveButton({ agentId, next, before, after, className, disabled, title, onDemoDone, children, ...rest }: Props) {
  const live = useLiveSessionMaybe();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!live) {
    return (
      <CommandButton command="admin.profile.language" className={className} targetId={agentId} confirmTarget={false} before={before} after={after} disabled={disabled} title={title} aria-label={rest["aria-label"]} onDone={onDemoDone}>
        {children}
      </CommandButton>
    );
  }
  async function save() {
    setBusy(true);
    setFailed(false);
    try {
      await live!.client.updateMyLanguage(next ?? null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        data-command="admin.profile.language"
        className={className}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        title={failed ? tr("The language was not saved. Try again.") : title}
        aria-label={rest["aria-label"]}
        onClick={() => void save()}
      >
        {children}
      </button>
      {failed ? <span className="lang-save-error" role="alert">{tr("The language was not saved. Try again.")}</span> : null}
    </>
  );
}
