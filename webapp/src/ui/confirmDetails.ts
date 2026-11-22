/**
 * The five parts of every confirm "!" (owner 2026-11-16 ~20:08 UTC "Add info details in i and !"): the exact values
 * before → after, every zone or country touched, who sees the change and when (live, or the apps' next settings read),
 * the money effect, and the exact undo path. Pure, by the command id; the texts are English keys of the i18n area c39
 * (sv / fr / en). Only ui/ConfirmInfoBody.tsx imports this file, so it loads with the "!", not in the first download.
 * Facts: open apps re-read a published document at once on `config_published` (contracts/CONTRACT.md "Config:
 * config_published on /rider/config/stream and /driver/config/stream"); a closed app reads it at its next start.
 * Round 2 (Rules audits/impact/info-details-supervisor.md MF-1 to MF-5): a line is said only when it is known to be
 * true; a dialog with no command, and a command that is not named here, get "See the details above".
 */
import { tr } from "../i18n/core.ts";
import { undoFor, whoFor } from "./confirmInfo.ts";
import { fromToLines, type ChangeOf } from "./fromTo.ts";

const domainOf = (command: string): string => command.split(".")[1] ?? "";

/** Settings whose values reach the rider and driver apps through the published config. */
const CONFIG_DOCS = new Set(["pricing", "tipsLimits", "config", "zone", "onboarding", "content", "studio", "campaign", "driverNotices"]);
/** Desks and tools only admins see. */
const ADMIN_ONLY = new Set(["alerts", "incident", "team", "auth", "audit", "auditLog", "ui", "table", "card", "thread", "modal", "tabs", "doc", "confirm", "report", "reports", "design", "shell", "panel", "inbox", "errors", "profile", "gateA", "handover", "tax"]);

/**
 * Round 2 (supervisor MF-1): the flat "No money moves." is said ONLY for this named list: screen tools and desks that
 * hold no money, and the live record actions below (read on the server: documents, fleet codes and reviews, a cancelled
 * invitation, the legal texts, the reveals). Everything else that is not named says nothing ("See the details above").
 */
const NO_MONEY_DOMAINS = new Set(["ui", "table", "card", "modal", "tabs", "doc", "confirm", "design", "shell", "panel", "errors", "profile", "auditLog", "alarm", "live", "auth", "alerts", "inbox", "handover", "gateA", "shift", "report", "reports", "waitlist"]);
const NO_MONEY_SERVER = /^admin\.server\.(signIn|setupPassword|reload|loadMore|openRecord|dialogConfirm|dialogCancel|documentOpen|documentReview|documentCheck|fleetReview|fleetCode|copyCode|invitationCancel|legalPublish|tripChat|riderSavedPlaces|driverPreferences|emergencyContacts|revealRider|revealDriver|revealFleet|revealIncidentContacts|bonusCampaignOpen)$/;
const REFUND = "Money goes back to the rider: the amount shown in this dialog, at once or after a second admin approves it. It shows on the rider's receipt and in Payments." as const;
const BONUS_RULES = "No money moves now. Movera pays a driver the bonus when they earn it under these rules, added to their payout; riders never pay it." as const;
const PROMO_RULES = "No money moves now. It changes the discount or reward riders get on later rides; that cost comes out of Movera's promotion budget." as const;

/**
 * What a confirm changes in money, in plain words. Each line was read on the server (cfgundo-server 6b2e559; file and
 * line in Rules audits/impact/info-details.md, Round 2). A command that is not named here says nothing it cannot
 * know: never "No money moves." by default (supervisor MF-1).
 */
