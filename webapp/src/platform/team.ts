import { ROLE_LABELS, ROLE_PERMISSIONS, type Role } from "../auth/permissions.ts";
import { MARKETS } from "../markets/markets.ts";

/**
 * Team: every permission with a plain name, custom roles built from switches, limits per role,
 * and sign-in safety (2-step code and sign-out after idle time). Saved here; the backend applies
 * custom roles and these limits when it reads them.
 */

export const TEAM_OPS_KEY = "teamOps";

export const PERMISSION_GROUPS: { label: string; items: { id: string; label: string }[] }[] = [
  { label: "Look", items: [
    { id: "overview.read", label: "See the dashboard" },
    { id: "trips.read", label: "See trips" },
    { id: "riders.read", label: "See riders" },
    { id: "drivers.read", label: "See drivers" },
    { id: "zones.read", label: "See zones" },
    { id: "finance.read", label: "See payments and payouts" },
    { id: "incidents.read", label: "See incidents" },
    { id: "audit.read", label: "See the audit" },
    { id: "team.read", label: "See the team" },
    { id: "system.read", label: "See system pages" },
  ] },
  { label: "Private data", items: [
    { id: "riders.viewSensitive", label: "See rider phone and email" },
    { id: "drivers.viewSensitive", label: "See driver phone and papers" },
  ] },
  { label: "Act", items: [
    { id: "trips.annotate", label: "Note, flag and open cases on trips" },
    { id: "trips.intervene", label: "Change or cancel trips" },
    { id: "support.reply", label: "Answer support" },
    { id: "safety.edit", label: "Handle safety" },
    { id: "riders.block", label: "Block riders" },
    { id: "riders.promotions", label: "Give rider promotions" },
    { id: "drivers.activate", label: "Activate drivers" },
    { id: "drivers.bonuses", label: "Make driver bonuses" },
    { id: "documents.approve", label: "Approve papers" },
    { id: "vehicles.edit", label: "Change vehicles" },
    { id: "alerts.manage", label: "Manage alerts" },
    { id: "payments.refund", label: "Give money back" },
    { id: "finance.edit", label: "Change payments, payouts and wallets" },
  ] },
  { label: "Change the setup", items: [
    { id: "zones.edit", label: "Edit zones" },
    { id: "zones.publish", label: "Publish zones" },
    { id: "dispatch.edit", label: "Edit dispatch rules" },
    { id: "dispatch.approve", label: "Approve dispatch rules" },
    { id: "settings.read", label: "See settings" },
    { id: "settings.edit", label: "Edit settings" },
    { id: "settings.publish", label: "Publish settings" },
    { id: "approval.decide", label: "Approve as second admin" },
    { id: "team.edit", label: "Change the team" },
  ] },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items);

export type CustomRole = { id: string; name: string; base: Role; permissions: string[]; createdBy: string; createdAt: string };
/** The second-admin rule is not here: it is one limit per country in Settings (Q25, payments/refundPolicy.ts). */
export type RoleLimit = { refund: { on: boolean; max: number }; credit: { on: boolean; max: number } };
export type Security = { twoStep: Record<Role, boolean>; idle: { on: boolean; minutes: number } };
export type TeamOps = { draftRev: number; customRoles: CustomRole[]; limits: Record<Role, RoleLimit>; security: Security; assigned: Record<string, string> };

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function permissionsOf(role: Role): string[] {
  const list = ROLE_PERMISSIONS[role];
  return list.includes("*") ? PERMISSIONS.map((item) => item.id) : PERMISSIONS.map((item) => item.id).filter((id) => list.includes(id));
}

function limit(role: Role): RoleLimit {
  const money = role === "super" || role === "finance" || role === "ops";
  return { refund: { on: money, max: role === "super" ? 5000 : 1000 }, credit: { on: money || role === "support", max: role === "support" ? 100 : 500 } };
}

