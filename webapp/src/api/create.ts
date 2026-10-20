import { emptyGateA, recordGateA, type GateBook } from "../gates/gateA.ts";
import { zoneAllowed } from "../markets/scope.ts";
import { scopedSlice, type ReadContext } from "./scopes.ts";
import { emptyReports, reportExport, type ReportsBook } from "../reports/ops.ts";
import { emptyGrowth, saveGrowthRule, redeemGrowth, moderateGrowth, growthReviews, type GrowthBook } from "../growth/ops.ts";
import { emptyStudio, changeStudio, studioSlot, type StudioBook } from "../content/studio.ts";
import { emptyCampaigns, changeCampaign, type CampaignBook } from "../messages/ops.ts";
import { emptySupport, supportChange, ticketOps, type SupportBook } from "../support/ops.ts";
import { AGENTS, canUseZone } from "../auth/permissions.ts";
import { sessionAgent } from "../auth/sessionStore.ts";
import { marketOfZone } from "../markets/markets.ts";
import { emptySafety, safetyAction, validateSafety, type SafetyBook } from "../safety/ops.ts";
import { can, type AgentScope, type Role } from "../auth/permissions.ts";
import { commandById } from "../commands/registry.ts";
import { catalogFor, type CatalogEntry } from "../data/catalog.ts";
import { CURRENCY, TIME_ZONE, isCancelReasonCode, nextStatus, type TripCommand } from "../domain/contract.ts";
import { isCurrency, type CurrencyCode } from "../domain/money.ts";
import {
  addAudit,
  findHit,
  loadDb,
  pause,
  readFault,
  resetDb,
  rowsFor,
  saveDb,
  writeFault,
  type Fault,
} from "./demoStore.ts";
import { ApiError, apiRequest, classifyStatus, type ApiErrorBody } from "./httpClient.ts";
import { REFUND_POLICY_KEY, needsSecondAdminIn, normalizeRefundPolicy, parseRefundAbove, saveRefundPolicy, type RefundPolicy } from "../payments/refundPolicy.ts";
import type { ApprovalRow, AuditRow, DemoDb, DemoRecord, InboxItem, OperationRow, ZoneScope } from "./seed.ts";

export type ApiEnv = {
  PROD: boolean;
  VITE_DATA?: string;
  VITE_ADMIN_API?: string;
};

export type PageResult = CatalogEntry;

export type CommandInput = {
  action: string;
  targetId: string;
  reason: string;
  /**
   * Who the client thinks is signed in. The server never trusts it: it takes the actor (id, role, scope)
   * from the session and refuses a request sent for someone else (for example from a tab signed in earlier).
   */
  actorId?: string;
  before: string;
  after: string;
  scope?: string;
  idempotencyKey?: string;
  expectedRev?: number;
  expectedSliceRev?: number;
  entityState?: string;
  /** Ignored for money commands with an approval threshold: the server reads the amount from the stored record. */
  amountOre?: number;
  sliceKey?: string;
  value?: unknown;
  collection?: string;
  patch?: Record<string, string | number | boolean | null>;
};

export type CommandResult = {
  message: string;
  db: DemoDb;
  operationId: string;
  status: "committed" | "pending_approval";
  rev: number;
};

export type AdminApi = {
  kind: "fixture" | "http";
  demo: boolean;
  /** The default market's currency and time zone. Any contract currency is accepted (SE, FR and TN markets). */
  ready: () => Promise<{ currency: CurrencyCode; timeZone: string; demo: boolean }>;
  page: (pageId: string) => Promise<PageResult>;
  list: (name: string, scope: ZoneScope) => Promise<DemoRecord[]>;
  search: (query: string, scope: ZoneScope) => Promise<{ kind: string; id: string; label: string; path: string }[]>;
  command: (input: CommandInput) => Promise<CommandResult>;
  revision: () => Promise<number>;
  audit: () => Promise<AuditRow[]>;
  approvals: () => Promise<ApprovalRow[]>;
  operation: (idempotencyKey: string, actorId: string) => Promise<OperationRow | null>;
  reset: () => Promise<DemoDb>;
  getFault: () => Promise<Fault>;
  setFault: (fault: Fault) => Promise<void>;
  inbox: () => Promise<InboxItem[]>;
  freshness: () => Promise<string>;
  readSlice: <T>(key: string, fallback: T, context?: ReadContext) => Promise<T>;
};

