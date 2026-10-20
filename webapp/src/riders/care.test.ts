import { addCredit, validatePromo, autoState, parseEmails, promoMessage, promoReach, randomRiders, sendPromotion, setAutoPromos, setPopup, editPromotion, promoPrice, setPromotionOn, addLostItem, advanceLostItem, ban, createPromotion, decideRefund, emptyRiderCare, isBanned, markPaid, maxCost, merge, normalizeCare, promoResults, promoUsed, reply, requestRefund, saveFilter, threadOf, unpaidMinor, waitingMinutes, type PromoDraft } from "./care.ts";
import { bookingCounts, joinedAt, riderBookings, riderCode, riderProfile, type RiderRecord } from "./profile.ts";
import { buildRows, pickAudience, insights, matches, ridersCsv, segmentCounts, sortRows } from "./segments.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const NOW = Date.parse("2026-10-11T10:00:00.000Z");
const people: RiderRecord[] = Array.from({ length: 160 }, (_, index) => ({ id: `R${String(index + 1).padStart(4, "0")}`, name: `Rider ${index + 1} Test`, phone: `+46 70 000 ${String(index).padStart(4, "0")}`, zoneId: index % 3 ? "Z001" : "Z002", status: index % 17 === 0 ? "blocked" : "active", tripId: `T${index + 1}` }));
const paris: RiderRecord = { id: "R2601", name: "Chloé Martin", phone: "+33 6 00 00 00 01", zoneId: "FR-PC", status: "active" };

// Codes and the booking history.
assert(riderCode(people[0]) === "RD-SE-0001" && riderCode(paris) === "RD-FR-2601", "rider codes follow the country");
const heavy = people.map((rider) => riderBookings(rider, NOW)).sort((a, b) => b.length - a.length)[0];
const counts = bookingCounts(heavy);
assert(counts.completed > counts.cancelled_rider && counts.cancelled_rider > 0, "most rides complete, some are cancelled");
assert(heavy.every((booking, index) => index === 0 || booking.at <= heavy[index - 1].at), "history is newest first");
const all = people.flatMap((rider) => riderBookings(rider, NOW));
for (const status of ["completed", "cancelled_rider", "cancelled_driver", "no_show", "interrupted", "scheduled"] as const) assert(all.some((booking) => booking.status === status), `history has ${status}`);
assert(all.filter((booking) => booking.status === "interrupted").every((booking) => booking.reason), "interrupted rides say why");
assert(all.filter((booking) => booking.status === "cancelled_driver").every((booking) => booking.fareMinor === 0), "driver cancellations cost the rider nothing");
assert(JSON.stringify(riderBookings(people[5], NOW)) === JSON.stringify(riderBookings(people[5], NOW)), "history is stable");
const parisProfile = riderProfile(paris, riderBookings(paris, NOW), NOW);
assert(parisProfile.country === "FR" && parisProfile.code === "RD-FR-2601", "Paris rider is French");
const profile = riderProfile(people[0], riderBookings(people[0], NOW), NOW);
assert(profile.completed === riderBookings(people[0], NOW).filter((booking) => booking.status === "completed").length, "stats come from the history");
assert(profile.score >= 5 && profile.score <= 100, "score is 0–100");
assert(people.some((rider) => NOW - joinedAt(rider, NOW) < 7 * 86_400_000), "some riders joined this week");

