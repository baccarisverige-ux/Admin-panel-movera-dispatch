import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import type { Market } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { DISPATCH_KEY, type DispatchBook, type DriverGroup } from "./rules";
import { tr, trn } from "../i18n";

type Props = {
  book: DispatchBook;
  market: Market;
  drivers: { id: string; name: string; zoneName: string }[];
  canEdit: boolean;
  onNotice: (text: string) => void;
};

/** Saved driver groups of a country: a hand-picked set of drivers a waiting ride can be sent to, or put on their radar. */
export function DriverGroupsCard({ book, market, drivers, canEdit, onNotice }: Props) {
  const [group, setGroup] = useState<DriverGroup | null>(null);
  const [search, setSearch] = useState("");
  const groups = book.groups.filter((item) => item.country === market.id);
  return (
    <section className="dash-card dx-card green" aria-label={tr("Driver groups")} aria-labelledby="dx-groups-title">
      <div className="card-head">
        <h3 id="dx-groups-title">{trn("{0} Driver groups", <Users size={16} aria-hidden="true" />)}</h3>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setGroup({ id: `G-${Date.now().toString(36)}`, country: market.id, name: "", driverIds: [] })}>{trn("{0} New group", <Plus size={14} aria-hidden="true" />)}</button>
      </div>
      <p className="dx-modal-help">{tr("Save drivers as a group, then send a waiting ride to the group or put it on the group's radar from Live or the Dashboard.")}</p>
      {groups.length === 0 ? <p className="dx-calm">{tr("No group yet.")}</p> : (
        <ul className="dx-group-list" aria-label={tr("Driver groups")}>
          {groups.map((item) => (
            <li key={item.id}>
              <span className="dx-avatar"><Users size={15} aria-hidden="true" /></span>
              <span><b>{item.name}</b><small>{trn("{0} driver{1}{2}", item.driverIds.length, item.driverIds.length === 1 ? "" : tr("s"), item.driverIds.length ? `: ${item.driverIds.slice(0, 3).map((id) => drivers.find((row) => row.id === id)?.name ?? id).join(", ")}${item.driverIds.length > 3 ? "…" : ""}` : "")}</small></span>
              <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setGroup(item)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button>
            </li>
          ))}
        </ul>
      )}
      {group ? (
        <div className="dx-group-edit" aria-label={tr("Group")}>
          <label className="field">{trn("Group name{0}", <input aria-label={tr("Group name")} maxLength={40} value={group.name} onChange={(event) => setGroup({ ...group, name: event.target.value })} placeholder={tr("For example Night drivers")} />)}</label>
          <label className="field">{trn("Find drivers{0}", <input aria-label={tr("Find drivers for the group")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Name or zone")} />)}</label>
          <div className="dx-group-pick" role="group" aria-label={tr("Drivers in the group")}>
            {drivers.filter((row) => !search.trim() || `${row.name} ${row.zoneName}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 40).map((row) => (
              <label key={row.id} className={group.driverIds.includes(row.id) ? "check-chip on" : "check-chip"}>
                <input type="checkbox" checked={group.driverIds.includes(row.id)} onChange={() => setGroup({ ...group, driverIds: group.driverIds.includes(row.id) ? group.driverIds.filter((id) => id !== row.id) : [...group.driverIds, row.id] })} />{row.name} · {row.zoneName}
              </label>
            ))}
          </div>
          <div className="dx-modal-actions">
            <button data-command="admin.dispatch.view" type="button" className="dash-btn ghost" onClick={() => setGroup(null)}>{tr("Cancel")}</button>
            <CommandButton command="admin.dispatch.group" className="dash-btn" targetId={group.name.trim() || "group"} confirmTarget={false} scope="all" before="group" after={`${group.driverIds.length} drivers`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={{ ...book, draftRev: book.draftRev + 1, groups: book.groups.some((item) => item.id === group.id) ? book.groups.map((item) => (item.id === group.id ? { ...group, name: group.name.trim() } : item)) : [...book.groups, { ...group, name: group.name.trim() }] }} disabled={!canEdit || !group.name.trim()} onDone={() => { onNotice(tr("Group {0} saved with {1} drivers.", [group.name.trim(), group.driverIds.length])); setGroup(null); }}>{tr("Save group")}</CommandButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