export function moneyFor(command: string) {
  const domain = domainOf(command);
  // S-c1: a setting, not a refund (it stood under the refund line before and was never reached).
  if (command === "admin.refundPolicy.save") return "No money moves now: the refund rules apply to refunds made after the save." as const;
  // src/admin/trips.ts:625-634 markRefundPaid: the admin paid by Swish or bank himself; only "paid" is written.
  if (command === "admin.refund.markPaid") return "It records that you already sent this refund to the rider by Swish or bank, by hand. The panel sends no money itself." as const;
  if (command === "admin.rider.refundDecide") return "If you approve, the refund goes back to the rider for the amount shown; if you decline, no money moves." as const;
  if (/refund/i.test(command)) return REFUND;
  if (domain === "payout" && /^(settings|schedule)$/.test(command.split(".")[2] ?? "")) return "No money moves now: the change applies to the next payout runs of this country." as const;
  if (/^admin\.payout\.(hold|retry|approveRun)$/.test(command) || command === "admin.driver.payoutHold") return "Driver payouts: the payout or run named here is sent, held or retried; the driver's bank gets it with that payout. Nothing is lost by a hold." as const;
  if (command === "admin.payment.savePolicy" || command === "admin.payment.rules") return "No money moves now: the change applies to payments from now on." as const;
  if (/^admin\.payment\.(markPaid|approveBank|rejectBank|voidVoucher|reconcile|retry|dispute)$/.test(command)) return "The payment named here changes state (paid, approved, rejected, retried or voided) for the amount shown." as const;
  if (command === "admin.trip.driverBonus") return "Movera pays the driver the bonus shown, up to the country's driver bonus limit (Pricing › Tips & limits); the rider never pays it." as const;
  if (command === "admin.reservation.raise") return "The driver's fare on this booked ride goes up by the amount shown, paid from Movera's commission; the rider pays the same." as const;
  // src/trips/ride/cancel.ts:44-68 markNoShow: the fee of the trip's rules (a booked ride: its booking fee), the driver's share.
  if (command === "admin.trip.noShow" || command === "admin.reservation.noShow") return "The rider is charged the no-show fee of this trip's rules (a booked ride: its booking fee); the driver gets their share of it (Dispatch › Waiting at pickup)." as const;
  // src/admin/trips.ts:387-424 adminReverseNoShow.
  if (command === "admin.trip.reverseNoShow") return "The rider pays nothing for this trip: an owed no-show fee is waived, a paid one goes back to the rider's wallet. The driver keeps their share (Movera pays it) unless you tick Take back the driver's share." as const;
  // MF-2. src/admin/trips.ts:161-174 adminCancel: fee null (owner decision 33); the only money is the lost-driver payment.
  if (command === "admin.trip.cancel" || command === "admin.reservation.cancel") return "The rider pays nothing: an admin cancel never charges a cancel fee. The only money that can move is a lost-driver payment to the driver who lost the trip, and Movera pays it." as const;
  // MF-3. src/admin/trips.ts:433-453 adminComplete → src/trips/ride/finish.ts:179-225 completeTrip.
  if (command === "admin.trip.complete") return "The trip ends as a paid trip: the rider pays the fare the server works out (the wallet first, then the trip's payment method), and the driver is paid for the trip. The amounts show on the trip afterwards." as const;
  // src/admin/trips.ts:484-496: fareWithWaiting writes the fare and the driver's earnings again.
  if (command === "admin.trip.waiting") return "The rider's price and the driver's pay on this trip are worked out again with the waiting minutes you type. Only on a running trip: a paid trip is corrected with a refund." as const;
  // src/admin/trips.ts:498-505 and contracts/contract.json moneyBase.adminFare.
  if (command === "admin.trip.adjust") return "Only the driver's pay changes, to the amount you type; Movera pays the difference. The rider pays the same." as const;
  // src/admin/trips.ts:468-479 waiveCancelFee.
  if (command === "admin.trip.waiveFee") return "The rider's owed cancel or no-show fee is waived: the rider owes nothing more for it. The driver keeps the share they already got." as const;
  if (command === "admin.trip.pay") return "The driver's pay on this trip goes up by the amount shown; Movera pays it. The rider's price does not change." as const;
  if (command === "admin.trip.decide") return "If you approve, the waiting refund or pay change is made for the amount shown; if you decline, no money moves." as const;
  // src/admin/trips.ts:512 (trip.adjust) and :614 (trip.refund) run when the request is approved.
  if (command === "admin.approval.approve") return "The waiting action is carried out. If it is a refund or a change of a driver's pay, the money moves now, for the amount in the request." as const;
  if (command === "admin.approval.reject") return "The waiting action is not carried out, so it moves no money." as const;
  // v0.18.149 contract.json#adminSessions.signOut.effect: sessions end, no fee, no wallet or payout line.
  if (command === "admin.rider.signOut" || command === "admin.driver.signOut") return "No money moves." as const;
  if (command === "admin.rider.walletCredit") return "The amount shown is added to the rider's wallet, at most the country's wallet credit maximum (Pricing › Tips & limits)." as const;
  // src/riders/feeMarkPaid.ts:19-39.
  if (command === "admin.rider.feeMarkPaid") return "The owed fee is marked as paid by hand: the rider is not charged for it and it is no longer added to the next trip. No money is sent." as const;
  // riders/care.ts markPaid: the panel's own book.
  if (command === "admin.rider.markPaid") return "The rider's unpaid balance is marked as paid by hand: the rider is not charged for it and can book rides again. No money is sent." as const;
  // src/bonuses/counting.ts:91-96: an earnings entry (kind bonus) when the driver reaches the target; it is in his payout.
  if (/^admin\.drivers\.bonus(Create|Edit|Toggle|Stop)$|^admin\.server\.bonusCampaign(Create|Edit|Pause|Resume|End)$/.test(command)) return BONUS_RULES;
  if (/^admin\.riders\.(promoCreate|promoStop|promoToggle|promoEdit|autoPromo)$|^admin\.rider\.(promoAdd|promoRemove)$|^admin\.promo\.(voucher|referral|autoStop)$/.test(command)) return PROMO_RULES;
  // live/LiveFleetPanel.tsx: "The driver is linked, paid through the fleet".
  if (command === "admin.server.invitationAccept") return "No money moves now. From now on this driver is paid through the fleet." as const;
  if (domain === "pricing") return "Riders pay, and drivers earn, by the new values on rides priced after it; rides already priced keep their price. No money moves now." as const;
  if (domain === "tipsLimits") return "It changes what riders can tip or offer and the most admins can pay or credit. No money moves now." as const;
  if (domain === "dispatch" || command === "admin.reservation.savePolicy") return "Fees, waiting pay and shares under these rules apply to rides from now on; booked rides keep the rules they were booked with. No money moves now." as const;
  if (NO_MONEY_DOMAINS.has(domain) || NO_MONEY_SERVER.test(command)) return "No money moves." as const;
  return "See the details above for any money effect." as const;
}