export function emptyTeamOps(): TeamOps {
  return {
    draftRev: 1,
    customRoles: [],
    limits: Object.fromEntries(ROLES.map((role) => [role, limit(role)])) as Record<Role, RoleLimit>,
    security: { twoStep: Object.fromEntries(ROLES.map((role) => [role, true])) as Record<Role, boolean>, idle: { on: true, minutes: 15 } },
    assigned: {},
  };
}

export function normalizeTeamOps(value: unknown): TeamOps {
  const base = emptyTeamOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<TeamOps>;
  return {
    draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1,
    customRoles: Array.isArray(raw.customRoles) ? raw.customRoles : [],
    limits: { ...base.limits, ...(raw.limits ?? {}) },
    security: { twoStep: { ...base.security.twoStep, ...(raw.security?.twoStep ?? {}) }, idle: { ...base.security.idle, ...(raw.security?.idle ?? {}) } },
    assigned: raw.assigned ?? {},
  };
}

export function newRole(base: Role, by: string, now: number): CustomRole {
  return { id: `role-${now.toString(36)}`, name: "", base, permissions: permissionsOf(base), createdBy: by, createdAt: new Date(now).toISOString() };
}

export function roleError(role: CustomRole, all: readonly CustomRole[]): string | null {
  const name = role.name.trim();
  if (!name) return "Give the role a name.";
  if (all.some((item) => item.id !== role.id && item.name.trim().toLowerCase() === name.toLowerCase()) || Object.values(ROLE_LABELS).some((label) => label.toLowerCase() === name.toLowerCase())) return "A role with that name exists.";
  if (!role.permissions.includes("overview.read")) return "Every role must see the dashboard.";
  if (role.permissions.includes("settings.publish") && !role.permissions.includes("settings.read")) return "Publishing settings needs seeing settings.";
  if (role.permissions.includes("team.edit") && !role.permissions.includes("team.read")) return "Changing the team needs seeing the team.";
  return null;
}

export function saveRole(ops: TeamOps, role: CustomRole): { ops: TeamOps; error?: string } {
  const error = roleError(role, ops.customRoles);
  if (error) return { ops, error };
  const next = { ...role, name: role.name.trim() };
  const exists = ops.customRoles.some((item) => item.id === role.id);
  return { ops: { ...ops, draftRev: ops.draftRev + 1, customRoles: exists ? ops.customRoles.map((item) => (item.id === role.id ? next : item)) : [...ops.customRoles, next] } };
}

export function removeRole(ops: TeamOps, id: string): TeamOps {
  return { ...ops, draftRev: ops.draftRev + 1, customRoles: ops.customRoles.filter((item) => item.id !== id), assigned: Object.fromEntries(Object.entries(ops.assigned).filter(([, roleId]) => roleId !== id)) };
}

/** Switched on and off compared with the role it is built on. */
export function roleChanges(role: CustomRole): { added: string[]; removed: string[] } {
  const base = permissionsOf(role.base);
  return { added: role.permissions.filter((id) => !base.includes(id)), removed: base.filter((id) => !role.permissions.includes(id)) };
}

export function limitError(value: RoleLimit): string | null {
  if ((value.refund.on && value.refund.max <= 0) || (value.credit.on && value.credit.max <= 0)) return "Limits must be more than zero.";
  return null;
}

export function securityError(value: Security): string | null {
  if (value.idle.on && (value.idle.minutes < 5 || value.idle.minutes > 240)) return "Sign out after 5 to 240 minutes.";
  if (!value.twoStep.super) return "The Super admin must always use the 2-step code.";
  return null;
}

/** Where an admin may work: every zone of some countries, or a list of zones. */
export function placeOf(scope: { zones: "all" | string[]; countries?: string[] }): string {
  const countries = scope.countries?.length ? scope.countries : null;
  const names = countries ? MARKETS.filter((item) => countries.includes(item.id)).map((item) => item.name).join(", ") : "Every country";
  return scope.zones === "all" ? names : `${scope.zones.length} zone${scope.zones.length > 1 ? "s" : ""}`;
}
