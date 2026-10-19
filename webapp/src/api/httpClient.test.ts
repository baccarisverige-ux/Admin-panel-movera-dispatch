import { API_VERSION, ApiError, ERROR_CODES, apiRequest, classifyStatus, parseErrorBody } from "./httpClient.ts";
import { contractJson } from "../contract/load.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

assert(classifyStatus(409) === "Someone else changed this. Reload.", "409 is a conflict, not success");
assert(classifyStatus(0).includes("Offline"), "offline");

await apiRequest("", "/ready").then(
  () => {
    throw new Error("empty base should reject");
  },
  (error: unknown) => assert(error instanceof ApiError && /not connected/.test(error.message), "not connected"),
);

const conflict = await apiRequest("https://staging.example", "/ready", {}, async () => ({ ok: false, status: 409, json: async () => ({}) })).then(
  () => "ok",
  (error: unknown) => error,
);
assert(conflict instanceof ApiError && conflict.status === 409, "409 is not treated as success");

const ready = await apiRequest("https://staging.example", "/ready", {}, async () => ({
  ok: true,
  status: 200,
  json: async () => ({ currency: "SEK", timeZone: "Europe/Stockholm" }),
}));
assert((ready as { currency: string }).currency === "SEK", "ready body");

// Contract v0.3.0: error codes, error body and headers.
const contract = contractJson<{ errors: { codes: string[] }; headers: Record<string, string> }>("contract.json");
assert(JSON.stringify(ERROR_CODES) === JSON.stringify(contract.errors.codes), "error codes equal contract.json#errors.codes");
assert(API_VERSION === contract.headers["X-Api-Version"], "X-Api-Version equals the contract");

let seen: Headers | null = null;
const projection = { tripId: "T1", status: "arrived", version: 7 };
const stale = await apiRequest("https://staging.example", "/admin/trips/T1/cancel", { method: "POST", body: "{}", idempotencyKey: "cancel-T1-0000000001" }, async (_url, init) => {
  seen = new Headers(init?.headers);
  return { ok: false, status: 409, json: async () => ({ code: "version_mismatch", message: "Trip changed", requestId: "req-9", retryable: false, projection }) };
}).then(() => null, (error: unknown) => error);
assert(stale instanceof ApiError && stale.code === "version_mismatch" && stale.requestId === "req-9" && stale.retryable === false && stale.message === "Trip changed", "the error body is parsed");
assert(stale instanceof ApiError && JSON.stringify(stale.projection) === JSON.stringify(projection), "409 keeps the current projection for a rebase");
const sent = seen as Headers | null;
assert(sent?.get("Idempotency-Key") === "cancel-T1-0000000001" && sent.get("X-Api-Version") === "0.3" && (sent.get("X-Request-Id") ?? "").length > 0, "mutation headers");

let getHeaders: Headers | null = null;
await apiRequest("https://staging.example", "/admin/trips/T1", { requestId: "req-get-1" }, async (_url, init) => {
  getHeaders = new Headers(init?.headers);
  return { ok: true, status: 200, json: async () => ({}) };
});
const read = getHeaders as Headers | null;
assert(read?.get("X-Request-Id") === "req-get-1" && read.get("Idempotency-Key") === null && read.get("X-Api-Version") === "0.3", "reads carry the request id and version, no idempotency key");

let generated = "";
await apiRequest("https://staging.example", "/admin/trips/T1/no-show", { method: "POST" }, async (_url, init) => {
  generated = new Headers(init?.headers).get("Idempotency-Key") ?? "";
  return { ok: true, status: 200, json: async () => ({}) };
});
assert(generated.length >= 16 && generated.length <= 128, "a mutation without a key gets one of 16–128 chars");
const short = await apiRequest("https://staging.example", "/x", { method: "POST", idempotencyKey: "short" }, async () => ({ ok: true, status: 200, json: async () => ({}) })).then(() => null, (error: unknown) => error);
assert(short instanceof ApiError && short.code === "invalid_request", "a too-short key is refused before sending");

const html = await apiRequest("https://staging.example", "/x", {}, async () => ({ ok: false, status: 503, json: async () => { throw new Error("not json"); } })).then(() => null, (error: unknown) => error);
assert(html instanceof ApiError && html.code === "unavailable" && html.retryable && html.requestId, "a body that is not JSON falls back to the status");
assert(parseErrorBody({ code: "made_up", message: "x" }) === null && parseErrorBody({ code: "conflict", message: "x" })?.retryable === false, "only contract codes parse");

console.log("http client ok");
