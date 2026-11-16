import type { SettingInfoTexts } from "./SettingInfo.ts";
import { PRICING_INFO } from "./settingInfo/pricing.ts";
import { TIPS_INFO } from "./settingInfo/tips.ts";
import { SETTINGS_INFO } from "./settingInfo/settings.ts";
import { DISPATCH_ZONE_INFO } from "./settingInfo/dispatchZone.ts";
import { DISPATCH_OFFERS_INFO } from "./settingInfo/dispatchOffers.ts";
import { MORE_INFO } from "./settingInfo/more.ts";

/**
 * English texts of the small "i" next to each admin setting (owner 2026-11-16 "Make it only english"): what it is for,
 * where it applies, unit / range / default, an example. Loaded on the first open of an "i" (its own file in the build).
 */
export const SETTING_INFO: SettingInfoTexts = {
  ...PRICING_INFO,
  ...TIPS_INFO,
  ...SETTINGS_INFO,
  ...DISPATCH_ZONE_INFO,
  ...DISPATCH_OFFERS_INFO,
  ...MORE_INFO,
};
