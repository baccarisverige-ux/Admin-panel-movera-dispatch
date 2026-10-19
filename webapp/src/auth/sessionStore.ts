import { AGENTS, type Agent } from "./permissions.ts";

/**
 * The demo session: which agent is signed in and the team list (with role changes made on the Team page).
 * The sign-in screen writes it, and the in-browser fixture server reads it to know who sends a command,
 * so a request cannot pick its own role, scope or id. A real backend takes identity from its token only.
 */
export const SESSION_KEY = "movera-admin-session";
export const AGENTS_KEY = "movera-admin-agents";
export const ACTIVITY_KEY = "movera-admin-activity";

type StorageLike = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void };

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

function storage(): StorageLike {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Blocked storage: the session then lives in memory for this page only.
  }
  return memoryStorage;
}

function read(key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return memoryStorage.getItem(key);
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    if (value === null) memoryStorage.removeItem(key);
    else memoryStorage.setItem(key, value);
  }
}

export function readAgents(): Agent[] {
  const raw = read(AGENTS_KEY);
  if (!raw) return AGENTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Agent>[];
    if (!Array.isArray(parsed) || parsed.length === 0) return AGENTS;
    return parsed
      .filter((item): item is Partial<Agent> & Pick<Agent, "id" | "email" | "name" | "role"> =>
        typeof item.id === "string" && typeof item.email === "string" && typeof item.name === "string" && typeof item.role === "string",
      )
      .map((item) => {
        const fallback = AGENTS.find((agent) => agent.id === item.id || agent.email === item.email);
        return {
          ...(fallback ?? AGENTS[0]!),
          ...item,
          password: item.password ?? fallback?.password ?? "movera",
          code: item.code ?? fallback?.code ?? "123456",
          active: item.active ?? true,
          presence: item.presence ?? "away",
          scope: item.scope ?? fallback?.scope ?? { zones: "all", market: "SE-STO" as const },
        } as Agent;
      });
  } catch {
    return AGENTS;
  }
}

export function writeAgents(next: readonly Agent[]): void {
  write(AGENTS_KEY, JSON.stringify(next));
}

export function sessionAgentId(): string | null {
  return read(SESSION_KEY);
}

export function writeSession(agentId: string | null): void {
  write(SESSION_KEY, agentId);
  if (agentId) write(ACTIVITY_KEY, String(Date.now()));
}

export function lastActivity(): number {
  return Number(read(ACTIVITY_KEY) || "0");
}

export function markActivity(at = Date.now()): void {
  write(ACTIVITY_KEY, String(at));
}

/** The signed-in, active agent, or null. */
export function sessionAgent(): Agent | null {
  const id = sessionAgentId();
  if (!id) return null;
  return readAgents().find((agent) => agent.id === id && agent.active) ?? null;
}
