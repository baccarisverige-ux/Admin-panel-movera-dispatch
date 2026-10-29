/**
 * Contract v0.15.0 §24 (owner 2026-10-29, decision 5): the sign-in waiting list. A number the server answered
 * 403 sign_in_restricted joined it from the rider or driver app; GET /admin/waitlist lists them, newest first.
 */
export type WaitlistApp = "rider" | "driver";

export type WaitlistEntry = { phone: string; app: WaitlistApp; locale?: "sv" | "fr" | "en"; firstAt: string; lastAt: string; count: number };

/** The page reads the list again this often (owner: the admin sees the waiting list live). */
export const WAITLIST_REFRESH_MS = 15_000;

/** The list's query: newest first, at most 200, one app or both. */
export function waitlistPath(app: WaitlistApp | "all"): string {
  return `/admin/waitlist?limit=200${app === "all" ? "" : `&app=${app}`}`;
}

/** "+46 70 174 06 05" / "+33 6 12 34 56 78": as the apps show a Swedish or French mobile number; others as sent. */
export function displayPhone(e164: string): string {
  const se = /^\+46(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (se) return `+46 ${se.slice(1).join(" ")}`;
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  if (fr) return `+33 ${fr.slice(1).join(" ")}`;
  return e164;
}

/** Counts per app for the cards above the list. */
export function waitlistCounts(items: readonly WaitlistEntry[]): { all: number; rider: number; driver: number } {
  return { all: items.length, rider: items.filter((i) => i.app === "rider").length, driver: items.filter((i) => i.app === "driver").length };
}
