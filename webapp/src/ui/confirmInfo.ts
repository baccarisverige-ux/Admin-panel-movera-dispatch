/**
 * What the "?" of a confirm dialog says (owner 2026-11-16: "When confirm anything u add info ? When clic understand
 * what's going to happen and where and which zone and all info"). Pure: who an action affects and how it is undone,
 * by the command's id; and where a setting lands when the Standard and zones are chosen together (owner 2026-11-16
 * "Stay on Standard (Rec.)"). The texts are English keys of the i18n area c35 (sv / fr / en).
 */
import { tr, trx } from "../i18n/core.ts";
import { COUNTRY_LABEL } from "../i18n/countries.ts";
import { marketOfZone, market, zoneById, type MarketId } from "../markets/markets.ts";
import { scopeName } from "./scopeNames.ts";

const domainOf = (command: string): string => command.split(".")[1] ?? "";
const SETTINGS = new Set(["pricing", "tipsLimits", "config", "dispatch", "zone", "onboarding", "payout", "incident", "alerts", "review", "reservation"]);

/** Who a setting reaches: the places of the Where line (a Standard and the zones that use it). */
export const PRICING_WHO = "Riders and drivers in the places named under Where: their apps get the new values with the next app settings." as const;

/** Who the action touches, in plain words. */
export function whoFor(command: string) {
  const domain = domainOf(command);
  // Supervisor S-c4: the payout schedule is a setting of a country (live/LivePayoutSettings.tsx), not one person's money.
  if (/^admin\.payout\.(settings|schedule)$/.test(command)) return "Drivers and fleets of this country who get payouts: their next payout runs follow the new settings." as const;
  // Rules of a country or of the whole panel, not one person's money: nothing is said that is not known.
  if (/^admin\.(payment\.(rules|savePolicy)|refundPolicy\.save)$/.test(command)) return "See the details above for who this reaches." as const;
  if (/^admin\.(payout|refund|payment)\.|^admin\.trip\.(refund|adjust|waiveFee|driverBonus)$|^admin\.rider\.(walletCredit|feeMarkPaid)$/.test(command)) return "The people whose money this is: the rider, driver or fleet named here. Nobody else." as const;
  // Supervisor SF-R3-5: the reservation policy is one for every zone (dispatch/BookingPolicy.tsx), not one booking.
  if (command === "admin.reservation.savePolicy") return "Riders and drivers of rides booked from now on, in every zone. Rides already booked keep the policy they were booked with." as const;
  if (domain === "trip" || domain === "reservation") return "The rider and the driver of this trip or booking. Nobody else." as const;
  // Supervisor SF-R2-2: a Standard reaches the zones that use it; the Where line names them, so this does not say "other zones are not affected".
  if (["pricing", "tipsLimits", "config", "dispatch", "zone", "onboarding"].includes(domain)) return PRICING_WHO;
  if (["studio", "content", "campaign", "messages", "driverNotices"].includes(domain)) return "Everyone who sees these texts or messages in the apps, in the zones named here." as const;
  if (["driver", "drivers", "driverOps", "vehicle", "fleetOwner"].includes(domain)) return "The driver, car or fleet named here. Other drivers are not affected." as const;
  if (["rider", "riders", "growthOps"].includes(domain)) return "The rider named here. Other riders are not affected." as const;
  // Supervisor SF-R3-5: settings of a desk, saved per country on the server; not one case.
  if (command === "admin.alerts.settings") return "Every admin of this country: which alerts they see and hear, and when. Riders and drivers are not affected." as const;
  if (command === "admin.incident.settings") return "Every admin who handles safety cases in this country: time limits, call buttons and case tools. Riders and drivers are not affected." as const;
  if (command === "admin.review.rules") return "Riders and drivers of this country whose average falls under a line: they get the warning or are listed for an admin review. New comments with a listed word are hidden." as const;
  if (["safety", "incident", "alerts", "support", "review", "approval", "inbox"].includes(domain)) return "The case named here and the people in it. Other admins see the change at once." as const;
  // Round 2: admin.server.* are the live screens' own requests (documents, fleets, legal texts, campaigns), not one account.
  if (["team", "auth"].includes(domain)) return "The account named here." as const;
  return "See the details above for who this reaches." as const;
}