// Rows, categories and sorting.
const care = emptyRiderCare();
const rows = buildRows(people, care, NOW, "month", new Set(["R0003"]));
const segs = segmentCounts(rows);
assert(segs.all === 160 && segs.new > 0 && segs.top >= 3 && segs.inactive > 0 && segs.blocked > 0, "categories are filled");
assert(segs.reply > 0 && segs.attention >= segs.reply, "riders waiting for a reply need attention");
assert(rows.find((row) => row.rider.id === "R0003")?.live === "waiting", "a waiting rider shows as online");
const byRides = sortRows(rows, "rides");
assert(byRides[0].periodRides >= byRides[byRides.length - 1].periodRides, "sort by most rides");
assert(rows.filter((row) => row.segments.has("top")).every((row) => row.periodRides >= sortRows(rows.filter((item) => item.segments.has("top")), "rides").at(-1)!.periodRides), "top riders book the most");
assert(matches(rows[0], "RD-SE-0001") && matches(rows[0], "rider 1 test") && !matches(rows[0], "nobody"), "search by code and name");
// Moved from the old riders/book.ts test (C-21): search by phone as stored (spaces must match), by trip and by name.
assert(matches(rows[0], "70 000 0000") && !matches(rows[0], "070 000 0000"), "find by phone; spaces must match the stored phone");
const onTrip = buildRows([{ ...people[1], tripId: "T1002" }], care, NOW, "month", new Set())[0];
assert(matches(onTrip, "T1002") && !matches(rows[0], "T1002"), "find by trip");
assert(matches(rows[0], "rider 1 test"), "find by name");
assert(ridersCsv(rows.slice(0, 2), (_row, minor) => String(minor / 100)).split("\n").length === 3, "CSV has a header and one line per rider");
const facts = insights(rows, NOW);
assert(facts.signups.length === 14 && facts.retention > 0 && facts.topZones.length > 0, "insights are computed");

// Messages.
const writer = people.find((rider) => waitingMinutes(threadOf(care, rider, NOW), NOW) !== null)!;
const answered = reply(care, writer, "We are on it.", "maja", NOW);
assert(waitingMinutes(threadOf(answered, writer, NOW), NOW) === null, "a reply clears the waiting badge");

// Wallet credit limits and refunds with a second approver.
const credited = addCredit(care, people[1], 200, "Driver was late", "astrid", NOW);
assert(!credited.error && credited.care.credits.length === 1, "credit added");
assert(addCredit(care, people[1], 600, "Too much", "astrid", NOW).error?.includes("at most 500"), "one credit is capped");
let monthly = care;
for (let i = 0; i < 2; i += 1) monthly = addCredit(monthly, people[1], 450, "Goodwill", "astrid", NOW).care;
assert(addCredit(monthly, people[1], 200, "Again", "astrid", NOW).error?.includes("Monthly limit"), "monthly limit holds");
const rideRow = rows.find((row) => row.bookings.some((booking) => booking.status === "completed" && booking.fareMinor > 60_000))!;
const ride = rideRow.bookings.find((booking) => booking.status === "completed" && booking.fareMinor > 60_000)!;
const small = requestRefund(care, rideRow.rider, ride, 100, "card", "Long route", "maja", NOW);
assert(!small.error && !small.needsApproval && small.care.refunds[0].status === "sent", "small refund goes out");
const big = requestRefund(care, rideRow.rider, ride, 550, "bank", "Charged twice", "maja", NOW);
assert(big.needsApproval && big.care.refunds[0].status === "waiting", "big refund waits for approval");
assert(decideRefund(big.care, big.care.refunds[0].id, true, "maja").error?.includes("Another admin"), "no self-approval");
assert(decideRefund(big.care, big.care.refunds[0].id, true, "astrid").care.refunds[0].status === "sent", "second admin approves");
assert(requestRefund(care, rideRow.rider, ride, ride.fareMinor / 100 + 1, "card", "x", "maja", NOW).error?.includes("paid"), "cannot refund more than paid");

// Unpaid balance clears when paid.
const owing = rows.find((row) => row.unpaidMinor > 0)!;
assert(owing.segments.has("unpaid"), "unpaid riders are in the unpaid category");
assert(unpaidMinor(markPaid(care, owing.rider.id, NOW), owing.rider, owing.profile) === 0, "marked as paid");

