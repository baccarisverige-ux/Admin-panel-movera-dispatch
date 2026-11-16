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
