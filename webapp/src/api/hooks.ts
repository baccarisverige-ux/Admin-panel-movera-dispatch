import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { canUseZone } from "../auth/permissions.ts";
import { useSession } from "../auth/SessionContext.tsx";
import { commandById } from "../commands/registry.ts";
import { useAdminApi } from "./AdminApiContext.tsx";
import type { CommandInput } from "./create.ts";
import type { TripRecord } from "./seed.ts";
import { useMarketScope } from "../markets/useMarketScope.ts";
import { parseZoneList } from "../markets/markets.ts";
import { ApiError } from "./httpClient.ts";
import { BUSY_MESSAGE, CHECKING_MESSAGE, UNREACHABLE_MESSAGE, outcomeOf, queryTouched, readAt, readTracked, touchedBy } from "./commandFlow.ts";

export { markPaid, PAYMENT_METHODS, setMethod } from "../payments/book.ts";
export type { BankAccount, PaymentMethod, Payout } from "../payments/book.ts";
export { bankReview, bankValidation, defaultBankReview, defaultFinanceBook, defaultMethodPolicy, issueWalletVoucher, markPayoutPaid, normalizeFinanceBook, paymentPolicy, paymentPolicyKey, payoutState, reviewBank, runReconciliation, savePaymentPolicy, voidWalletVoucher, WALLET_TOP_UPS_ORE } from "../payments/finance.ts";
export type { BankReview, FinanceBook, PaymentPolicyContext, PayoutState, ReconciliationInput, ReconciliationRun, WalletVoucher } from "../payments/finance.ts";
export { answerAsk, askDriver, currentAsk, notAccepted, raiseFare } from "../reservations/book.ts";
export { assignReservation, cancelReservation, emptyReservationBook, needsDriverSoon, normalizeReservationBook, recordReservationContact, recordReservationOffer, reservationCandidates, reservationOps, reservationWarning, saveReservationPolicy, scheduleReturnRide, stockholmLabel, stockholmLocalToIso, stockholmLocalValue, timeZoneCity, touchReservation, zonedLabel, zonedLocalToIso, zonedLocalValue, unassignReservation, DEFAULT_RESERVATION_POLICY, GIVE_UP_MINUTES } from "../reservations/book.ts";
export type { AskState, Reservation, ReservationAsk, ReservationBook, ReservationContact, ReservationOffer, ReservationOps, ReservationPolicy, ReservationRaise, ReservationStatus } from "../reservations/book.ts";
export { advanceConfigClock, approveConfig, configDiff, draftRevisionMatches, effectiveValue, emptyConfig, impactPreview, missingTranslations, normalizeConfig, publishConfig, removeOverride, rollbackConfig, REASON_GROUPS, setAppUpdate, setAppVersion, setEnvironment, setExpiry, setFeature, setMaxStops, setOverride, setReason, setSchedule, setSwitch, setZoneOverride, submitConfigApproval } from "../config/book.ts";
export type { ConfigBook, EffectiveContext, FeatureKey, OverrideLevel, OverrideRule } from "../config/book.ts";
export { activeScheduledBoost, defaultPricingBook, enabledCategoryIds, normalizePricingBook, pricingDiff, removeBoostSchedule, restorePricingVersion, saveBoostSchedule, savePriceZone, validateZonePrice } from "../pricing/book.ts";
export type { BoostSchedule, PricingBook, PricingSnapshot } from "../pricing/book.ts";

function screenRevision(client: ReturnType<typeof useQueryClient>): number | undefined {
  const revs = client
    .getQueryCache()
    .findAll({ type: "active" })
    .map((query) => readAt.get(JSON.stringify(query.queryKey)))
    .filter((rev): rev is number => rev !== undefined);
  return revs.length ? Math.min(...revs) : undefined;
}

