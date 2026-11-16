import type { SettingInfoText } from "../SettingInfo.ts";

/**
 * English "i" texts, Pricing › Tips & limits (CountryRules). Written from config/countrySettings.ts
 * (defaultCountrySettings, MAX_AMOUNTS, TIP_*, WALLET_CREDIT_MAX, DRIVER_PAY_CHANGE_MAX, BONUS_CAMPAIGN_MAX_MAJOR,
 * PERSON_LIMITS_DEFAULT), config/zoneDefaults.ts CONFIG_DEFAULTS.countries, config/callSettings.ts,
 * config/chatSettings.ts (CHAT_DEFAULTS, CHAT_RANGES), config/dontMatchSettings.ts, config/emergencyNumbers.ts.
 */
const t = (what: string, where: string, range: string, example: string): SettingInfoText => ({ what, where, range, example });

const COUNTRY = "Pricing › Tips & limits: one setting per country (the Standard), or only the zones chosen at the top. Saved with Save, not with Publish.";
const STANDARD_ONLY = "Pricing › Tips & limits, on the country Standard only: one value for the whole country (a zone shows it read-only).";
const CHAT = "Pricing › Tips & limits › Chat, per country (or the zones chosen at the top). The rider and driver apps get it for the trip chat.";
const CALLS = "Pricing › Tips & limits › Calls, per country (or the zones chosen at the top). Rider and driver apps.";

