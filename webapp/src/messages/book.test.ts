import { advance } from "./book.ts";
import { NOTICE_KINDS, deliveryLine, driverAppNotices, emptyDriverNoticeBook, inQuiet, isOnlineNow, limitOf, noticeChanges, noticeIssues, noticeText, normalizeDriverNoticeBook, sendNotice, targetDrivers } from "./driverNotices.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// The test-send audience moved to messages/ops.test.ts (C-21).
const message = advance({ id: "M1", audience: { app: "rider", zone: "Norrmalm" }, body: "Hello", status: "accepted" }, "sent");
assert(message.status === "sent", "sent is separate from accepted");
assert(advance(message, "delivered").status === "delivered", "delivered");
assert(advance(message, "failed").status === "failed", "failed");

// Q31: driver notifications N1–N4. The kind ids are the driver app's DriverNoticeKind.
const notices = emptyDriverNoticeBook();
assert(NOTICE_KINDS.map((def) => def.kind).join() === "newScheduledRide,exclusiveOffer,scheduledReminder,leaveNow,highDemand,event,documentExpiring,documentApproved,restOver,scheduledPaused,payoutSent,bonusProgress", "the driver app's kinds, in its order");
assert(NOTICE_KINDS.every((def) => notices.kinds[def.kind].on && notices.kinds[def.kind].offline && notices.kinds[def.kind].island), "everything on, popups reach offline drivers");
assert(limitOf("leaveNow") === "always" && limitOf("highDemand") === "promo" && limitOf("payoutSent") === "quiet", "ride alerts always go through");
const seLimits = notices.limits.SE;
assert(seLimits.promoPerDay.max === 2 && inQuiet(seLimits, "23:10") && inQuiet(seLimits, "06:59") && !inQuiet(seLimits, "07:00"), "2 promo messages a day, quiet 22:00–07:00");
assert(deliveryLine("exclusiveOffer", seLimits, "23:00") === "Always goes through, also in quiet hours." && deliveryLine("highDemand", seLimits, "23:00") === "Quiet hours now: it goes out at 07:00." && deliveryLine("highDemand", seLimits, "12:00") === "Goes out now.", "quiet hours hold promo messages, not ride alerts");
const svNotice = { ...notices.kinds.newScheduledRide, texts: { sv: { title: "Ny bokad resa" } } };
assert(noticeText(svNotice, "newScheduledRide", "sv").title === "Ny bokad resa" && noticeText(svNotice, "newScheduledRide", "sv").body === "{day} {time} · {fare} · Tap to view" && noticeText(svNotice, "newScheduledRide", "fr").title === "New scheduled ride", "empty means the default");
const edited = { ...notices, kinds: { ...notices.kinds, exclusiveOffer: { ...notices.kinds.exclusiveOffer, on: false }, newScheduledRide: svNotice }, limits: { ...notices.limits, SE: { ...seLimits, promoPerDay: { on: true, max: 3 } } } };
const noticeLines = noticeChanges(notices, edited);
assert(noticeLines.includes("Exclusive offer: off") && noticeLines.includes("New scheduled ride: Swedish title “Ny bokad resa”") && noticeLines.includes("SE: promo messages 2 → 3 a day"), "change lines");
assert(noticeIssues({ ...edited, kinds: { ...edited.kinds, payoutSent: { ...edited.kinds.payoutSent, texts: { en: { body: "{fare} sent" } } } } })[0].startsWith("Payout sent: {fare} is not a value here") && noticeIssues({ ...edited, limits: { ...edited.limits, FR: { ...edited.limits.FR, promoPerDay: { on: true, max: 0 } } } })[0] === "FR: a driver can get 1 to 10 promo messages a day.", "unknown values and limits are checked");
const crowd = Array.from({ length: 9 }, (_, index) => ({ id: `D00${index + 10}`, zoneId: index < 7 ? "Z001" : "Z002" }));
const everyone = targetDrivers(crowd, { zoneId: "Z001", groupDriverIds: null, reach: "all" });
assert(everyone.length === 7 && targetDrivers(crowd, { zoneId: "Z001", groupDriverIds: null, reach: "online" }).every((row) => isOnlineNow(row.id)) && targetDrivers(crowd, { zoneId: "Z001", groupDriverIds: ["D0010"], reach: "all" }).length === 1, "zone, group and online or offline");
const input = { kind: "highDemand" as const, country: "SE" as const, zoneId: "Z001", area: { name: "Stockholm City", center: [59.33, 18.06] as [number, number], radiusKm: 1.6 }, groupId: null, reach: "all" as const, title: "High demand in Stockholm City", body: "Go online now", driverIds: everyone.map((row) => row.id) };
const first = sendNotice(notices, input, "nora", "2026-10-15T12:00:00Z", "14:00");
assert(!first.error && first.sent!.driverIds.length === 7 && first.sent!.sendsAt === null && first.book.draftRev === 2, "sent to the zone's drivers");
const second = sendNotice(first.book, input, "nora", "2026-10-15T13:00:00Z", "23:30");
assert(second.sent!.sendsAt === "07:00" && sendNotice(second.book, input, "nora", "2026-10-15T14:00:00Z", "16:00").error === "Every driver here already got today's promo messages.", "quiet hours wait, and the daily limit stops a third message");
assert(sendNotice({ ...notices, kinds: { ...notices.kinds, highDemand: { ...notices.kinds.highDemand, on: false } } }, input, "nora", "now", "12:00").error === "High demand is off. Turn it on first.", "a kind that is off can't be sent");
const onlineOnly = sendNotice({ ...notices, kinds: { ...notices.kinds, highDemand: { ...notices.kinds.highDemand, offline: false } } }, input, "nora", "2026-10-15T12:00:00Z", "12:00");
assert(onlineOnly.sent!.driverIds.every((id) => isOnlineNow(id)) && onlineOnly.sent!.skipped === 7 - onlineOnly.sent!.driverIds.length, "without “Also offline” only online drivers get it");
const appRules = driverAppNotices(normalizeDriverNoticeBook(edited), "SE");
assert(appRules.off.join() === "exclusiveOffer" && (appRules.texts.sv as Record<string, unknown>).newScheduledRide !== undefined && appRules.limits.promoPerDay === 3 && appRules.limits.alwaysThrough.includes("leaveNow"), "what the driver app gets");

console.log("messages ok");
