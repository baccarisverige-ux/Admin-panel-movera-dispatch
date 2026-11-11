import { KeyRound } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr } from "../i18n/core";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { UNLOCK_SIGN_IN_PERMISSION } from "./unlockSignIn";

/**
 * Owner 2026-11-11 ("Yes, add it"; AUDIT-A16 §7): lift the wrong-code sign-in lock on a rider's or driver's phone number.
 * POST /admin/auth/sign-in-locks/unlock { phone } (server: settings.edit). The contract has no route that says whether a
 * number is locked, so the button is always there for an admin with settings.edit. Live only (like Pause payouts).
 * `phone` is the full E.164 number when the page already has it; otherwise the command first reveals it (audited, with
 * the dialog's reason).
 */
export function LiveUnlockSignIn({ kind, id, phone }: { kind: "rider" | "driver"; id: string; phone: string | null }) {
  const session = useLiveSessionMaybe();
  if (!session?.can(UNLOCK_SIGN_IN_PERMISSION)) return null;
  return (
    <section className="fd-box" data-testid="unlock-sign-in">
      <h3><KeyRound size={15} aria-hidden="true" /> {tr("Sign-in lock")}</h3>
      <p>{tr("After too many wrong codes the number is locked for up to 24 hours.")}</p>
      <CommandButton
        command="admin.auth.unlockSignIn"
        className="dash-btn ghost"
        targetId={id}
        value={{ kind, phone }}
        summary={tr("Lift the wrong-code lock on this person's phone number so they can get a sign-in code again.")}
      >
        {tr("Unlock sign-in")}
      </CommandButton>
    </section>
  );
}
