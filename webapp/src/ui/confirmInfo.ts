/**
 * What the "?" of a confirm dialog says (owner 2026-11-16: "When confirm anything u add info ? When clic understand
 * what's going to happen and where and which zone and all info"). Pure: who an action affects and how it is undone,
 * by the command's id; and where a setting lands when the Standard and zones are chosen together (owner 2026-11-16
 * "Stay on Standard (Rec.)"). The texts are English keys of the i18n area c35 (sv / fr / en).
 */
import { marketOfZone, market, zoneById, type MarketId } from "../markets/markets.ts";

const domainOf = (command: string): string => command.split(".")[1] ?? "";
const SETTINGS = new Set(["pricing", "tipsLimits", "config", "dispatch", "zone", "onboarding", "payout", "incident", "alerts", "review", "reservation"]);

/** Who the action touches, in plain words. */
export function whoFor(command: string) {
  const domain = domainOf(command);
  if (/^admin\.(payout|refund|payment)\.|^admin\.trip\.(refund|adjust|waiveFee|driverBonus)$|^admin\.rider\.(walletCredit|feeMarkPaid)$/.test(command)) return "The people whose money this is: the rider, driver or fleet named here. Nobody else." as const;
  if (domain === "trip" || domain === "reservation") return "The rider and the driver of this trip or booking. Nobody else." as const;
  if (["pricing", "tipsLimits", "config", "dispatch", "zone", "onboarding"].includes(domain)) return "Riders and drivers in the zones named here: their apps get the new values with the next app settings. Other zones are not affected." as const;
  if (["studio", "content", "campaign", "messages", "driverNotices"].includes(domain)) return "Everyone who sees these texts or messages in the apps, in the zones named here." as const;
  if (["driver", "drivers", "driverOps", "vehicle", "fleetOwner"].includes(domain)) return "The driver, car or fleet named here. Other drivers are not affected." as const;
  if (["rider", "riders", "growthOps"].includes(domain)) return "The rider named here. Other riders are not affected." as const;
  if (["safety", "incident", "alerts", "support", "review", "approval", "inbox"].includes(domain)) return "The case named here and the people in it. Other admins see the change at once." as const;
  if (["team", "auth", "server"].includes(domain)) return "The account named here." as const;
  return "Only what this dialog names. Nobody else." as const;
}

/** How the action is taken back, in plain words. Never promises an undo that does not exist. */
export function undoFor(command: string) {
  const domain = domainOf(command);
  if (command === "admin.pricing.saveCountry" || domain === "tipsLimits") return "Pricing › Tips & limits › Undo last Tips & limits save puts back the version before in every document of that save." as const;
  if (domain === "pricing") return "Pricing › History › Restore puts an earlier version back, and the tile Undo last pricing publish undoes the newest one." as const;
  if (domain === "dispatch") return "Dispatch › History › Undo puts the version before back." as const;
  if (command === "admin.config.useStandard") return "The zone's own settings stay in History. Publish them again for that zone to take it off the Standard." as const;
  if (domain === "config" || domain === "onboarding") return "There is no one-press undo here: publish the earlier values again. A zone can also go back to the Standard with Go back to Standard." as const;
  if (domain === "zone") return "Zones › Releases: roll back to the release before." as const;
  if (domain === "studio" || domain === "content") return "Content › History: roll back to the version before." as const;
  if (/^admin\.(payout|refund|payment)\.|^admin\.trip\.(refund|adjust|waiveFee|driverBonus)$|^admin\.rider\.(walletCredit|feeMarkPaid)$/.test(command)) return "Money that was sent cannot be taken back from the panel. Check the amount and the person before you confirm." as const;
  return "There is no one-press undo. The action is written in the Audit log with your name and your reason; do the opposite action on the same page to take it back." as const;
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
    };
  });
}
