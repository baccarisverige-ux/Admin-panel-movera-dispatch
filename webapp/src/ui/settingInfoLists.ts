import { PRICE_ROWS } from "../pricing/zonePricing.ts";
import { PICKUP_OFFERS } from "../pricing/pickupPay.ts";
import { CALL_FIELDS } from "../config/callSettings.ts";
import { CHAT_FIELDS } from "../config/chatSettings.ts";
import { APP_IDS } from "../config/countrySettings.ts";
import { ZONE_PAYMENT_METHODS } from "../config/zoneDefaults.ts";
import { REQUEST_LIMIT_FIELDS } from "../config/requestLimits.ts";
import { ALERTS, EXTRAS, FACTORS, WAIT_KINDS } from "../dispatch/rules/model.ts";
import { OFFER_CARD_DETAILS, WAIT_RIDE_TYPES } from "../dispatch/offers.ts";
import { LEVELS, ZONE_LIMITS } from "../alerts/engine.ts";
import { TOPICS } from "../support/desk.ts";

/**
 * The lists behind info ids built in a loop (`prefix.${id}`), taken from the same lists the pages loop over, so a new
 * item without its English text fails settingInfo.test.ts. Used by that test only.
 */
export const SETTING_INFO_LISTS: Readonly<Record<string, readonly string[]>> = {
  "pricing.price.": PRICE_ROWS.map((row) => row.field),
  "pricing.fee.": ["airportPickup", "airportDropoff", "reservationFee", "cleaningFee"],
  "pricing.pickup.offer.": PICKUP_OFFERS.map((item) => item.kind),
  "tips.calls.": CALL_FIELDS.map((field) => field.key),
  "tips.chat.": CHAT_FIELDS.map((field) => field.key),
  // pages/ConfigPage.tsx SwitchRow: cash, applePay, scheduled, bookLater and scheduledRides show a "set elsewhere" line, no switch.
  "config.switch.": ["wallet", "pin", "shareTrip", "showRating", "showAcceptance", "showCancellation"],
  "config.environment.": ["simulatedArrival", "skipActivation", "demoPopup", "demoHint"],
  "settings.payment.": [...ZONE_PAYMENT_METHODS],
  "settings.language.": [...APP_IDS],
  "settings.requestLimits.": [...REQUEST_LIMIT_FIELDS],
  "dispatch.zone.factor.": FACTORS.map((item) => item.id),
  "dispatch.zone.wait.": WAIT_KINDS.map((item) => item.id),
  "dispatch.zone.extra.": EXTRAS.map((item) => item.id),
  "dispatch.zone.alert.": ALERTS.map((item) => item.id),
  "dispatch.offerCard.detail.": OFFER_CARD_DETAILS.map((item) => item.id),
  "dispatch.cancelFee.free.": ["live", "reservation"],
  "dispatch.wait.rideType.": WAIT_RIDE_TYPES.map((item) => item.id),
  "alerts.settings.zoneLimit.": ZONE_LIMITS.map((item) => item.id),
  "alerts.settings.channels.": LEVELS.map((item) => item.id),
  // alerts/SettingsView.tsx LEGACY (a list inside the page).
  "alerts.settings.legacy.": ["dashboardCounts", "dashboardSound", "inbox", "dispatchAlerts"],
  "support.limits.": TOPICS.map((item) => item.id),
};
