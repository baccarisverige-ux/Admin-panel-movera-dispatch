import { createContext, Fragment, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { COUNTRY_SETTINGS_KEY, normalizeCountrySettingsBook } from "../config/countrySettings";
import type { MarketId } from "../markets/markets";
import { isLanguageLoaded, loadLanguage, setLanguage } from "./core";
import { homeCountry, resolveAdminLanguage, type AppLanguage, type LanguageSource } from "./languages";
import { signInLanguage, subscribeSignInLanguage } from "./signInLanguage";

type I18nValue = {
  language: AppLanguage;
  source: LanguageSource;
  /** The language the admin gets without a choice of their own. */
  defaultLanguage: AppLanguage;
  /** The admin's own country, whose default applies. */
  country: MarketId;
  /** The admin's own choice, if any. */
  chosen: AppLanguage | undefined;
};

const I18nContext = createContext<I18nValue>({ language: "en", source: "country", defaultLanguage: "en", country: "SE", chosen: undefined });

/**
 * Picks the signed-in admin's language (owner Q49): their own choice from the profile, else the admin default of their
 * country from Settings › Payment methods and languages per country. A build may set VITE_ADMIN_LANGUAGE to replace the
 * country default (the e2e suite runs in English). Everything below re-renders from scratch when the language changes,
 * so every text, date and number is written again in the new language.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { agent, agents } = useSession();
  const me = agent ? agents.find((item) => item.id === agent.id) ?? agent : null;
  const slice = useSlice<unknown>(COUNTRY_SETTINGS_KEY, null, { enabled: Boolean(agent) });
  const book = useMemo(() => normalizeCountrySettingsBook(slice.value), [slice.value]);
  const country = homeCountry(me?.scope);
  // Owner G1-D2: nobody signed in (sign-in, forgot password, set password, signed out) → the computer's language or
  // the globe's choice on this computer; signed in → the admin's own language, as before.
  const beforeSignIn = useSyncExternalStore(subscribeSignInLanguage, signInLanguage, signInLanguage);
  const resolved: { language: AppLanguage; source: LanguageSource; defaultLanguage: AppLanguage } = me
    ? resolveAdminLanguage({
      chosen: me.language,
      countryDefault: book.countries[country].languages.admin,
      buildDefault: import.meta.env.VITE_ADMIN_LANGUAGE,
    })
    : { language: beforeSignIn.language, source: beforeSignIn.source === "chosen" ? "chosen" : "computer", defaultLanguage: beforeSignIn.language };
  // French and Swedish load on first use; until then the page waits a moment (English never waits).
  const ready = isLanguageLoaded(resolved.language);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadLanguage(resolved.language).then(() => { if (live) setLoaded((count) => count + 1); });
    return () => { live = false; };
  }, [ready, resolved.language]);
  // Set before the children render, so module-level helpers (status words, dates) already use it.
  if (ready) setLanguage(resolved.language);
  useEffect(() => {
    if (ready) document.documentElement.lang = resolved.language;
  }, [ready, resolved.language]);
  const value = useMemo<I18nValue>(() => ({ ...resolved, country, chosen: me?.language }), [resolved.language, resolved.source, resolved.defaultLanguage, country, me?.language]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <I18nContext.Provider value={value}>
      {ready ? <Fragment key={resolved.language}>{children}</Fragment> : <p className="state-line" role="status">…</p>}
    </I18nContext.Provider>
  );
}

export function useLanguage(): I18nValue {
  return useContext(I18nContext);
}
