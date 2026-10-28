/** Error codes of contract v0.3.0 (contract.json#errors.codes). */
export const ERROR_CODES = ["invalid_request", "unauthenticated", "forbidden", "not_found", "otp_expired", "conflict", "invalid_transition", "version_mismatch", "rate_limited", "unavailable", "internal"] as const;
/** Contract v0.10.1 adds documents_not_approved (activation and car documents); accepted before the contract copy is synced. */
export const NEWER_ERROR_CODES = ["documents_not_approved"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number] | (typeof NEWER_ERROR_CODES)[number];

/** The wire error body: { code, message, requestId, retryable, projection? }. */
export type ApiErrorBody = { code: ErrorCode; message: string; requestId: string; retryable: boolean; projection?: unknown; reason?: string; details?: string[] };

export const API_VERSION = "0.5";

export class ApiError extends Error {
  readonly status: number;
  /** Contract error code; derived from the HTTP status when the server sent no body. */
  readonly code: ErrorCode;
  readonly requestId: string | null;
  readonly retryable: boolean;
  /** The current resource on 409 version_mismatch / invalid_transition, so the screen can rebase. */
  readonly projection: unknown;
  /** Optional machine-readable detail under the code (snake_case, e.g. invalid_credentials, on_trip); never shown as is. */
  readonly reason: string | null;
  /** v0.10.1: the detail list (documents_not_approved: "<scope>:<type>" for each missing required document). */
  readonly details: readonly string[];
  /** Seconds from a Retry-After header on 429 / 503, when the server sent one. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, message: string, body: Partial<ApiErrorBody> & { retryAfterSeconds?: number | null } = {}) {
    super(message);
    this.status = status;
    this.code = body.code ?? codeForStatus(status);
    this.requestId = body.requestId ?? null;
    this.retryable = body.retryable ?? (status === 0 || status === 429 || status === 503);
    this.projection = body.projection;
    this.reason = body.reason ?? null;
    this.details = Array.isArray(body.details) ? body.details.filter((item): item is string => typeof item === "string") : [];
    this.retryAfterSeconds = body.retryAfterSeconds ?? null;
  }
}

const STATUS_TEXT: Record<number, string> = {
  401: "Sign in again.",
  403: "Your role cannot do that.",
  409: "Someone else changed this. Reload.",
  422: "That value was refused.",
  429: "Too many attempts. Wait.",
  503: "The service is unavailable.",
};

export function classifyStatus(status: number): string {
  if (status === 0) return "Offline. Nothing was saved.";
  return STATUS_TEXT[status] ?? `Request failed (${status}).`;
}

export function codeForStatus(status: number): ErrorCode {
  if (status === 0 || status === 502 || status === 503 || status === 504) return "unavailable";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 410) return "otp_expired";
  if (status === 429) return "rate_limited";
  return "internal";
}

/** Reads a contract error body; anything else (HTML, empty, wrong shape) gives null. */
export function parseErrorBody(value: unknown): ApiErrorBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.code !== "string" || ![...ERROR_CODES, ...NEWER_ERROR_CODES].includes(raw.code as ErrorCode) || typeof raw.message !== "string") return null;
  return {
    code: raw.code as ErrorCode,
    message: raw.message,
    requestId: typeof raw.requestId === "string" ? raw.requestId : "",
    retryable: raw.retryable === true,
    ...("projection" in raw ? { projection: raw.projection } : {}),
    ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
    ...(Array.isArray(raw.details) ? { details: raw.details.filter((item): item is string => typeof item === "string") } : {}),
  };
}

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown>; headers?: { get(name: string): string | null }; blob?: () => Promise<Blob> };
export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponse>;
export type ApiRequestInit = RequestInit & { idempotencyKey?: string; requestId?: string };

/** Reads a Retry-After header (seconds or an HTTP date) as whole seconds, or null. */
export function retryAfterSeconds(headers: { get(name: string): string | null } | undefined, nowMs = Date.now()): number | null {
  const raw = headers?.get("Retry-After");
  if (!raw) return null;
  if (/^\d+$/.test(raw.trim())) return Number(raw.trim());
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/**
 * One HTTP call with the contract headers: X-Api-Version, X-Request-Id on every call and an
 * Idempotency-Key (16–128 chars) on every mutation (generated when the caller has none; pass the same key to retry).
 * A non-OK response throws ApiError carrying the server's { code, message, requestId, retryable, projection }.
 * Any header the caller passes (for example Authorization) is kept.
 */
export async function apiRequest(base: string, path: string, init: ApiRequestInit = {}, fetchImpl: FetchLike = fetch): Promise<unknown> {
  const response = await apiFetch(base, path, init, fetchImpl);
  return response.json();
}

/** The same call as apiRequest, giving back the OK response itself (for a 204 or a file body). */
export async function apiFetch(base: string, path: string, init: ApiRequestInit = {}, fetchImpl: FetchLike = fetch): Promise<FetchResponse> {
  if (!base.trim()) throw new ApiError(0, "Admin API is not connected.");
  const { idempotencyKey, requestId: givenRequestId, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  const headers = new Headers(rest.headers);
  const requestId = givenRequestId ?? headers.get("X-Request-Id") ?? newId();
  headers.set("X-Api-Version", API_VERSION);
  headers.set("X-Request-Id", requestId);
  if (MUTATIONS.has(method) || idempotencyKey) {
    const key = idempotencyKey ?? headers.get("Idempotency-Key") ?? newId();
    if (key.length < 16 || key.length > 128) throw new ApiError(0, "Idempotency-Key must be 16 to 128 characters.", { code: "invalid_request", requestId, retryable: false });
    headers.set("Idempotency-Key", key);
  }
  let response: FetchResponse;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, "")}${path}`, { ...rest, method, headers });
  } catch {
    throw new ApiError(0, classifyStatus(0), { requestId, retryable: true });
  }
  if (!response.ok) {
    const body = parseErrorBody(await response.json().catch(() => null));
    const echoed = response.headers?.get("X-Request-Id") ?? null;
    const retryAfter = retryAfterSeconds(response.headers);
    if (body) throw new ApiError(response.status, body.message, { ...body, requestId: body.requestId || echoed || requestId, retryAfterSeconds: retryAfter });
    throw new ApiError(response.status, classifyStatus(response.status), { requestId: echoed ?? requestId, retryAfterSeconds: retryAfter });
  }
  return response;
}