/** `refetchMs` keeps live screens up to date by reloading on a timer. */
/** `observe` watches the list without reading it again on mount (the live list bar beside a page that reads it). */
export function useRecords(name: string, scope?: string | null, options: { refetchMs?: number; observe?: boolean } = {}) {
  const api = useAdminApi();
  const session = useSession();
  const resolved = useMarketScope(scope);
  const scopeDenied = resolved.denied;
  const effectiveScope = resolved.effective;
  const queryKey = ["records", name, JSON.stringify(effectiveScope), session.agent?.id ?? "signed-out"];
  const query = useQuery({
    queryKey,
    queryFn: () => readTracked(api, queryKey, () => api.list(name, effectiveScope)),
    refetchInterval: options.refetchMs,
    ...(options.observe ? { refetchOnMount: false, retryOnMount: false } : {}),
  });
  return { ...query, scopeDenied, effectiveScope };
}

export function useDrivers(scope: string | null) {
  return useRecords("drivers", scope);
}

export function useDriver(id: string, scope: string | null) {
  const query = useDrivers(scope);
  return { ...query, driver: query.data?.find((row) => row.id === id) };
}

export function useRiders(scope: string | null) {
  return useRecords("riders", scope);
}

export function useTrips(scope: string | null) {
  const query = useRecords("trips", scope);
  return { ...query, data: query.data as TripRecord[] | undefined };
}

export function useSearch(query: string) {
  const api = useAdminApi();
  const session = useSession();
  const resolved = useMarketScope();
  const scopeDenied = resolved.denied;
  const effectiveScope = resolved.effective;
  return useQuery({
    queryKey: ["search", query, JSON.stringify(effectiveScope), session.agent?.id ?? "signed-out"],
    queryFn: () => api.search(query, effectiveScope),
    enabled: query.trim().length > 1 && !scopeDenied,
  });
}

export function useInbox() {
  const api = useAdminApi();
  return useQuery({ queryKey: ["inbox"], queryFn: () => api.inbox() });
}

export function useFreshness() {
  const api = useAdminApi();
  return useQuery({ queryKey: ["freshness"], queryFn: () => api.freshness() });
}

export function useRevision() {
  const api = useAdminApi();
  return useQuery({ queryKey: ["revision"], queryFn: () => api.revision() });
}

export function useAudit(refetchMs?: number) {
  const api = useAdminApi();
  return useQuery({ queryKey: ["audit"], queryFn: () => readTracked(api, ["audit"], () => api.audit()), refetchInterval: refetchMs });
}

export function useApprovals(refetchMs?: number) {
  const api = useAdminApi();
  return useQuery({ queryKey: ["approvals"], queryFn: () => readTracked(api, ["approvals"], () => api.approvals()), refetchInterval: refetchMs });
}

export type CommandPhase = "idle" | "submitting" | "checking" | "committed" | "rejected" | "pending_approval";

type Attempt = {
  fingerprint: string;
  idempotencyKey: string;
  expectedRev: number;
};

let globalCommandBusy = false;
const globalCommandListeners = new Set<() => void>();

function setGlobalCommandBusy(next: boolean) {
  if (globalCommandBusy === next) return;
  globalCommandBusy = next;
  for (const listener of globalCommandListeners) listener();
}

function subscribeGlobalCommand(listener: () => void) {
  globalCommandListeners.add(listener);
  return () => globalCommandListeners.delete(listener);
}

function globalCommandSnapshot() {
  return globalCommandBusy;
}

