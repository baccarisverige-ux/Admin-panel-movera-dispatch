import type { SettingInfoText } from "../SettingInfo.ts";

/**
 * English "i" texts, Payouts settings (live/LivePayoutSettings.tsx + live/payoutSettings.ts; payments/PayoutParts.tsx +
 * payments/runs.ts), Alerts › Settings (alerts/SettingsView.tsx + alerts/engine.ts defaultSettings, ZONE_LIMITS) and
 * Support settings (support/SupportSettings.tsx + support/desk.ts LIMITS). Written from the code.
 */
const t = (what: string, where: string, range: string, example: string): SettingInfoText => ({ what, where, range, example });

const PAYOUT_LIVE = "Payouts › Payout settings, per country (its Standard country rules), after Save; drivers are paid by it.";
const PAYOUT_DEMO = "Payouts › Schedule, per country (demo panel).";
const ALERTS = "Alerts › Settings: one setting for every admin of the panel.";
const SUPPORT = "Support › Settings, per country.";

export const MORE_INFO: Readonly<Record<string, SettingInfoText>> = {
  "payouts.live.mode": t("How driver payouts are made: automatically on the schedule, or an admin approves each run.", PAYOUT_LIVE, "Automatic or Manual. Default: Automatic.", "Manual: Monday's run waits until an admin approves it."),
  "payouts.live.frequency": t("How often a payout run happens.", PAYOUT_LIVE, "Every week or Every 2 weeks. Default: every week.", "Every 2 weeks: drivers are paid every other Monday."),
  "payouts.live.day": t("The weekday of the payout run.", PAYOUT_LIVE, "Monday to Sunday. Default: Monday.", "Friday: drivers are paid before the weekend."),
  "payouts.live.time": t("The time of the payout run, in the country's local time. A change applies to the next run.", PAYOUT_LIVE, "A time like 08:00. Default: 08:00.", "06:00: the run starts at 06:00 local time."),
  "payouts.howOften": t("How often the payout run happens.", PAYOUT_DEMO, "Every week or Every day. Default: every week.", "Every day: drivers are paid daily."),
  "payouts.day": t("The weekday of a weekly payout run.", PAYOUT_DEMO, "Monday to Sunday. Default: Monday.", "Thursday."),
  "payouts.time": t("The time of the payout run, in the country's time.", PAYOUT_DEMO, "A time like 08:00. Default: 08:00.", "07:30."),
  "payouts.retryFailedPayouts": t("Admins can send a payout again after the bank returned it.", PAYOUT_DEMO, "On or off. Default: on.", "A wrong account number bounced: an admin retries after the fix."),
  "payouts.secondAdminForBigRuns": t("A payout run above this total waits until another admin approves it.", PAYOUT_DEMO, "Money in the country's currency. Default: 20 000 kr, 2 000 €, 6 000 DT.", "20 000 kr: a 25 000 kr run needs a second admin."),
  "alerts.settings.kind": t("Turns this alert kind on or off; a kind with a fixed level shows which level it gets (Critical, Important or Info).", ALERTS, "On or off; level Critical, Important or Info. Default: per kind.", "Off: this kind never shows in the bell."),
  "alerts.settings.limits": t("The values at which this alert becomes Important or Critical. An unticked limit is not used.", ALERTS, "A number per level in the kind's unit, or off. Default: per kind.", "Critical from 10: at 10 or more it is Critical."),
  "alerts.settings.who": t("Which admins get this alert: every admin, or only the roles you tick.", ALERTS, "Every admin, or chosen roles. Default: every admin.", "Only Operations and Support get it."),
  "alerts.settings.passOn": t("If nobody takes the alert within these minutes, it is also shown to another role.", ALERTS, "On or off; minutes 1 to 240; a role. Default: off, 10 min, Operations.", "Not taken in 10 minutes: Operations sees it too."),
  "alerts.settings.zoneLimit.bookedAtRiskMin": t("Alert when a booked ride has no driver this many minutes or less before pickup.", "Alerts › Settings › Zone limits, per zone, on the live server (checked all the time).", "Minutes before pickup, 1 to 240. Default: 15.", "15: no driver at 09:45 for 10:00 raises an alert."),
  "alerts.settings.zoneLimit.liveAtRiskMin": t("Alert when a rider has waited this many minutes with no driver.", "Alerts › Settings › Zone limits, per zone, on the live server.", "Minutes waiting, 1 to 240. Default: 15.", "15: a ride requested at 18:00 alerts at 18:15."),
  "alerts.settings.zoneLimit.fewDriversLimit": t("Alert when free drivers are at most this many while more riders wait.", "Alerts › Settings › Zone limits, per zone, on the live server.", "Drivers, 0 to 100. Default: 2.", "2: 2 free drivers and 5 waiting riders raises an alert."),
  "alerts.settings.zoneLimit.noDriverLimit": t("Alert when this many live rides are searching at once.", "Alerts › Settings › Zone limits, per zone, on the live server.", "Rides, 1 to 500. Default: 5.", "5: a sixth ride searching at once keeps the alert on."),
  "alerts.settings.channels.critical": t("What else a Critical alert does besides the panel and the bell. Email and SMS are sent by the backend to the admins who get it.", ALERTS, "Sound, browser notification, email, SMS (each on or off). Default: sound and browser notification on.", "An SOS plays a sound and shows a browser notification."),
  "alerts.settings.channels.important": t("What else an Important alert does besides the panel and the bell.", ALERTS, "Sound, browser notification, email, SMS. Default: all off.", "Turn on email for Important alerts."),
  "alerts.settings.channels.info": t("What else an Info alert does besides the panel and the bell.", ALERTS, "Sound, browser notification, email, SMS. Default: all off.", "Leave them off: Info alerts stay quiet."),
  "alerts.settings.snooze": t("Adds a Snooze button on alerts: remind me again in 10 min to 4 hours.", ALERTS, "On or off. Default: off.", "On: an admin snoozes an alert for 30 minutes."),
  "alerts.settings.passToAnotherAdmin": t("Adds a button to pass an alert to another admin, who becomes the one working on it.", ALERTS, "On or off. Default: off.", "On: the night admin passes an alert to the morning admin."),
  "alerts.settings.muteThisKindFor1Hour": t("Adds a button to mute one alert kind for 1 hour, for example during planned work.", ALERTS, "On or off. Default: off.", "Mute \"Few free drivers\" during a planned outage."),
  "alerts.settings.openThePageToFixIt": t("Adds a button that goes straight to the driver, ride, payment or zone of the alert.", ALERTS, "On or off. Default: off.", "On: one tap opens the ride with no driver."),
  "alerts.settings.legacy.dashboardCounts": t("The Dashboard counts alerts on its own. Off: the Dashboard strip shows the same numbers as Alerts.", ALERTS, "On or off. Default: off.", "Keep it off so every number comes from Alerts."),
  "alerts.settings.legacy.dashboardSound": t("The Dashboard plays its own alert sound. Off: only the bell plays a sound, so nothing sounds twice.", ALERTS, "On or off. Default: off.", "Off: one sound per alert."),
  "alerts.settings.legacy.inbox": t("Shows the old Inbox button in the top bar. Off: the bell replaces it; its items are alerts now.", ALERTS, "On or off. Default: off.", "Off: documents waiting show in the bell."),
  "alerts.settings.legacy.dispatchAlerts": t("Dispatch → Live counts alerts on its own. Off: Dispatch shows the alerts from Alerts, so taking one there takes it here too.", ALERTS, "On or off. Default: off.", "Off: one list of alerts everywhere."),
  "alerts.settings.quietHours": t("Only for you: no sound and no browser notification in these hours. Alerts still show in the panel.", "Alerts › Settings › My quiet hours: only the admin who sets it.", "On or off; from and to, like 22:00. Default: off.", "22:00 to 07:00: no sound at night."),
  "support.limits.ride": t("How fast a \"Problem with a ride\" ticket must get a first answer and be solved. Late tickets turn red in the inbox.", SUPPORT, "First answer in minutes, solve in hours, at least 1. Default: 60 min, 24 h.", "60 min: a ticket from 10:00 is late at 11:00 without an answer."),
  "support.limits.payment": t("Time limits for \"Payment or refund\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 60 min, 24 h.", "Solve within 24 h."),
  "support.limits.lost": t("Time limits for \"Lost item\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 30 min, 48 h.", "Answer within 30 min."),
  "support.limits.safety": t("Time limits for \"Safety\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 5 min, 4 h.", "Answer within 5 min."),
  "support.limits.account": t("Time limits for \"Account and login\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 120 min, 24 h.", "Answer within 2 hours."),
  "support.limits.app": t("Time limits for \"The app does not work\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 120 min, 48 h.", "Solve within 48 h."),
  "support.limits.pay": t("Time limits for \"Driver pay\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 120 min, 48 h.", "Answer within 2 hours."),
  "support.limits.other": t("Time limits for \"Something else\" tickets: first answer and solve.", SUPPORT, "Minutes and hours, at least 1. Default: 240 min, 72 h.", "Solve within 3 days."),
  "support.sortByTopicAndLanguageBy": t("New tickets get a topic from their words and a language from the country.", SUPPORT, "On or off. Default: on.", "\"I lost my phone\" is sorted as Lost item."),
  "support.askForARatingAfterSolving": t("The person gets 1 to 5 stars in the app after a ticket is solved; the average shows per admin.", SUPPORT, "On or off. Default: on.", "On: the rider rates the answer 5 stars."),
  "support.alertWhenATicketIsLate": t("Late tickets show in Alerts and the bell.", SUPPORT, "On or off. Default: on.", "A safety ticket unanswered after 5 minutes rings the bell."),
  "support.template": t("A ready-made reply: title, topic, language and text. Admins pick one and change it before sending; the ticket's language comes first.", SUPPORT, "Free text; a topic or Any topic; a language.", "\"Refund on its way\" for Payment or refund, in Swedish."),
};

