import { logActivity } from "../reports/activityLog";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IDLE_MS, isIdle, signIn, type Agent } from "./permissions";
import { lastActivity, markActivity, readAgents, sessionAgentId, writeAgents, writeSession } from "./sessionStore";

export type SessionValue = {
  agent: Agent | null;
  agents: Agent[];
  error: string | null;
  signInWith: (email: string, password: string, code: string) => Agent | null;
  signOut: () => void;
  setAgents: (next: Agent[]) => void;
};

/** Exported so the live mode (src/live) can provide an Agent-like value built from the server's AdminMe. */
export const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [agents, setAgentsState] = useState<Agent[]>(() => readAgents());
  const [agent, setAgent] = useState<Agent | null>(() => {
    const id = sessionAgentId();
    const last = lastActivity();
    if (!id || isIdle(last, Date.now())) return null;
    return readAgents().find((item) => item.id === id && item.active) ?? null;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agent) return;
    const mark = () => markActivity();
    mark();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((name) => window.addEventListener(name, mark));
    const timer = window.setInterval(() => {
      const last = lastActivity();
      if (isIdle(last, Date.now(), IDLE_MS)) {
        logActivity({ actorId: agent?.id ?? "", kind: "signout", what: "Signed out after 15 min without activity", at: new Date(last + IDLE_MS).toISOString() });
        writeSession(null);
        queryClient.clear();
        setAgent(null);
      }
    }, 30_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      window.clearInterval(timer);
    };
  }, [agent, queryClient]);

  const value = useMemo<SessionValue>(
    () => ({
      agent,
      agents,
      error,
      signInWith(email, password, code) {
        const result = signIn(agents, { email, password, code });
        if (!result.ok) {
          setError(result.error);
          return null;
        }
        writeSession(result.agent.id);
        logActivity({ actorId: result.agent.id, kind: "signin", what: "Signed in" });
        setError(null);
        setAgent(result.agent);
        return result.agent;
      },
      signOut() {
        if (agent) logActivity({ actorId: agent.id, kind: "signout", what: "Signed out" });
        writeSession(null);
        queryClient.clear();
        setAgent(null);
      },
      setAgents(next) {
        writeAgents(next);
        setAgentsState(next);
      },
    }),
    [agent, agents, error, queryClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session is missing.");
  return value;
}
