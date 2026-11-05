import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { useSession } from "../auth/SessionContext.tsx";
import { market, marketZonesVersion, subscribeMarketZones, type Market } from "./markets.ts";
import type { ResolvedScope } from "./scope.ts";
import { scopeFor } from "./countryMemory.ts";

export { rememberCountry, rememberedCountry } from "./countryMemory.ts";

/** The country and zones chosen in the top bar, checked against the signed-in agent. */
export function useMarketScope(scopeOverride?: string | null): ResolvedScope & { market: Market } {
  const { agent } = useSession();
  const [params] = useSearchParams();
  // Live: the server's zone list arrives after sign-in; every screen that reads the scope follows it.
  useSyncExternalStore(subscribeMarketZones, marketZonesVersion, marketZonesVersion);
  const resolved = scopeFor(agent?.scope ?? { zones: "all" }, agent?.id, { country: params.get("country"), scope: scopeOverride ?? params.get("scope") });
  return { ...resolved, market: market(resolved.country) };
}
