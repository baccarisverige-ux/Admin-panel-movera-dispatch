import { MENU } from "../nav.ts";
import type { MarketId } from "../markets/markets.ts";
import type { AppLanguage } from "../config/zoneDefaults.ts";
import { parseZoneList } from "../markets/markets.ts";
import { zoneAllowed } from "../markets/scope.ts";

export type Role =
  | "viewer"
  | "support"
  | "dispatcher"
  | "compliance"
  | "finance"
  | "safety"
  | "content"
  | "config"
  | "fleet"
  | "ops"
  | "super";

export type AgentScope = {
  zones: "all" | string[];
  fleetPartnerId?: string;
  market: "SE-STO";
  /** Countries this agent may open. Missing means every country. */
  countries?: MarketId[];
};

export type Agent = {
  id: string;
  email: string;
  name: string;
  password: string;
  code: string;
  role: Role;
  active: boolean;
  presence: "online" | "away";
  scope: AgentScope;
  /** The admin's own panel language from their profile (round 4); missing means the default of their country. */
  language?: AppLanguage;
};

export const DEMO_PASSWORD = "movera";
export const DEMO_CODE = "123456";
export const IDLE_MS = 15 * 60 * 1000;

const ALL_STOCKHOLM: AgentScope = { zones: "all", market: "SE-STO" };
const CENTRAL: AgentScope = { zones: ["Z001", "Z002", "Z003", "Z004", "Z005"], market: "SE-STO" };
const NORTH: AgentScope = { zones: ["Z007", "Z008", "ARN"], market: "SE-STO", fleetPartnerId: "F1" };
const ALL_FRANCE: AgentScope = { zones: "all", market: "SE-STO", countries: ["FR"] };
const ALL_TUNISIA: AgentScope = { zones: "all", market: "SE-STO", countries: ["TN"] };

export const AGENTS: Agent[] = [
  { id: "nora", email: "nora@movera.se", name: "Nora Lind", password: DEMO_PASSWORD, code: DEMO_CODE, role: "super", active: true, presence: "online", scope: ALL_STOCKHOLM },
  { id: "lena", email: "lena@movera.se", name: "Lena Berg", password: DEMO_PASSWORD, code: DEMO_CODE, role: "ops", active: true, presence: "online", scope: ALL_STOCKHOLM },
  { id: "maja", email: "support@movera.se", name: "Maja Holm", password: DEMO_PASSWORD, code: DEMO_CODE, role: "support", active: true, presence: "online", scope: CENTRAL },
  { id: "erik", email: "safety@movera.se", name: "Erik Söder", password: DEMO_PASSWORD, code: DEMO_CODE, role: "safety", active: true, presence: "online", scope: ALL_STOCKHOLM },
  { id: "astrid", email: "finance@movera.se", name: "Astrid Ek", password: DEMO_PASSWORD, code: DEMO_CODE, role: "finance", active: true, presence: "away", scope: ALL_STOCKHOLM },
  { id: "daniel", email: "dispatch@movera.se", name: "Daniel Falk", password: DEMO_PASSWORD, code: DEMO_CODE, role: "dispatcher", active: true, presence: "online", scope: CENTRAL },
  { id: "ida", email: "compliance@movera.se", name: "Ida Nyström", password: DEMO_PASSWORD, code: DEMO_CODE, role: "compliance", active: true, presence: "online", scope: ALL_STOCKHOLM },
  { id: "elsa", email: "content@movera.se", name: "Elsa Dahl", password: DEMO_PASSWORD, code: DEMO_CODE, role: "content", active: true, presence: "away", scope: ALL_STOCKHOLM },
  { id: "otto", email: "config@movera.se", name: "Otto Lund", password: DEMO_PASSWORD, code: DEMO_CODE, role: "config", active: true, presence: "online", scope: ALL_STOCKHOLM },
  { id: "fredrik", email: "fleet@movera.se", name: "Fredrik Sand", password: DEMO_PASSWORD, code: DEMO_CODE, role: "fleet", active: true, presence: "online", scope: NORTH },
  { id: "anna", email: "viewer@movera.se", name: "Anna Blom", password: DEMO_PASSWORD, code: DEMO_CODE, role: "viewer", active: true, presence: "away", scope: CENTRAL },
  { id: "camille", email: "france@movera.se", name: "Camille Moreau", password: DEMO_PASSWORD, code: DEMO_CODE, role: "ops", active: true, presence: "online", scope: ALL_FRANCE },
  { id: "yasmine", email: "tunisia@movera.se", name: "Yasmine Trabelsi", password: DEMO_PASSWORD, code: DEMO_CODE, role: "ops", active: true, presence: "online", scope: ALL_TUNISIA },
];

