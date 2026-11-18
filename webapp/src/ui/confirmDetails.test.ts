import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COMMANDS } from "../commands/registry.ts";
import { LIVE_COMMANDS } from "../live/liveCommands.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC39ConfirmDetails } from "../i18n/en/c39-confirm-details.ts";
import { undoFor, whoFor } from "./confirmInfo.ts";
import { CONFIRM_PART_TITLES, confirmParts, fromToFallbackFor, moneyFor, whenFor, whereFallbackFor } from "./confirmDetails.ts";

/**
 * Owner 2026-11-16 ~20:08 UTC "Add info details in i and !": every confirm "!" has five parts: the values
 * before → after, every zone or country touched, who sees it and when, the money effect, the exact undo path.
 * Record: Rules audits/impact/info-details.md.
 */
/**
 * Round 2 (supervisor MF-1 to MF-3, test gap): the money commands, written by hand from the server's routes and code,
 * NOT from the code under test (ui/confirmDetails.ts). Each row: the command, where its money moves on the server
 * (a route of contracts/contract.json, or "panel" for an action that only exists in the panel's own book), and the
 * words its Money line must say. Server code read at cfgundo-server 6b2e559 (Rules audits/impact/info-details.md, Round 2).
 */
const MONEY_TABLE: readonly (readonly [command: string, route: string, says: RegExp])[] = [
  // src/admin/trips.ts:616-623 adminRefund (runOrRequest: at once, or after a second admin), :569-603 createRefund.
  ["admin.trip.refund", "POST /admin/trips/{tripId}/refund", /goes back to the rider/],
  ["admin.server.tripRefund", "POST /admin/trips/{tripId}/refund", /goes back to the rider/],
  ["admin.trip.partRefund", "POST /admin/trips/{tripId}/refund", /goes back to the rider/],
  ["admin.rider.refund", "panel", /goes back to the rider/],
  ["admin.payment.refund", "panel", /goes back to the rider/],
  // src/admin/trips.ts:625-634 markRefundPaid: only payout_status = paid is written; the admin paid by hand.
  ["admin.refund.markPaid", "POST /admin/refunds/{refundId}/paid", /already sent.*by hand.*sends no money/],
  // src/admin/trips.ts:161-174 adminCancel: fee null (owner decision 33); only payLostDriver (driverBonus) moves money.
  ["admin.trip.cancel", "POST /admin/trips/{tripId}/cancel", /rider pays nothing.*lost-driver payment.*Movera pays/],
  ["admin.reservation.cancel", "POST /admin/trips/{tripId}/cancel", /rider pays nothing.*lost-driver payment.*Movera pays/],
  // src/admin/trips.ts:433-453 adminComplete → src/trips/ride/finish.ts:179-225 completeTrip (spendWallet, payment_status captured, creditTrip).
  ["admin.trip.complete", "POST /admin/trips/{tripId}/complete", /rider pays the fare.*driver is paid/],
  // src/admin/trips.ts:484-496 adjustTrip waitingSeconds → fareWithWaiting: fare_minor and driver_earnings_minor change.
  ["admin.trip.waiting", "POST /admin/trips/{tripId}/adjust", /rider's price and the driver's pay.*worked out again/],
  // src/admin/trips.ts:498-505 driverPay: only driver_adjustments_minor; the fare stays (contract.json moneyBase.adminFare).
  ["admin.trip.adjust", "POST /admin/trips/{tripId}/adjust", /Only the driver's pay changes.*rider pays the same/],
  // src/admin/trips.ts:468-479 waiveCancelFee: the fee is waived; the driver keeps the share already credited.
  ["admin.trip.waiveFee", "POST /admin/trips/{tripId}/adjust", /fee is waived.*driver keeps/],
  // src/admin/trips.ts:322-362 adminDriverBonus, :66-79 bonusLimit.
  ["admin.trip.driverBonus", "POST /admin/trips/{tripId}/driver-bonus", /Movera pays the driver the bonus/],
  ["admin.reservation.raise", "POST /admin/trips/{tripId}/driver-bonus", /Movera's commission.*rider pays the same/],
  // src/trips/ride/cancel.ts:44-68 markNoShow: chargeRiderFee + the driver's fee_share.
  ["admin.trip.noShow", "POST /admin/trips/{tripId}/no-show", /rider is charged the no-show fee.*driver gets their share/],
  ["admin.reservation.noShow", "POST /admin/trips/{tripId}/no-show", /rider is charged the no-show fee.*driver gets their share/],
  // src/admin/trips.ts:387-424 adminReverseNoShow: owed → waived, paid → wallet; the share only with takeBackDriverShare.
  ["admin.trip.reverseNoShow", "POST /admin/trips/{tripId}/reverse-no-show", /rider pays nothing.*waived.*wallet.*driver keeps their share.*unless/],
  // src/admin/approvals.ts registerApprovalHandler; src/admin/trips.ts:512 (trip.adjust) and :614 (trip.refund) run on approve.
  ["admin.approval.approve", "POST /admin/approvals/{id}/approve", /refund or a change of a driver's pay.*money moves now/],
  // src/riders/walletCredit.ts creditRiderWallet (route src/admin/tripRoutes.ts:229).
  ["admin.rider.walletCredit", "POST /admin/riders/{riderId}/wallet-credit", /added to the rider's wallet/],
  // src/riders/feeMarkPaid.ts:19-39: the fee becomes paid with a wallet correction; nobody is charged.
  ["admin.rider.feeMarkPaid", "POST /admin/riders/{riderId}/fees/{tripId}/mark-paid", /marked as paid by hand.*not charged/],
  // Panel book only (riders/care.ts:311 markPaid writes care.paid; no server route; hidden on live).
  ["admin.rider.markPaid", "panel", /unpaid balance.*marked as paid by hand.*not charged/],
  ["admin.rider.refundDecide", "panel", /approve.*goes back to the rider.*decline.*no money moves/],
  ["admin.trip.pay", "panel", /driver's pay.*goes up.*Movera pays/],
  ["admin.trip.decide", "panel", /approve.*refund or pay change.*decline.*no money moves/],
  // src/admin/payouts.ts (payout runs) and POST /admin/drivers/{driverId}/payout-hold.
  ["admin.payout.approveRun", "POST /admin/payouts/runs/approve", /Driver payouts/],
  ["admin.payout.hold", "panel", /Driver payouts/],
  ["admin.payout.retry", "panel", /Driver payouts/],
  ["admin.driver.payoutHold", "POST /admin/drivers/{driverId}/payout-hold", /Driver payouts/],
  ["admin.payment.markPaid", "panel", /payment named here changes state/],
  ["admin.payment.retry", "panel", /payment named here changes state/],
  // Driver bonuses: src/bonuses/counting.ts:91-96 (an earnings entry kind bonus when the driver reaches the target; it is in his payout).
  ["admin.server.bonusCampaignCreate", "POST /admin/bonuses", /No money moves now.*Movera pays.*payout.*riders never pay/],
  ["admin.server.bonusCampaignEdit", "PUT /admin/bonuses/{bonusId}", /No money moves now.*Movera pays/],
  ["admin.server.bonusCampaignPause", "POST /admin/bonuses/{bonusId}/pause", /No money moves now.*Movera pays/],
  ["admin.server.bonusCampaignResume", "POST /admin/bonuses/{bonusId}/pause", /No money moves now.*Movera pays/],
  ["admin.server.bonusCampaignEnd", "POST /admin/bonuses/{bonusId}/pause", /No money moves now.*Movera pays/],
  ["admin.drivers.bonusCreate", "panel", /No money moves now.*Movera pays/],
  ["admin.drivers.bonusEdit", "panel", /No money moves now.*Movera pays/],
  ["admin.drivers.bonusToggle", "panel", /No money moves now.*Movera pays/],
  ["admin.drivers.bonusStop", "panel", /No money moves now.*Movera pays/],
  // Promotions, vouchers and invite rewards exist only in the panel's book (no server route at 6b2e559).
  ["admin.riders.promoCreate", "panel", /No money moves now.*discount or reward.*Movera's promotion budget/],
  ["admin.riders.promoStop", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.riders.promoToggle", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.riders.promoEdit", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.riders.autoPromo", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.rider.promoAdd", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.rider.promoRemove", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.promo.voucher", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.promo.referral", "panel", /No money moves now.*Movera's promotion budget/],
  ["admin.promo.autoStop", "panel", /No money moves now.*Movera's promotion budget/],
];
const NO_MONEY = "No money moves.";
const MONEY_UNKNOWN = "See the details above for any money effect.";
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(`${dir}${entry.name}/`) : /\.tsx$/.test(entry.name) ? [`${dir}${entry.name}`] : []));

test("every command's confirm \"!\" has all five parts, each filled", () => {
  assert.ok(COMMANDS.length > 100);
  const gaps: string[] = [];
  for (const { id } of COMMANDS) {
    const parts = confirmParts({ command: id });
    if (!parts.fromTo.length || parts.fromTo.some((line) => line.trim().length < 3)) gaps.push(`${id}: before → after`);
    for (const key of ["where", "whoWhen", "money", "undo"] as const) if (parts[key].trim().length < 3) gaps.push(`${id}: ${key}`);
    if (!/at once|next start|next app start|after publish/i.test(parts.whoWhen)) gaps.push(`${id}: when (live or the next app start)`);
  }
  assert.deepEqual(gaps, []);
  console.log(`confirm "!" coverage: ${COMMANDS.length} commands, each with ${CONFIRM_PART_TITLES.length} parts`);
});

test("money: every hand-listed money command says its real money effect, never \"No money moves.\" and never the unknown line", () => {
  // admin.refund.markPaid is sent by the live adapter (live/liveCommands.ts) and is not in the registry.
  const ids = new Set([...COMMANDS.map(({ id }) => id), ...LIVE_COMMANDS]);
  const contract = readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8") + readFileSync(new URL("../../../contracts/CONTRACT.md", import.meta.url), "utf8");
  const wrong: string[] = [];
  for (const [command, route, says] of MONEY_TABLE) {
    if (!ids.has(command)) wrong.push(`${command}: not a command of the registry`);
    if (route !== "panel" && !contract.includes(route)) wrong.push(`${command}: the contract has no route ${route}`);
    const line = moneyFor(command);
    if (line === NO_MONEY || line === MONEY_UNKNOWN) wrong.push(`${command}: ${line}`);
    if (!says.test(line)) wrong.push(`${command}: "${line}" does not say ${says}`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(MONEY_TABLE.length >= 45);
  assert.match(moneyFor("admin.pricing.publish"), /No money moves now/);
});

test("MF-2: an admin cancel never says the rider pays a cancel fee", () => {
  for (const command of ["admin.trip.cancel", "admin.reservation.cancel"]) {
    assert.doesNotMatch(moneyFor(command), /rider cancel fees|Any fee follows/, command);
    assert.match(moneyFor(command), /rider pays nothing/, command);
  }
});

test("MF-1: \"No money moves.\" is said only for a named list; an unknown command and no command promise nothing", () => {
  assert.equal(moneyFor(""), MONEY_UNKNOWN);
  assert.equal(moneyFor("admin.somethingNew.pay"), MONEY_UNKNOWN);
  assert.equal(moneyFor("admin.trip.somethingNew"), MONEY_UNKNOWN);
  assert.equal(confirmParts({}).money, MONEY_UNKNOWN);
  assert.equal(confirmParts({ money: "The money goes back." }).money, "The money goes back.", "a dialog's own money words win");
  // Hand-written: the only commands allowed to say the flat "No money moves." are screen tools and these record actions.
  const allowed = /^admin\.(ui|table|card|modal|tabs|doc|confirm|design|shell|panel|errors|profile|auditLog|alarm|live|auth|alerts|inbox|handover|gateA|shift|report|reports|waitlist)\.|^admin\.server\.(signIn|setupPassword|reload|loadMore|openRecord|dialogConfirm|dialogCancel|documentOpen|documentReview|documentCheck|fleetReview|fleetCode|copyCode|invitationCancel|legalPublish|tripChat|riderSavedPlaces|driverPreferences|emergencyContacts|revealRider|revealDriver|revealFleet|revealIncidentContacts|bonusCampaignOpen)$/;
  const flat = COMMANDS.filter(({ id }) => moneyFor(id) === NO_MONEY).map(({ id }) => id);
  assert.deepEqual(flat.filter((id) => !allowed.test(id)), []);
  assert.ok(flat.length > 50);
  assert.equal(moneyFor("admin.alerts.settings"), NO_MONEY);
  // S-c1: the refund policy is a setting, not a refund.
  assert.match(moneyFor("admin.refundPolicy.save"), /No money moves now/);
  assert.doesNotMatch(moneyFor("admin.refundPolicy.save"), /goes back to the rider/);
});

test("MF-1: every dialog with a \"!\" passes its command or its own money words", () => {
  const gaps: string[] = [];
  for (const path of filesUnder("")) {
    const text = src(path);
    for (const tag of ["ConfirmInfo", "DecisionDialog"]) {
      for (let at = text.indexOf(`<${tag}\n`) >= 0 || text.indexOf(`<${tag} `) >= 0 ? 0 : -1; at >= 0; ) {
        const next = Math.min(...[text.indexOf(`<${tag}\n`, at), text.indexOf(`<${tag} `, at)].filter((i) => i >= 0), Infinity);
        if (!Number.isFinite(next)) break;
        // The end of this tag: the first "/>" outside every {…} of its props.
        let end = next;
        for (let depth = 0; end < text.length && !(depth === 0 && text.startsWith("/>", end)); end += 1) depth += text[end] === "{" ? 1 : text[end] === "}" ? -1 : 0;
        const call = text.slice(next, end);
        if (!/\bcommand=/.test(call) && !/\bmoney=/.test(call)) gaps.push(`${path}: <${tag}> at ${text.slice(0, next).split("\n").length}`);
        at = end;
      }
    }
  }
  assert.deepEqual(gaps, []);
  // The dialogs the supervisor named.
  assert.match(src("live/LiveRefund.tsx"), /command="admin\.server\.tripRefund"/);
  assert.match(src("trips/ReverseNoShow.tsx"), /command="admin\.trip\.reverseNoShow"/);
  assert.match(src("content/LegalEditor.tsx"), /command="admin\.server\.legalPublish"/);
  assert.match(src("live/ui.tsx"), /command: string/, "DecisionDialog cannot be used without a command");
});

test("MF-1: a dialog rendered without a command says nothing it cannot know (real render of the body)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "confirm-body-"));
  try {
    const out = join(dir, "body.mjs");
    const { build } = await import("esbuild");
    await build({
      stdin: { contents: `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import Body from "./ConfirmInfoBody.tsx"; export const render = (props) => renderToStaticMarkup(createElement(Body, props));`, resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "tsx" },
      bundle: true, format: "esm", platform: "node", outfile: out, jsx: "automatic", logLevel: "silent", define: { "import.meta.env": "{}" }, banner: { js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` },
    });
    const { render } = (await import(pathToFileURL(out).href)) as { render: (props: Record<string, unknown>) => string };
    const part = (html: string, id: string) => (new RegExp(`data-testid="confirm-info-${id}"[^>]*>(.*?)</dd>`).exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    const bare = render({ what: "Something happens." });
    assert.equal(part(bare, "money"), MONEY_UNKNOWN);
    assert.equal(part(bare, "where"), "See the details above for what this changes.");
    assert.match(part(bare, "who"), /^See the details above for who this reaches\. See the details above for when it takes effect\.$/);
    assert.match(part(bare, "undo"), /cannot be undone with a button/);
    assert.doesNotMatch(bare, /No money moves|no zone or country|No other zone|Nobody else|At once|opposite action/);
    // The dialog's own words win; a command fills the rest.
    const own = render({ what: "x", money: "The money goes back to the rider.", when: "Only after you publish." });
    assert.equal(part(own, "money"), "The money goes back to the rider.");
    assert.match(part(own, "who"), /Only after you publish\.$/);
    assert.match(part(render({ what: "x", command: "admin.trip.cancel" }), "money"), /rider pays nothing/);
    assert.match(part(render({ what: "x", command: "admin.server.tripRefund" }), "money"), /goes back to the rider/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MF-3: settings and campaigns say \"No money moves now\" and who pays later, never the flat line", () => {
  for (const command of ["admin.drivers.bonusToggle", "admin.drivers.bonusStop", "admin.drivers.bonusEdit", "admin.riders.promoCreate", "admin.riders.promoStop", "admin.riders.autoPromo", "admin.promo.voucher", "admin.promo.referral"]) {
    assert.match(moneyFor(command), /^No money moves now\./, command);
    assert.match(moneyFor(command), /Movera/, command);
  }
});

test("MF-5: the default Where promises nothing; \"only this record\" is said only for a named list of record actions", () => {
  const nothing = "See the details above for what this changes.";
  assert.equal(whereFallbackFor(""), nothing);
  assert.equal(confirmParts({}).where, nothing);
  assert.equal(whereFallbackFor("admin.somethingNew.save"), nothing);
  // Settings and country-wide actions outside the old lists: hand-written.
  for (const command of ["admin.refundPolicy.save", "admin.server.legalPublish", "admin.alerts.settings", "admin.incident.settings", "admin.review.rules", "admin.tax.rules", "admin.payout.settings", "admin.payout.schedule", "admin.payment.rules", "admin.payment.savePolicy", "admin.reservation.savePolicy", "admin.team.limits", "admin.team.security", "admin.approval.approve", "admin.promo.voucher", "admin.promo.referral", "admin.riders.autoPromo", "admin.drivers.bonusEdit", "admin.server.bonusCampaignCreate", "admin.rideCheck.settings", "admin.shift.settings", "admin.ticket.settings", "admin.trip.settings", "admin.vehicle.rules", "admin.risk.rules", "admin.onboarding.rules", "admin.campaigns.rules", "admin.pricing.publish", "admin.dispatch.publish", "admin.config.publish", "admin.zone.update"]) {
    assert.equal(whereFallbackFor(command), nothing, command);
  }
  // The broad guard: any line that says "no zone or country setting changes" belongs to a hand-listed record action or screen tool.
  const record = /^admin\.trip\.(cancel|complete|noShow|reverseNoShow|refund|partRefund|adjust|waiting|waiveFee|driverBonus|pay|reassign|assign|pinUnlock|note|flag|decide|offer|radarGroup|radarZoneStop|openCase|block)$|^admin\.reservation\.(assign|offer|unassign|contact|return|answer|raise|cancel|noShow|dispatchNow)$|^admin\.rider\.(walletCredit|feeMarkPaid|markPaid|refund|refundDecide|block|unblock|signOut|note|askPay|activate|moderate)$|^admin\.driver\.(activate|review|requestInfo|onHold|suspend|reactivate|bankReview|note|docExpiry|payoutHold)$|^admin\.(vehicle\.(hold|activate|link|reviewRegistration)|fleetOwner\.(review|docExpiry|activate|onHold|note)|refund\.markPaid|safety\.(take|resolve|dismiss)|server\.(tripRefund|documentReview|documentCheck|fleetReview|fleetCode|invitationAccept|invitationCancel|removeDriver))$/;
  const screen = /^admin\.(ui|table|card|modal|tabs|doc|confirm|design|shell|panel|errors|profile|auditLog|alarm)\./;
  const claims = COMMANDS.filter(({ id }) => /no zone|No other zone|Nobody else|Only the|only:/i.test(whereFallbackFor(id))).map(({ id }) => id);
  assert.deepEqual(claims.filter((id) => !record.test(id) && !screen.test(id)), []);
  assert.match(whereFallbackFor("admin.trip.cancel"), /Only the record named in this dialog/);
  // Publish terms and privacy: a real country-wide Where from the dialog itself.
  assert.match(src("content/LegalEditor.tsx"), /where=\{tr\("The whole country: every rider and driver of \{0\}, in every zone\."/);
});

test("MF-4: no undo is promised where none exists", () => {
  const undo = COMMANDS.map(({ id }) => [id, undoFor(id)] as const);
  assert.deepEqual(undo.filter(([, line]) => /opposite action/.test(line)).map(([id]) => id), [], "the old catch-all is gone");
  for (const command of ["admin.trip.cancel", "admin.trip.complete", "admin.trip.reverseNoShow", "admin.approval.approve", "admin.approval.reject"]) assert.match(undoFor(command), /^This cannot be undone with a button/, command);
  for (const command of ["admin.trip.partRefund", "admin.rider.refund", "admin.trip.refund", "admin.server.tripRefund", "admin.payment.refund"]) assert.match(undoFor(command), /Money that was sent cannot be taken back/, command);
  assert.match(undoFor(""), /^This cannot be undone with a button/);
  assert.match(undoFor("admin.somethingNew.go"), /^This cannot be undone with a button/);
  // Real paths that exist as buttons (checked in the test below against the screens).
  assert.match(undoFor("admin.trip.noShow"), /Reverse no-show/);
  assert.match(undoFor("admin.driver.payoutHold"), /Release payouts/);
  assert.match(src("live/LivePayoutHold.tsx"), /tr\("Release payouts"\)/);
  assert.match(src("trips/ReverseNoShow.tsx"), /tr\("Reverse no-show"\)/);
  for (const [off, on, page] of [["admin.driver.suspend", "admin.driver.reactivate", "pages/DriverDetailPage.tsx"], ["admin.rider.block", "admin.rider.unblock", "pages/RiderDetailPage.tsx"], ["admin.vehicle.hold", "admin.vehicle.activate", "pages/VehicleDetailPage.tsx"], ["admin.fleetOwner.onHold", "admin.fleetOwner.activate", "pages/FleetOwnerDetailPage.tsx"], ["admin.team.deactivate", "admin.team.reactivate", "pages/TeamPage.tsx"]] as const) {
    assert.ok(src(page).includes(`"${off}"`) && src(page).includes(`"${on}"`), `${page} has both buttons`);
    for (const command of [off, on]) assert.match(undoFor(command), /other button of the pair/, command);
  }
});

test("S-c2 / S-c3 / S-c4: pricing is server-only, a dialog without a command names no time, payout settings are a country setting", () => {
  assert.match(whenFor("admin.pricing.publish"), /server prices new quotes with it at once/);
  assert.doesNotMatch(whenFor("admin.pricing.publish"), /re-read/);
  assert.equal(whenFor(""), "See the details above for when it takes effect.");
  assert.match(src("drivers/OnboardingSettingsEditor.tsx"), /when=\{tr\("Only after you publish the draft\."\)\}/);
  assert.match(whenFor("admin.server.legalPublish"), /next start/);
  assert.doesNotMatch(whenFor("admin.server.legalPublish"), /see nothing/);
  assert.doesNotMatch(whoFor("admin.payout.settings"), /Nobody else/);
  assert.doesNotMatch(whenFor("admin.payout.settings"), /in their app/);
  assert.doesNotMatch(undoFor("admin.payout.settings"), /Money that was sent/);
  assert.equal((fr as Record<string, string>)["Money"], "Argent");
});

test("when: settings reach open apps at once and closed apps at the next start; admin desks never reach the apps", () => {
  assert.match(whenFor("admin.config.publish"), /re-read it at once; a closed app gets it at its next start/);
  assert.match(whenFor("admin.dispatch.publish"), /next dispatch decision/);
  assert.match(whenFor("admin.alerts.settings"), /Riders and drivers see nothing/);
  assert.match(whenFor("admin.trip.cancel"), /At once \(live\)/);
});

test("values given win over the fallback: From → to lines, where and undo", () => {
  const parts = confirmParts({ command: "admin.pricing.saveCountry", changeOf: { kind: "audit", before: "120 kr", after: "150 kr" }, where: "Stockholm" });
  assert.deepEqual(parts.fromTo, ["120 kr → 150 kr"]);
  assert.equal(parts.where, "Stockholm");
  assert.equal(confirmParts({ command: "admin.trip.cancel" }).where, whereFallbackFor("admin.trip.cancel"));
  assert.equal(confirmParts({ command: "admin.trip.cancel" }).fromTo[0], fromToFallbackFor("admin.trip.cancel"));
});

test("c39: every word of the five parts is in en, sv and fr; sv / fr are translated", () => {
  const keys = Object.keys(enC39ConfirmDetails);
  const used = new Set(["", ...COMMANDS.map(({ id }) => id)].flatMap((id) => [moneyFor(id), whenFor(id), whereFallbackFor(id), fromToFallbackFor(id), undoFor(id), whoFor(id)]));
  for (const key of [...used, ...keys]) {
    for (const [name, dict] of [["en", en], ["sv", sv], ["fr", fr]] as const) assert.ok(Object.hasOwn(dict, key), `${name}: ${key}`);
    assert.notEqual((sv as Record<string, string>)[key], key, `sv: ${key}`);
    assert.notEqual((fr as Record<string, string>)[key], key, `fr: ${key}`);
  }
});

test("the body shows the five parts, and the texts load with the \"!\", not with the first page", () => {
  const body = readFileSync(new URL("./ConfirmInfoBody.tsx", import.meta.url), "utf8");
  for (const title of CONFIRM_PART_TITLES) assert.ok(body.includes(`tr("${title}")`), title);
  // One source for the five parts: the body renders what confirmParts answers (so the tests of confirmParts are tests of the dialog).
  assert.match(body, /confirmParts<ReactNode>\(/);
  for (const key of ["parts.fromTo", "parts.where", "parts.who", "parts.when", "parts.money", "parts.undo"]) assert.ok(body.includes(key), key);
  const shell = readFileSync(new URL("./ConfirmInfo.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /^import .*confirmDetails/m);
  assert.match(shell, /import\("\.\/ConfirmInfoBody"\)/);
});
