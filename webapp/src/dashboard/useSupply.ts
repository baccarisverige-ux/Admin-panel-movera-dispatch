import { useMemo } from "react";
import { useRecords } from "../api/hooks";
import { isLiveData } from "../live/realData";
import type { MarketId } from "../markets/markets";
import { serverSupply, supplyDemand, type ZoneBalance } from "./insights";
import type { LiveDriver } from "./live";
import type { RideRequest } from "./riders";

/**
 * G3-D5 (owner "Fix it"): supply and demand per zone. Live: the server's zoneSupply (GET /admin/live/drivers), where every
 * online driver counts in his zone, fresh position or not. Demo: the same rule over the demo drivers.
 */
export function useSupply(country: MarketId, zoneIds: readonly string[], requests: readonly RideRequest[], drivers: readonly LiveDriver[]): ZoneBalance[] {
  const live = isLiveData();
  const server = useRecords("zoneSupply", undefined, { refetchMs: 10_000 });
  const key = zoneIds.join(",");
  return useMemo(
    () => (live ? serverSupply(country, key ? key.split(",") : [], server.data ?? []) : supplyDemand(country, key ? key.split(",") : [], requests, drivers)),
    [live, country, key, server.data, requests, drivers],
  );
}
