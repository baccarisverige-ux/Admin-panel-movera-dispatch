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
  // v0.18.17 Book later: Admin › Reservations on live calls the server (live/LiveReservations.tsx).
  "admin.reservation.assign", "admin.reservation.cancel", "admin.reservation.savePolicy", "admin.reservation.contact", "admin.reservation.dispatchNow", "admin.reservation.noShow", "admin.reservation.offer", "admin.reservation.raise", "admin.reservation.unassign",
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

/**
 * Screen-only commands (live clean-up 1, demo tour key finding 1): their buttons are plain `data-command` buttons that
 * only change what the screen shows (view and tab switches, filters, the zone drawing toolbar, Pricing editing before
 * save, local files). They never reach a server, so they are never hidden on live. `admin.server.*` ids belong to the
 * live screens, which send their own requests. live/liveCommands.test.ts checks every id here is used only that way,
 * and that every such id in the code is listed.
 */
export const SCREEN_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  "admin.alarm.sound",
  "admin.alerts.export", "admin.alerts.view",
  "admin.auditLog.view",
  "admin.campaigns.view",
  "admin.content.slot", "admin.content.view",
  "admin.dispatch.appConfig", "admin.dispatch.edit", "admin.dispatch.rulesFile", "admin.dispatch.view",
  "admin.drivers.bonusDraw", "admin.drivers.bonusForm", "admin.drivers.view",
  "admin.errors.status", "admin.errors.view",
  "admin.inbox.view",
  "admin.incident.view",
  "admin.live.focus",
  "admin.message.useText",
  "admin.onboarding.editTypes", "admin.onboarding.view",
  "admin.panel.view",
  "admin.payment.view",
  "admin.payout.bankFile", "admin.payout.view",
  "admin.pricing.addCategory", "admin.pricing.cancelCategory", "admin.pricing.copyZones", "admin.pricing.discard", "admin.pricing.edit", "admin.pricing.schedule", "admin.pricing.tab", "admin.pricing.testRide", "admin.pricing.zone",
  "admin.promo.view",
  "admin.reports.download", "admin.reports.view",
  "admin.review.view",
  "admin.rideCheck.view",
  "admin.rider.tab",
  "admin.riders.export", "admin.riders.flyer", "admin.riders.select", "admin.riders.view",
  "admin.risk.view",
  "admin.shift.view",
  "admin.team.view",
  "admin.ticket.view",
  "admin.trip.view",
  "admin.vehicle.view",
  "admin.waitlist.view",
  "admin.zone.basemap", "admin.zone.cancel", "admin.zone.changes", "admin.zone.export", "admin.zone.filter", "admin.zone.gaps", "admin.zone.import", "admin.zone.importKml", "admin.zone.layer", "admin.zone.pick", "admin.zone.priority", "admin.zone.redo", "admin.zone.removeLine", "admin.zone.search", "admin.zone.snap", "admin.zone.tab", "admin.zone.tool", "admin.zone.undo", "admin.zone.wizard",
]);

export type LiveClass = "server" | "screen" | "hidden";

/** Every command is exactly one of: handled by the server, screen-only (runs in the browser), or hidden on live. */
export function liveClass(id: string): LiveClass {
  if (LIVE_COMMANDS.has(id)) return "server";
  if (SCREEN_ONLY_COMMANDS.has(id) || id.startsWith("admin.server.") || commandById(id)?.scope === "global") return "screen";
  return "hidden";
}

/** True when the live build can run this command: a screen-only command, or one the server handles. */
export function liveHandles(id: string): boolean {
  return liveClass(id) !== "hidden";
}