/** When the people reached see the change. A dialog without a command names no time (supervisor S-c3). */
export function whenFor(command: string) {
  const domain = domainOf(command);
  if (!command) return "See the details above for when it takes effect." as const;
  // content/LegalEditor.tsx: "goes live in the rider and driver apps at their next start".
  if (command === "admin.server.legalPublish") return "At the next start of the rider and driver apps: an app that is open shows the new texts after it is started again." as const;
  // Rules of money saved for a country (live/LivePayoutSettings.tsx "Saved and published at once"): no app screen is claimed.
  if (/^admin\.(payout\.(settings|schedule)|payment\.(rules|savePolicy)|refundPolicy\.save)$/.test(command)) return "At once: it is saved when you confirm and applies from then on." as const;
  if (ADMIN_ONLY.has(domain)) return "At once, in the admin panel. Riders and drivers see nothing of it." as const;
  if (domain === "dispatch") return "At once after Publish: the server uses the new rules for its next dispatch decision. Open driver and rider apps re-read their settings at once; a closed app at its next start." as const;
  // S-c2. contracts/CONTRACT.md "Built by Admin from Pricing": the pricing document is server-only, no config_published
  // is sent for it. Tips & limits (saveCountry) also writes the apps' settings, so it keeps the line below.
  if (domain === "pricing" && command !== "admin.pricing.saveCountry") return "At once after Publish: the server prices new quotes with it at once. The apps do not download prices: riders see the new price in the next price they are shown. Rides already priced keep their price." as const;
  if (CONFIG_DOCS.has(domain) || command === "admin.reservation.savePolicy") return "After Publish (or Save): open rider and driver apps re-read it at once; a closed app gets it at its next start. Rides already running keep what they started with." as const;
  return "At once (live): the server records it when you confirm. The people named see it in their app at once, or at the next app start if it is closed." as const;
}

