import { CONFIG_DEFAULTS } from "../../config/zoneDefaults.ts";
import type { ZoneDispatch } from "./model.ts";

/** v0.18.144 (contract.json#liveLocation.setting): the rider document's liveLocation (sendEverySeconds stays the server's default). adjustPickupMeters 0 = the banner is off. */
export function liveLocationOf(zone: Pick<ZoneDispatch, "liveLocation">): { share: boolean; adjustPickupMeters: number } {
  const own = zone.liveLocation;
  const meters = own?.adjustPickupMeters;
  return {
    share: typeof own?.share === "boolean" ? own.share : CONFIG_DEFAULTS.liveLocationShare,
    adjustPickupMeters: typeof meters === "number" && Number.isInteger(meters) && (meters === 0 || (meters >= 10 && meters <= 500)) ? meters : CONFIG_DEFAULTS.adjustPickupMeters,
  };
}