const STUDIO = "Content › Studio, the content slot picked, for the zones chosen at the top; the apps show it after Publish.";
const STUDIO_DEMO = "Content › Studio › Image, places and app update (demo panel), for the slot picked.";
const LEGAL = "Content › Legal, per country: the terms and privacy texts in the rider and driver apps, after Publish.";
const BONUS_DEMO = "Drivers › Bonuses › New driver bonus (demo panel), per country.";
const CAMPAIGN = "Drivers › Bonuses (live): one campaign in one zone; drivers see it in the driver app and Movera pays it with the next payout.";

export const MORE_INFO_2: Readonly<Record<string, SettingInfoText>> = {
  "content.studio.title": t("The title of this content, shown with it in the app.", STUDIO, "Free text, required.", "\"Weekend tips\"."),
  "content.studio.text": t("The content text in Swedish, French and English; the app shows the one in the user's language.", STUDIO, "Free text; all three languages are required.", "Swedish \"Kör säkert i helgen\", French and English the same message."),
  "content.studio.imageUrl": t("An optional picture shown with the content.", STUDIO, "A web address starting with https://, or empty.", "https://…/banner.png."),
  "content.studio.expiry": t("When the content stops being shown. Empty = no end.", STUDIO, "A future date and time, or empty.", "Sunday 23:59: the banner is gone on Monday."),
  "content.studio.riderMin": t("The lowest rider app version that may be used. Below it the app shows \"Update the app\" and is blocked (after a trip; SOS always works).", `${STUDIO} Slot app-versions only.`, "A version like 1.2.3, not above the recommended one.", "1.4.0: a rider on 1.3.9 must update."),
  "content.studio.riderRecommended": t("Below this rider app version the user sees a message to update that he can close.", `${STUDIO} Slot app-versions only.`, "A version like 1.2.3, at least the minimum.", "1.5.0: riders on 1.4.x see \"Update available\"."),
  "content.studio.driverMin": t("The lowest driver app version that may be used. Below it the app shows \"Update the app\" and is blocked (after a trip; SOS always works).", `${STUDIO} Slot app-versions only.`, "A version like 1.2.3, not above the recommended one.", "2.0.0: a driver on 1.9 must update."),
  "content.studio.driverRecommended": t("Below this driver app version the user sees a message to update that he can close.", `${STUDIO} Slot app-versions only.`, "A version like 1.2.3, at least the minimum.", "2.1.0: drivers on 2.0.x see \"Update available\"."),
  "content.studio.usersMustAcceptAgain": t("At the next app start (never during a trip) riders and drivers see the new terms with \"I accept\"; until then the rider cannot book and the driver cannot go online.", `${STUDIO} Slot legal only.`, "On or off. Default: off.", "On after a terms change: everyone accepts again."),
  "content.studio.image": t("Upload a picture for the content.", STUDIO_DEMO, "An image file, or none.", "A banner photo for a rider banner."),
  "content.studio.howTheImageFits": t("Fill covers the whole space and may cut the edges; Fit shows the whole picture.", STUDIO_DEMO, "Fill or Fit. Default: Fill.", "Fit for a logo that must not be cut."),
  "content.studio.countries": t("The content shows only in these countries.", STUDIO_DEMO, "Any of the countries.", "Only Sweden and France."),
  "content.studio.onlySomeZones": t("Shows the content only in the ticked zones. Leave empty to show it in every zone of the chosen countries.", STUDIO_DEMO, "On or off; zones of the chosen countries. Default: off (every zone).", "Only Norrmalm and Solna."),
  "content.studio.forceUpdateOnIphone": t("People on iPhone below the minimum version must update before they can book.", `${STUDIO_DEMO} Slot app-versions only.`, "On or off.", "On: an old iPhone app cannot book until updated."),
  "content.studio.forceUpdateOnAndroid": t("People on Android below the minimum version must update before they can book.", `${STUDIO_DEMO} Slot app-versions only.`, "On or off.", "On: an old Android app cannot book until updated."),
  "content.driverText": t("Your own wording of a driver app text (island, offer cards, main trip button) in the language shown. Empty means the app's default text; values in braces are filled in by the app and must stay.", "Content › Driver texts; the driver app.", "Island up to 40, offer cards up to 32, trip buttons up to 28 characters; keep every {value} of the English text.", "\"Radar online\" written as \"Radar on\"."),
  "content.legal.title": t("The title of the terms or the privacy text, in the language shown.", LEGAL, "Up to 200 characters per language.", "\"Terms of use\"."),
  "content.legal.text": t("The full terms or privacy text, in the language shown. A blank line starts a new paragraph; paragraph 3.5 keeps {waitingRules}, filled per zone with the live waiting rules.", LEGAL, "Up to 20 000 characters per language.", "Paragraph 3.5 shows the zone's free waiting and no-show fee."),
  "content.legal.company.companyName": t("Replaces {companyName} in the legal texts. A paragraph whose value is empty is left out.", LEGAL, "Free text, or empty.", "The company's legal name, as registered."),
  "content.legal.company.orgNumber": t("Replaces {orgNumber} in the legal texts. A paragraph whose value is empty is left out.", LEGAL, "Free text, or empty.", "The company registration number."),
  "content.legal.company.address": t("Replaces {address} in the legal texts. A paragraph whose value is empty is left out.", LEGAL, "Free text, or empty.", "The company's postal address."),
  "content.legal.company.supportEmail": t("Replaces {supportEmail} in the legal texts. A paragraph whose value is empty is left out.", LEGAL, "An e-mail address, or empty.", "The support address users write to."),
  "content.legal.company.supportPhone": t("Replaces {supportPhone} in the legal texts; spaces are removed when published. A paragraph whose value is empty is left out.", LEGAL, "A phone number, or empty.", "+46 8 123 456 78."),
  "content.legal.reaccept": t("At the next app start (never during a trip) riders and drivers in the country see the new texts with \"I accept\"; until then a rider cannot book and a driver cannot go online.", LEGAL, "On or off. Default: off.", "On after a privacy change: everyone accepts again."),
  "bonus.kind": t("Ride bonus: rides in a time window anywhere in the chosen zones. Area bonus: only rides in an area drawn on the map.", BONUS_DEMO, "Ride bonus or Area bonus.", "Area bonus around the arena."),
  "bonus.name": t("The bonus name drivers see.", `${BONUS_DEMO} Driver app.`, "Up to 40 characters. Default: \"Morning rush\" (\"Area bonus\" for an area).", "\"Friday night boost\"."),
  "bonus.message": t("An optional message to drivers, shown in the app and on the map.", `${BONUS_DEMO} Driver app.`, "Free text, optional.", "\"Concert ends 22:30 at the arena.\""),
  "bonus.rewardType": t("How the bonus pays: ride target, steps, extra per ride, earnings boost or guaranteed earnings.", BONUS_DEMO, "One of the 5 types. Default: Ride target.", "Steps: 3 rides 100, 5 rides 200."),
  "bonus.reward.target": t("Ride target: a driver who does this many rides earns this bonus.", BONUS_DEMO, "Rides 0 to 50; money in the country's currency. Default: 3 rides, 150 kr (15 €, 20 DT).", "3 rides between 07:00 and 09:00 earn 150 kr."),
  "bonus.reward.steps": t("Steps: rides and the bonus for each step. Drivers get the highest step they reach, not all of them added up.", BONUS_DEMO, "2 to 6 steps; rides 0 to 50 each. Default: 3, 5, 8 rides for 1×, 2×, 3.5× the amount.", "5 rides earn 300 kr, 8 rides 525 kr."),
  "bonus.reward.perRide": t("Extra money on each ride. Set Max payout per driver in the rules so the cost has a limit.", BONUS_DEMO, "Money in the country's currency.", "+20 kr on each ride."),
  "bonus.reward.multiplier": t("A boost on the driver's share of each fare. Needs a max payout.", BONUS_DEMO, "× up to 3, steps of 0.05. Default: × 1.3.", "× 1.3: 30% more on the driver's share."),
  "bonus.reward.guarantee": t("If the driver earns less than this per hour while online in the window, Movera pays the rest. Needs a max payout.", BONUS_DEMO, "Money per hour in the country's currency.", "At least 300 kr per hour."),
  "bonus.window": t("The time of day the bonus runs, in local time.", BONUS_DEMO, "Times like 07:00. Default: 07:00 to 09:00.", "16:00 to 18:00 for the evening rush."),
  "bonus.weekdays": t("The weekdays the bonus runs.", BONUS_DEMO, "Any of Mon to Sun. Default: Mon to Fri.", "Fri and Sat only."),
  "bonus.days": t("The first and the last day of the bonus. An empty last day = no end.", BONUS_DEMO, "Dates. Default: from today, no end.", "1 to 31 December."),
  "bonus.zones": t("The zones where rides count for a ride bonus. None = the whole country.", BONUS_DEMO, "Any zones of the country. Default: none (whole country).", "Only Norrmalm."),
  "bonus.areaCounts": t("For an area bonus: a ride counts when its pickup, its drop-off, or both are inside the area.", BONUS_DEMO, "Pickup inside, Drop-off inside, or Both inside. Default: pickup inside.", "Pickup inside the arena area."),
  "bonus.areaName": t("The name of one drawn bonus area.", BONUS_DEMO, "Free text.", "\"Arena north\"."),
  "bonus.rule.maxCancelPct": t("Drivers who cancel more than this get nothing.", BONUS_DEMO, "On or off; percent 0 to 100. Default: on, 10%.", "10%: a driver at 15% cancels earns no bonus."),
  "bonus.rule.minAcceptPct": t("Only drivers who accept at least this share of ride offers earn the bonus.", BONUS_DEMO, "On or off; percent 0 to 100. Default: off, 80%.", "80%: a driver accepting 70% earns nothing."),
  "bonus.rule.backToBack": t("Rides count only when the next one starts within these minutes of the last.", BONUS_DEMO, "On or off; minutes. Default: off, 20.", "20 min: a 30 minute gap breaks the chain."),
  "bonus.rule.minFare": t("Short cheap rides below this fare do not count.", BONUS_DEMO, "On or off; money. Default: off, 80 kr (8 €, 8 DT).", "80 kr: a 60 kr ride does not count."),
  "bonus.rule.minKm": t("Rides shorter than this do not count.", BONUS_DEMO, "On or off; km. Default: off, 2 km.", "2 km: a 1.5 km ride does not count."),
  "bonus.rule.minRating": t("Only drivers with at least this rating earn the bonus.", BONUS_DEMO, "On or off; stars 1 to 5, one decimal. Default: off, 4.7.", "4.7: a 4.6 driver earns nothing."),
  "bonus.rule.minOnlineMin": t("The driver must be online at least this many minutes in the time window.", BONUS_DEMO, "On or off; minutes. Default: off, 60.", "60: a driver online 45 minutes earns nothing."),
  "bonus.rule.maxRides": t("Extra rides after this number do not add more.", BONUS_DEMO, "On or off; rides. Default: off, 10.", "10: the 11th ride adds nothing."),
  "bonus.rule.maxPayout": t("The most one driver can earn from this bonus.", BONUS_DEMO, "On or off; money. Default: off, 500 kr (50 €, 80 DT).", "500 kr: extra per ride stops at 500 kr."),
  "bonus.rule.categories": t("Only rides in the ticked categories count; rides in other categories do not.", BONUS_DEMO, "On or off; car types. Default: off.", "Only Comfort and Premium rides count."),
  "bonus.audience": t("Which drivers can earn the bonus. Only active drivers get bonuses; a driver on hold or suspended earns nothing.", BONUS_DEMO, "All active drivers, New drivers (last 30 days), Top drivers (rating 4.85+), One fleet, or Drivers I pick. Default: all active drivers.", "New drivers only, to help them start."),
  "bonus.budget": t("An optional total budget for the bonus. 0 = no budget.", BONUS_DEMO, "Money in the country's currency, optional. Default: none.", "5 000 kr in all."),
  "bonus.quick.on": t("Turns this bonus on or off from the map.", BONUS_DEMO, "On or off.", "Off: the bonus stops at once."),
  "bonus.quick.amount": t("Changes the bonus amount from the map (multiplier, extra per ride or per hour, by type). Step bonuses are changed in full screen.", BONUS_DEMO, "A number 0 or more.", "Raise extra per ride to 25 kr."),
  "bonus.campaign.names": t("The campaign name drivers see, in Swedish, French and English.", CAMPAIGN, "1 to 80 characters in each language.", "\"Airport weekend\" in all three."),
  "bonus.campaign.zone": t("The zone the campaign is in. Changing it clears the drawn area.", CAMPAIGN, "One zone of the country.", "Arlanda zone."),
  "bonus.campaign.measure": t("What counts towards the target: trips, or hours online.", CAMPAIGN, "Trips or Hours online. Default: trips.", "Hours online: be online 20 hours."),
  "bonus.campaign.target": t("How many trips, or hours online, a driver must reach inside the area and the dates.", CAMPAIGN, "Whole number: 1 to 500 trips, or 1 to 200 hours online.", "30 trips in the week."),
  "bonus.campaign.amount": t("What a driver who reaches the target earns, once, with the next payout.", CAMPAIGN, "Above 0 in the zone's currency, at most the country's largest campaign bonus (Pricing › Tips & limits: 2 000 kr, 200 €, 200 DT by default).", "500 kr for 30 trips."),
  "bonus.campaign.dates": t("The campaign's first and last day, in the zone's local dates.", CAMPAIGN, "Start today or later; end not before the start; at most 92 days.", "1 to 7 December."),
  "bonus.campaign.laterEnd": t("A running campaign can only get a later end date (and new names). To change anything else, end it and make a new one.", CAMPAIGN, "A date after the current end, at most 92 days from the start.", "Extend 7 December to 14 December."),
  "bonus.campaign.area": t("The campaign's own shape, separate from the operating zones. Every point must be inside the zone.", CAMPAIGN, "3 to 500 points.", "A shape around the airport terminals."),
};
