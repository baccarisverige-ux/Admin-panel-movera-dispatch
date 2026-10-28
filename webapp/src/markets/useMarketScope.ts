import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { useSession } from "../auth/SessionContext.tsx";
import { market, marketZonesVersion, subscribeMarketZones, type Market, type MarketId } from "./markets.ts";
import { resolveScope, type ResolvedScope } from "./scope.ts";

const REMEMBER_KEY = "movera-admin-country";

export function rememberedCountry(agentId: string | undefined): string | null {
  if (!agentId) return null;
  try {
    return localStorage.getItem(`${REMEMBER_KEY}:${agentId}`);
  } catch {
    return null;
  }
}

export function rememberCountry(agentId: string | undefined, id: MarketId): void {
  if (!agentId) return;
  try {
    localStorage.setItem(`${REMEMBER_KEY}:${agentId}`, id);
  } catch {
    // Remembering is a convenience; the URL still carries the choice.
  }
}

/** The country and zones chosen in the top bar, checked against the signed-in agent. */
export function useMarketScope(scopeOverride?: string | null): ResolvedScope & { market: Market } {
  const { agent } = useSession();
  const [params] = useSearchParams();
  // Live: the server's zone list arrives after sign-in; every screen that reads the scope follows it.
  useSyncExternalStore(subscribeMarketZones, marketZonesVersion, marketZonesVersion);
  const resolved = resolveScope(agent?.scope ?? { zones: "all" }, {
    country: params.get("country"),
    scope: scopeOverride ?? params.get("scope"),
    remembered: rememberedCountry(agent?.id),
  });
  return { ...resolved, market: market(resolved.country) };
}
