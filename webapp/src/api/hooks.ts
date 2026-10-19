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

export { advancePrivacy, blockRider, creditWallet, findRiders, RIDERS, signOutRider } from "../riders/book.ts";
export type { Rider } from "../riders/book.ts";
export { advance, testSend } from "../messages/book.ts";
export type { Delivery, Outbound } from "../messages/book.ts";
export { addNote, claim, deliveredToRider, reply } from "../support/book.ts";
export type { Ticket } from "../support/book.ts";
export { publicIncident, resolveIncident, takeIncident } from "../safety/book.ts";
export type { Incident } from "../safety/book.ts";
export { markPaid, PAYMENT_METHODS, setMethod } from "../payments/book.ts";
export type { BankAccount, PaymentMethod, Payout } from "../payments/book.ts";
export { bankReview, bankValidation, defaultBankReview, defaultFinanceBook, defaultMethodPolicy, issueWalletVoucher, markPayoutPaid, normalizeFinanceBook, paymentPolicy, paymentPolicyKey, payoutState, reviewBank, runReconciliation, savePaymentPolicy, voidWalletVoucher, WALLET_TOP_UPS_ORE } from "../payments/finance.ts";
export type { BankReview, FinanceBook, PaymentPolicyContext, PayoutState, ReconciliationInput, ReconciliationRun, WalletVoucher } from "../payments/finance.ts";
export { answerAsk, askDriver, currentAsk, notAccepted, raiseFare } from "../reservations/book.ts";
export { assignReservation, cancelReservation, emptyReservationBook, needsDriverSoon, normalizeReservationBook, recordReservationContact, recordReservationOffer, reservationCandidates, reservationOps, reservationWarning, saveReservationPolicy, scheduleReturnRide, stockholmLabel, stockholmLocalToIso, stockholmLocalValue, touchReservation, unassignReservation, DEFAULT_RESERVATION_POLICY, GIVE_UP_MINUTES } from "../reservations/book.ts";
export type { AskState, Reservation, ReservationAsk, ReservationBook, ReservationContact, ReservationOffer, ReservationOps, ReservationPolicy, ReservationRaise, ReservationStatus } from "../reservations/book.ts";
export { averageStars, BONUSES, hideReview } from "../growth/book.ts";
export type { Review } from "../growth/book.ts";
export { editContent, phonePreview, publishContent, rollbackContent } from "../content/book.ts";
export type { ContentBook } from "../content/book.ts";
export { advanceConfigClock, approveConfig, configDiff, draftRevisionMatches, effectiveValue, emptyConfig, impactPreview, missingTranslations, normalizeConfig, publishConfig, removeOverride, rollbackConfig, REASON_GROUPS, setAppUpdate, setAppVersion, setEnvironment, setExpiry, setFeature, setMaxStops, setOverride, setReason, setSchedule, setSwitch, setZoneOverride, submitConfigApproval } from "../config/book.ts";
export type { ConfigBook, EffectiveContext, FeatureKey, OverrideLevel, OverrideRule } from "../config/book.ts";
export { activeScheduledBoost, defaultPricingBook, enabledCategoryIds, normalizePricingBook, pricingDiff, removeBoostSchedule, restorePricingVersion, saveBoostSchedule, savePriceZone, validateZonePrice } from "../pricing/book.ts";
export type { BoostSchedule, PricingBook, PricingSnapshot } from "../pricing/book.ts";

/** `refetchMs` keeps live screens up to date by reloading on a timer. */
export function useRecords(name: string, scope?: string | null, options: { refetchMs?: number } = {}) {
  const api = useAdminApi();
  const session = useSession();
  const resolved = useMarketScope(scope);
  const scopeDenied = resolved.denied;
  const effectiveScope = resolved.effective;
  const query = useQuery({
    queryKey: ["records", name, JSON.stringify(effectiveScope), session.agent?.id ?? "signed-out"],
    queryFn: () => api.list(name, effectiveScope),
    refetchInterval: options.refetchMs,
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
  return useQuery({ queryKey: ["audit"], queryFn: () => api.audit(), refetchInterval: refetchMs });
}

export function useApprovals(refetchMs?: number) {
  const api = useAdminApi();
  return useQuery({ queryKey: ["approvals"], queryFn: () => api.approvals(), refetchInterval: refetchMs });
}

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
  const [phase, setPhase] = useState<"idle" | "submitting" | "unknown" | "committed" | "rejected" | "pending_approval">("idle");
  const [message, setMessage] = useState("");

  async function run(id: string, extra: Partial<CommandInput> = {}) {
    const spec = commandById(id);
    if (!spec) throw new Error(`Unknown command ${id}`);
    if (lock.current || globalCommandBusy) return undefined;
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
    const retry = phase === "unknown" && lastAttempt.current?.fingerprint === fingerprint;
    const idempotencyKey = extra.idempotencyKey ?? (retry ? lastAttempt.current!.idempotencyKey : newIdempotencyKey(id));
    const expectedRev = extra.expectedRev ?? (retry ? lastAttempt.current!.expectedRev : await api.revision());
    lastAttempt.current = { fingerprint, idempotencyKey, expectedRev };

    let unknown = false;
    const timer = setTimeout(() => {
      unknown = true;
      setPhase("unknown");
      setMessage("Unknown. Check the audit before trying again. A retry will reuse the same operation key.");
    }, 900);

    try {
      const result = await api.command({
        action: id,
        targetId,
        reason: extra.reason ?? "No person affected",
        actorId: extra.actorId ?? session.agent?.id ?? "signed-out",
        actorRole: extra.actorRole ?? session.agent?.role ?? "super",
        actorScope: extra.actorScope ?? session.agent?.scope ?? { zones: "all", market: "SE-STO" },
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
      if (!unknown) {
        setPhase(result.status);
        setMessage(result.message);
        lastAttempt.current = null;
      }
      await client.invalidateQueries();
      return result;
    } catch (error) {
      clearTimeout(timer);
      if (!unknown) {
        setPhase("rejected");
        setMessage(error instanceof Error ? error.message : "Rejected");
        lastAttempt.current = null;
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
  const query = useQuery({ queryKey: ["slice", key, agent?.id, JSON.stringify(scope)], queryFn: () => api.readSlice(key, fallback, agent && scope ? { actorId:agent.id,role:agent.role,scope } : undefined), enabled:Boolean(agent) && options.enabled !== false });
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