function newIdempotencyKey(action: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${action}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useCommands() {
  const api = useAdminApi();
  const client = useQueryClient();
  const session = useSession();
  const [params] = useSearchParams();
  const lock = useRef(false);
  const busy = useSyncExternalStore(subscribeGlobalCommand, globalCommandSnapshot, globalCommandSnapshot);
  const lastAttempt = useRef<Attempt | null>(null);
  /** The last attempt's outcome is not known for sure, so a retry must reuse its operation key. */
  const retrySameKey = useRef(false);
  const [phase, setPhase] = useState<CommandPhase>("idle");
  const [message, setMessage] = useState("");

  /** Read again only what the command can have changed (C-18); the rest is moved to the new revision. */
  async function refresh(spec: ReturnType<typeof commandById>, extra: Partial<CommandInput>, expectedRev: number, rev: number | undefined) {
    const touched = touchedBy(spec, extra);
    // Exactly one change since the screen's revision means it was this command: untouched reads are still current.
    const onlyThis = rev !== undefined && rev === expectedRev + 1;
    if (!onlyThis) {
      await client.invalidateQueries();
      return;
    }
    for (const query of client.getQueryCache().findAll()) {
      const key = JSON.stringify(query.queryKey);
      if (!queryTouched(query.queryKey, touched) && readAt.get(key) === expectedRev) readAt.set(key, rev);
    }
    await client.invalidateQueries({ predicate: (query) => queryTouched(query.queryKey, touched) });
  }

  async function run(id: string, extra: Partial<CommandInput> = {}) {
    const spec = commandById(id);
    if (!spec) throw new Error(`Unknown command ${id}`);
    if (lock.current || globalCommandBusy) {
      // Never drop a click silently (C-16): the buttons are disabled meanwhile, and this says why.
      setMessage(BUSY_MESSAGE);
      return undefined;
    }
    const publicPick = id === "admin.auth.pickAgent";
    if (!session.agent && !publicPick) {
      setPhase("rejected");
      setMessage("Sign in again.");
      return undefined;
    }
    if (spec.reason && !extra.reason) {
      setPhase("rejected");
      setMessage("A reason is required.");
      return undefined;
    }
    // Live mode (src/live): the server has no demo command endpoint. A screen-only command (menu, sign out, tabs,
    // close a dialog) runs in the browser; the live screens send their own requests with the bearer token.
    if (api.kind === "http" && spec.scope === "global") {
      setPhase("committed");
      setMessage("");
      return { message: "", operationId: extra.idempotencyKey ?? newIdempotencyKey(id), status: "committed" as const, rev: 0 };
    }

    lock.current = true;
    setGlobalCommandBusy(true);
    setPhase("submitting");
    setMessage("");

    const targetId = extra.targetId ?? id;
    const fingerprint = JSON.stringify([
      id,
      targetId,
      extra.reason ?? "",
      extra.before ?? "",
      extra.after ?? spec.label,
      extra.collection ?? "",
      extra.entityState ?? "",
      extra.amountOre ?? null,
      extra.scope ?? params.get("scope") ?? "all",
      extra.patch ?? null,
    ]);
    const retry = retrySameKey.current && lastAttempt.current?.fingerprint === fingerprint;
    const idempotencyKey = extra.idempotencyKey ?? (retry ? lastAttempt.current!.idempotencyKey : newIdempotencyKey(id));
    const expectedRev = extra.expectedRev ?? (retry ? lastAttempt.current!.expectedRev : screenRevision(client) ?? (await api.revision()));
    lastAttempt.current = { fingerprint, idempotencyKey, expectedRev };
    retrySameKey.current = false;

    // A slow answer shows "Checking…" (C-14), never a final "Unknown": the answer, or a re-check of the server, settles it.
    let slow = false;
    const timer = setTimeout(() => {
      slow = true;
      setPhase("checking");
      setMessage(CHECKING_MESSAGE);
    }, 900);
    const actorId = session.agent?.id ?? "signed-out";

    /** Asks the server what happened to this operation key. */
    async function recheck(fallback: string) {
      try {
        const outcome = outcomeOf(await api.operation(idempotencyKey, actorId), fallback);
        setPhase(outcome.phase);
        setMessage(outcome.message);
        retrySameKey.current = outcome.retrySameKey;
      } catch {
        setPhase("rejected");
        setMessage(UNREACHABLE_MESSAGE);
        retrySameKey.current = true;
      }
    }

    try {
      const result = await api.command({
        action: id,
        targetId,
        reason: extra.reason ?? "No person affected",
        // Sent so the server can refuse a stale tab; the server takes the actor from the session, not from here.
        actorId: session.agent?.id,
        scope: extra.scope ?? params.get("scope") ?? "all",
        idempotencyKey,
        expectedRev,
        expectedSliceRev: extra.expectedSliceRev,
        entityState: extra.entityState,
        amountOre: extra.amountOre,
        before: extra.before ?? "",
        after: extra.after ?? spec.label,
        sliceKey: extra.sliceKey,
        value: extra.value,
        collection: extra.collection,
        patch: extra.patch,
      });
      clearTimeout(timer);
      if (slow) await recheck(result.message);
      else {
        setPhase(result.status);
        setMessage(result.message);
      }
      await refresh(spec, extra, expectedRev, result.rev);
      return result;
    } catch (error) {
      clearTimeout(timer);
      const text = error instanceof Error ? error.message : "Rejected";
      // A lost connection or a busy server says nothing about whether the command ran: ask the server.
      const unsure = error instanceof ApiError ? error.status === 0 || error.status === 429 || error.status >= 500 : !(error instanceof Error);
      if (unsure) await recheck(text);
      else {
        setPhase("rejected");
        setMessage(text);
      }
      await client.invalidateQueries();
      return undefined;
    } finally {
      lock.current = false;
      setGlobalCommandBusy(false);
    }
  }

  return { run, phase, message, busy };
}

export function useCommand(action: string) {
  const commands = useCommands();
  return {
    phase: commands.phase,
    message: commands.message,
    run(input: Partial<CommandInput>) {
      return commands.run(action, input);
    },
  };
}

export function useSlice<T>(key: string, fallback: T, options: { enabled?: boolean } = {}) {
  const api = useAdminApi();
  const { agent }=useSession();
  const [params]=useSearchParams();
  const requested=params.get("scope");
  const scope=agent ? { ...agent.scope, zones: requested ? canUseZone(agent,requested) ? parseZoneList(requested) : ["__scope-denied__"] : agent.scope.zones } : undefined;
  const queryKey = ["slice", key, agent?.id, JSON.stringify(scope)];
  const query = useQuery({ queryKey, queryFn: () => readTracked(api, queryKey, () => api.readSlice(key, fallback, agent && scope ? { actorId:agent.id,role:agent.role,scope } : undefined)), enabled:Boolean(agent) && options.enabled !== false });
  const command = useCommand(`admin.${key}.save`);
  return {
    value: query.data ?? fallback,
    loading: query.isLoading,
    message: command.message || query.error?.message || "",
    error: query.error,
    refetch: query.refetch,
    async save(value: T, meta: { targetId: string; reason: string; actorId: string; before: string; after: string; expectedSliceRev?: number }) {
      return command.run({ ...meta, sliceKey: key, value });
    },
  };
}

export { DEFAULT_SAFETY, emptySafety, validateSafety, safetyAction } from "../safety/ops.ts";
export type { SafetyBook, SafetyPolicy } from "../safety/ops.ts";

export { emptySupport, ticketOps, supportChange } from "../support/ops.ts";
export type { SupportBook, TicketOps } from "../support/ops.ts";

export { emptyCampaigns, newCampaign, validateCampaign, campaignAudience, changeCampaign } from "../messages/ops.ts";
export type { Campaign, CampaignBook } from "../messages/ops.ts";

export { STUDIO_SLOTS, emptyStudio, studioSlot, changeStudio } from "../content/studio.ts";
export type { StudioBook, StudioText } from "../content/studio.ts";

export { emptyGrowth, newGrowthRule, saveGrowthRule, redeemGrowth, moderateGrowth, growthReviews } from "../growth/ops.ts";
export type { GrowthBook, GrowthRule } from "../growth/ops.ts";

export { emptyReports, reportRows, reportExport, stockholmDay } from "../reports/ops.ts";
export type { ReportsBook, ReportFilter } from "../reports/ops.ts";

export { GATE_A_CHECKS, emptyGateA, recordGateA, gateAState } from "../gates/gateA.ts";
export type { GateBook, GateCheck, GateEvidence } from "../gates/gateA.ts";