const DEMO_DELAY_MS = 200;

const TARGET_COLLECTIONS = [
  "drivers",
  "riders",
  "vehicles",
  "fleets",
  "fleetOwners",
  "trips",
  "reservations",
  "tickets",
  "incidents",
  "payments",
  "refunds",
  "payouts",
  "wallet",
  "templates",
  "banners",
  "events",
  "bonuses",
  "staff",
] as const;

type TargetCollection = (typeof TARGET_COLLECTIONS)[number];

function unsupported(): never {
  throw new ApiError(0, "Admin API is not connected.");
}

function operationKey(actorId: string, idempotencyKey: string): string {
  return `${actorId}:${idempotencyKey}`;
}

function makeOperationId(actorId: string, idempotencyKey: string): string {
  const compact = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);
  return `op-${actorId}-${compact || "command"}`;
}

function targetRecord(db: DemoDb, targetId: string, collection?: string): DemoRecord | null {
  if (collection && TARGET_COLLECTIONS.includes(collection as TargetCollection)) {
    return db[collection as TargetCollection].find((row) => row.id === targetId) ?? null;
  }
  for (const key of TARGET_COLLECTIONS) {
    const row = db[key].find((item) => item.id === targetId);
    if (row) return row;
  }
  return null;
}

function resolveTargetScope(db: DemoDb, input: CommandInput): string {
  // An approval is in the zone of the record it acts on (it is in no collection itself).
  const approval = input.action.startsWith("admin.approval.") ? db.approvals.find((item) => item.id === input.targetId) : undefined;
  if (approval) return targetRecord(db, approval.targetId)?.zoneId ?? "all";
  const record = targetRecord(db, input.targetId, input.collection);
  if (record?.zoneId) return record.zoneId;
  if (db.zones.some((zone) => zone.id === input.targetId)) return input.targetId;
  return input.scope ?? "all";
}

function resolveTargetState(db: DemoDb, input: CommandInput): string | undefined {
  const record = targetRecord(db, input.targetId, input.collection);
  // A trip's or payment's state is the stored one, never what the client says it saw.
  const stored = input.collection === "trips" || input.collection === "payments" || /^admin\.(trip|payment)\./.test(input.action);
  if (stored && record?.status) return record.status;
  return input.entityState ?? record?.status;
}

/** Admin trip commands that move the lifecycle, by their contract command (contract.json#transitions, actor admin). */
const TRIP_LIFECYCLE: Record<string, TripCommand> = {
  "admin.trip.cancel": "cancel",
  "admin.trip.offer": "assign",
  "admin.trip.reassign": "reassign",
  "admin.trip.noShow": "no_show",
  "admin.trip.complete": "complete",
};

/**
 * The amount a money command moves, from the stored record, never from the request (C-03).
 * A payment or trip refund is always a full refund, so the amount is the stored fare.
 */
function storedAmount(db: DemoDb, input: CommandInput): { amountMinor: number; currency: CurrencyCode } | null {
  const record =
    input.action === "admin.payment.refund" ? db.payments.find((row) => row.id === input.targetId)
      : input.action === "admin.trip.refund" ? db.trips.find((row) => row.id === input.targetId)
        : undefined;
  if (record) return { amountMinor: record.fareOre ?? 0, currency: marketOfZone(record.zoneId)?.currency ?? CURRENCY };
  // The Audit page's demo refund buttons have no record; their amount is the button's own (SEK).
  if (input.action.startsWith("admin.audit.")) return { amountMinor: input.amountOre ?? 0, currency: CURRENCY };
  return null;
}

function scopeAllowed(actorScope: AgentScope, scope: string): boolean {
  if (!scope || scope === "all") return true;
  if (actorScope.countries) return zoneAllowed(actorScope, scope);
  return actorScope.zones === "all" || actorScope.zones.includes(scope);
}

function faultStatus(fault: Fault): number | null {
  if (fault === "none" || fault === "slow" || fault === "empty") return null;
  if (fault === "offline") return 0;
  return Number(fault);
}

function rejectionResult(status: number): AuditRow["result"] {
  if (status === 403) return "denied";
  if (status === 409) return "conflict";
  return "rejected";
}

/** Conflicts and state refusals can change once the record changes, so a retry must be checked again, not replayed. */
function cacheRejection(status: number): boolean {
  return status !== 409 && status !== 422;
}

