import { commandById } from "../commands/registry.ts";

/**
 * Every command id the live adapter sends to the Movera server (live/liveAdminApi.ts `command` and
 * live/liveSettings.ts `command`). Live clean-up 1 (owner 2026-11-02, rule 1): on the live build a CommandButton whose
 * command is not here is not shown at all, so no button ends in "Not connected yet.". When a group connects a command,
 * add its id here (live/liveCommands.test.ts checks this list against the adapter's code).
 */
export const LIVE_COMMANDS: ReadonlySet<string> = new Set([
  "admin.alerts.done", "admin.alerts.mute", "admin.alerts.pass", "admin.alerts.quiet", "admin.alerts.rule", "admin.alerts.settings", "admin.alerts.snooze", "admin.alerts.take",
  "admin.approval.approve", "admin.approval.reject",
  "admin.config.copyAppToZones", "admin.config.publish", "admin.config.publishAppDraft", "admin.config.save", "admin.config.saveCountry", "admin.config.useStandard",
  "admin.dispatch.control", "admin.dispatch.event", "admin.dispatch.group", "admin.dispatch.preset", "admin.dispatch.publish", "admin.dispatch.radarRule", "admin.dispatch.radarZone", "admin.dispatch.saveDraft", "admin.dispatch.undo",
  "admin.driver.activate", "admin.driver.bankReview", "admin.driver.category", "admin.driver.onHold", "admin.driver.reactivate", "admin.driver.suspend",
  "admin.fleetOwner.activate", "admin.fleetOwner.onHold",
  "admin.growthOps.moderate",
  "admin.incident.level", "admin.incident.report", "admin.incident.settings",
  "admin.onboarding.publishSettings",
  "admin.pricing.archiveCategory", "admin.pricing.createCategory", "admin.pricing.editCategory", "admin.pricing.publish", "admin.pricing.restore", "admin.pricing.restoreCategory", "admin.pricing.saveCountry", "admin.pricing.startSurge", "admin.pricing.stopAllSurges", "admin.pricing.stopSurge", "admin.pricing.undo",
  "admin.refund.markPaid",
  "admin.review.rules",
  "admin.safety.dismiss", "admin.safety.resolve", "admin.safety.take",
  "admin.studio.publish", "admin.studio.rollback",
  "admin.trip.adjust", "admin.trip.assign", "admin.trip.cancel", "admin.trip.complete", "admin.trip.driverBonus", "admin.trip.noShow", "admin.trip.pinUnlock", "admin.trip.radarGroup", "admin.trip.radarZoneStop", "admin.trip.reassign", "admin.trip.refund", "admin.trip.reverseNoShow", "admin.trip.waiting", "admin.trip.waiveFee",
  "admin.vehicle.activate", "admin.vehicle.hold", "admin.vehicle.link", "admin.vehicle.update",
  "admin.zone.close", "admin.zone.create", "admin.zone.open", "admin.zone.update",
]);

/** True when the live build can run this command: a screen-only (global) command, or one the server handles. */
export function liveHandles(id: string): boolean {
  if (LIVE_COMMANDS.has(id)) return true;
  return commandById(id)?.scope === "global";
}
