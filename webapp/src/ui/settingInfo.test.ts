import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { scanSettingFields, shownInfoIds, type ScannedField } from "./settingInfoScan.ts";
import { SETTING_INFO_PARTS, SettingInfo, loadSettingInfoTexts, nextInfoOpen, settingInfoLabel } from "./SettingInfo.ts";
import { SETTING_INFO } from "./settingInfoTexts.ts";
import { SETTING_INFO_LISTS } from "./settingInfoLists.ts";

/**
 * Owner 2026-11-16: "Also add next to any setting in all admin panel small i for info when clic it show what this
 * setting for and where can apply and all explanation !" + "the i make it white inside blue circle" + "Make it only
 * english". Record: Rules audits/impact/admin-setting-help.md.
 */

/** Every settings file, by admin area. A new editable field in one of them without an "i" fails the inventory test. */
export const SETTING_FILES: Readonly<Record<string, readonly string[]>> = {
  "Pricing": [
    "pages/PricingPage.tsx", "pricing/CategoryManager.tsx", "pricing/CommissionPanel.tsx", "pricing/CommissionSteps.tsx", "pricing/CopyZones.tsx",
    "pricing/FeesPanel.tsx", "pricing/HistoryPanel.tsx", "pricing/PickupPayPanel.tsx", "pricing/PriceTable.tsx", "pricing/SurgePanel.tsx",
    "pricing/SurgeQuickPopup.tsx", "pricing/SurgeSlider.tsx", "pricing/TestRide.tsx",
  ],
  "Tips & limits": ["pricing/CountryExtrasPanel.tsx", "pricing/ChatSettingsCard.tsx", "pricing/EmergencyNumbersEditor.tsx"],
  "Settings": ["pages/ConfigPage.tsx", "config/CountryAppsPanel.tsx", "config/RequestLimitsPanel.tsx", "platform/SettingsParts.tsx"],
  "Dispatch": [
    "pages/DispatchPage.tsx", "pages/DispatchSectionPage.tsx", "dispatch/ActivityView.tsx", "dispatch/AllFeaturesView.tsx", "dispatch/AssignPanel.tsx",
    "dispatch/BookingPolicy.tsx", "dispatch/CancelFeeTable.tsx", "dispatch/CancelReasonsView.tsx", "dispatch/DestinationSettings.tsx",
    "dispatch/DriverBonusBox.tsx", "dispatch/DriverGroupsCard.tsx", "dispatch/EventsView.tsx", "dispatch/HandlePanel.tsx", "dispatch/OfferSections.tsx",
    "dispatch/OfferSettings.tsx", "dispatch/PickupWaitCard.tsx", "dispatch/Previews.tsx", "dispatch/RadarZones.tsx", "dispatch/ReservationSettings.tsx",
    "dispatch/RideCheckCard.tsx", "dispatch/RulesView.tsx", "dispatch/TestView.tsx", "dispatch/ZoneSettings.tsx",
  ],
  "Content": ["pages/ContentPage.tsx", "content/DriverTexts.tsx", "content/LegalEditor.tsx"],
  "Onboarding": ["pages/OnboardingPage.tsx", "drivers/OnboardingSettingsEditor.tsx"],
  "Drivers › Bonuses": ["drivers/BonusBuilder.tsx", "drivers/BonusQuickPopup.tsx", "drivers/BonusAreaMap.tsx", "live/LiveBonusCampaigns.tsx"],
  "Payouts settings": ["live/LivePayoutSettings.tsx", "payments/PayoutParts.tsx", "pages/PayoutsPage.tsx"],
  "Safety, alerts and support settings": ["pages/SafetyPage.tsx", "alerts/SettingsView.tsx", "support/SupportSettings.tsx"],
};

/** Areas whose "i" is not attached yet (the record lists them). The inventory test prints them; it does not fail on them. */
export const NOT_YET: readonly string[] = ["Content", "Onboarding", "Drivers › Bonuses"];

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const scanned: { area: string; file: string; field: ScannedField }[] = Object.entries(SETTING_FILES).flatMap(([area, files]) =>
  files.flatMap((file) => scanSettingFields(read(file)).map((field) => ({ area, file, field }))),
);

test("inventory: every editable setting in the settings pages has a small i (or says why it is not a setting)", () => {
  const missing = scanned.filter(({ area, field }) => !NOT_YET.includes(area) && field.info === null && field.skip === null);
  assert.deepEqual(missing.map(({ file, field }) => `${file}:${field.line} <${field.tag}> ${field.label}`), []);
  const settings = scanned.filter(({ field }) => field.skip === null);
  const covered = settings.filter(({ field }) => field.info !== null);
  console.log(`setting info coverage: ${covered.length} of ${settings.length} editable fields (${scanned.length - settings.length} fields are not settings)`);
  for (const area of NOT_YET) console.log(`not yet: ${area}: ${settings.filter((entry) => entry.area === area && entry.field.info === null).length} fields`);
});