function replayOperation(db: DemoDb, operation: OperationRow): CommandResult {
  if (operation.status === "rejected") throw new ApiError(operation.httpStatus, operation.message, operation.code ? { code: operation.code } : {});
  return {
    message: operation.message,
    db,
    operationId: operation.operationId,
    status: operation.status,
    rev: operation.rev,
  };
}

function rememberRejected(
  db: DemoDb,
  input: CommandInput & { actorId: string },
  resolvedScope: string,
  idempotencyKey: string,
  operationId: string,
  status: number,
  message: string,
  cache: boolean,
  code?: ApiErrorBody["code"],
): DemoDb {
  let next = addAudit(
    db,
    {
      operationId,
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId,
      scope: resolvedScope,
      before: input.before,
      after: input.after,
      reason: input.reason,
      result: rejectionResult(status),
    },
    false,
  );

  if (!cache) return next;

  const operation: OperationRow = {
    operationId,
    idempotencyKey,
    action: input.action,
    targetId: input.targetId,
    status: "rejected",
    httpStatus: status,
    message,
    ...(code ? { code } : {}),
    rev: next.rev,
    at: new Date().toISOString(),
  };
  next = {
    ...next,
    operations: {
      ...next.operations,
      [operationKey(input.actorId, idempotencyKey)]: operation,
    },
  };
  return saveDb(next);
}

/**
 * The in-browser demo server. It stands in for the real Admin API, so every check here is one the real
 * backend must repeat on its side (the browser can change anything sent from it):
 * - identity: actor id, role and scope from the session (the backend: from its token), never from the body;
 * - permission and scope: the actor's role allows the action, and the record's zone is in the actor's scope;
 * - writes: only the slice and record fields the action declares (registry `writes`); the backend should also
 *   rebuild slice contents from the command rather than store the client's computed book;
 * - state: the stored state, not the one the client says it saw (trips, payments);
 * - money: amounts from the stored record, the second-admin threshold per currency, and an approver who may
 *   do the action itself in that zone and is not the requester;
 * - idempotency: one effect per (actor, key); conflicts and state refusals are checked again on retry.
 * Not done here yet: reads (readSlice/list/audit) still trust the read context the client passes.
 */
