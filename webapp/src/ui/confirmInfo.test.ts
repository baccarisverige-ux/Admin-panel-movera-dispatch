import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { COMMANDS } from "../commands/registry.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { landing, undoFor, whoFor } from "./confirmInfo.ts";

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
  const source = textOf("ui/ConfirmInfo.tsx");
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
