import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { COMMANDS } from "../commands/registry.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { market } from "../markets/markets.ts";
import { landing, noOtherZoneChange, pricingWhere, undoFor, watchedIds, whereText, whoFor } from "./confirmInfo.ts";

/**
 * Owner 2026-11-16: "It's only last step when confirm ! When confirm anything u add info ? When clic understand
 * what's going to happen and where and which zone and all info"; then "instead of ? Put ! Inside orange triangle" and
 * "The ! Also white". Every confirm dialog of the admin renders the one shared <ConfirmInfo>. This file is the
 * inventory: a confirm dialog without it, or a new dialog file nobody classified, fails here.
 */
function files(dir: URL, base = ""): Array<{ path: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) return files(new URL(`${name}/`, dir), `${base}${name}/`);
    return name.endsWith(".tsx") ? [{ path: `${base}${name}`, text: readFileSync(url, "utf8") }] : [];
  });
}
const all = files(new URL("../", import.meta.url));
const textOf = (path: string) => all.find((file) => file.path === path)?.text ?? "";

/** The dialogs where an admin confirms an action: each renders <ConfirmInfo>. */
const CONFIRM_DIALOGS = [
  "ui/CommandButton.tsx", // every CommandButton whose command asks for a reason (the registry's `reason: true`)
  "ui/kit.tsx", // ConfirmDialog (demo screens)
  "live/ui.tsx", // DecisionDialog: every live decision (documents, company review, fleet, legal texts)
  "live/LiveRefund.tsx", // Refund trip
  "live/LiveReveal.tsx", // Reveal the full phone / e-mail / date of birth
  "live/LiveBonusCampaigns.tsx", // End campaign
  "trips/ReverseNoShow.tsx", // Reverse no-show
  "drivers/OnboardingSettingsEditor.tsx", // Turn on the e-mail check?
  "live/LiveReservations.tsx", // the inline Confirm of a booked ride's action (cancel, no-show, raise, assign, …): SF-R2-4 found it
];
/** They confirm through DecisionDialog (live/ui.tsx), which holds the info. */
const THROUGH_DECISION_DIALOG = ["content/LegalEditor.tsx", "live/DocumentsTable.tsx", "live/LiveCompanyReview.tsx", "live/LiveFleetPanel.tsx"];
/** Panels, pickers, viewers and forms: their only confirms are CommandButtons (covered above), or they change nothing on the server. */
const NOT_A_CONFIRM = [
  "alerts/AlertBell.tsx", "dashboard/DriverPanel.tsx", "dashboard/DriversMap.tsx", "dashboard/TripCard.tsx", "dispatch/AssignPanel.tsx", "drivers/BonusQuickPopup.tsx",
  "i18n/ProfileMenu.tsx", "pages/DesignPage.tsx", "pages/ReportsPage.tsx", "pages/RidersPage.tsx", "pages/TripsPage.tsx", "pricing/CategoryManager.tsx", "pricing/SurgeQuickPopup.tsx",
  "pricing/TestRide.tsx", "riders/PromoShare.tsx", "riders/RiderPicker.tsx", "ui/Modal.tsx",
];
/**
 * FOLLOW-UP (reported in Rules audits/impact/country-undo.md, Round 2): steps that ask before they act but have no
 * "!" yet. The copy dialogs only write drafts on the page (the publish after them has the "!"); window.confirm is the
 * browser's own "leave the page?" box and cannot hold a button.
 */
const FOLLOW_UP = ["dispatch/CancelFeeTable.tsx", "dispatch/RulesView.tsx", "pricing/CopyZones.tsx", "pages/ConfigPage.tsx", "pages/PricingPage.tsx"];

/**
 * Supervisor SF-R2-4: a confirm step can be a plain <div> or <span> with its own button. These words make one: a
 * button labelled Confirm, the "Yes, I'm sure" tick, "Type … to confirm". Files that have such a word and are not a
 * confirm step say why.
 */
