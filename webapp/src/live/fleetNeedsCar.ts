import { tr } from "../i18n/index.ts";

/**
 * v0.18.159 fleet needs a car (contract.json#fleetNeedsCar; owner 2026-11-24 "No but in sheet must see that it's missing to
 * add car", mockup PROPOSAL-fleet-add-car-2026-11-24.html part C): the Cars line of the fleet review sheet. With no car and
 * the country's OnboardingSettings.fleetNeedsCarForApproval on, Approve is locked (the server refuses it too:
 * 409 fleet_has_no_car).
 */
export type FleetCarLine = { tone: "ok" | "bad"; text: string; locked: boolean; lockText?: string };

export const FLEET_LOCK_TEXT = "Approve is locked until the owner adds at least 1 car.";

/**
 * The line from the server's own answer: Fleet.approvalBlockedReason (contract.json#fleetNeedsCar.adminView, computed from
 * the PUBLISHED setting and the car count), so no settings.read is needed and a draft never decides.
 */
export function fleetCarLine(vehicleCount: number, approvalBlockedReason: string | undefined): FleetCarLine {
  const locked = approvalBlockedReason === "fleet_has_no_car";
  if (vehicleCount > 0 && !locked) return { tone: "ok", text: tr(vehicleCount === 1 ? "✓ {0} car" : "✓ {0} cars", [vehicleCount]), locked: false };
  return locked ? { tone: "bad", text: tr("✕ Car missing: no car added"), locked: true, lockText: tr(FLEET_LOCK_TEXT) } : { tone: "bad", text: tr("✕ Car missing: no car added"), locked: false };
}
