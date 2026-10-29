import { useMemo } from "react";
import { useSlice } from "../api/hooks";
import { marketOfZone } from "../markets/markets";
import { ONBOARDING_KEY, emptyOnboardingRules, firstWarningDays, normalizeOnboardingRules, withSettings, type OnboardingRules } from "./onboarding";
import { ONBOARDING_SETTINGS_KEY, emptySettingsBook, normalizeSettingsBook } from "./onboardingSettings";

/** The first document warning for a driver's zone, from the country's onboarding rules (Q26). Documents turn orange from then. */
export function useDocWarnDays(): (zoneId: string | undefined) => number {
  const slice = useSlice<OnboardingRules>(ONBOARDING_KEY, emptyOnboardingRules());
  const settings = useSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook());
  const rules = useMemo(() => withSettings(normalizeOnboardingRules(slice.value), normalizeSettingsBook(settings.value)), [slice.value, settings.value]);
  return useMemo(() => (zoneId: string | undefined) => firstWarningDays(rules, marketOfZone(zoneId ?? "")?.id ?? "SE"), [rules]);
}