const CONFIRM_STEP = /tr\("Confirm"\)|Yes, I'm sure|Type \{0\} to confirm/;
const CONFIRM_WORD_NOT_A_STEP: Record<string, string> = {
  "pages/ConfirmPage.tsx": "its Confirm opens the value editor; the save is a CommandButton, which holds the info",
};
/**
 * SF-R2-4: the files above that are not confirms are looked at again whenever they change in a way that could add one:
 * the count of dialog / form / confirm words in each is pinned. A new one fails here; check the file, give it
 * <ConfirmInfo> or say why not, then write the new count.
 */
const CONFIRM_WORDS = /role="(alert)?dialog"|<Modal\b|window\.confirm|admin\.confirm\.[a-zA-Z]+|tr\("[^"]*\b[Cc]onfirm[^"]*"|Are you sure|I.m sure|type="submit"|onSubmit=|<form\b/g;
const PINNED: Record<string, number> = {
  "alerts/AlertBell.tsx": 1, "dashboard/DriverPanel.tsx": 1, "dashboard/DriversMap.tsx": 1, "dashboard/TripCard.tsx": 1, "dispatch/AssignPanel.tsx": 1, "drivers/BonusQuickPopup.tsx": 2,
  "i18n/ProfileMenu.tsx": 1, "pages/DesignPage.tsx": 1, "pages/ReportsPage.tsx": 2, "pages/RidersPage.tsx": 4, "pages/TripsPage.tsx": 1, "pricing/CategoryManager.tsx": 2,
  "pricing/SurgeQuickPopup.tsx": 1, "pricing/TestRide.tsx": 1, "riders/PromoShare.tsx": 2, "riders/RiderPicker.tsx": 2, "ui/Modal.tsx": 1,
  "dispatch/CancelFeeTable.tsx": 1, "dispatch/RulesView.tsx": 2, "pricing/CopyZones.tsx": 3, "pages/ConfigPage.tsx": 2, "pages/PricingPage.tsx": 2,
};

test("SF-R2-4: a confirm step built on any element (a Confirm button, \"Yes, I'm sure\", \"Type … to confirm\") has the info", () => {
  for (const file of all) {
    if (!CONFIRM_STEP.test(file.text) || file.path.endsWith("ConfirmInfo.tsx")) continue;
    assert.ok(file.text.includes("<ConfirmInfo") || CONFIRM_WORD_NOT_A_STEP[file.path], `${file.path}: a confirm step without <ConfirmInfo>`);
  }
  assert.deepEqual(Object.keys(CONFIRM_WORD_NOT_A_STEP).filter((path) => !CONFIRM_STEP.test(textOf(path))), [], "a listed file has no confirm word any more");
});

test("SF-R2-4: the files classified as not a confirm, or as a follow-up, are checked again when a confirm word is added", () => {
  assert.deepEqual(Object.keys(PINNED).sort(), [...NOT_A_CONFIRM, ...FOLLOW_UP].sort(), "every NOT_A_CONFIRM / FOLLOW_UP file is pinned");
  for (const [path, count] of Object.entries(PINNED)) {
    const now = (textOf(path).match(CONFIRM_WORDS) ?? []).length;
    assert.equal(now, count, `${path}: ${now} dialog / confirm words, was ${count}. Check it for a new confirm step, then update PINNED`);
  }
});

test("every confirm dialog renders the shared info button", () => {
  for (const path of CONFIRM_DIALOGS) assert.ok(textOf(path).includes("<ConfirmInfo"), `${path} has no <ConfirmInfo>`);
  // The two Confirm buttons of the admin: wherever one is, the info is in the same file.
  for (const file of all) {
    if (/admin\.confirm\.submit|admin\.server\.dialogConfirm/.test(file.text)) assert.ok(file.text.includes("<ConfirmInfo"), `${file.path}: a Confirm button without <ConfirmInfo>`);
  }
});

test("inventory: every file with a dialog, a modal or a browser confirm is classified", () => {
  const known = new Set([...CONFIRM_DIALOGS, ...THROUGH_DECISION_DIALOG, ...NOT_A_CONFIRM, ...FOLLOW_UP]);
  const found = all.filter((file) => /role="(alert)?dialog"|<Modal\b|window\.confirm|<DecisionDialog|<ConfirmDialog\b/.test(file.text)).map((file) => file.path);
  assert.deepEqual(found.filter((path) => !known.has(path)), [], "a new dialog: give it <ConfirmInfo> and list it in CONFIRM_DIALOGS, or say here why it is not a confirm");
  assert.deepEqual([...known].filter((path) => !textOf(path)), [], "a listed file is gone");
  for (const path of THROUGH_DECISION_DIALOG) assert.ok(textOf(path).includes("<DecisionDialog"), path);
  // window.confirm only for "leave with unsaved changes" (the browser's box), never for an action.
  const native = all.filter((file) => file.text.includes("window.confirm")).map((file) => file.path).sort();
  assert.deepEqual(native, ["pages/ConfigPage.tsx", "pages/PricingPage.tsx"]);
});

test("the button is a white \"!\" in an orange triangle, dark enough to read (owner 2026-11-16)", () => {
  // The words open from their own file (bundle budget): the shell and the body are read together.
  const source = textOf("ui/ConfirmInfo.tsx") + textOf("ui/ConfirmInfoBody.tsx");
  const orange = /INFO_ORANGE = "(#[0-9A-Fa-f]{6})"/.exec(source)![1]!;
  const mark = /INFO_MARK = "(#[0-9A-Fa-f]{6})"/.exec(source)![1]!;
  assert.equal(mark.toUpperCase(), "#FFFFFF");
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.ok(ratio(orange, mark) >= 4.5, `white on ${orange} is ${ratio(orange, mark).toFixed(2)} : 1, under 4.5 : 1`);
  // The triangle itself against a white card and against the dark theme's card (icons: 3 : 1).
  assert.ok(ratio(orange, "#FFFFFF") >= 3 && ratio(orange, "#111827") >= 3);
  assert.ok(source.includes('d="M10 1 19 17H1Z"') && source.includes("fill={INFO_ORANGE}"), "a triangle, filled orange");
  assert.ok(source.includes('aria-label={tr("What will happen")}'));
  assert.equal(source.includes("CircleHelp"), false, "not a question mark");
  for (const part of ['tr("What happens")', 'tr("Where")', 'tr("From → to")', 'tr("Who it affects")', 'tr("How to undo")']) assert.ok(source.includes(part), part);
});

test("every command has who-it-affects and how-to-undo words, in sv / fr / en", () => {
  for (const command of COMMANDS) {
    for (const key of [whoFor(command.id), undoFor(command.id)]) {
      assert.ok(Object.hasOwn(en, key), `${command.id}: ${key}`);
      assert.ok(fr[key] && sv[key] && fr[key] !== key && sv[key] !== key, `${command.id}: not translated`);
    }
  }
  assert.match(undoFor("admin.pricing.saveCountry"), /Undo last Tips & limits save/);
  // SF-R2-3, each checked against the button that takes it back.
  assert.doesNotMatch(undoFor("admin.tipsLimits.undo"), /Undo last Tips & limits save/, "an Undo does not point to itself");
  assert.match(undoFor("admin.tipsLimits.undo"), /Save tips & limits/);
  assert.match(undoFor("admin.pricing.archiveCategory"), /Categories › Deleted: Restore/);
  assert.doesNotMatch(undoFor("admin.pricing.archiveCategory"), /History/);
  for (const surge of ["admin.pricing.startSurge", "admin.pricing.stopSurge", "admin.pricing.stopAllSurges"]) assert.match(undoFor(surge), /Start or stop the manual surge again/, surge);
  for (const zone of ["admin.zone.close", "admin.zone.open"]) assert.match(undoFor(zone), /Open zone or Close zone/, zone);
  assert.doesNotMatch(undoFor("admin.reservation.cancel"), /opposite action/, "a cancelled ride has no opposite button");
  // SF-R2-2: nothing says "other zones are not affected" for a setting (a Standard reaches its zones).
  for (const command of COMMANDS) assert.doesNotMatch(whoFor(command.id), /Other zones are not affected/, command.id);
  assert.match(undoFor("admin.trip.refund"), /cannot be taken back/);
  assert.match(undoFor("admin.driver.suspend"), /no one-press undo/);
  assert.match(whoFor("admin.rider.block"), /rider named here/);
});

test("where a setting lands (owner 2026-11-16 \"Stay on Standard (Rec.)\")", () => {
  const uses = (id: string) => (id === "Z002" ? false : id === "Z004" ? undefined : true);
  const [all] = landing(["standard-SE", "Z001", "Z002", "Z004"], uses);
  assert.equal(all!.standard, true);
  assert.ok(all!.through.includes("Norrmalm") && all!.through.length > 5, "every zone on the Standard gets it through the Standard, chosen or not");
  assert.equal(all!.direct.length, 1);
  assert.deepEqual(all!.detach, []);
  assert.equal(all!.unknown.length, 1);
  // Another zone with its own settings that is not chosen does not get it.
  const [missed] = landing(["standard-SE"], (id) => id !== "Z002");
  assert.equal(missed!.notReached.length, 1);
  // Zones without the Standard: each gets its own and stops following.
  const [alone] = landing(["Z001", "Z002"], uses);
  assert.equal(alone!.standard, false);
  assert.deepEqual(alone!.detach, ["Norrmalm"]);
  assert.deepEqual(alone!.through, []);
  // Pricing: every chosen zone is written even with its Standard.
  const [prices] = landing(["standard-SE", "Z001"], uses, false);
  assert.deepEqual(prices!.detach, ["Norrmalm"]);
  assert.equal(prices!.through.includes("Norrmalm"), false);
});

test("the settings dialogs ask for the zones again: Tips & limits, Pricing, Settings, Dispatch", () => {
  const where = (path: string, command: string) => {
    const text = textOf(path);
    const at = text.indexOf(`command="${command}"`);
    assert.ok(at >= 0, `${path}: ${command}`);
    return text.slice(at, at + 2500).includes("where={");
  };
  assert.ok(where("pricing/CountryExtrasPanel.tsx", "admin.pricing.saveCountry"));
  assert.ok(where("pages/PricingPage.tsx", "admin.pricing.publish"));
  assert.ok(where("pages/ConfigPage.tsx", "admin.config.publish"));
  assert.ok(where("pages/DispatchPage.tsx", "admin.dispatch.publish"));
  const dialog = textOf("ui/CommandButton.tsx");
  assert.ok(dialog.includes("<WhereItLands") && /const placed = /.test(dialog) && dialog.includes("&& placed"), "Confirm waits for the ticks");
  assert.ok(textOf("live/WhereItLands.tsx").includes('type="checkbox"'));
});

/**
 * Supervisor MF-R2-1 (Rules audits/impact/country-undo-supervisor.md, Round 2): whether a zone uses the Standard is
 * known only for zones this session has read. With the Standard ticked, every zone on it changes too; a zone whose mark
 * is not known was put in no list, and the text still ended "No other zone changes.".
 */
test("MF-R2-1: Standard ticked, zones not known: they are named as \"may also change\", never \"No other zone changes.\"", () => {
  const [item] = landing(["standard-SE"], () => undefined);
  assert.deepEqual(item!.maybe, market("SE").zones.map((zone) => zone.name), "every zone of the country may change through the Standard");
  assert.equal(noOtherZoneChange([item!]), false);
  const text = whereText(["standard-SE"], () => undefined);
  assert.equal(text.includes("No other zone changes."), false, text);
  assert.match(text, /may also change/);
  for (const zone of market("SE").zones) assert.ok(text.includes(zone.name), zone.name);
  // Some known, some not: only the not-known ones are "may also change"; still no claim.
  const some = (id: string) => (id === "Z001" ? true : id === "Z002" ? false : undefined);
  const [mixed] = landing(["standard-SE"], some);
  assert.deepEqual(mixed!.through, ["Norrmalm"]);
  assert.equal(mixed!.notReached.length, 1);
  assert.equal(mixed!.maybe.length, market("SE").zones.length - 2);
  assert.equal(whereText(["standard-SE"], some).includes("No other zone changes."), false);
  // A ticked zone not known yet is not known either.
  assert.equal(whereText(["Z001"], () => undefined).includes("No other zone changes."), false);
  // Everything known: the claim is true and said.
  assert.ok(whereText(["standard-SE"], () => true).endsWith("No other zone changes."));
  assert.ok(whereText(["Z001"], () => false).endsWith("No other zone changes."));
  assert.deepEqual(landing(["standard-SE"], () => true)[0]!.maybe, []);
});

test("MF-R2-1: the dialog listens to the marks of every zone of the country, not only the ticked ones", () => {
  const ids = watchedIds(["standard-SE"]);
  for (const zone of market("SE").zones) assert.ok(ids.includes(zone.id), zone.id);
  assert.ok(ids.includes("standard-SE"));
  assert.ok(watchedIds(["Z001"]).includes("Z002"), "a ticked zone: its whole country");
  const source = textOf("live/WhereItLands.tsx");
  assert.ok(/useSyncExternalStore\([^;]*watchedIds\(zoneIds\)/.test(source), "the snapshot is over watchedIds(zoneIds)");
  assert.ok(source.includes("whereText("), "the dialog says what whereText says");
  assert.equal(source.includes('tr("No other zone changes.")'), false, "the claim is made only by whereText, when it is true");
});

test("SF-R2-2: the default \"Where\" and \"Who\" promise nothing; the commands that reach more name it", () => {
  const body = textOf("ui/ConfirmInfoBody.tsx");
  assert.ok(body.includes('tr("See the details above for what this changes.")'));
  assert.equal(/No other zone|Nobody else/.test(body), false, body);
  // Undo / Restore of a pricing revision with a Standard: every zone on it gets it too.
  assert.match(pricingWhere(["standard-SE", "Z001"]), /Standard Sweden.*Norrmalm.*Every zone of Sweden that uses the Standard/);
  assert.match(pricingWhere(["Z001"]), /only in: Norrmalm\. No other zone changes\./);
  const info = (path: string, command: string) => {
    const text = textOf(path);
    const at = text.indexOf(`command="${command}"`);
    assert.ok(at >= 0, `${path}: ${command}`);
    const rest = text.slice(at);
    return rest.slice(0, rest.indexOf("</CommandButton>"));
  };
  assert.match(info("pages/PricingPage.tsx", "admin.pricing.undo"), /info=\{\{ where: pricingWhere\(/);
  assert.match(info("pricing/HistoryPanel.tsx", "admin.pricing.restore"), /info=\{\{ where: pricingWhere\(revision\.zoneIds\)/);
  assert.match(info("pricing/CategoryManager.tsx", "admin.pricing.archiveCategory"), /info=\{\{ where: tr\("Every zone of every country/);
  assert.match(info("config/CountryAppsPanel.tsx", "admin.config.saveCountry"), /info=\{\{ where: tr\("Each country whose payment methods/);
  assert.match(info("live/StandardBar.tsx", "admin.config.copyAppToZones"), /info=\{\{ where: tr\("Every other zone of/);
  assert.match(info("live/StandardBar.tsx", "admin.config.useStandard"), /info=\{\{ where: tr\("\{0\} only: it follows/);
  // The shell passes the command; the body says who and how to undo from it.
  assert.ok(textOf("ui/CommandButton.tsx").includes("command={command}"));
  assert.ok(body.includes("whoFor(command)") && body.includes("undoFor(command"));
});

test("bundle: the words of the \"!\" and the zone pick load on demand, not in the first download", () => {
  const shell = textOf("ui/ConfirmInfo.tsx");
  assert.ok(/lazy\(/.test(shell) && shell.includes('import("./ConfirmInfoBody")'));
  assert.equal(/from "\.\/confirmInfo"|from "\.\/ConfirmInfoBody"/.test(shell), false);
  const button = textOf("ui/CommandButton.tsx");
  assert.ok(button.includes('import("../live/WhereItLands")'));
  assert.equal(/^import \{[^}]*\} from "(\.\.\/live\/WhereItLands|\.\/confirmInfo)"/m.test(button), false, "no static import of the words");
});