export function createFixtureAdminApi(delayMs = DEMO_DELAY_MS): AdminApi {
  return {
    kind: "fixture",
    demo: true,

    async ready() {
      await pause(delayMs, "none");
      return { currency: CURRENCY, timeZone: TIME_ZONE, demo: true };
    },

    async page(pageId) {
      await pause(delayMs, "none");
      return catalogFor(pageId);
    },

    async list(name, scope) {
      const fault = readFault();
      await pause(delayMs, fault);
      const status = faultStatus(fault);
      if (status !== null) throw new ApiError(status, classifyStatus(status));
      return rowsFor(loadDb(), name, scope, fault);
    },

    async search(query, scope) {
      await pause(delayMs, "none");
      return findHit(loadDb(), query, scope);
    },

    async command(raw) {
      const fault = readFault();
      await pause(delayMs, fault);

      let db = loadDb();
      const spec = commandById(raw.action);
      // Identity comes from the signed-in session, never from the request (C-05). The real backend takes it from its token.
      const agent = sessionAgent();
      const pureUi = Boolean(spec && !spec.versioned && spec.audit === "none");
      if (!agent && !pureUi) throw new ApiError(401, "Sign in again.");
      if (agent && raw.actorId && raw.actorId !== agent.id) throw new ApiError(403, "You are signed in as someone else now. Reload the page.");
      const actorId = agent?.id ?? "signed-out";
      const actorRole: Role = agent?.role ?? "viewer";
      const actorScope: AgentScope = agent?.scope ?? { zones: [], market: "SE-STO" };
      raw = { ...raw, actorId };
      const idempotencyKey = raw.idempotencyKey ?? `direct-${db.rev}-${raw.action}-${raw.targetId}`;
      const expectedRev = raw.expectedRev ?? db.rev;
      const resolvedScope = resolveTargetScope(db, raw);
      const resolvedState = resolveTargetState(db, raw);
      const operationId = makeOperationId(actorId, idempotencyKey);

      const cached = db.operations[operationKey(actorId, idempotencyKey)];
      if (cached) return replayOperation(db, cached);

      // Errors carry the contract codes (X8): a stale version is 409 version_mismatch and a command the current
      // status does not allow is 409 invalid_transition, both with the current record as the projection.
      const reject = (status: number, message: string, cache = cacheRejection(status), body: Partial<ApiErrorBody> = {}): never => {
        db = rememberRejected(db, { ...raw, actorId }, resolvedScope, idempotencyKey, operationId, status, message, cache, body.code);
        throw new ApiError(status, message, { retryable: false, ...body });
      };
      const projection = () => targetRecord(db, raw.targetId, raw.collection) ?? undefined;
      const stale = (message: string, current: unknown): never => reject(409, message, false, { code: "version_mismatch", projection: current });
      const notAllowed = (message: string): never => reject(409, message, false, { code: "invalid_transition", projection: projection() });

      if (!spec) reject(422, `Unknown action ${raw.action}.`);
      const actionSpec = spec!;

      if (!can(actorRole, actionSpec.permission)) reject(403, "Your role cannot do that.");
      if (!scopeAllowed(actorScope, resolvedScope)) reject(403, "That record is outside your active scope.");
      if (actionSpec.reason && !raw.reason.trim()) reject(422, "A reason is required.");

      // A command writes only the slice and collection fields it declares in the registry (C-04).
      // The real backend must do the same, and also rebuild slice contents from the command instead of
      // accepting the client's computed book as it is (only safety, support, campaign, studio, growth,
      // report and gate evidence are rebuilt here so far).
      if (raw.sliceKey && !actionSpec.writes.slices.includes(raw.sliceKey)) reject(403, `${actionSpec.label}: this action cannot change ${raw.sliceKey}.`);
      // (A patch without a collection is never written; growth redeem uses it as a parameter.)
      if (raw.collection) {
        const fields = actionSpec.writes.collections[raw.collection];
        if (!fields) reject(403, `${actionSpec.label}: this action cannot change ${raw.collection}.`);
        const extra = Object.keys(raw.patch ?? {}).filter((field) => !fields!.includes(field));
        if (extra.length) reject(403, `${actionSpec.label}: this action cannot change ${extra.join(", ")}.`);
      }

      if (!actionSpec.versioned && actionSpec.audit === "none") {
        return {
          message: "Done.",
          db,
          operationId,
          status: "committed",
          rev: db.rev,
        };
      }

      if (expectedRev !== db.rev) stale("Someone else changed this. Reload and review the newest version.", raw.sliceKey ? db.slices[raw.sliceKey] : projection());
      if (raw.sliceKey && raw.expectedSliceRev !== undefined) {
        const currentSlice = db.slices[raw.sliceKey] as { draftRev?: unknown } | undefined;
        const currentDraftRev = typeof currentSlice?.draftRev === "number" ? currentSlice.draftRev : 1;
        if (currentDraftRev !== raw.expectedSliceRev) {
          stale("Someone else changed this configuration draft. Reload and review the newest draft.", currentSlice);
        }
      }
      // The lifecycle table decides first (X8): an admin trip command the trip's status does not allow is
      // invalid_transition, not a validation error from the action's own state list.
      const lifecycle = raw.collection === "trips" ? TRIP_LIFECYCLE[raw.action] : undefined;
      if (lifecycle) {
        // The server derives the next status from the shared table; the client's patch cannot pick it.
        const to = resolvedState ? nextStatus(resolvedState, lifecycle, "admin") : null;
        if (!to) notAllowed(`${actionSpec.label} is not allowed while the trip is ${resolvedState ?? "unknown"}.`);
        raw = { ...raw, patch: { ...(raw.patch ?? {}), status: to } };
      } else if (raw.collection === "trips" && raw.patch && "status" in raw.patch) {
        reject(422, `${actionSpec.label} cannot change the trip status.`, undefined, { code: "invalid_request" });
      }
      if (actionSpec.allowedStates && resolvedState && !actionSpec.allowedStates.includes(resolvedState)) {
        notAllowed(`${actionSpec.label} is not allowed while the record is ${resolvedState}.`);
      }
      // An admin cancel carries an admin_* reason code (contract cancelReasons per actor); a rider's or driver's code is refused.
      if (raw.action === "admin.trip.cancel") {
        const code = raw.patch?.cancelReasonCode;
        if (typeof code !== "string" || !isCancelReasonCode(code, "admin")) reject(422, "Choose an admin cancel reason.", undefined, { code: "invalid_request" });
      }

      if (raw.action.startsWith("admin.safety.")) {
        const incident = db.incidents.find(r => r.id === raw.targetId);
        if (!incident) reject(404, "Incident not found.");
        const book = (db.slices.safetyOps ?? emptySafety()) as SafetyBook;
        const proposed = raw.value as SafetyBook | undefined;
        const text = proposed?.incidents[raw.targetId]?.events.at(-1)?.text ?? "";
        const kind = raw.action.split(".").at(-1) as "take" | "contact" | "resolve";
        const result = safetyAction(book, incident!, actorId, kind, text);
        if (result.error) reject(422, result.error);
        raw = { ...raw, sliceKey: "safetyOps", value: result.book, collection: "incidents", patch: { status: result.status } };
      }
      if (raw.action === "admin.safetyOps.save") {
        const proposed = raw.value as SafetyBook | undefined;
        const policy = proposed?.policies[raw.targetId];
        if (!policy || !db.zones.some(z => z.id === raw.targetId)) reject(422, "Select a valid safety zone.");
        const error = validateSafety(policy!);
        if (error) reject(422, error);
        const book = (db.slices.safetyOps ?? emptySafety()) as SafetyBook;
        raw = { ...raw, sliceKey: "safetyOps", value: { ...book, draftRev: book.draftRev + 1, policies: { ...book.policies, [raw.targetId]: policy } } };
      }

      if (raw.action.startsWith("admin.support.")) {
        const row = db.tickets.find(r => r.id === raw.targetId);
        if (!row) reject(404, "Ticket not found.");
        const book = (db.slices.supportOps ?? emptySupport()) as SupportBook;
        const proposed = raw.value as SupportBook | undefined;
        const kind = raw.action.split(".").at(-1) as "claim" | "assign" | "reply" | "note" | "draft" | "metadata";
        const ops = proposed?.tickets[raw.targetId];
        const line = ops?.messages.at(-1);
        const owner = kind === "assign" ? ops?.owner ?? undefined : undefined;
        if (owner && !AGENTS.some(a => a.id === owner && a.active && can(a.role, "support.reply") && canUseZone(a, row!.zoneId))) reject(422, "Agent is not eligible for this ticket.");
        const text = kind === "draft" ? proposed?.drafts[`${actorId}:${raw.targetId}`] ?? "" : line?.text ?? "";
        const current = ticketOps(book,row!);
        if (kind === "metadata" && (!ops || !["normal", "urgent"].includes(ops.priority) || !["sv", "en"].includes(ops.language))) reject(422, "Invalid ticket metadata.");
        const result = supportChange(book,row!,actorId,kind,text,line?.id ?? idempotencyKey,owner,line?.attachment,kind === "metadata" ? { ...current, priority: ops!.priority, language: ops!.language, tags: ops!.tags } : undefined);
        if (result.error) reject(422,result.error);
        raw = { ...raw, sliceKey: "supportOps", value: result.book };
      }

      if (raw.action.startsWith("admin.campaign.")) {
        const book = (db.slices.campaignOps ?? emptyCampaigns()) as CampaignBook;
        const proposed = raw.value as CampaignBook | undefined;
        const campaign = proposed?.campaigns.find(c => c.id === raw.targetId);
        if (!campaign || !db.zones.some(z => z.id === campaign.zone) || !scopeAllowed(actorScope,campaign.zone)) reject(422,"Invalid campaign audience.");
        const action = raw.action.split(".").at(-1) as "save" | "test" | "publish" | "cancel" | "refresh";
        const result = changeCampaign(book,campaign!,action,actorId,campaign!.app === "rider" ? db.riders : db.drivers);
        if (result.error) reject(422,result.error);
        raw = { ...raw, sliceKey: "campaignOps", value: result.book };
      }

      if (raw.action.startsWith("admin.studio.")) {
        if (actorScope.zones !== "all") reject(403,"Global content requires all-zone scope.");
        const book = (db.slices.studioOps ?? emptyStudio()) as StudioBook;
        const proposed = raw.value as StudioBook | undefined;
        const action = raw.action.split(".").at(-1) as "save" | "publish" | "rollback";
        const draft = proposed?.slots[raw.targetId]?.draft ?? studioSlot(book,raw.targetId).draft;
        const result = changeStudio(book,raw.targetId,draft,action,actorId);
        if (result.error) reject(422,result.error);
        raw = { ...raw, sliceKey: "studioOps", value: result.book };
      }

      if (raw.action.startsWith("admin.growthOps.")) {
        const book = (db.slices.growthOps ?? emptyGrowth()) as GrowthBook;
        const proposed = raw.value as GrowthBook | undefined;
        let result: { book: GrowthBook; error?: string };
        if (raw.action.endsWith(".save")) {
          const rule = proposed?.rules.find(r => r.id === raw.targetId);
          if (!rule || !db.zones.some(z=>z.id===rule.zone) || !scopeAllowed(actorScope,rule.zone)) reject(422,"Invalid growth zone.");
          if (rule!.ownerId && !db.riders.some(r=>r.id===rule!.ownerId)) reject(422,"Referral owner is not a rider.");
          result = saveGrowthRule(book,rule!);
        } else if (raw.action.endsWith(".redeem")) {
          const reward = proposed?.ledger.at(-1);
          const rule = book.rules.find(r=>r.id===raw.targetId);
          const person = (rule?.kind === "bonus" ? db.drivers : db.riders).find(r=>r.id===reward?.personId);
          if (!person || !rule || !scopeAllowed(actorScope,rule.zone)) reject(422,"Invalid reward recipient.");
          result = redeemGrowth(book,raw.targetId,person!,reward!.key,Boolean(raw.patch?.discounted),db.trips);
        } else {
          const review = growthReviews(db.trips).find(r=>r.id===raw.targetId);
          const decision = proposed?.moderation[raw.targetId]?.at(-1);
          if (!review || !decision || !scopeAllowed(actorScope,review.zone)) reject(422,"Invalid review.");
          result = moderateGrowth(book,raw.targetId,decision!.hidden,decision!.reason,actorId);
        }
        if (result.error) reject(422,result.error);
        raw = { ...raw, sliceKey: "growthOps", value: result.book };
      }

      if (raw.action === "admin.report.export") {
        const book = (db.slices.reportOps ?? emptyReports()) as ReportsBook;
        const proposed = raw.value as ReportsBook | undefined;
        const job = proposed?.jobs[0];
        if (!job || job.actor !== actorId) reject(422,"Invalid export request.");
        const visible = db.trips.filter(r=>scopeAllowed(actorScope,r.zoneId) && (!raw.scope || raw.scope === "all" || r.zoneId === raw.scope));
        if (job!.filter.zone && !scopeAllowed(actorScope,job!.filter.zone)) reject(403,"Report zone is outside your scope.");
        const result = reportExport(book,visible,job!.filter,actorId,job!.id);
        if (result.error) reject(422,result.error);
        raw = { ...raw, sliceKey: "reportOps", value: result.book };
      }

      if (raw.action === "admin.refundPolicy.save") {
        // The server rebuilds the policy from the numbers sent and checks them (C-26), whatever else the body holds.
        const current = normalizeRefundPolicy(db.slices[REFUND_POLICY_KEY]);
        const sent = parseRefundAbove(raw.value);
        if ("error" in sent) reject(422, sent.error);
        const result = saveRefundPolicy(current, (sent as { aboveMajor: RefundPolicy["aboveMajor"] }).aboveMajor);
        if (result.error) reject(422, result.error);
        raw = { ...raw, sliceKey: REFUND_POLICY_KEY, value: result.policy };
      }

      if (raw.action === "admin.gateA.record") {
        if(actorScope.zones!=="all") reject(403,"Acceptance evidence requires all-zone scope.");
        const book=(db.slices.gateAOps??emptyGateA()) as GateBook;
        const entry=(raw.value as GateBook | undefined)?.evidence.at(-1);
        if(!entry)reject(422,"Evidence is required.");
        const result=recordGateA(book,{...entry!,actor:actorId,at:new Date().toISOString()});
        if(result.error)reject(422,result.error);
        raw={...raw,sliceKey:"gateAOps",value:result.book};
      }

      const injectedStatus = faultStatus(fault);
      if (injectedStatus !== null) {
        const transient = injectedStatus === 0 || injectedStatus === 429 || injectedStatus === 503;
        reject(
          injectedStatus,
          injectedStatus === 409 ? "This record changed. The newest version is still here." : classifyStatus(injectedStatus),
          !transient && cacheRejection(injectedStatus),
          injectedStatus === 409 ? { code: "version_mismatch", projection: raw.sliceKey ? db.slices[raw.sliceKey] : projection() } : { retryable: transient },
        );
      }

      const stored = actionSpec.secondAdmin ? storedAmount(db, raw) : null;
      if (actionSpec.secondAdmin && !stored) reject(404, "The record to refund was not found.");
      // Q25: one limit per country, from Settings (the stored refundPolicy slice); above it a second admin decides.
      if (stored && needsSecondAdminIn(normalizeRefundPolicy(db.slices[REFUND_POLICY_KEY]), stored.currency, stored.amountMinor)) {
        if (db.approvals.some((item) => item.status === "pending" && item.action === raw.action && item.targetId === raw.targetId)) {
          reject(409, "A request for this is already waiting for a second admin.", false, { code: "conflict" });
        }
        const approval: ApprovalRow = {
          id: `approval-${db.approvals.length + 1}`,
          action: raw.action,
          targetId: raw.targetId,
          requestedBy: actorId,
          amountOre: stored.amountMinor,
          currency: stored.currency,
          reason: raw.reason,
          status: "pending",
        };

        let next: DemoDb = { ...db, approvals: [approval, ...db.approvals] };
        next = addAudit(next, {
          operationId,
          actorId: actorId,
          action: raw.action,
          targetId: raw.targetId,
          scope: resolvedScope,
          before: raw.before,
          after: "pending approval",
          reason: raw.reason,
          result: "pending_approval",
        });

        const operation: OperationRow = {
          operationId,
          idempotencyKey,
          action: raw.action,
          targetId: raw.targetId,
          status: "pending_approval",
          httpStatus: 202,
          message: "Pending approval. A second authorised agent must decide this action.",
          rev: next.rev,
          at: new Date().toISOString(),
        };
        next = saveDb({
          ...next,
          operations: {
            ...next.operations,
            [operationKey(actorId, idempotencyKey)]: operation,
          },
        });

        return {
          message: operation.message,
          db: next,
          operationId,
          status: "pending_approval",
          rev: next.rev,
        };
      }

      if (raw.action === "admin.approval.approve" || raw.action === "admin.approval.reject") {
        const foundApproval = db.approvals.find((item) => item.id === raw.targetId);
        if (!foundApproval) reject(404, "Approval was not found.");
        const approval = foundApproval!;
        if (approval.status !== "pending") reject(422, `Approval is already ${approval.status}.`);
        if (approval.requestedBy === actorId) reject(403, "A second authorised agent must decide this action.");
        // The decider must be allowed to do the action itself, in the record's zone (C-02). The zone check
        // already ran above: an approval resolves to the zone of the record it acts on.
        const decided = commandById(approval.action);
        if (!decided || !can(actorRole, decided.permission)) reject(403, "Your role cannot do this action, so it cannot approve it.");

        const approved = raw.action === "admin.approval.approve";
        if (approved && approval.action === "admin.payment.refund") {
          const foundPayment = db.payments.find((item) => item.id === approval.targetId);
          if (!foundPayment) reject(404, "Payment for this approval was not found.");
          const payment = foundPayment!;
          if (payment.status !== "captured") {
            reject(409, `Payment changed to ${payment.status}. Reload before deciding the approval.`, false, { code: "invalid_transition", projection: payment });
          }
          db = {
            ...db,
            payments: db.payments.map((item) =>
              item.id === approval.targetId ? { ...item, status: "refunded" } : item,
            ),
          };
          db = addAudit(
            db,
            {
              operationId: `${operationId}-approved-action`,
              actorId: actorId,
              action: approval.action,
              targetId: approval.targetId,
              scope: payment.zoneId,
              before: "captured",
              after: "refunded",
              reason: `Approved request from ${approval.requestedBy}: ${approval.reason}`,
              result: "committed",
            },
            false,
          );
        }

        if (approved && approval.action === "admin.trip.refund") {
          const foundTrip = db.trips.find((item) => item.id === approval.targetId);
          if (!foundTrip) reject(404, "Trip for this approval was not found.");
          const trip = foundTrip!;
          if (trip.kind === "refunded") reject(409, "This trip is already refunded. Reload before deciding the approval.", false, { code: "invalid_transition", projection: trip });
          db = { ...db, trips: db.trips.map((item) => (item.id === trip.id ? { ...item, kind: "refunded" } : item)) };
          db = addAudit(
            db,
            {
              operationId: `${operationId}-approved-action`,
              actorId,
              action: approval.action,
              targetId: approval.targetId,
              scope: trip.zoneId,
              before: String(trip.kind ?? ""),
              after: "refunded",
              reason: `Approved request from ${approval.requestedBy}: ${approval.reason}`,
              result: "committed",
            },
            false,
          );
        }

        db = {
          ...db,
          approvals: db.approvals.map((item) =>
            item.id === raw.targetId
              ? {
                  ...item,
                  status: approved ? "approved" : "rejected",
                  decidedBy: actorId,
                  decidedAt: new Date().toISOString(),
                  decisionReason: raw.reason,
                }
              : item,
          ),
        };
      }

      if (raw.collection && raw.patch && TARGET_COLLECTIONS.includes(raw.collection as TargetCollection)) {
        const key = raw.collection as TargetCollection;
        db = {
          ...db,
          [key]: db[key].map((row) => row.id === raw.targetId ? { ...row, ...raw.patch } : row),
        };
      }

      if (raw.sliceKey) {
        db = {
          ...db,
          slices: {
            ...db.slices,
            [raw.sliceKey]: raw.value,
          },
        };
      }

      db = addAudit(db, {
        operationId,
        actorId: actorId,
        action: raw.action,
        targetId: raw.targetId,
        scope: resolvedScope,
        before: raw.before,
        after: raw.after,
        reason: raw.reason,
        result: "committed",
      });

      const operation: OperationRow = {
        operationId,
        idempotencyKey,
        action: raw.action,
        targetId: raw.targetId,
        status: "committed",
        httpStatus: 200,
        message: "Saved in demo.",
        rev: db.rev,
        at: new Date().toISOString(),
      };
      db = saveDb({
        ...db,
        operations: {
          ...db.operations,
          [operationKey(actorId, idempotencyKey)]: operation,
        },
      });

      return {
        message: operation.message,
        db,
        operationId,
        status: "committed",
        rev: db.rev,
      };
    },

    async revision() {
      return loadDb().rev;
    },

    async audit() {
      return loadDb().audits;
    },

    async approvals() {
      return loadDb().approvals;
    },

    async operation(idempotencyKey, actorId) {
      return loadDb().operations[operationKey(actorId, idempotencyKey)] ?? null;
    },

    async reset() {
      await pause(delayMs, "none");
      return resetDb();
    },

    async getFault() {
      return readFault();
    },

    async setFault(fault) {
      writeFault(fault);
    },

    async inbox() {
      return loadDb().inbox;
    },

    async freshness() {
      return loadDb().updatedAt;
    },

    async readSlice(key, fallback, context) {
      const fault = readFault();
      await pause(delayMs, fault);
      if (fault === "empty") return fallback;
      const status = faultStatus(fault);
      if (status !== null) throw new ApiError(status, classifyStatus(status));
      const value = loadDb().slices[key];
      return scopedSlice(key,(value ?? fallback) as typeof fallback,loadDb(),context);
    },
  };
}

