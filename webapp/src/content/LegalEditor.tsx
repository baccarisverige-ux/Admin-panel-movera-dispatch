import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck, History, Scale, TriangleAlert } from "lucide-react";
import { tr, trn, trx } from "../i18n";
import { COUNTRY_LABEL } from "../i18n/countries";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { DateText, DecisionDialog, ErrorLine } from "../live/ui";
import { useDirtyWarning } from "../ui/useDirtyWarning";
import {
  LEGAL_COUNTRIES,
  LEGAL_DOCUMENTS,
  LEGAL_LANGUAGES,
  LEGAL_PLACEHOLDERS,
  TEXT_MAX,
  TITLE_MAX,
  draftChanged,
  draftFrom,
  isLegalCountry,
  latestReacceptVersion,
  legalPath,
  legalProblems,
  publishBody,
  unknownPlaceholders,
  type LegalAdminView,
  type LegalCompanyField,
  type LegalCountry,
  type LegalDocumentId,
  type LegalDraft,
  type LegalLanguage,
  type LegalVersion,
} from "./legal";

const LANGUAGE_NAME: Record<LegalLanguage, string> = { sv: "Svenska", fr: "Français", en: "English" };
const DOCUMENT_NAME: Record<LegalDocumentId, "Terms of use" | "Privacy policy"> = { terms: "Terms of use", privacy: "Privacy policy" };
const COMPANY_LABEL: Record<LegalCompanyField, "Company name" | "Company number" | "Address" | "Support e-mail" | "Support phone"> = {
  companyName: "Company name",
  orgNumber: "Company number",
  address: "Address",
  supportEmail: "Support e-mail",
  supportPhone: "Support phone",
};

/**
 * v0.18.5 (owner G1-B2 "Real texts from admin (Recommended)"): Content › Legal. Per country (SE, FR): the terms of use
 * and the privacy policy in Svenska / Français / English, the company details the texts use (shown in the apps only
 * when filled), "Ask everyone to accept again", the version history and the lawyer note. Read and published on the
 * server (GET /admin/legal/{country}, POST /admin/legal/{country}/publish, audited legal.publish).
 */
export function LegalEditor({ country: preferred, onNotice }: { country: string; onNotice: (text: string) => void }) {
  const live = useLiveSessionMaybe();
  const [country, setCountry] = useState<LegalCountry>(isLegalCountry(preferred) ? preferred : "SE");
  if (!live) {
    return (
      <section className="panel gr-panel" data-testid="legal-editor">
        <h3><Scale size={16} aria-hidden="true" /> {tr("Terms and privacy per country")}</h3>
        <p className="gr-help">{tr("The terms and the privacy policy are kept and versioned on the Movera server. Open the live admin panel to edit them.")}</p>
      </section>
    );
  }
  return <LiveLegal key={country} country={country} onCountry={setCountry} onNotice={onNotice} />;
}