/** Screen tools: nothing outside the panel changes. */
const SCREEN_ONLY = new Set(["ui", "table", "card", "modal", "tabs", "doc", "confirm", "design", "shell", "panel", "errors", "profile", "auditLog", "alarm"]);
/**
 * Round 2 (supervisor MF-5): the actions on ONE record (a trip, a booked ride, a rider, a driver, a car, a fleet, one
 * refund, one safety case). Only these say "only the record named in this dialog"; a setting, a rule, an approval
 * (it may be a settings publish) and anything not named here say nothing.
 */
const RECORD_ACTIONS = /^admin\.trip\.(cancel|complete|noShow|reverseNoShow|refund|partRefund|adjust|waiting|waiveFee|driverBonus|pay|reassign|assign|pinUnlock|note|flag|decide|offer|radarGroup|radarZoneStop|openCase|block)$|^admin\.reservation\.(assign|offer|unassign|contact|return|answer|raise|cancel|noShow|dispatchNow)$|^admin\.rider\.(walletCredit|feeMarkPaid|markPaid|refund|refundDecide|block|unblock|signOut|note|askPay|activate|moderate)$|^admin\.driver\.(activate|review|requestInfo|onHold|suspend|reactivate|bankReview|note|docExpiry|payoutHold)$|^admin\.(vehicle\.(hold|activate|link|reviewRegistration)|fleetOwner\.(review|docExpiry|activate|onHold|note)|refund\.markPaid|safety\.(take|resolve|dismiss)|server\.(tripRefund|documentReview|documentCheck|fleetReview|fleetCode|invitationAccept|invitationCancel|removeDriver))$/;

/**
 * Where, when the dialog names no place: nothing it cannot know (supervisor SF-R2-2, MF-5). Unknown or no command:
 * "See the details above". The "only this record" line: only the named record actions.
 */
export function whereFallbackFor(command: string) {
  if (SCREEN_ONLY.has(domainOf(command))) return "The admin panel only: no zone or country setting changes." as const;
  if (RECORD_ACTIONS.test(command)) return "Only the record named in this dialog: no zone or country setting changes." as const;
  return "See the details above for what this changes." as const;
}

/** Before → after, when the dialog gives no values. */
export function fromToFallbackFor(command: string) {
  const domain = domainOf(command);
  if (CONFIG_DOCS.has(domain) || domain === "dispatch") return "The values that change are listed in this dialog; the old and the new values are both kept in History and in the Audit log." as const;
  return "No setting value changes: the action itself is the change. The Audit log keeps it with your name and your reason." as const;
}

export type ConfirmPartsInput<Text = string> = { change?: Text; changeOf?: ChangeOf; where?: Text; who?: Text; when?: Text; money?: Text; undo?: Text; command?: string };
export type ConfirmParts<Text = string> = { fromTo: (Text | string)[]; where: Text | string; who: Text | string; when: Text | string; whoWhen: string; money: Text | string; undo: Text | string };

/**
 * The five parts, translated, for one dialog: the ONE source of what the "!" shows (ui/ConfirmInfoBody.tsx renders
 * exactly this). The dialog's own words win; then the command's; with neither, nothing is promised. Every part is
 * filled (ui/confirmDetails.test.ts).
 */
export function confirmParts<Text = string>({ change, changeOf, where, who, when, money, undo, command = "" }: ConfirmPartsInput<Text>): ConfirmParts<Text> {
  const lines = change ? [change] : changeOf ? fromToLines(changeOf) : [];
  const whoText = who ?? tr(whoFor(command));
  const whenText = when ?? tr(whenFor(command));
  return {
    fromTo: lines.length ? lines : [tr(fromToFallbackFor(command))],
    where: where ?? tr(whereFallbackFor(command)),
    who: whoText,
    when: whenText,
    whoWhen: `${String(whoText)} ${String(whenText)}`,
    money: money ?? tr(moneyFor(command)),
    undo: undo ?? tr(undoFor(command)),
  };
}

/** The titles of the five parts, in order. */
export const CONFIRM_PART_TITLES = ["From → to", "Where", "Who sees it, and when", "Money", "How to undo"] as const;
