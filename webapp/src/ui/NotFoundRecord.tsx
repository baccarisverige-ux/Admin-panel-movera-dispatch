import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Search } from "lucide-react";
import { useSearch } from "../api/hooks";

/**
 * The one "Not found" page for every detail address (Q23, UI-15): a title, a search box and a link back to
 * the list. Used when the id does not exist or is outside the admin's country or zones.
 */
export function NotFoundRecord({ kind, id, list, listLabel }: { kind: string; id?: string; list: string; listLabel: string }) {
  const [query, setQuery] = useState("");
  const search = useSearch(query);
  const hits = search.data ?? [];
  return (
    <div className="page-heading not-found" data-testid="record-missing">
      <div>
        <h2>{kind} not found</h2>
        <p className="state-line">
          {id ? <>There is no {kind.toLowerCase()} <b>{id}</b> you can open.</> : <>There is no such {kind.toLowerCase()}.</>} It may be in another country or zone, it may have been deleted, or the address is wrong.
        </p>
        <form className="not-found-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="pl-search">
            <Search size={14} aria-hidden="true" />
            <input aria-label="Search the admin" placeholder="Search by name, id or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </form>
        {query.trim().length > 1 ? (
          hits.length ? (
            <ul className="not-found-hits" aria-label="Search results">
              {hits.slice(0, 8).map((hit) => <li key={`${hit.kind}-${hit.id}`}><Link to={hit.path}>{hit.label}</Link> <small>{hit.kind} · {hit.id}</small></li>)}
            </ul>
          ) : <p className="state-line">{search.isLoading ? "Searching." : "Nothing matches."}</p>
        ) : null}
        <Link className="dash-btn small ghost not-found-back" to={list}><ArrowLeft size={13} aria-hidden="true" /> Back to {listLabel}</Link>
      </div>
    </div>
  );
}
