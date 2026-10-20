import { useEffect, useState } from "react";
import { MARKETS, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import {
  APP_IDS,
  APP_LABEL,
  COUNTRY_SETTINGS_KEY,
  LANGUAGE_LABEL,
  PAYMENT_METHOD_LABEL,
  countrySettingsIssues,
  countrySettingsLines,
  countrySettingsOf,
  sectionPart,
  settingsSummary,
  type CountrySettings,
  type CountrySettingsBook,
} from "./countrySettings";
import { useCountrySettings } from "./useCountrySettings";
import { APP_LANGUAGES, ZONE_PAYMENT_METHODS, type AppLanguage } from "./zoneDefaults";

/**
 * Settings › Payment methods and languages per country: Cash, Card, Apple Pay and Google Pay (owner Q7 FINAL, no Swish,
 * no Klarna, no PayPal) and the default language of the rider, driver and admin apps (Q49: en, fr, sv). The wallet is
 * kept: one balance per currency, used first. Nothing is saved until Save (Q33).
 */
export function CountryAppsPanel({ editable, onDirty }: { editable: boolean; onDirty?: (dirty: boolean) => void }) {
  const { book, loading } = useCountrySettings();
  const [draft, setDraft] = useState<CountrySettingsBook | null>(null);
  const [notice, setNotice] = useState("");
  const shown = draft ?? book;
  const of = (country: MarketId) => countrySettingsOf(shown, country);
  const saved = (country: MarketId) => countrySettingsOf(book, country);
  const dirty = Boolean(draft) && MARKETS.some((item) => JSON.stringify(sectionPart(of(item.id), "settings")) !== JSON.stringify(sectionPart(saved(item.id), "settings")));
  const issues = dirty ? MARKETS.flatMap((item) => countrySettingsIssues(item.id, of(item.id))) : [];
  const lines = dirty ? MARKETS.flatMap((item) => countrySettingsLines(item.id, saved(item.id), of(item.id)).map((line) => `${item.name}: ${line}`)) : [];
  const edit = (country: MarketId, patch: Partial<CountrySettings>) => setDraft({ ...shown, countries: { ...shown.countries, [country]: { ...of(country), ...patch } } });

  useEffect(() => {
    if (globalThis.location?.hash === "#country-apps") document.getElementById("country-apps")?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  return (
    <article className="panel" id="country-apps" data-testid="country-apps">
      <h3>Payment methods and languages per country</h3>
      <p className="state-line">What the rider can pay with, and the language each app starts in. The same four methods are offered in every country; untick one to turn it off there. The wallet stays: one balance per currency, used first (Features › Wallet).</p>
      <div className="table-wrap">
      <table className="cx-country-table" aria-label="Payment methods and languages per country">
        <thead>
          <tr>
            <th scope="col">Country</th>
            {ZONE_PAYMENT_METHODS.map((method) => <th key={method} scope="col">{PAYMENT_METHOD_LABEL[method]}</th>)}
            {APP_IDS.map((app) => <th key={app} scope="col">{APP_LABEL[app]} language</th>)}
          </tr>
        </thead>
        <tbody>
          {MARKETS.map((item) => {
            const settings = of(item.id);
            return (
              <tr key={item.id}>
                <th scope="row">{item.name}</th>
                {ZONE_PAYMENT_METHODS.map((method) => (
                  <td key={method}>
                    <input type="checkbox" aria-label={`${item.name} ${PAYMENT_METHOD_LABEL[method]}`} checked={settings.paymentMethods[method]} disabled={!editable || loading} onChange={(event) => edit(item.id, { paymentMethods: { ...settings.paymentMethods, [method]: event.target.checked } })} />
                  </td>
                ))}
                {APP_IDS.map((app) => (
                  <td key={app}>
                    <select aria-label={`${item.name} ${app} language`} value={settings.languages[app]} disabled={!editable || loading} onChange={(event) => edit(item.id, { languages: { ...settings.languages, [app]: event.target.value as AppLanguage } })}>
                      {APP_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang.toUpperCase()} · {LANGUAGE_LABEL[lang]}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {issues.length ? <p className="pl-warn" role="alert">{issues[0]}</p> : null}
      {dirty && !issues.length ? <ul className="cx-lines" aria-label="Unsaved payment and language changes">{lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
      {notice ? <p className="state-line" role="status">{notice}</p> : null}
      <div className="actions">
        <CommandButton
          command="admin.config.saveCountry"
          className="primary-btn"
          targetId="payment methods and languages"
          confirmTarget={false}
          before={settingsSummary(book)}
          after={settingsSummary(shown)}
          sliceKey={COUNTRY_SETTINGS_KEY}
          value={{ ...shown, draftRev: book.draftRev + 1 }}
          expectedSliceRev={book.draftRev}
          disabled={!editable || !dirty || issues.length > 0}
          title={!editable ? "Your role cannot change this." : !dirty ? "No unsaved change." : issues[0]}
          onDone={() => { setDraft(null); setNotice("Payment methods and languages saved. The apps get them with the next app config."); }}
        >
          Save payment methods and languages
        </CommandButton>
        <button data-command="admin.card.action" type="button" className="secondary-btn" disabled={!draft} onClick={() => setDraft(null)}>Discard</button>
      </div>
    </article>
  );
}