test("inventory: an info id is a fixed id or a list prefix, and every one has its English text", () => {
  const ids = [...new Set(scanned.map(({ field }) => field.info).filter((id): id is string => id !== null))];
  assert.deepEqual(ids.filter((id) => id === ""), [], "an info id must be written as a fixed text or `prefix.${id}`");
  const fixed = ids.filter((id) => !id.endsWith(".*"));
  assert.deepEqual(fixed.filter((id) => !SETTING_INFO[id]), []);
  for (const prefix of ids.filter((id) => id.endsWith(".*")).map((id) => id.slice(0, -1))) {
    const list = SETTING_INFO_LISTS[prefix];
    assert.ok(list, `the ids of ${prefix}* come from a list in settingInfoLists.ts`);
    assert.deepEqual(list.filter((id) => !SETTING_INFO[`${prefix}${id}`]), [], prefix);
  }
});

test("inventory: an info-at: <id> marker points at an i shown in the same file", () => {
  for (const [, files] of Object.entries(SETTING_FILES)) {
    for (const file of files) {
      const source = read(file);
      const shown = new Set(shownInfoIds(source));
      for (const match of source.matchAll(/info-at:\s*([\w.*-]+)/g)) assert.ok(shown.has(match[1]), `${file}: info-at ${match[1]} has no <SettingInfo id="${match[1]}">`);
    }
  }
});

test("English completeness: every text has all four parts, short and plain", () => {
  const entries = Object.entries(SETTING_INFO);
  assert.ok(entries.length > 0);
  for (const [id, text] of entries) {
    for (const { key } of SETTING_INFO_PARTS) {
      const value = text[key];
      assert.ok(typeof value === "string" && value.trim().length >= 3, `${id}.${key} is empty`);
      assert.ok(value.length <= 400, `${id}.${key} is longer than 400 characters`);
      const sentences = value.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).filter(Boolean).length;
      assert.ok(sentences <= 3, `${id}.${key} has ${sentences} sentences (1 to 3)`);
      assert.doesNotMatch(value, /TODO|lorem|\?\?\?/i, `${id}.${key}`);
    }
  }
});

test("English completeness: no text is left without a field that uses it", () => {
  const shown = Object.values(SETTING_FILES).flat().concat(EXTRA_USERS).flatMap((file) => shownInfoIds(read(file)));
  const used = new Set([...scanned.map(({ field }) => field.info), ...shown].filter((id): id is string => Boolean(id)));
  const inLists = (id: string) => Object.entries(SETTING_INFO_LISTS).some(([prefix, list]) => id.startsWith(prefix) && list.includes(id.slice(prefix.length)));
  const extra = Object.keys(SETTING_INFO).filter((id) => !used.has(id) && !inLists(id));
  assert.deepEqual(extra, []);
});

/** Files outside the scan that show an "i" with a fixed id (components that pass the id on). */
const EXTRA_USERS: readonly string[] = [];

test("the i renders: a button with a white i inside a blue circle, named Info: <setting>", () => {
  const html = renderToStaticMarkup(createElement(SettingInfo, { id: "dispatch.zone.longestSearch", label: "Longest search" }));
  assert.match(html, /<button type="button" class="setting-info-btn" aria-label="Info: Longest search" aria-expanded="false"/);
  assert.match(html, /<span class="setting-info-dot" aria-hidden="true">i<\/span>/);
  assert.doesNotMatch(html, /role="dialog"/);
  const css = read("styles/settingInfo.css");
  const dot = /\.setting-info-dot \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(dot, /background: #1d4ed8/);
  assert.match(dot, /color: #fff/);
  assert.ok(contrast("#ffffff", "#1d4ed8") >= 4.5, "white on the blue passes WCAG AA");
  assert.ok(read("main.tsx").includes('import "./styles/settingInfo.css";'));
});

test("the i opens and closes: tap toggles, Escape / outside tap / close button close it", async () => {
  assert.equal(nextInfoOpen(false, "toggle"), true);
  assert.equal(nextInfoOpen(true, "toggle"), false);
  for (const event of ["escape", "outside", "close"] as const) assert.equal(nextInfoOpen(true, event), false);
  assert.equal(nextInfoOpen(false, "escape"), false);
  assert.equal(settingInfoLabel("Longest search"), "Info: Longest search");
  await loadSettingInfoTexts();
  const open = renderToStaticMarkup(createElement(SettingInfo, { id: "dispatch.zone.longestSearch", label: "Longest search", defaultOpen: true }));
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /role="dialog"[^>]*aria-label="Info: Longest search"/);
  for (const part of SETTING_INFO_PARTS) assert.ok(open.includes(`<dt>${part.title}</dt>`), `${part.title} in ${open}`);
  assert.ok(open.includes(SETTING_INFO["dispatch.zone.longestSearch"].what));
  assert.match(open, /aria-label="Close"/);
  const source = read("ui/SettingInfo.ts");
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /"pointerdown"/);
});

test("the texts load on first open, not with the first page", () => {
  const component = read("ui/SettingInfo.ts");
  assert.match(component, /import\("\.\/settingInfoTexts\.ts"\)/);
  assert.doesNotMatch(component, /^import .*settingInfoTexts/m);
  for (const file of ["dispatch/fields.tsx", "pricing/NumberField.tsx"]) assert.doesNotMatch(read(file), /settingInfoTexts/);
});

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