// Promotions: 30% for the next 10 rides, max 50 kr per ride.
const draft: PromoDraft = { code: "SPRING30", title: "Spring", kind: "percent", value: 30, rides: 10, maxPerRide: 50, minFare: 0, validFrom: "2026-10-11T00:00:00.000Z", validTo: "2026-11-11T00:00:00.000Z", country: "SE", zones: [], categories: [], budget: null, riderIds: ["R0001", "R0002"], group: "Picked riders" };
assert(maxCost(draft) === 1000, "max cost = riders × rides × max per ride");
const created = createPromotion(care, draft, "nora", NOW);
assert(!created.error && created.ticket?.status === "active", "promotion created");
assert(createPromotion(created.care, draft, "nora", NOW).error?.includes("already used"), "codes are unique");
assert(createPromotion(care, { ...draft, budget: 500 }, "nora", NOW).error?.includes("budget"), "budget is checked");
assert(promoUsed(created.ticket!, "R0001", riderBookings(people[0], NOW)) === 0, "a new promotion is unused");
const paused = setPromotionOn(created.care, created.ticket!.id, false);
assert(paused.promotions[0].status === "paused" && setPromotionOn(paused, created.ticket!.id, true).promotions[0].status === "active", "promotions switch off and on");
assert(!buildRows([people[0]], paused, NOW, "month", new Set())[0].promos.some((item) => item.ticket.code === "SPRING30"), "a paused promotion is not usable");
const edited = editPromotion(created.care, created.ticket!.id, { value: 25, maxPerRide: 40, rides: 5 }, "lena", NOW);
assert(!edited.error && edited.care.promotions[0].value === 25 && edited.care.promotions[0].rides === 5 && edited.care.promotions[0].editedBy === "lena", "promotion edited");
assert(editPromotion(created.care, created.ticket!.id, { value: 0, maxPerRide: 40, rides: 5 }, "lena", NOW).error, "a 0% promotion is refused");
const seeded = care.promotions[1];
const results = promoResults(seeded, (id) => {
  const rider = people.find((item) => item.id === id)!;
  const bookings = riderBookings(rider, NOW);
  return { used: promoUsed(seeded, id, bookings), avgFare: riderProfile(rider, bookings, NOW).avgFareMinor / 100 };
});
assert(results.reached === seeded.riderIds.length && results.ridesUsed >= results.usedBy, "results add up");

// Bans, lost items, merges, saved filters.
const banned = ban(care, "phones", people[2].phone, people[2].id, "Fraud", "nora", NOW);
assert(isBanned(banned.care, people[2].phone, "") && ban(banned.care, "phones", people[2].phone, people[2].id, "Fraud", "nora", NOW).error, "ban list");
const lost = addLostItem(care, "R0001", "Black umbrella", "R0001-B001", "maja", NOW);
assert(advanceLostItem(lost.care, "R0001", lost.care.lostFound.R0001[0].id).lostFound.R0001[0].status === "driver contacted", "lost item moves on");
assert(merge(care, "R0001", "R0001").error && !merge(care, "R0001", "R0002").error, "merge needs another account");
assert(saveFilter(care, { name: "Top in Norrmalm", by: "nora", segment: "top", query: "", sort: "rides", period: "month" }).care.savedFilters.length === 1, "filter saved");
assert(normalizeCare(null).promotions.length === 2, "empty data falls back to defaults");
// Old price and new price per category.
const promo = { kind: "percent" as const, value: 30, maxPerRide: 50, minFare: 0, categories: ["economy", "comfort"] };
assert(JSON.stringify(promoPrice(100, "economy", promo)) === JSON.stringify({ applies: true, discount: 30, newPrice: 70 }), "30% off 100 is 70");
assert(promoPrice(400, "comfort", promo).newPrice === 350, "capped at max per ride");
assert(!promoPrice(400, "premium", promo).applies, "categories outside the promotion keep their price");
assert(!promoPrice(60, "economy", { ...promo, minFare: 80 }).applies, "below the minimum fare there is no discount");
assert(promoPrice(40, "xl", { kind: "fixed", value: 50, maxPerRide: 50, minFare: 0, categories: [] }).newPrice === 0, "a fixed discount never goes below zero");
assert(normalizeCare({ autoPromos: { firstRide: { on: false } } }).autoPromos.firstRide.audience === "new", "older saved automatic promotions get an audience");

