import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SessionContext, type SessionValue } from "../auth/SessionContext";
import type { Agent } from "../auth/permissions";
import { adminCan, agentFromAdmin, liveBaseUrl, signInErrorText } from "./format";
import { createLiveClient, idleExpired, type LiveClient } from "./session";
import type { AdminMe } from "./types";

export type LiveSessionValue = {
  admin: AdminMe | null;
  client: LiveClient;
  error: string | null;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<AdminMe | null>;
  signOut: () => void;
  /** The server's expanded permission list decides, never the panel's role tables. */
  can: (permission: string) => boolean;
};

const LiveSessionContext = createContext<LiveSessionValue | null>(null);

/**
 * The live session (api.kind === "http"): holds the server's AdminMe, signs in and out through /admin/auth/*, signs
 * out after idleTimeoutSeconds without use, and also provides the legacy SessionContext with an Agent built from
 * AdminMe so the shell, the menu and the language picker keep working unchanged.
 */
export function LiveSessionProvider({ children, baseUrl = liveBaseUrl(import.meta.env.VITE_ADMIN_API) }: { children: ReactNode; baseUrl?: string }) {
  const queryClient = useQueryClient();
  const signedOutBy = useRef<((reason: "refresh_failed" | "sign_out") => void) | null>(null);
  const [client] = useState(() => createLiveClient({ baseUrl, onSignedOut: (reason) => signedOutBy.current?.(reason) }));
  const [admin, setAdmin] = useState<AdminMe | null>(() => client.admin());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The language picker edits "agents"; in live mode that list is the signed-in admin alone (kept in memory).
  const [agents, setAgentsState] = useState<Agent[]>(() => (admin ? [agentFromAdmin(admin)] : []));
  const lastActivity = useRef(Date.now());

  useEffect(() => client.subscribe((state) => {
    setAdmin(state?.admin ?? null);
    setAgentsState((current) => {
      if (!state) return [];
      const next = agentFromAdmin(state.admin);
      const kept = current.find((item) => item.id === next.id);
      return [kept ? { ...next, language: kept.language ?? next.language } : next];
    });
  }), [client]);

  useEffect(() => {
    signedOutBy.current = () => {
      queryClient.clear();
      setError(null);
    };
  }, [queryClient]);

  // Idle sign-out after idleTimeoutSeconds without a pointer or key event (contract §9: default 900 s).
  useEffect(() => {
    if (!admin) return;
    const mark = () => { lastActivity.current = Date.now(); };
    mark();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((name) => window.addEventListener(name, mark));
    const timer = window.setInterval(() => {
      if (idleExpired(lastActivity.current, Date.now(), admin.idleTimeoutSeconds)) void client.signOut();
    }, 15_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      window.clearInterval(timer);
    };
  }, [admin, client]);

  const signIn = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const me = await client.signIn(email, password);
      lastActivity.current = Date.now();
      return me;
    } catch (caught) {
      setError(signInErrorText(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [client]);

  const signOut = useCallback(() => { void client.signOut(); }, [client]);

  const live = useMemo<LiveSessionValue>(() => ({
    admin,
    client,
    error,
    busy,
    signIn,
    signOut,
    can: (permission) => adminCan(admin, permission),
  }), [admin, client, error, busy, signIn, signOut]);

  const agent = agents[0] ?? null;
  const legacy = useMemo<SessionValue>(() => ({
    agent,
    agents,
    error,
    // The live sign-in is asynchronous and lives in useLiveSession().signIn; the legacy form is not shown in live mode.
    signInWith: () => null,
    signOut,
    setAgents: (next) => setAgentsState(next),
  }), [agent, agents, error, signOut]);

  return (
    <LiveSessionContext.Provider value={live}>
      <SessionContext.Provider value={legacy}>{children}</SessionContext.Provider>
    </LiveSessionContext.Provider>
  );
}

export function useLiveSession(): LiveSessionValue {
  const value = useContext(LiveSessionContext);
  if (!value) throw new Error("Live session is missing.");
  return value;
}

/** The live session when the app runs against the server, null in demo mode. */
export function useLiveSessionMaybe(): LiveSessionValue | null {
  return useContext(LiveSessionContext);
}
