import type { SettingInfoText } from "../SettingInfo.ts";

/**
 * English "i" texts, Settings (pages/ConfigPage.tsx, config/CountryAppsPanel.tsx, config/RequestLimitsPanel.tsx,
 * platform/SettingsParts.tsx). Written from config/book.ts (RIDER_SWITCHES, DRIVER_SWITCHES, emptyConfigBook),
 * config/appConfigs.ts (which switches reach the apps), config/countrySettings.ts and contract.json#countryLimits.
 */
const t = (what: string, where: string, range: string, example: string): SettingInfoText => ({ what, where, range, example });

const DRAFT = "Settings › All settings, in the configuration draft: Save draft keeps it, Publish sends it to the zones chosen at the top.";
const RIDER = `${DRAFT} Rider app (rider app configuration).`;
const DRIVER = `${DRAFT} Driver app (driver app configuration).`;
const COUNTRY = "Settings › Payment methods and languages per country: one value per country, for every zone of it. Saved with Save.";
const TEST = "Settings › All settings › Environment, in the configuration draft only. It is not sent to the rider or driver app.";

export const SETTINGS_INFO: Readonly<Record<string, SettingInfoText>> = {
  "config.switch.wallet": t(
    "Turns the wallet on or off in the rider app. A wallet override for a zone (below) can change it for that zone.",
    RIDER,
    "On or off. Default: on.",
    "Off: riders do not see their wallet balance or pay with it.",
  ),
  "config.switch.pin": t(
    "Turns the PIN feature on or off in the rider app.",
    RIDER,
    "On or off. Default: on.",
    "Off: the rider app shows no PIN.",
  ),
  "config.switch.shareTrip": t(
    "Turns Share trip on or off in the rider app.",
    RIDER,
    "On or off. Default: on.",
    "Off: riders cannot share their trip from the app.",
  ),
  "config.switch.showRating": t(
    "Shows the driver his own rating in the driver app.",
    DRIVER,
    "On or off. Default: on.",
    "Off: drivers no longer see their star rating.",
  ),
  "config.switch.showAcceptance": t(
    "Shows the driver his acceptance rate in the driver app.",
    DRIVER,
    "On or off. Default: on.",
    "Off: the acceptance rate is hidden from drivers.",
  ),
  "config.switch.showCancellation": t(
    "Shows the driver his cancellation rate in the driver app.",
    DRIVER,
    "On or off. Default: on.",
    "Off: the cancellation rate is hidden from drivers.",
  ),
  "config.publishSchedule": t(
    "When the published configuration takes effect. Empty = at once.",
    `${DRAFT} Not connected yet in the live panel.`,
    "A date and time, or empty. Default: empty.",
    "Set Monday 06:00: the change starts Monday morning.",
  ),
  "config.expiry": t(
    "When the configuration stops and the one before comes back. Empty = it never expires.",
    `${DRAFT} Not connected yet in the live panel.`,
    "A date and time, or empty. Default: empty.",
    "A weekend test that ends Sunday 23:59.",
  ),
  "config.override.feature": t(
    "The feature the advanced override changes.",
    `${DRAFT} Not connected yet in the live panel.`,
    "Wallet (the only one today).",
    "Wallet off for one cohort.",
  ),
  "config.override.level": t(
    "Where the override applies. The winning order is global → market → zone → category → app → platform → app version → cohort.",
    `${DRAFT} Not connected yet in the live panel.`,
    "One of those 8 levels.",
    "Level zone: only one zone changes.",
  ),
  "config.override.target": t(
    "The exact market, zone, category, app, platform, version or cohort the override is for.",
    `${DRAFT} Not connected yet in the live panel.`,
    "Text, picked from the list or typed; must not be empty.",
    "Zone op-norrmalm.",
  ),
  "config.override.value": t(
    "What the override sets the feature to.",
    `${DRAFT} Not connected yet in the live panel.`,
    "On or off.",
    "Off: the wallet is off at that target.",
  ),
  "config.override.times": t(
    "When the override starts and when it ends. Empty = from now, and no end.",
    `${DRAFT} Not connected yet in the live panel.`,
    "Date and time, or empty.",
    "Starts Friday 18:00, expires Sunday 23:00.",
  ),
  "config.zoneOverride": t(
    "Picks the zone whose legacy wallet switch is shown below.",
    DRAFT,
    "One of the zones.",
    "Pick Norrmalm to change the wallet only there.",
  ),
  "config.zoneWallet": t(
    "Turns the wallet on or off in the picked zone only, over the rider app's wallet switch.",
    RIDER,
    "On or off. Default: the rider app's wallet switch.",
    "Off in one zone: riders there do not see the wallet.",
  ),
  "config.reasonText": t(
    "The Swedish and English text of a reason in the rider support and receipt group. Cancel reasons are edited in Dispatch › Cancel reasons.",
    DRAFT,
    "Free text per language.",
    "\"Wrong price on the receipt\".",
  ),
  "config.environment.simulatedArrival": t(
    "Test only: the arrival is simulated instead of waiting for a real driver.",
    TEST,
    "On or off. Default: off. Leave it off in real use.",
    "On during a demo to show the arrival screen.",
  ),
  "config.environment.skipActivation": t(
    "Test only: skips the activation step.",
    TEST,
    "On or off. Default: off. Leave it off in real use.",
    "On to test the rest of the flow quickly.",
  ),
  "config.environment.demoPopup": t(
    "Test only: shows the preview pop-up.",
    TEST,
    "On or off. Default: off.",
    "On while showing the panel to a new admin.",
  ),
  "config.environment.demoHint": t(
    "Test only: shows the preview hint.",
    TEST,
    "On or off. Default: off.",
    "On while showing the panel to a new admin.",
  ),
  "settings.payment.cash": t(
    "Whether riders in this country can choose Pay in car (cash). Today Movera takes only Pay in car.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: on. A country Movera is not open in yet cannot be saved.",
    "On: the rider picks Pay in car and pays the driver.",
  ),
  "settings.payment.card": t(
    "Whether riders in this country see Card. It shows as \"Coming soon\" until a payment company is connected.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: on.",
    "Off: the rider does not see Card at all.",
  ),
  "settings.payment.apple_pay": t(
    "Whether riders in this country see Apple Pay. It shows as \"Coming soon\" until a payment company is connected.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: on.",
    "Off: Apple Pay is not offered in that country.",
  ),
  "settings.walletFirst": t(
    "The wallet balance is used first when a rider pays. The rider can switch it off per ride; the per-ride switch starts on.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: on.",
    "On: a rider with 50 kr in the wallet pays 50 kr from it on a 120 kr ride.",
  ),
  "settings.language.rider": t(
    "The language the rider app starts in, in this country. Each rider can change it.",
    `${COUNTRY} Rider app.`,
    "English, French or Swedish. Default: Swedish in Sweden, French in France and Tunisia.",
    "Tunisia on French: a new rider sees the app in French.",
  ),
  "settings.language.driver": t(
    "The language the driver app starts in, in this country. Each driver can change it.",
    `${COUNTRY} Driver app.`,
    "English, French or Swedish. Default: Swedish in Sweden, French in France and Tunisia.",
    "Sweden on Swedish: a new driver sees the app in Swedish.",
  ),
  "settings.language.admin": t(
    "The language the admin panel starts in for this country. Each admin can change his own.",
    `${COUNTRY} Admin panel.`,
    "English, French or Swedish. Default: Swedish in Sweden, French in France and Tunisia.",
    "France on French: a new admin there sees French.",
  ),
  "settings.requestLimits.writesPerUserPerMinute": t(
    "How many changes (book, cancel, send, save) one signed-in person may send per minute. Above it the apps say \"wait a moment\" and try again by themselves.",
    "Settings › Request limits, per country (the person's country), on the live server. The server uses the new limit within a minute.",
    "Whole number, 30 to 10 000. Default: 120.",
    "120: a 121st change in one minute waits a moment.",
  ),
  "settings.requestLimits.writesPerAddressPerMinute": t(
    "How many changes one internet address may send per minute when nobody is signed in (sign-in, waiting list).",
    "Settings › Request limits, per country (the server's default zone), on the live server. The server uses the new limit within a minute.",
    "Whole number, 20 to 10 000. Default: 60.",
    "60: a script trying sign-ins is slowed after 60 a minute.",
  ),
  "settings.devPages": t(
    "Shows System, Release gates and Design (pages for developers) in the menu. Off: they still open by their address, for the Super admin only.",
    "Settings › Admin panel: the whole admin panel. Only the Super admin can change it.",
    "On or off. Default: off.",
    "On: the Super admin sees System in the menu.",
  ),
};
