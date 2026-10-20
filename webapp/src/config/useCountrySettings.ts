import { useMemo } from "react";
import { useSlice } from "../api/hooks";
import { COUNTRY_SETTINGS_KEY, normalizeCountrySettingsBook, type CountrySettingsBook } from "./countrySettings";

/** The per-country settings (tips, raise steps, promo cap, driver bonus limit, payment methods, languages). Defaults until loaded. */
export function useCountrySettings(): { book: CountrySettingsBook; loading: boolean; slice: ReturnType<typeof useSlice<unknown>> } {
  const slice = useSlice<unknown>(COUNTRY_SETTINGS_KEY, null);
  const book = useMemo(() => normalizeCountrySettingsBook(slice.value), [slice.value]);
  return { book, loading: slice.loading, slice };
}
