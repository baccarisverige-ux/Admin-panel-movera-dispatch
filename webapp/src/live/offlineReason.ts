import { tr } from "../i18n/index.ts";

/**
 * BQ-A07 (owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md): the ONE admin formatter for why a
 * driver is offline. The server stores Driver.offlineReason (contract.json#driverHome.setOffline.offlineReasons, server
 * src/db/schema/drivers.ts:59); app_restart is set by the driver app only. Used by the Audit page (driver.auto_offline)
 * and the driver page. sv / fr / en in i18n area c28-offline-reasons.
 */
export const OFFLINE_REASONS = ["no_position", "missed_offers", "app_restart", "vehicle_blocked", "fleet_removed", "account_status", "admin", "documents_expired", "after_trip"] as const;
export type OfflineReason = (typeof OFFLINE_REASONS)[number];

export type OfflineReasonExtra = { minutes?: unknown; count?: unknown; note?: unknown };

const positive = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/** The reason as one line in the panel's language; a reason this panel does not know yet still shows its code. */
export function offlineReasonText(reason: string, extra: OfflineReasonExtra = {}): string {
  const minutes = positive(extra.minutes);
  const count = positive(extra.count);
  const note = typeof extra.note === "string" && extra.note.trim() ? extra.note.trim() : null;
  switch (reason) {
    case "no_position": return minutes !== null ? tr("No position for {0} min", [minutes]) : tr("No position");
    case "missed_offers": return count !== null ? tr("Missed or declined {0} offers in a row", [count]) : tr("Missed or declined offers in a row");
    case "app_restart": return tr("The driver app was restarted while online");
    case "vehicle_blocked": return note ? tr("Car blocked or rejected by an admin: {0}", [note]) : tr("Car blocked or rejected by an admin");
    case "fleet_removed": return tr("Removed from the fleet, or the fleet was blocked");
    case "account_status": return tr("Account on hold, suspended or back to pending");
    case "admin": return tr("Set offline by Movera");
    case "documents_expired": return tr("A required document has expired");
    case "after_trip": return tr("Went offline after his trip (asked during the trip)");
    default: return tr("Set offline by the server ({0})", [reason]);
  }
}
