/** Owner 2026-11-11 (AUDIT-A16 §7): POST /admin/auth/sign-in-locks/unlock { phone } (SignInUnlock). */
export const UNLOCK_SIGN_IN_PATH = "/admin/auth/sign-in-locks/unlock";
/** The contract route has no x-permission; the server checks settings.edit (movera-server src/auth/routes.ts). */
export const UNLOCK_SIGN_IN_PERMISSION = "settings.edit";

const E164 = /^\+[1-9]\d{6,14}$/;

/** The full number to send, or null when it is missing or masked ("+46•••••12") and must be revealed first. */
export function fullPhone(phone: string | null | undefined): string | null {
  const value = (phone ?? "").trim();
  return E164.test(value) ? value : null;
}

/** The line under the button: the server answers { phone, lifted } (lifted 0 = there was no lock); the contract says no content. */
export function unlockMessage(answer: unknown): string {
  const lifted = (answer as { lifted?: unknown } | null | undefined)?.lifted;
  return lifted === 0 ? "This number had no sign-in lock." : "Sign-in unlocked: the number can get codes again.";
}