function LiveLegal({ country, onCountry, onNotice }: { country: LegalCountry; onCountry: (country: LegalCountry) => void; onNotice: (text: string) => void }) {
  const live = useLiveSessionMaybe()!;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["live", "legal", country], queryFn: () => live.client.json<LegalAdminView>(legalPath(country)) });
  const [draft, setDraft] = useState<LegalDraft | null>(null);
  const [from, setFrom] = useState<LegalVersion | null>(null);
  const [language, setLanguage] = useState<LegalLanguage>(country === "FR" ? "fr" : "sv");
  const [confirm, setConfirm] = useState(false);
  const editable = live.can("settings.publish");
  const current = query.data?.live ?? null;
  useEffect(() => {
    if (current && !draft) {
      setDraft(draftFrom(current));
      setFrom(current);
    }
  }, [current, draft]);
  const dirty = Boolean(draft && from && draftChanged(draft, from));
  useDirtyWarning(dirty);

  const switcher = (
    <div className="dash-tabs dx-views" role="group" aria-label={tr("Country")} data-testid="legal-country">
      {LEGAL_COUNTRIES.map((code) => (
        <button key={code} type="button" data-command="admin.content.view" aria-pressed={code === country} className={code === country ? "active" : undefined} onClick={() => { if (code !== country) onCountry(code); }}>
          {trx(COUNTRY_LABEL[code])}
        </button>
      ))}
    </div>
  );

  if (query.isLoading || (current && !draft)) return <section className="panel gr-panel" data-testid="legal-editor">{switcher}<p className="state-line">{tr("Loading.")}</p></section>;
  if (query.error || !current || !draft) return <section className="panel gr-panel" data-testid="legal-editor">{switcher}<ErrorLine error={query.error ?? new Error(tr("Something failed."))} onRetry={() => void query.refetch()} /></section>;

  const problems = legalProblems(draft);
  const unknown = unknownPlaceholders(draft);
  const history = [...(query.data?.history ?? [])].sort((a, b) => b.version - a.version);
  const patchDoc = (id: LegalDocumentId, part: "title" | "text", value: string) => setDraft({ ...draft, [id]: { ...draft[id], [part]: { ...draft[id][part], [language]: value } } });
  const patchCompany = (field: LegalCompanyField, value: string) => setDraft({ ...draft, company: { ...draft.company, [field]: value } });
  const countryName = trx(COUNTRY_LABEL[country]);
  const askedBefore = latestReacceptVersion(current, history);

  return (
    <section className="panel gr-panel legal-editor" data-testid="legal-editor">
      {switcher}
      <h3><Scale size={16} aria-hidden="true" /> {tr("Terms and privacy for {0}", [countryName])}</h3>
      <p className="fd-banner amber" data-testid="legal-lawyer-note"><TriangleAlert size={14} aria-hidden="true" /> {tr("Drafts – a lawyer must review the texts before launch.")}</p>
      <p data-testid="legal-live-version">
        {current.source === "default"
          ? tr("Live now: Movera's draft texts (version 0). Nothing has been published for {0} yet.", [countryName])
          : trn("Live now: version {0}, published {1}{2}.", String(current.version), <DateText value={current.publishedAt} withTime />, current.reaccept ? tr(" · everyone was asked to accept again") : "")}
      </p>

      <fieldset disabled={!editable} className="legal-fields">
        <div className="dash-tabs dx-views" role="group" aria-label={tr("Language of the texts")} data-testid="legal-language">
          {LEGAL_LANGUAGES.map((code) => (
            <button key={code} type="button" data-command="admin.content.view" lang={code} aria-pressed={code === language} className={code === language ? "active" : undefined} onClick={() => setLanguage(code)}>{LANGUAGE_NAME[code]}</button>
          ))}
        </div>
        <div className="legal-docs">
          {LEGAL_DOCUMENTS.map((id) => (
            <div key={id} className="legal-doc" data-document={id}>
              <h4>{tr(DOCUMENT_NAME[id])} · {LANGUAGE_NAME[language]}</h4>
              <label>{tr("Title")}<input lang={language} value={draft[id].title[language]} maxLength={TITLE_MAX} onChange={(event) => patchDoc(id, "title", event.target.value)} aria-label={tr("{0} title ({1})", [tr(DOCUMENT_NAME[id]), LANGUAGE_NAME[language]])} /></label>
              <label>{tr("Text")}<textarea lang={language} rows={16} value={draft[id].text[language]} maxLength={TEXT_MAX} onChange={(event) => patchDoc(id, "text", event.target.value)} aria-label={tr("{0} text ({1})", [tr(DOCUMENT_NAME[id]), LANGUAGE_NAME[language]])} /></label>
              <small className="gr-help">{tr("{0} of {1} characters. A blank line starts a new paragraph.", [draft[id].text[language].length, TEXT_MAX])}</small>
            </div>
          ))}
        </div>

        <h4>{tr("Company details")}</h4>
        <p className="gr-help">{trn("The texts use {0}. In the apps each one is replaced by the value below; a paragraph whose value is empty is left out, so nothing empty is shown.", <code>{LEGAL_PLACEHOLDERS.map((name) => `{${name}}`).join(" ")}</code>)}</p>
        <div className="legal-company">
          {LEGAL_PLACEHOLDERS.map((field) => (
            <label key={field}>{tr(COMPANY_LABEL[field])}
              <input value={draft.company[field]} type={field === "supportEmail" ? "email" : field === "supportPhone" ? "tel" : "text"} placeholder={field === "supportPhone" ? "+46 8 123 456 78" : undefined} onChange={(event) => patchCompany(field, event.target.value)} data-company={field} />
            </label>
          ))}
        </div>

        <label className="legal-reaccept">
          <input type="checkbox" checked={draft.reaccept} onChange={(event) => setDraft({ ...draft, reaccept: event.target.checked })} data-testid="legal-reaccept" />
          {" "}{tr("Ask everyone to accept again")}
        </label>
        <p className="gr-help">{tr("At the next app start (never during a trip) riders and drivers in {0} see the new texts with \"I accept\". Until then a rider cannot book and a driver cannot go online.", [countryName])}</p>
      </fieldset>

      {unknown.length ? <p className="gr-warn" data-testid="legal-unknown"><TriangleAlert size={13} aria-hidden="true" /> {tr("Not a company field, shown as written: {0}", [unknown.map((name) => `{${name}}`).join(", ")])}</p> : null}
      {problems.length ? (
        <ul className="legal-problems" data-testid="legal-problems" role="alert">
          {problems.map((problem) => <li key={`${problem.key}${JSON.stringify(problem.vars ?? [])}`}>{tr(problem.key, (problem.vars ?? []).map((value) => (value === "Terms of use" || value === "Privacy policy" ? tr(value) : value)))}</li>)}
        </ul>
      ) : null}
      {!editable ? <p className="gr-help">{tr("Your role can read these texts but not publish them.")}</p> : null}
      <div className="actions">
        <button type="button" className="primary-btn" data-command="admin.server.legalPublish" disabled={!editable || problems.length > 0 || !dirty} title={!dirty ? tr("Nothing changed yet.") : undefined} onClick={() => setConfirm(true)}>
          <FileCheck size={14} aria-hidden="true" /> {tr("Publish for {0}", [countryName])}
        </button>
        {dirty ? <button type="button" className="secondary-btn" data-command="admin.content.view" onClick={() => { setDraft(draftFrom(current)); setFrom(current); }}>{tr("Undo changes")}</button> : null}
      </div>

      <h4><History size={14} aria-hidden="true" /> {tr("History")}</h4>
      <ol className="legal-history" data-testid="legal-history">
        {history.map((item) => (
          <li key={item.version}>
            <b>{tr("Version {0}", [String(item.version)])}</b> · <DateText value={item.publishedAt} withTime />{item.publishedBy ? <> · {item.publishedBy}</> : null}
            {item.reaccept ? <span className="chip warn">{tr("Accept again")}</span> : null}
            {item.version === current.version ? <em> · {tr("live now")}</em> : null}
            {" "}<button type="button" className="link-action" data-command="admin.content.view" onClick={() => { setDraft(draftFrom(item)); setFrom(current); }}>{tr("Copy into the editor")}</button>
          </li>
        ))}
        <li><b>{tr("Version {0}", ["0"])}</b> · {tr("Movera's draft texts")}{current.version === 0 ? <em> · {tr("live now")}</em> : null}</li>
      </ol>

      <DecisionDialog
        open={confirm}
        title={tr("Publish terms and privacy")}
        summary={<>{tr("Version {0} for {1} goes live in the rider and driver apps at their next start.", [String(current.version + 1), countryName])}{draft.reaccept ? <> {tr("Everyone is asked to accept it again.")}</> : askedBefore !== null ? <> <span data-testid="legal-still-asked">{tr("People who have not accepted version {0} yet will still be asked to accept the new texts.", [String(askedBefore)])}</span></> : null}</>}
        confirmLabel={tr("Publish")}
        note="none"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          const saved = await live.client.post<LegalVersion>(`${legalPath(country)}/publish`, publishBody(draft));
          setDraft(draftFrom(saved));
          setFrom(saved);
          onNotice(tr("Terms and privacy for {0}: version {1} published.", [countryName, String(saved.version)]));
          void queryClient.invalidateQueries({ queryKey: ["live", "legal", country] });
        }}
      />
    </section>
  );
}
