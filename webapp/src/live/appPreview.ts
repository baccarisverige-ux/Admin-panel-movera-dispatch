/**
 * Contract v0.18.25 §47 admin real app preview (BASE job B7; owner P1 a, P2 b, P3 a, 2026-11-04).
 * The admin panel shows the REAL rider / driver web app inside a phone frame. POST /admin/preview-sessions gives a
 * 15-minute read-only token; the app opens at <appUrl>#movera-preview=<token>&zone=<zoneId>&draft=<0|1>. The app talks
 * to the live server, and every real action (Book, Accept, Pay, Go online) shows "Preview – not sent".
 */
export type PreviewRole = "rider" | "driver";

export type PreviewSession = { token: string; role: PreviewRole; zoneId: string; useDraft: boolean; expiresAt: string; subjectId: string };

export const PREVIEW_SESSIONS_PATH = "/admin/preview-sessions";

/** The live web builds (Rules plan/STATUS.md "Live"); a build may replace them with VITE_RIDER_APP_URL / VITE_DRIVER_APP_URL. */
export const APP_WEB_URLS: Record<PreviewRole, string> = {
  rider: "https://baccarisverige-ux.github.io/movera-rider-app/live/",
  driver: "https://baccarisverige-ux.github.io/Movera-driver-app/live/",
};

/** A new token this long before the old one ends, so the phone never shows a signed-out app. */
export const PREVIEW_RENEW_MS = 12 * 60_000;

const TOKEN = /^[A-Za-z0-9_\-.]+$/;

/** The server's answer, or null when it is not a usable preview session. */
export function parsePreviewSession(raw: unknown): PreviewSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.token !== "string" || !TOKEN.test(value.token)) return null;
  if (value.role !== "rider" && value.role !== "driver") return null;
  if (typeof value.zoneId !== "string" || typeof value.expiresAt !== "string") return null;
  return { token: value.token, role: value.role, zoneId: value.zoneId, useDraft: value.useDraft === true, expiresAt: value.expiresAt, subjectId: typeof value.subjectId === "string" ? value.subjectId : "" };
}

/** The framed app's address: the token goes in the fragment, so it never reaches a web server log. */
export function previewUrl(appUrl: string, session: PreviewSession): string {
  const base = appUrl.split("#")[0] ?? appUrl;
  const params = new URLSearchParams({ "movera-preview": session.token, zone: session.zoneId, draft: session.useDraft ? "1" : "0" });
  return `${base}#${params.toString()}`;
}

/**
 * Step 24 (owner Q31, 2026-11-09): the real app opens in a NEW TAB with no link back to the admin tab (`noopener`), never
 * in a frame. The admin's sign-in lives in this tab's sessionStorage; a frame on the same origin (github.io) could read it
 * and the page around it, a new tab cannot. Returns false only when opening threw (a blocked pop-up is silent).
 */
export function openPreviewWindow(url: string, win: Pick<Window, "open"> = window): boolean {
  if (!/^https:\/\//.test(url)) return false;
  // With "noopener" window.open returns null on success AND when a pop-up blocker stops it: the browser cannot tell
  // us. Only a thrown error (a sandbox refusing the navigation) is reported as false; the panel shows a standing hint.
  try {
    win.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

/** The app web address for a role, from the build's env when set. */
export function appWebUrl(role: PreviewRole, env: { VITE_RIDER_APP_URL?: string; VITE_DRIVER_APP_URL?: string } = {}): string {
  const given = role === "rider" ? env.VITE_RIDER_APP_URL : env.VITE_DRIVER_APP_URL;
  return given && /^https:\/\//.test(given) ? given : APP_WEB_URLS[role];
}
