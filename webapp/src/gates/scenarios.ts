import { classifyStatus } from "../api/httpClient.ts";
import { can } from "../auth/permissions.ts";
import { APPS, tripContractMatchesApps } from "./apps.ts";
import { canStartCheckout, existingAuthContinues, type PaymentMethod } from "../payments/book.ts";
import { liveSos, liveTicket } from "./frontendC.ts";

export type ScenarioResult = {
  id: string;
  pass: boolean;
  staging: boolean;
  note: string;
};

export function chapter16(): ScenarioResult[] {
  const results: ScenarioResult[] = [];
  const sim = (id: string, pass: boolean, note: string) => results.push({ id, pass, staging: false, note });

  const apps = APPS.map((app) => `${app.name} ${app.sha.slice(0, 7)}`).join(" and ");
  const sameStatuses = tripContractMatchesApps();
  sim("T01", false, sameStatuses ? `${apps} are live frontends and use the same 19 trip statuses (contract v0.3.0). They do not share a trip id with this admin.` : "Trip statuses do not match the apps.");
  sim("T02", false, "The admin refuses a finished trip. The driver frontend has a cancelled-by-Movera sheet. There is no shared trip, so the fee is not proven in both apps.");
  sim("T03", false, "Two drivers claiming the same trip is not simulated.");
  sim("T04", false, `${apps} exist. Resume after background was not run on them.`);
  sim("T05", false, "The driver frontend exists. Suspension across a restart was not run on it.");
  sim("T06", false, "The admin preview matches the rider formula. The driver offer and the receipt are not connected.");
  const methods = { card: true, apple: true, google: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;
  sim("T07", !canStartCheckout(methods, "cash") && existingAuthContinues({ id: "C", method: "cash", state: "authorized" }, methods), "New cash checkout refused. Existing authorisation continues.");
  sim("T08", false, "A repeated refund key is one effect. Tip and payout retries are not all wired.");
  sim("T09", false, "Cancel keeps the policy version in the reservation book. Daylight-saving was not exercised, so this scenario is not passed.");
  const view = liveSos();
  sim("T10", !view.error && view.status === "resolved" && !("pin" in view.record), "SOS taken and resolved. No PIN.");
  const ticket = liveTicket();
  sim("T11", ticket.replies === 1 && ticket.private, "One public reply. The note stays private.");
  sim("T12", false, "A stale revision is a conflict and a second agent can publish. Scheduled expiry does not reach the apps.");
  sim("T13", false, "The audience filter exists. A deep link does not open an app screen, so this scenario is not passed.");
  sim("T14", !can("support", "finance.read") && can("finance", "payments.refund"), "Out-of-scope permission is refused in the admin.");
  sim("T15", [401, 403, 409, 422, 429, 503, 0].every((status) => !classifyStatus(status).toLowerCase().includes("saved") || status === 0), "401, 403, 409, 422, 429, 503 and offline have their own text.");
  sim("T16", false, "The live site is still the demo adapter. Gate D is not claimed.");

  return results;
}

export function gateB(stagingUrl: string | undefined, results = chapter16()): { passed: false; reason: string } | { passed: true; reason: string } {
  if (!stagingUrl) return { passed: false, reason: "No staging URL. Gate B is not claimed." };
  if (results.some((item) => !item.pass || item.staging !== true)) {
    return { passed: false, reason: "Chapter 16 has not passed on staging." };
  }
  return { passed: true, reason: "Staging scenarios passed." };
}