// Code promotions, random and newest riders, sending, automatic dates.
const codeDraft: PromoDraft = { ...draft, code: "CITY25", audience: "code", maxUses: 200, riderIds: [], group: "Anyone with the code" };
assert(validatePromo(codeDraft) === null && promoReach(codeDraft) === 200 && maxCost(codeDraft) === 200 * codeDraft.rides * codeDraft.maxPerRide, "a code promotion needs no rider list and costs by its limit");
assert(validatePromo({ ...codeDraft, maxUses: 0 }), "a code promotion needs a limit");
const codeMade = createPromotion(emptyRiderCare(), codeDraft, "nora", NOW);
const codeTicket = codeMade.ticket!;
const lucky = randomRiders(people, 10, 1);
assert(lucky.length === 10 && new Set(lucky.map((rider) => rider.id)).size === 10, "ten different random riders");
assert(JSON.stringify(randomRiders(people, 10, 1)) === JSON.stringify(lucky) && JSON.stringify(randomRiders(people, 10, 2)) !== JSON.stringify(lucky), "same seed, same riders; new seed, others");
const audienceRows = buildRows(people, emptyRiderCare(), NOW, "month", new Set());
const newest = pickAudience(audienceRows, "newest", 5, 1);
assert(newest.length === 5 && newest.every((row, index) => index === 0 || row.profile.joinedAt <= newest[index - 1].profile.joinedAt), "newest riders come first");
assert(pickAudience(audienceRows, "random", 300, 1).every((row) => !row.segments.has("blocked")), "blocked riders are never picked");
const mails = parseEmails("anna@mail.com, ANNA@mail.com; omar@site.fr nope");
assert(mails.valid.length === 2 && mails.invalid[0] === "nope", "emails are checked and kept once");
const text = promoMessage(codeTicket, "sv-SE");
assert(text.includes("CITY25"), "the message has the code");
const sent = sendPromotion(codeMade.care, codeTicket.id, { channels: ["push", "inapp", "popup"], riders: people.slice(0, 3), emails: [], subject: "", message: text }, "nora", NOW);
const sentTicket = sent.care.promotions.find((item) => item.id === codeTicket.id)!;
assert(!sent.error && sentTicket.popup && sentTicket.sends?.[0].riders === 3, "sending is recorded and turns the popup on");
assert(sent.care.messages.R0001.at(-1)?.text === text && sent.care.draftRev === codeMade.care.draftRev + 1, "app messages land in the rider's messages, one save");
assert(sendPromotion(codeMade.care, codeTicket.id, { channels: ["email"], riders: [], emails: ["anna@mail.com"], subject: "", message: text }, "nora", NOW).error, "an email needs a subject");
assert(!sendPromotion(codeMade.care, codeTicket.id, { channels: ["email"], riders: [], emails: ["anna@mail.com"], subject: "Gift", message: text }, "nora", NOW).error, "email addresses alone are fine");
assert(sendPromotion(codeMade.care, codeTicket.id, { channels: ["sms"], riders: [], emails: [], subject: "", message: text }, "nora", NOW).error, "SMS needs riders");
assert(sendPromotion(codeMade.care, codeTicket.id, { channels: ["push"], riders: people.slice(0, 1), emails: [], subject: "", message: "Hello" }, "nora", NOW).error, "the message must have the code");
assert(!setPopup(sent.care, codeTicket.id, false).promotions.find((item) => item.id === codeTicket.id)!.popup, "popup can be turned off");
const auto = emptyRiderCare().autoPromos;
assert(autoState({ ...auto.birthday, on: true }, NOW) === "running" && autoState({ ...auto.firstRide, from: "2026-11-01" }, NOW) === "waiting" && autoState({ ...auto.firstRide, to: "2026-10-01" }, NOW) === "ended" && autoState(auto.birthday, NOW) === "off", "automatic promotions follow their days");
assert(setAutoPromos(emptyRiderCare(), { ...auto, birthday: { ...auto.birthday, from: "2026-12-01", to: "2026-11-01" } }).error, "end day after start day");
assert(setAutoPromos(emptyRiderCare(), { ...auto, winBack: { ...auto.winBack, audience: "picked", riderIds: [] } }).error === "Pick at least one rider.", "riders I pick needs riders");
assert(!setAutoPromos(emptyRiderCare(), { ...auto, winBack: { ...auto.winBack, audience: "random", count: 2, riderIds: ["R0001", "R0002"] } }).error, "random riders saved");
assert(normalizeCare({ autoPromos: { birthday: { on: true } } }).autoPromos.birthday.riderIds.length === 0, "older saved automatic promotions get an empty rider list");
console.log("rider care ok");
