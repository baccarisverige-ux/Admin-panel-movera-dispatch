import { useState } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import { FEATURE_INDEX, featureTarget, searchFeatures } from "./featureIndex";

/** "All features" (Q40): every setting as a short phrase; a click opens its section; the box filters the list. */
export function AllFeaturesView({ zoneId }: { zoneId: string }) {
  const [query, setQuery] = useState("");
  const shown = searchFeatures(query);
  return (
    <section className="panel pl-audit dx-features" aria-label="All features">
      <h3>All features</h3>
      <p className="pl-help">Every setting and feature, in one list. Click one to open its section.</p>
      <div className="pl-filters">
        <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label="Find a setting" placeholder="For example stops, surge, refund" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <small className="pl-help">{shown.length} of {FEATURE_INDEX.length}</small>
      </div>
      {shown.length ? (
        <ul className="dx-feature-list" aria-label="Features">
          {shown.map((entry) => (
            <li key={entry.id}>
              <Link to={featureTarget(entry, zoneId)}><b>{entry.phrase}</b> <small>{entry.section}</small></Link>
            </li>
          ))}
        </ul>
      ) : <p className="dx-calm">No setting matches. Try another word.</p>}
    </section>
  );
}