/**
 * How the action is taken back, in plain words. Never promises an undo that does not exist (supervisor SF-R2-3: each
 * line was checked against the button that really takes it back). Round 2 (supervisor MF-4): the old last line said
 * "do the opposite action on the same page" for every command, also where no opposite exists (a cancelled or completed
 * trip, a refund, an approval). Now: the real path where one exists, else "This cannot be undone with a button."
 */
export function undoFor(command: string) {
  const domain = domainOf(command);
  // The Undo itself: the panel's Undo finds the same save again and nothing of it can go back a second time.
  if (command === "admin.tipsLimits.undo") return "An Undo cannot be undone with a button: put the values in again in Pricing › Tips & limits and press Save tips & limits." as const;
  if (command === "admin.pricing.saveCountry") return "Pricing › Tips & limits › Undo last Tips & limits save puts back the version before in every document of that save." as const;
  // pricing/CategoryManager.tsx: a deleted category is archived and listed under "Deleted" with Restore for 30 days.
  if (command === "admin.pricing.archiveCategory") return "Pricing › Categories › Deleted: Restore brings the category back, for 30 days after it was deleted." as const;
  if (command === "admin.pricing.restoreCategory" || command === "admin.pricing.createCategory") return "Pricing › Categories: Delete takes it away again (it can then be restored for 30 days)." as const;
  // Surges are not in Pricing › History: the opposite button on the same zone takes a surge back.
  if (/^admin\.pricing\.(startSurge|stopSurge|stopAllSurges|saveSurge|clearSurge|activateBoost|saveBoost)$/.test(command)) return "Start or stop the manual surge again on the same zone (Pricing › Surge). Nothing goes back by itself." as const;
  if (domain === "pricing") return "Pricing › History › Restore puts an earlier version back, and the tile Undo last pricing publish undoes the newest one." as const;
  // Supervisor SF-R3-5: the tools are saved on the server apart from the rule versions (live/liveSettings.ts saveTools).
  if (/^admin\.dispatch\.(preset|group|radarZone|radarRule|event)$/.test(command)) return "Presets, driver groups, radar zones, radar rules and events are saved on their own and are not in Dispatch › History. There is no one-press undo: change it back, add it again or remove it on the same tab. The save is written in the Audit log." as const;
  // dispatch/LiveView.tsx: Pause, Resume, Radar now, Exclusive now, Back to rules on the same zone.
  if (command === "admin.dispatch.control") return "Dispatch › Live: press Resume or Back to rules on the same zone. It is not in Dispatch › History." as const;
  if (domain === "dispatch") return "Dispatch › History › Undo puts the version before back." as const;
  // live/LiveReservations.tsx: a cancelled ride, a no-show and a raise have no opposite button.
  if (/^admin\.reservation\.(cancel|noShow|raise)$/.test(command)) return "There is no one-press undo for this booked ride. The action is written in the Audit log with your name and your reason." as const;
  if (command === "admin.config.useStandard") return "The zone's own settings stay in History. Publish them again for that zone to take it off the Standard." as const;
  if (domain === "config" || domain === "onboarding") return "There is no one-press undo here: publish the earlier values again. A zone can also go back to the Standard with Go back to Standard." as const;
  // pages/LiveZoneActions.tsx: one button that closes an open zone and opens a closed one.
  if (command === "admin.zone.close" || command === "admin.zone.open") return "Press Open zone or Close zone on the same zone to turn it back. Rides booked meanwhile stay as they are." as const;
  // Supervisor SF-R3-5: there is no "Releases" screen. Live: Save names and type / Save outline (pages/LiveZoneActions.tsx,
  // ZoneMap.tsx) keep no versions in the panel; the server writes zone.update in the Audit log.
  if (command === "admin.zone.update") return "There is no one-press undo for a zone save: change it back on the same zone and save again. The save is written in the Audit log." as const;
  if (command === "admin.zone.create") return "There is no one-press undo for a new zone. It is created closed: riders cannot use it until someone presses Open zone." as const;
  // The demo zone screens (pages/ZonesPage.tsx, ZoneDetailPage.tsx): Undo last publish and a zone's History › Restore version.
  if (domain === "zone") return "Zones: Undo last publish takes back the newest publish, and a zone's History has Restore version for each earlier version." as const;
  if (domain === "studio" || domain === "content") return "Content › History: roll back to the version before." as const;
  // Supervisor S-c4: a schedule save sends no money.
  if (/^admin\.(payout\.(settings|schedule)|payment\.(rules|savePolicy)|refundPolicy\.save)$/.test(command)) return "There is no one-press undo: set the earlier values again and save. The save is written in the Audit log." as const;
  // live/LivePayoutHold.tsx: one button, "Pause payouts" or "Release payouts".
  if (command === "admin.driver.payoutHold") return "Press Release payouts (or Pause payouts) on the same driver to turn it back." as const;
  if (/^admin\.(payout|refund|payment)\.|refund|^admin\.trip\.(adjust|waiveFee|driverBonus|pay)$|^admin\.rider\.(walletCredit|feeMarkPaid|markPaid)$/i.test(command)) return "Money that was sent cannot be taken back from the panel. Check the amount and the person before you confirm." as const;
  // Server src/admin/trips.ts adminCancel / adminComplete: both are end states (contracts/CONTRACT.md "terminal").
  if (command === "admin.trip.cancel") return "This cannot be undone with a button: a cancelled trip stays cancelled. The rider books a new ride." as const;
  if (command === "admin.trip.complete") return "This cannot be undone with a button: a completed trip stays completed. A wrong amount is corrected with a refund on the same trip." as const;
  // trips/ReverseNoShow.tsx: the button "Reverse no-show" on a no-show trip.
  if (command === "admin.trip.noShow") return "The trip stays a no-show, but Reverse no-show on the same trip takes the fee off the rider again." as const;
  // Server adminReverseNoShow: "Again on a reversed trip: the trip as it is, nothing changes."
  if (command === "admin.trip.reverseNoShow") return "This cannot be undone with a button: a reversed no-show cannot be charged again." as const;
  if (command === "admin.trip.waiting") return "Save the earlier waiting minutes again on the same trip, while the trip is still running." as const;
  if (command === "admin.approval.approve") return "This cannot be undone with a button: the approved action is carried out at once, and money that was sent cannot be taken back from the panel." as const;
  if (command === "admin.approval.reject") return "This cannot be undone with a button: the requester has to ask again." as const;
  // Pairs of buttons that exist on the same page (ui/confirmDetails.test.ts checks both ids are on the page).
  if (/^admin\.(driver\.(suspend|reactivate)|rider\.(block|unblock)|vehicle\.(hold|activate)|fleetOwner\.(onHold|activate)|team\.(deactivate|reactivate))$/.test(command)) return "There is no one-press undo, but the other button of the pair on the same page turns it back (for example Reactivate after Suspend, Unblock after Block)." as const;
  return "This cannot be undone with a button. The action is written in the Audit log with your name and your reason." as const;
}

