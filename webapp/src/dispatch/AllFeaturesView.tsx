import { useState } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import { FEATURE_INDEX, featureTarget, searchFeatures } from "./featureIndex";
import { tr, trn, trx } from "../i18n";

/** "All features" (Q40): every setting as a short phrase; a click opens its section; the box filters the list. */
export function AllFeaturesView({ zoneId }: { zoneId: string }) {
  const [query, setQuery] = useState("");
  // The list is searched in English (with its keywords) and in the admin's language.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const english = new Set(searchFeatures(query).map((entry) => entry.id));
  const shown = FEATURE_INDEX.filter((entry) => english.has(entry.id) || words.every((word) => `${trx(entry.phrase)} ${trx(entry.section)}`.toLowerCase().includes(word)));
  return (
    <section className="panel pl-audit dx-features" aria-label={tr("All features")}>
      <h3>{tr("All features")}</h3>
      <p className="pl-help">{tr("Every setting and feature, in one list. Click one to open its section.")}</p>
      <div className="pl-filters">
        <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find a setting")} placeholder={tr("For example stops, surge, refund")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <small className="pl-help">{trn("{0} of {1}", shown.length, FEATURE_INDEX.length)}</small>
      </div>
      {shown.length ? (
        <ul className="dx-feature-list" aria-label={tr("Features")}>
          {shown.map((entry) => (
            <li key={entry.id}>
              <Link to={featureTarget(entry, zoneId)}><b>{trx(entry.phrase)}</b> <small>{trx(entry.section)}</small></Link>
            </li>
          ))}
        </ul>
      ) : <p className="dx-calm">{tr("No setting matches. Try another word.")}</p>}
    </section>
  );
}
