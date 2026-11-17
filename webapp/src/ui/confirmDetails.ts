/**
 * The five parts of every confirm "!" (owner 2026-11-16 ~20:08 UTC "Add info details in i and !"): the exact values
 * before → after, every zone or country touched, who sees the change and when (live, or the apps' next settings read),
 * the money effect, and the exact undo path. Pure, by the command id; the texts are English keys of the i18n area c39
 * (sv / fr / en). Only ui/ConfirmInfoBody.tsx imports this file, so it loads with the "!", not in the first download.
 * Facts: open apps re-read a published document at once on `config_published` (contracts/CONTRACT.md "Config:
 * config_published on /rider/config/stream and /driver/config/stream"); a closed app reads it at its next start.
 */
import { tr } from "../i18n/core.ts";
import { undoFor, whoFor } from "./confirmInfo.ts";
import { fromToLines, type ChangeOf } from "./fromTo.ts";

const domainOf = (command: string): string => command.split(".")[1] ?? "";

/** Commands that move money now (the same list as whoFor / undoFor in ui/confirmInfo.ts, plus the trip and booked-ride fees). */
const MONEY_NOW = /^admin\.(payout|refund|payment)\.|^admin\.audit\.refund|^admin\.trip\.(refund|partRefund|adjust|waiveFee|driverBonus|pay|noShow|reverseNoShow|cancel)$|^admin\.rider\.(walletCredit|feeMarkPaid|refund|refundDecide)$|^admin\.reservation\.(raise|noShow|cancel)$|^admin\.driver\.payoutHold$/;
/** Settings whose values reach the rider and driver apps through the published config. */
const CONFIG_DOCS = new Set(["pricing", "tipsLimits", "config", "zone", "onboarding", "content", "studio", "campaign", "driverNotices"]);
/** Desks and tools only admins see. */
const ADMIN_ONLY = new Set(["alerts", "incident", "team", "auth", "server", "audit", "auditLog", "ui", "table", "card", "thread", "modal", "tabs", "doc", "confirm", "report", "reports", "design", "shell", "panel", "inbox", "errors", "profile", "gateA", "handover", "tax"]);

/** What a confirm changes in money, in plain words. Never "no money" for a command that moves money. */
export function moneyFor(command: string) {
  const domain = domainOf(command);
  if (/refund/i.test(command)) return "Money goes back to the rider: the amount shown in this dialog. It shows on the rider's receipt and in Payments." as const;
  if (domain === "payout" && /^(settings|schedule)$/.test(command.split(".")[2] ?? "")) return "No money moves now: the change applies to the next payout runs of this country." as const;
  if (domain === "payout" || command === "admin.driver.payoutHold") return "Driver payouts: the payout or run named here is sent, held or retried; the driver's bank gets it with that payout. Nothing is lost by a hold." as const;
  if (command === "admin.payment.savePolicy" || command === "admin.payment.rules") return "No money moves now: the change applies to payments from now on." as const;
  if (domain === "payment") return "The payment named here changes state (paid, approved, rejected, retried or voided) for the amount shown." as const;
  if (command === "admin.trip.driverBonus") return "Movera pays the driver the bonus shown, up to the country's driver bonus limit (Pricing › Tips & limits); the rider never pays it." as const;
  if (command === "admin.reservation.raise") return "The driver's fare on this booked ride goes up by the amount shown, paid from Movera's commission; the rider pays the same." as const;
  if (command === "admin.trip.noShow" || command === "admin.reservation.noShow") return "The rider is charged the zone's no-show fee; the driver gets his share of it (Dispatch › Waiting at pickup)." as const;
  if (command === "admin.trip.reverseNoShow") return "The no-show fee is taken off the rider's charge, and the driver's share of it with it." as const;
  if (command === "admin.trip.cancel" || command === "admin.reservation.cancel") return "Any fee follows the zone's rider cancel fees; the trip's receipt shows the amount, or none." as const;
  if (command === "admin.rider.walletCredit") return "The amount shown is added to the rider's wallet, at most the country's wallet credit maximum (Pricing › Tips & limits)." as const;
  if (MONEY_NOW.test(command)) return "The trip's money changes by the amount shown in this dialog: the rider's price, a fee or the driver's pay." as const;
  if (domain === "pricing") return "Riders pay, and drivers earn, by the new values on rides priced after it; rides already priced keep their price. No money moves now." as const;
  if (domain === "tipsLimits") return "It changes what riders can tip or offer and the most admins can pay or credit. No money moves now." as const;
  if (domain === "dispatch" || command === "admin.reservation.savePolicy" || command === "admin.refundPolicy.save") return "Fees, waiting pay and shares under these rules apply to rides from now on; booked rides keep the rules they were booked with. No money moves now." as const;
  return "No money moves." as const;
}

/** When the people reached see the change. */
export function whenFor(command: string) {
  const domain = domainOf(command);
  if (ADMIN_ONLY.has(domain)) return "At once, in the admin panel. Riders and drivers see nothing of it." as const;
  if (domain === "dispatch") return "At once after Publish: the server uses the new rules for its next dispatch decision. Open driver and rider apps re-read their settings at once; a closed app at its next start." as const;
  if (CONFIG_DOCS.has(domain) || command === "admin.reservation.savePolicy") return "After Publish (or Save): open rider and driver apps re-read it at once; a closed app gets it at its next start. Rides already running keep what they started with." as const;
  return "At once (live): the server records it when you confirm. The people named see it in their app at once, or at the next app start if it is closed." as const;
}

/** Where, when the dialog names no zone: never "no other zone" for a setting it cannot see (supervisor SF-R2-2). */
export function whereFallbackFor(command: string) {
  const domain = domainOf(command);
  if (CONFIG_DOCS.has(domain) || domain === "dispatch") return "See the details above for what this changes." as const;
  if (ADMIN_ONLY.has(domain)) return "The admin panel only: no zone or country setting changes." as const;
  return "Only the record named in this dialog: no zone or country setting changes." as const;
}

/** Before → after, when the dialog gives no values. */
export function fromToFallbackFor(command: string) {
  const domain = domainOf(command);
  if (CONFIG_DOCS.has(domain) || domain === "dispatch") return "The values that change are listed in this dialog; the old and the new values are both kept in History and in the Audit log." as const;
  return "No setting value changes: the action itself is the change. The Audit log keeps it with your name and your reason." as const;
}

export type ConfirmPartsInput = { change?: string; changeOf?: ChangeOf; where?: string; who?: string; undo?: string; command?: string };
export type ConfirmParts = { fromTo: string[]; where: string; whoWhen: string; money: string; undo: string };

/** The five parts, translated, for one dialog. Every part is filled (ui/confirmDetails.test.ts). */
export function confirmParts({ change, changeOf, where, who, undo, command = "" }: ConfirmPartsInput): ConfirmParts {
  const lines = change ? [change] : changeOf ? fromToLines(changeOf) : [];
  return {
    fromTo: lines.length ? lines : [tr(fromToFallbackFor(command))],
    where: where ?? tr(whereFallbackFor(command)),
    whoWhen: `${who ?? (command ? tr(whoFor(command)) : tr("See the details above for who this reaches."))} ${tr(whenFor(command))}`,
    money: tr(moneyFor(command)),
    undo: undo ?? tr(undoFor(command)),
  };
}

/** The titles of the five parts, in order. */
export const CONFIRM_PART_TITLES = ["From → to", "Where", "Who sees it, and when", "Money", "How to undo"] as const;