export const isSettingsCommand = (command: string): boolean => SETTINGS.has(domainOf(command));

/** Where a setting lands, per country of the chosen scopes. Zone names, never ids. */
export type Landing = {
  country: MarketId;
  /** The country's Standard is one of the chosen scopes. */
  standard: boolean;
  /** Use the Standard and get the change through it (chosen or not); they stay on the Standard. */
  through: string[];
  /** Chosen zones with settings of their own: written directly. */
  direct: string[];
  /** Chosen zones that use the Standard now and get settings of their own (they stop following the Standard). */
  detach: string[];
  /** Zones with settings of their own that are not chosen: they do not get the change. */
  notReached: string[];
  /** Chosen zones the server has not answered for yet. */
  unknown: string[];
  /**
   * Supervisor MF-R2-1: the Standard is chosen and these zones are not, and it is not known whether they use it: each
   * that does gets the change through the Standard. They "may also change".
   */
  maybe: string[];
};

/**
 * `usesStandard(zoneId)`: true = uses its country's Standard, false = has its own, undefined = not known.
 * `keepFollowers` (Tips & limits, Settings, and Dispatch with the same rules): a chosen zone that uses the Standard
 * stays on it when the Standard is chosen too. Pricing writes every chosen zone (each has prices the admin edited);
 * Dispatch keeps a zone on the Standard only when its rules equal the Standard's (a function per zone).
 */
