import type { ApprovalRow } from "../api/seed.ts";
import type { CurrencyCode } from "../domain/money.ts";
import type { OpenValue } from "../config/confirm.ts";

/**
 * To confirm: one inbox for everything waiting on a decision. Money waiting for a second admin,
 * a settings version waiting for approval or publishing, and product values nobody has confirmed yet.
 */

export const CONFIRM_OPS_KEY = "confirmOps";

export type ValueDecision = { value: string; note: string; by: string; at: string };
export type ConfirmOps = { draftRev: number; values: Record<string, ValueDecision> };

export function emptyConfirmOps(): ConfirmOps {
  return { draftRev: 1, values: {} };
}

export function normalizeConfirmOps(value: unknown): ConfirmOps {
  if (!value || typeof value !== "object") return emptyConfirmOps();
  const raw = value as Partial<ConfirmOps>;
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, values: raw.values ?? {} };
}

export type InboxKind = "money" | "settings" | "value";
export type InboxItem = { id: string; kind: InboxKind; title: string; detail: string; by: string | null; mine: boolean; link: string };

const AREA: { match: RegExp; label: string }[] = [
  { match: /refund|payment/i, label: "Payments" },
  { match: /payout/i, label: "Payouts" },
  { match: /wallet|credit/i, label: "Wallet" },
];

export function areaLabel(action: string): string {
  return AREA.find((item) => item.match.test(action))?.label ?? "Money";
}

export function inboxItems(input: {
  approvals: readonly ApprovalRow[];
  config: { status: string; authorId: string; approverId: string | null; rev: number };
  values: readonly OpenValue[];
  decisions: ConfirmOps["values"];
  me: string;
  money: (minor: number, currency: CurrencyCode) => string;
}): InboxItem[] {
  const money = input.approvals.filter((row) => row.status === "pending").map((row) => ({
    id: row.id,
    kind: "money" as const,
    title: `${areaLabel(row.action)}: ${input.money(row.amountOre, row.currency ?? "SEK")} for ${row.targetId}`,
    detail: row.reason || row.action,
    by: row.requestedBy,
    mine: row.requestedBy === input.me,
    link: row.targetId.startsWith("PAY") ? `/payments/${row.targetId}` : "/audit",
  }));
  const settings = input.config.status === "in_review" || input.config.status === "approved" ? [{
    id: `config-${input.config.rev}`,
    kind: "settings" as const,
    title: input.config.status === "in_review" ? "Settings waiting for approval" : "Approved settings waiting to be published",
    detail: input.config.status === "in_review" ? "A second admin must approve the draft." : `Approved by ${input.config.approverId ?? "a second admin"}. Publish it from Settings.`,
    by: input.config.authorId,
    mine: input.config.authorId === input.me,
    link: "/settings",
  }] : [];
  const values = input.values.filter((item) => !input.decisions[item.id]).map((item) => ({
    id: item.id,
    kind: "value" as const,
    title: item.label,
    detail: `Today: ${item.today}`,
    by: null,
    mine: false,
    link: item.link ?? "/confirm?tab=values",
  }));
  return [...money, ...settings, ...values];
}

export function decisionError(value: string): string | null {
  return value.trim() ? null : "Write the value you confirm.";
}
