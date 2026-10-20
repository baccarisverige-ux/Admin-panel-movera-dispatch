import { useMemo, useState } from "react";
import { Crown, Search, Sparkles, X } from "lucide-react";
import { useDialogFocus } from "../ui/useDialogFocus";
import type { RiderRow } from "./segments";
import { money } from "./ui";
import { tr, trn } from "../i18n";

/** Choose riders by name or code. Riders already chosen are listed first. */
export function RiderPicker({ rows, picked, title, onSave, onClose }: { rows: RiderRow[]; picked: string[]; title: string; onSave: (ids: string[]) => void; onClose: () => void }) {
  const root = useDialogFocus(true, onClose);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(picked));
  const [query, setQuery] = useState("");
  // Order is fixed when the window opens, so rows do not jump while ticking.
  const ordered = useMemo(() => {
    const first = new Set(picked);
    return [...rows].filter((row) => !row.segments.has("blocked")).sort((a, b) => Number(first.has(b.rider.id)) - Number(first.has(a.rider.id)));
  }, [rows, picked]);
  const needle = query.trim().toLowerCase();
  const shown = ordered.filter((row) => !needle || `${row.rider.name} ${row.profile.code}`.toLowerCase().includes(needle)).slice(0, 120);

  function flip(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div ref={root} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card rd-modal rd-picker">
        <div className="rd-builder-head">
          <h3>{trn("{0} · {1} selected", title, chosen.size)}</h3>
          <button data-command="admin.confirm.cancel" type="button" className="icon-ghost" aria-label={tr("Close")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <label className="rd-search small"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find riders")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Find by name or code")} /></label>
        <ul className="rd-audience-list" aria-label={tr("Riders to choose")}>
          {shown.map((row) => (
            <li key={row.rider.id} className={chosen.has(row.rider.id) ? "on" : undefined}>
              <label>
                <input type="checkbox" aria-label={tr("Choose {0}", [row.rider.name])} checked={chosen.has(row.rider.id)} onChange={() => flip(row.rider.id)} />
                <span className="rd-aud-name">{row.rider.name}<small>{row.profile.code}</small></span>
                {row.isNew ? <span className="rd-badge new">{trn("{0}New", <Sparkles size={11} aria-hidden="true" />)}</span> : null}
                {row.segments.has("top") ? <span className="rd-badge top">{trn("{0}Top", <Crown size={11} aria-hidden="true" />)}</span> : null}
                <span className="rd-aud-num">{trn("{0} rides", <b>{row.profile.completed}</b>)}</span>
                <span className="rd-aud-num">{money(row.profile.spentMinor, row.profile.country, true)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="cat-actions end">
          <button data-command="admin.riders.select" type="button" className="dash-btn ghost" onClick={() => setChosen(new Set())}>{tr("Clear")}</button>
          <button data-command="admin.riders.select" type="button" className="dash-btn" onClick={() => onSave([...chosen])}>{trn("Use {0} rider{1}", chosen.size, chosen.size === 1 ? "" : tr("s"))}</button>
        </div>
      </div>
    </div>
  );
}