export function landing(chosen: readonly string[], usesStandard: (zoneId: string) => boolean | undefined, keepFollowers: boolean | ((zoneId: string) => boolean) = true): Landing[] {
  const keeps = (id: string) => (typeof keepFollowers === "function" ? keepFollowers(id) : keepFollowers);
  const countries = [...new Set(chosen.map((id) => marketOfZone(id)?.id).filter((id): id is MarketId => Boolean(id)))];
  return countries.map((country) => {
    const zones = market(country).zones;
    const standard = chosen.includes(`standard-${country}`);
    const name = (id: string) => zoneById(id)?.name ?? id;
    const picked = zones.filter((zone) => chosen.includes(zone.id));
    const follows = (id: string) => usesStandard(id) === true;
    const staying = standard ? zones.filter((zone) => follows(zone.id) && (keeps(zone.id) || !chosen.includes(zone.id))) : [];
    return {
      country,
      standard,
      through: staying.map((zone) => zone.name),
      direct: picked.filter((zone) => usesStandard(zone.id) === false).map((zone) => name(zone.id)),
      detach: picked.filter((zone) => follows(zone.id) && !staying.includes(zone)).map((zone) => zone.name),
      notReached: standard ? zones.filter((zone) => !chosen.includes(zone.id) && usesStandard(zone.id) === false).map((zone) => zone.name) : [],
      unknown: picked.filter((zone) => usesStandard(zone.id) === undefined).map((zone) => zone.name),
      maybe: standard ? zones.filter((zone) => !chosen.includes(zone.id) && usesStandard(zone.id) === undefined).map((zone) => zone.name) : [],
    };
  });
}

/** True only when every zone's mark is known: then "No other zone changes." is true (supervisor MF-R2-1). */
export const noOtherZoneChange = (items: readonly Landing[]): boolean => items.every((item) => !item.unknown.length && !item.maybe.length);

/** The scopes whose "uses the Standard" marks the dialog listens to: the chosen ones and every zone of their countries. */
export function watchedIds(zoneIds: readonly string[]): string[] {
  const countries = new Set(zoneIds.map((id) => marketOfZone(id)?.id).filter((id): id is MarketId => Boolean(id)));
  return [...new Set([...zoneIds, ...[...countries].flatMap((country) => market(country).zones.map((zone) => zone.id))])];
}

/** Where a setting lands, in plain sentences (the zone pick of a settings dialog and its "!"). */
export function whereText(zoneIds: readonly string[], usesStandard: (zoneId: string) => boolean | undefined, keepFollowers: boolean | ((zoneId: string) => boolean) = true): string {
  if (!zoneIds.length) return tr("Nothing is ticked: nothing will be saved.");
  const items = landing(zoneIds, usesStandard, keepFollowers);
  const lines = items.flatMap((item) => {
    const list = (names: string[]) => names.join(", ");
    return [
      item.standard ? tr("It is saved in {0}.", [scopeName(`standard-${item.country}`)]) : "",
      item.through.length ? tr("These zones use the Standard: they get it through the Standard and stay on it (no copy of their own): {0}.", [list(item.through)]) : "",
      item.direct.length ? tr("These zones have settings of their own: it is saved directly in each: {0}.", [list(item.direct)]) : "",
      item.detach.length ? tr("These zones use the Standard now: each gets settings of its own and stops following the Standard: {0}.", [list(item.detach)]) : "",
      item.notReached.length ? tr("These zones have settings of their own and are not ticked: they do NOT get it: {0}.", [list(item.notReached)]) : "",
      item.unknown.length ? tr("Not known yet whether these use the Standard: {0}.", [list(item.unknown)]) : "",
      item.maybe.length ? tr("These zones may also change: it is not known yet whether they use the Standard, and each that does gets it through the Standard: {0}.", [list(item.maybe)]) : "",
    ];
  });
  return [...lines, noOtherZoneChange(items) ? tr("No other zone changes.") : ""].filter(Boolean).join(" ");
}

/**
 * Supervisor SF-R2-2: the "Where" of commands that reach more than the scope they send. Pricing Undo / Restore of a
 * revision that holds a Standard: every zone of that country that uses the Standard gets it too.
 */
export function pricingWhere(zoneIds: readonly string[]): string {
  const named = zoneIds.map(scopeName).join(", ");
  const countries = zoneIds.filter((id) => /^standard-[A-Z]{2}$/.test(id)).map((id) => trx(COUNTRY_LABEL[id.slice(9) as MarketId] ?? id.slice(9)));
  if (!countries.length) return tr("Put back only in: {0}. No other zone changes.", [named]);
  return `${tr("Put back in: {0}.", [named])} ${tr("Every zone of {0} that uses the Standard gets it too, through the Standard; zones with prices of their own do not.", [countries.join(", ")])}`;
}