export const TIPS_INFO: Readonly<Record<string, SettingInfoText>> = {
  "tips.tips": t(
    "The tip buttons the rider sees after the ride. The whole tip goes to the driver.",
    `${COUNTRY} Rider app.`,
    "Up to 8 amounts, each at most 1 000 kr (about 95 € or 300 DT); one can be switched off and back on. Default: 10, 20, 30 kr; 1, 2, 5 €; 1, 2, 3 DT.",
    "Buttons 20, 30, 50 kr after every ride.",
  ),
  "tips.cashAfterTrip": t(
    "Lets the rider give a cash tip in the app after the trip has ended. Off: a cash tip is only possible in the car, in the first minutes after the trip.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: off.",
    "Off with 5 minutes: the cash tip button is gone 5 minutes after drop-off.",
  ),
  "tips.cashInCarMinutes": t(
    "How long after the trip the rider can still give a cash tip in the app, when cash tips after the trip are off.",
    `${COUNTRY} Rider app.`,
    "Minutes, 0 to 60. 0 = no cash tip in the app once the trip has ended. Default: 5.",
    "10 minutes: the rider can tip cash until 10 minutes after drop-off.",
  ),
  "tips.customAmount": t(
    "Lets the rider type his own tip amount besides the buttons.",
    `${COUNTRY} Rider app.`,
    "On or off. Default: off.",
    "On: a rider types 45 kr.",
  ),
  "tips.customMax": t(
    "The highest tip a rider can type.",
    `${COUNTRY} Rider app.`,
    "Money in the country's currency, up to 10 times the tip maximum. Default: 200 kr, 20 €, 30 DT.",
    "200 kr: a typed tip of 300 kr is refused.",
  ),
  "tips.raiseSteps": t(
    "The quick \"+\" buttons the rider can tap to raise his offer while he waits for a driver.",
    `${COUNTRY} Rider app.`,
    "Up to 8 amounts, each at most 500 kr (about 47.50 € or 150 DT). Default: +50, +100, +150, +200 kr; +2, +4, +6, +8 €; +2, +4, +6, +8 DT.",
    "Buttons +20, +50 kr on a busy night.",
  ),
  "tips.promoCap": t(
    "The highest promo discount on one ride, shown to the rider. Off = no cap.",
    `${COUNTRY} Rider app.`,
    "Off, or money up to 2 000 kr (about 190 € or 600 DT). Default: off; turning it on starts at 100 kr.",
    "Cap 80 kr: a 50% code on a 300 kr ride gives 80 kr off.",
  ),
  "tips.driverBonusLimit": t(
    "The most an admin can add to one trip for the driver. Movera pays it; the rider never does. Above it the admin sees \"adjust the limit in Pricing\".",
    `${COUNTRY} Admins on a trip page.`,
    "Money, up to the hard max: 1 000 kr, 95 €, 300 DT. Default: 200 kr, 20 €, 60 DT.",
    "Limit 200 kr: adding 250 kr to a trip is refused.",
  ),
  "tips.driverPayChangeMax": t(
    "The largest change an admin can make to a driver's pay on one trip.",
    `${COUNTRY} Admins on a trip page.`,
    "Money, up to 10 times the hard max. Default: 1 000 kr, 100 €, 100 DT.",
    "1 000 kr: lowering a driver's pay by 1 200 kr is refused.",
  ),
  "tips.walletCreditMax": t(
    "The largest amount an admin can add to a rider's wallet at one time.",
    `${STANDARD_ONLY} Admins on a rider page.`,
    "Money, 0 to 1 000 000. Default: 2 900 kr, 250 €, 800 DT.",
    "2 900 kr: one Add money of 3 000 kr is refused.",
  ),
  "tips.bonusCampaignMax": t(
    "The most one driver can earn from one bonus campaign in Drivers › Bonuses. Movera pays it with the next payout.",
    `${COUNTRY} Admins in Drivers › Bonuses.`,
    "Money, 0 to 1 000 000. Default: 2 000 kr, 200 €, 200 DT.",
    "2 000 kr: a campaign paying 2 500 kr cannot be saved.",
  ),
  "tips.onTripMinDonePct": t(
    "A driver on a trip gets offers (Exclusive only) only after he has driven this share of his route to the drop-off.",
    `${COUNTRY} Driver app and dispatch.`,
    "Percent of the route, 0 to 100. Default: 70.",
    "70%: on a 10 km trip offers can come after 7 km.",
  ),
  "tips.chainLateFreeCancelMin": t(
    "The rider of a next trip (taken by a driver still on a trip) may cancel free after waiting this long.",
    `${COUNTRY} Rider app.`,
    "Minutes, 0 to 120. Default: 10.",
    "10 min: the driver is late from his last trip, so after 10 minutes the rider cancels free.",
  ),
  "tips.calls.on": t(
    "Rider and driver can call each other in the app, during the trip and for a while after the drop-off. Nobody sees a phone number; calls are not recorded.",
    CALLS,
    "On or off. Default: on.",
    "Off: the call button is gone in both apps.",
  ),
  "tips.calls.mode": t(
    "How calls are made. Phone mode needs a phone company; until one is chosen calls stay in the app.",
    CALLS,
    "In the app (free internet calls) or Phone. Default: in the app.",
    "In the app: the rider taps Call and it rings in the driver app.",
  ),
  "tips.calls.callWindowAfterTripMin": t(
    "How long after the drop-off rider and driver can still call each other.",
    CALLS,
    "Minutes, 0 to 240. Default: 60.",
    "60: a rider who forgot a bag can call the driver for an hour.",
  ),
  "tips.calls.ringSeconds": t(
    "How long a call rings before it stops.",
    CALLS,
    "Seconds, 10 to 120. Default: 30.",
    "30 s: an unanswered call stops after 30 seconds.",
  ),
  "tips.calls.maxCallMin": t(
    "The longest one call can last.",
    CALLS,
    "Minutes, 1 to 60. Default: 15.",
    "15: a call ends by itself after 15 minutes.",
  ),
  "tips.calls.connectTimeoutSeconds": t(
    "How long the app tries to connect a call before it gives up.",
    CALLS,
    "Seconds, 10 to 60. Default: 25.",
    "25 s on a weak network, then \"Could not connect\".",
  ),
  "tips.chat.keepDays": t(
    "How long trip chat messages are kept. Messages of a trip with a safety case stay with the case.",
    CHAT,
    "Days, 1 to 365. Default: 90.",
    "90: a chat from January is gone in April.",
  ),
  "tips.chat.maxLength": t(
    "The longest message one person can send in the trip chat.",
    CHAT,
    "Characters, 100 to 2 000. Default: 2 000.",
    "500: a longer message cannot be sent.",
  ),
  "tips.chat.spamPerMin": t(
    "How many messages one sender can post on one trip per minute.",
    CHAT,
    "Messages, 1 to 60. Default: 10.",
    "10: an 11th message in the same minute is refused; Support is not limited.",
  ),
  "tips.chat.sound": t(
    "A sound plays when a new chat message comes in.",
    CHAT,
    "On or off. Default: on.",
    "Off: new messages come in silently.",
  ),
  "tips.chat.sheetAutoOpen": t(
    "Whether the folded trip sheet opens by itself when a new message comes in.",
    CHAT,
    "On a new message, or Off. Default: on a new message.",
    "Off: the rider sees only a badge on the folded sheet.",
  ),
  "tips.chat.readAloudDefault": t(
    "The start value of \"read new messages aloud\" in the driver app; each driver can change it.",
    "Pricing › Tips & limits › Chat, per country (or the zones chosen at the top). Driver app.",
    "On or off. Default: off.",
    "On: a new driver hears messages read aloud while driving.",
  ),
  "tips.chat.translation": t(
    "Shows a translate link under messages, into the reader's own app language, with \"See original\". Until a translation service is set on the server the apps show \"Translation coming soon\".",
    CHAT,
    "On or off. Default: on.",
    "A French rider sees a Swedish driver's message with a Translate link.",
  ),
  "tips.chat.autoTranslate": t(
    "Messages arrive already translated into the receiver's language. \"See original\" shows the text as written. Needs the translate link on.",
    CHAT,
    "On or off. Default: on.",
    "A driver writes in Swedish; the rider reads it in English.",
  ),
  "tips.chat.quickRepliesOn": t(
    "Shows ready-made quick replies in the chat. A tap sends the reply in the reader's language.",
    CHAT,
    "On or off. Default: on.",
    "The driver taps \"I'm on my way\".",
  ),
  "tips.chat.quickReplies": t(
    "The list of quick replies for this side of the chat. Each has an id and a text in Swedish, French and English.",
    CHAT,
    "Up to 8 replies, each 1 to 60 characters per language; id: lower-case letters, digits and _, starting with a letter. Default: 5 driver and 4 rider replies.",
    "Driver: on_my_way = \"I'm on my way\".",
  ),
  "tips.chat.autoArrived": t(
    "When the driver arrives (tap or automatic), the rider gets an \"I've arrived\" message once, in the rider's app language.",
    CHAT,
    "On or off. Default: on.",
    "The driver taps Arrived; the rider's chat shows \"I've arrived at the pickup point.\".",
  ),
  "tips.chat.autoArrivedText": t(
    "The text of the automatic \"I've arrived\" message, in Swedish, French and English.",
    CHAT,
    "Up to 200 characters per language. Default (English): \"I've arrived at the pickup point.\".",
    "\"Your driver is outside, at the main entrance.\"",
  ),
  "tips.dontMatch.on": t(
    "On a low rating the rider and the driver can tick \"Don't match me again\"; they are then never matched again. Neither side is told; only Support can undo a block.",
    `${COUNTRY} Rider and driver apps, dispatch.`,
    "On or off. Default: on.",
    "A rider gives 1 star and ticks it: that driver never gets his rides again.",
  ),
  "tips.dontMatch.atStars": t(
    "The rating at or below which the \"Don't match me again\" tick is offered.",
    `${COUNTRY} Rider and driver apps.`,
    "1 star or 2 stars. Default: 1 star.",
    "2 stars: a 2-star rating also shows the tick.",
  ),
  "tips.savedPlacesPerPerson": t(
    "How many saved places one rider can keep. Keeps the server traffic small.",
    `${COUNTRY} Rider app.`,
    "1 to 500, Home and Work included. Default: 50.",
    "50: the 51st saved place is refused.",
  ),
  "tips.emergencyContactsPerPerson": t(
    "How many emergency contacts one rider or one driver can keep.",
    `${COUNTRY} Rider and driver apps.`,
    "1 to 50; 112 is built in and not counted. Default: 10.",
    "10: an 11th contact cannot be added.",
  ),
  "tips.emergency.kind": t(
    "What kind of emergency number this is.",
    `${STANDARD_ONLY} Safety screens of the rider and driver apps, and the safety case page.`,
    "Police, Ambulance, Fire or General.",
    "Tunisia: Police 197, Ambulance 190.",
  ),
  "tips.emergency.number": t(
    "The number the call button dials. The first number is the main one: SOS dials it.",
    `${STANDARD_ONLY} Rider and driver apps.`,
    "Digits, 2 to 15, an optional + first; up to 6 numbers. Default: 112 in Sweden and France; 197 and 190 in Tunisia.",
    "112 as the first number: SOS calls 112.",
  ),
  "tips.emergency.label": t(
    "The name on the call button, in Swedish, French and English.",
    `${STANDARD_ONLY} Rider and driver apps.`,
    "Up to 40 characters per language.",
    "English \"Ambulance (SAMU)\".",
  ),
  "tips.sosContactsSms": t(
    "When a driver presses SOS during a trip, each of his emergency contacts gets one SMS with his position. Off: no SMS; the call and the Movera alert stay.",
    `${STANDARD_ONLY} Driver app SOS. Sent only once an SMS company is connected.`,
    "On or off. Default: on.",
    "On: the driver's sister gets an SMS with the map position.",
  ),
};
