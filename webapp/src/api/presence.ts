import type { LiveDriverFacts } from "./seed.ts";
import { isLiveData, liveDriverOf } from "../live/realData.ts";
/** Whether a demo driver has the app open right now; about a quarter of active drivers are offline. */

export function presenceHash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function isOnline(driver: { id: string; status: string; liveDriver?: LiveDriverFacts }): boolean {
  // Live build: the server's onlineStatus (online or on a trip); never the demo hash.
  const live = liveDriverOf(driver);
  if (live) return live.onlineStatus === "online" || live.onlineStatus === "on_trip";
  if (isLiveData()) return false;
  return driver.status === "active" && (presenceHash(driver.id) >>> 13) % 100 >= 24;
}

/** The online driver in a zone who raised (or is on the trip of) an SOS. */
export function sosDriverId(drivers: readonly { id: string; status: string; zoneId: string }[], zoneId: string): string | null {
  return drivers.find((driver) => driver.zoneId === zoneId && isOnline(driver))?.id ?? null;
}
