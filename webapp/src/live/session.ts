/**
 * The live admin session (contract v0.5.1 §9): sign-in with e-mail and password, a rotating refresh token, sign-out
 * and `fetch` with the bearer token. Tokens live in memory and sessionStorage (never localStorage, never in a URL).
 * On a 401 the client refreshes once and retries; a failed refresh signs out. No React here: session.test.ts drives
 * it with a fake fetch.
 */
import { ApiError, apiFetch, type ApiRequestInit, type FetchLike, type FetchResponse } from "../api/httpClient.ts";
import type { AdminMe, AdminSession } from "./types.ts";

export const LIVE_SESSION_KEY = "movera-admin-live-session";
const API_PREFIX = "/api/v1";

export type LiveSessionState = { accessToken: string; refreshToken: string; expiresAt: number; admin: AdminMe };

type StorageLike = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };

type Options = {
  baseUrl: string;
  fetchImpl?: FetchLike;
  storage?: StorageLike | null;
  now?: () => number;
  /** Called when the session ends by itself (a refresh that failed, a 401 after it). */
  onSignedOut?: (reason: "refresh_failed" | "sign_out") => void;
};

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function isAdminMe(value: unknown): value is AdminMe {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.adminId === "string" && typeof raw.email === "string" && typeof raw.name === "string" && typeof raw.role === "string" && Array.isArray(raw.permissions) && Boolean(raw.scope);
}

function isSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.accessToken === "string" && typeof raw.refreshToken === "string" && isAdminMe(raw.admin);
}

export type LiveClient = ReturnType<typeof createLiveClient>;