const ALL = ["*"] as const;
const OVERVIEW = ["overview.read"] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  viewer: [...OVERVIEW, "trips.read", "drivers.read", "riders.read", "zones.read"],
  support: [...OVERVIEW, "trips.read", "trips.annotate", "riders.read", "riders.viewSensitive", "support.reply"],
  dispatcher: [...OVERVIEW, "trips.read", "trips.annotate", "trips.intervene", "drivers.read", "drivers.viewSensitive", "zones.read"],
  compliance: [...OVERVIEW, "drivers.read", "drivers.viewSensitive", "drivers.activate", "documents.approve", "vehicles.edit", "zones.read"],
  finance: [...OVERVIEW, "riders.read", "finance.read", "finance.edit", "payments.refund", "audit.read", "approval.decide"],
  safety: [...OVERVIEW, "trips.read", "trips.annotate", "riders.read", "riders.viewSensitive", "incidents.read", "safety.edit"],
  content: [...OVERVIEW, "settings.read", "settings.edit"],
  config: [...OVERVIEW, "zones.read", "zones.edit", "zones.publish", "settings.read", "settings.edit", "settings.publish", "audit.read", "approval.decide"],
  fleet: [...OVERVIEW, "drivers.read", "drivers.viewSensitive", "documents.approve", "vehicles.edit", "zones.read"],
  ops: [
    ...OVERVIEW,
    "trips.read",
    "trips.annotate",
    "trips.intervene",
    "drivers.read",
    "drivers.viewSensitive",
    "drivers.activate",
    "documents.approve",
    "vehicles.edit",
    "riders.read",
    "riders.viewSensitive",
    "riders.block",
    "riders.promotions",
    "drivers.bonuses",
    "dispatch.edit",
    "dispatch.approve",
    "alerts.manage",
    "zones.read",
    "zones.edit",
    "zones.publish",
    "support.reply",
    "incidents.read",
    "safety.edit",
    "settings.read",
    "settings.edit",
    "settings.publish",
    "audit.read",
    "approval.decide",
  ],
  super: ALL,
};

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer / analyst",
  support: "Support agent",
  dispatcher: "Dispatcher",
  compliance: "Onboarding / compliance",
  finance: "Finance",
  safety: "Safety responder",
  content: "Content editor",
  config: "Configuration manager",
  fleet: "Fleet partner",
  ops: "Operations manager",
  super: "Super admin",
};

export function permissionForPage(pageId: string): string {
  return MENU.find((item) => item.id === pageId)?.permission ?? "overview.read";
}

export function can(role: Role, permission: string): boolean {
  const list = ROLE_PERMISSIONS[role];
  return list.includes("*") || list.includes(permission);
}

/** True when the agent may open the zone, or every zone of a comma-separated list. */
export function canUseZone(agent: Agent, zoneId: string | null): boolean {
  if (!zoneId) return true;
  const zones = parseZoneList(zoneId);
  if (zones.length > 1) return zones.every((zone) => canUseZone(agent, zone));
  if (agent.scope.countries) return zoneAllowed(agent.scope, zoneId);
  return agent.scope.zones === "all" || agent.scope.zones.includes(zoneId);
}

export function allowedZones(agent: Agent, zones: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  return zones.filter((zone) => canUseZone(agent, zone.id));
}