export function createHttpAdminApi(baseUrl = ""): AdminApi {
  return {
    kind: "http",
    demo: false,

    async ready() {
      const body = (await apiRequest(baseUrl, "/ready")) as { currency?: string; timeZone?: string };
      if (!isCurrency(body.currency) || typeof body.timeZone !== "string" || !body.timeZone.includes("/")) {
        throw new Error("The ready payload needs a contract currency (SEK, EUR or TND) and an IANA time zone.");
      }
      return { currency: body.currency, timeZone: body.timeZone, demo: false };
    },

    async page(pageId) {
      return (await apiRequest(baseUrl, `/pages/${encodeURIComponent(pageId)}`)) as PageResult;
    },

    list: async () => unsupported(),
    search: async () => unsupported(),
    command: async () => unsupported(),
    revision: async () => unsupported(),
    audit: async () => unsupported(),
    approvals: async () => unsupported(),
    operation: async () => unsupported(),
    reset: async () => unsupported(),
    getFault: async () => unsupported(),
    setFault: async () => unsupported(),
    inbox: async () => unsupported(),
    freshness: async () => unsupported(),
    readSlice: async () => unsupported(),
  };
}

export function createAdminApi(env: ApiEnv, delayMs = DEMO_DELAY_MS): AdminApi {
  const api = env.VITE_ADMIN_API ?? "";
  if (api === "http" || api.startsWith("http://") || api.startsWith("https://")) {
    return createHttpAdminApi(api === "http" ? "" : api);
  }
  if (env.PROD && env.VITE_DATA !== "demo") {
    throw new Error("Production refuses the simulation adapter.");
  }
  return createFixtureAdminApi(delayMs);
}