export function createLiveClient(options: Options) {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const base = resolveBase(options.baseUrl);
  let state: LiveSessionState | null = restore();
  let refreshing: Promise<boolean> | null = null;
  const listeners = new Set<(state: LiveSessionState | null) => void>();

  function restore(): LiveSessionState | null {
    try {
      const raw = storage?.getItem(LIVE_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<LiveSessionState>;
      if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || !isAdminMe(parsed.admin)) return null;
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: Number(parsed.expiresAt) || 0, admin: parsed.admin };
    } catch {
      return null;
    }
  }

  function setState(next: LiveSessionState | null): void {
    state = next;
    try {
      if (next) storage?.setItem(LIVE_SESSION_KEY, JSON.stringify(next));
      else storage?.removeItem(LIVE_SESSION_KEY);
    } catch {
      // Blocked storage: the session then lives in memory for this page only.
    }
    for (const listener of listeners) listener(next);
  }

  function fromSession(session: AdminSession): LiveSessionState {
    return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: now() + session.expiresIn * 1000, admin: session.admin };
  }

  /** An unauthenticated call of /admin/auth/*: no bearer, no refresh. */
  async function authCall(path: string, body: unknown): Promise<AdminSession> {
    const result = await apiFetch(base, `${API_PREFIX}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, fetchImpl).then((response) => response.json());
    if (!isSession(result)) throw new ApiError(0, "The server's session payload is not an AdminSession.", { code: "internal", retryable: false });
    return result;
  }

  async function refreshOnce(): Promise<boolean> {
    if (refreshing) return refreshing;
    const token = state?.refreshToken;
    if (!token) return false;
    refreshing = (async () => {
      try {
        const session = await authCall("/admin/auth/refresh", { refreshToken: token });
        setState(fromSession(session));
        return true;
      } catch {
        setState(null);
        options.onSignedOut?.("refresh_failed");
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function withAuth(init: ApiRequestInit, token: string): ApiRequestInit {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return { ...init, headers };
  }

  async function fetchAuthed(path: string, init: ApiRequestInit = {}): Promise<FetchResponse> {
    if (!state) throw new ApiError(401, "Sign in again.", { code: "unauthenticated", retryable: false });
    const url = `${API_PREFIX}${path}`;
    const method = (init.method ?? "GET").toUpperCase();
    // The key is fixed before the first attempt, so a retry after a refresh is the same command to the server.
    const idempotencyKey = init.idempotencyKey ?? (method === "GET" || method === "HEAD" ? undefined : newKey());
    const request = { ...init, method, ...(idempotencyKey ? { idempotencyKey } : {}) };
    try {
      return await apiFetch(base, url, withAuth(request, state.accessToken), fetchImpl);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const refreshed = await refreshOnce();
      if (!refreshed || !state) throw error;
      return apiFetch(base, url, withAuth(request, state.accessToken), fetchImpl);
    }
  }

  async function json<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
    const response = await fetchAuthed(path, init);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    state: () => state,
    admin: () => state?.admin ?? null,
    baseUrl: base,
    subscribe(listener: (state: LiveSessionState | null) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async signIn(email: string, password: string): Promise<AdminMe> {
      const session = await authCall("/admin/auth/sign-in", { email: email.trim(), password });
      setState(fromSession(session));
      return session.admin;
    },

    /** The setup link's token (contract §9): who it is for, or the server's error (expired, used). */
    async checkSetupLink(setupToken: string): Promise<{ email: string; name: string; expiresAt: string }> {
      const response = await apiFetch(base, `${API_PREFIX}/admin/auth/setup-password/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupToken }) }, fetchImpl);
      return (await response.json()) as { email: string; name: string; expiresAt: string };
    },

    /** Chooses the first password with the setup link's token; the answer is a session, so the admin is signed in. */
    async setupPassword(setupToken: string, password: string): Promise<AdminMe> {
      const session = await authCall("/admin/auth/setup-password", { setupToken, password });
      setState(fromSession(session));
      return session.admin;
    },

    /** Revokes the session on the server (204, idempotent) and forgets the tokens whatever the server answers. */
    async signOut(): Promise<void> {
      const token = state?.accessToken;
      setState(null);
      options.onSignedOut?.("sign_out");
      if (!token) return;
      try {
        await apiFetch(base, `${API_PREFIX}/admin/auth/sign-out`, withAuth({ method: "POST" }, token), fetchImpl);
      } catch {
        // The tokens are already gone here; a failed revoke changes nothing for the panel.
      }
    },

    /**
     * One authenticated call: contract headers (apiFetch) plus Authorization: Bearer. A 401 refreshes the token once
     * and retries; when the refresh fails the session is cleared and the 401 is thrown.
     */
    fetch: fetchAuthed,
    json,

    /** A mutation body as JSON with a fresh Idempotency-Key (uuid). */
    post<T>(path: string, body?: unknown): Promise<T> {
      return json<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), idempotencyKey: newKey() });
    },

    /** PUT with a JSON body and a fresh Idempotency-Key (the config drafts, contract §6). */
    put<T>(path: string, body: unknown): Promise<T> {
      return json<T>(path, { method: "PUT", body: JSON.stringify(body), idempotencyKey: newKey() });
    },

    /** PATCH with a JSON body and a fresh Idempotency-Key (v0.18.0: PATCH /admin/vehicles/{vehicleId}). */
    patch<T>(path: string, body: unknown): Promise<T> {
      return json<T>(path, { method: "PATCH", body: JSON.stringify(body), idempotencyKey: newKey() });
    },

    async me(): Promise<AdminMe> {
      const me = await json<unknown>("/admin/auth/me");
      if (!isAdminMe(me)) throw new ApiError(0, "The server's /me payload is not an AdminMe.", { code: "internal", retryable: false });
      if (state) setState({ ...state, admin: me });
      return me;
    },

    /**
     * contract v0.16.1 §9: saves the signed-in admin's own panel language (null = country default) and keeps the
     * server's AdminMe, so the panel switches at once and the choice stays after reload, sign-in and on other devices.
     */
    async updateMyLanguage(language: "en" | "fr" | "sv" | null): Promise<AdminMe> {
      const me = await json<unknown>("/admin/auth/me", { method: "PATCH", body: JSON.stringify({ language }), idempotencyKey: newKey() });
      if (!isAdminMe(me)) throw new ApiError(0, "The server's /me payload is not an AdminMe.", { code: "internal", retryable: false });
      if (state) setState({ ...state, admin: me });
      return me;
    },

    /** A document file as a Blob with its media type, fetched with the bearer token (never a token in a URL). */
    async blob(path: string): Promise<{ blob: Blob; mediaType: string }> {
      const response = await fetchAuthed(path);
      if (!response.blob) throw new ApiError(0, "The response has no body.", { code: "internal", retryable: false });
      const blob = await response.blob();
      return { blob, mediaType: response.headers?.get("Content-Type") ?? blob.type ?? "" };
    },
  };
}

/** "" (VITE_ADMIN_API=http, same origin) becomes the page's origin, so the dev proxy and a same-host deployment work. */
export function resolveBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  return typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "";
}

export function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Whether the admin has been idle long enough to sign out (idleTimeoutSeconds, 5–240 minutes; default 900 s). */
export function idleExpired(lastActivityMs: number, nowMs: number, idleTimeoutSeconds: number): boolean {
  const seconds = Number.isFinite(idleTimeoutSeconds) && idleTimeoutSeconds > 0 ? idleTimeoutSeconds : 900;
  return nowMs - lastActivityMs >= seconds * 1000;
}