export function signIn(
  agents: readonly Agent[],
  input: { email: string; password: string; code: string },
): { ok: true; agent: Agent } | { ok: false; error: string } {
  const agent = agents.find((item) => item.email.toLowerCase() === input.email.trim().toLowerCase());
  if (!agent || !agent.active) return { ok: false, error: "Unknown agent or the account is deactivated." };
  if (agent.password !== input.password) return { ok: false, error: "Wrong password." };
  if (agent.code !== input.code) return { ok: false, error: "Wrong code." };
  return { ok: true, agent };
}

export function isIdle(lastActivityMs: number, nowMs: number, idleMs = IDLE_MS): boolean {
  return nowMs - lastActivityMs >= idleMs;
}

export function deactivateAgent(agents: readonly Agent[], id: string, actor: Agent): Agent[] | { error: string } {
  if (!can(actor.role, "team.edit") && actor.role !== "super") {
    return { error: "You cannot change agents." };
  }
  if (actor.id === id) return { error: "You cannot deactivate yourself." };
  return agents.map((agent) => (agent.id === id ? { ...agent, active: false, presence: "away" } : agent));
}

export function reactivateAgent(agents: readonly Agent[], id: string, actor: Agent): Agent[] | { error: string } {
  if (!can(actor.role, "team.edit") && actor.role !== "super") return { error: "You cannot change agents." };
  return agents.map((agent) => (agent.id === id ? { ...agent, active: true } : agent));
}

export function changeAgentRole(agents: readonly Agent[], id: string, role: Role, actor: Agent): Agent[] | { error: string } {
  if (!can(actor.role, "team.edit") && actor.role !== "super") return { error: "You cannot change roles." };
  if (actor.id === id) return { error: "You cannot change your own role in the demo." };
  return agents.map((agent) => (agent.id === id ? { ...agent, role } : agent));
}

export function resetAgentCode(agents: readonly Agent[], id: string, actor: Agent): Agent[] | { error: string } {
  if (!can(actor.role, "team.edit") && actor.role !== "super") return { error: "You cannot reset 2-step sign-in." };
  if (actor.id === id) return { error: "Use account recovery for your own code." };
  return agents.map((agent) => (agent.id === id ? { ...agent, code: DEMO_CODE } : agent));
}

export function setAgentPresence(agents: readonly Agent[], id: string, presence: Agent["presence"], actor: Agent): Agent[] | { error: string } {
  if (actor.id !== id && actor.role !== "super") return { error: "Only the agent or a super admin can change presence." };
  return agents.map((agent) => (agent.id === id ? { ...agent, presence } : agent));
}

export function inviteAgent(
  agents: readonly Agent[],
  input: { name: string; email: string; role: Role; scope?: AgentScope },
  actor: Agent,
): Agent[] | { error: string } {
  if (!can(actor.role, "team.edit") && actor.role !== "super") return { error: "You cannot invite agents." };
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email.includes("@")) return { error: "Name and a valid email are required." };
  if (agents.some((agent) => agent.email.toLowerCase() === email)) return { error: "That email already exists." };
  const base = email.split("@")[0]?.replace(/[^a-z0-9]+/g, "-") || "agent";
  let id = base;
  let suffix = 2;
  while (agents.some((agent) => agent.id === id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return [
    ...agents,
    {
      id,
      email,
      name: input.name.trim(),
      password: DEMO_PASSWORD,
      code: DEMO_CODE,
      role: input.role,
      active: true,
      presence: "away",
      scope: input.scope ?? ALL_STOCKHOLM,
    },
  ];
}

export function scopeZone(search: string): string {
  const params = new URLSearchParams(search);
  const value = params.get("scope") ?? params.get("zone");
  return value && value.length > 0 ? value : "all";
}

export function rowMatchesZone(cells: readonly string[], zone: string): boolean {
  if (zone === "all") return true;
  const needle = zone.toLowerCase();
  return cells.some((cell) => cell.toLowerCase().includes(needle));
}
