import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, CalendarDays, Flame, MapPin, Pencil, Plus, Radar, Target, Trash2, Users } from "lucide-react";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import type { Market } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { Choice, Num, Switch } from "./fields";
import { giveBonusPrefill } from "./prefill";
import { DISPATCH_KEY, modeLabel, type DispatchBook, type DispatchEvent, type DriverGroup } from "./rules";
import { tr, trn, trx, trSentences } from "../i18n";

type Props = {
  book: DispatchBook;
  market: Market;
  drivers: { id: string; name: string; zoneName: string }[];
  canEdit: boolean;
  canBonus: boolean;
  onNotice: (text: string) => void;
};

function eventState(event: DispatchEvent, now: number): "on" | "soon" | "done" | "off" {
  if (!event.on) return "off";
  const from = Date.parse(event.from);
  const until = Date.parse(event.until);
  if (until < now) return "done";
  if (from <= now) return "on";
  return "soon";
}

const STATE_TEXT = { on: "Running now", soon: "Coming", done: "Done", off: "Off" } as const;

function blankEvent(country: Market["id"], id: string): DispatchEvent {
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return { id, country, name: "", ring: [], from: `${day}T20:00`, until: `${day}T23:30`, on: true, mode: "radar", radarDrivers: 10, pickupNote: "", driverMessage: "" };
}

export function EventsView({ book, market, drivers, canEdit, canBonus, onNotice }: Props) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<DispatchEvent | null>(null);
  const [group, setGroup] = useState<DriverGroup | null>(null);
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());
  const events = book.events.filter((event) => event.country === market.id);
  const groups = book.groups.filter((item) => item.country === market.id);

  if (editing) {
    const exists = book.events.some((event) => event.id === editing.id);
    const error = !editing.name.trim() ? "Give the event a name." : editing.ring.length < 3 ? "Draw the event area on the map." : !(Date.parse(editing.until) > Date.parse(editing.from)) ? "The end must be after the start." : null;
    const next: DispatchBook = { ...book, draftRev: book.draftRev + 1, events: exists ? book.events.map((event) => (event.id === editing.id ? editing : event)) : [...book.events, editing] };
    return (
      <section className="dash-card dx-event-edit" aria-label={tr("Event")}>
        <div className="card-head">
          <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setEditing(null)}>{trn("{0} Back to events", <ArrowLeft size={14} aria-hidden="true" />)}</button>
          <h3>{exists ? tr("Change {0}", [editing.name]) : tr("New event")}</h3>
        </div>
        <div className="dx-event-grid">
          <div className="dx-event-fields">
            <label className="field">{trn("Event name{0}", <input aria-label={tr("Event name")} maxLength={60} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={tr("For example Football final")} />)}</label>
            <div className="dx-modal-row">
              <label className="field">{trn("Starts{0}", <input type="datetime-local" aria-label={tr("Event starts")} value={editing.from} onChange={(event) => setEditing({ ...editing, from: event.target.value })} />)}</label>
              <label className="field">{trn("Ends{0}", <input type="datetime-local" aria-label={tr("Event ends")} value={editing.until} onChange={(event) => setEditing({ ...editing, until: event.target.value })} />)}</label>
            </div>
            <div className="field">{trn("Dispatch in the area{0}", <Choice label={tr("Event mode")} value={editing.mode} onChange={(mode) => setEditing({ ...editing, mode })} options={[{ id: "radar", label: tr("Radar") }, { id: "exclusive", label: tr("Exclusive") }]} />)}</div>
            {editing.mode === "radar" ? <label className="field">{trn("Drivers who see each request{0}", <Num label={tr("Event radar drivers")} value={editing.radarDrivers} unit="drivers" min={1} max={30} onChange={(radarDrivers) => setEditing({ ...editing, radarDrivers })} />)}</label> : null}
            <label className="field">{trn("Pickup point for riders{0}", <input aria-label={tr("Event pickup note")} maxLength={100} value={editing.pickupNote} onChange={(event) => setEditing({ ...editing, pickupNote: event.target.value })} placeholder={tr("For example North gate, lane P2")} />)}</label>
            <label className="field">{trn("Message to drivers before the event{0}", <textarea aria-label={tr("Event driver message")} rows={2} maxLength={140} value={editing.driverMessage} onChange={(event) => setEditing({ ...editing, driverMessage: event.target.value })} placeholder={tr("For example Concert ends at 22:30. Wait at the north gate.")} />)}</label>
            <div className="dx-row"><span className="dx-row-text"><b>{tr("Event is on")}</b></span><Switch label={tr("Event")} on={editing.on} onChange={(on) => setEditing({ ...editing, on })} /></div>
            {error ? <p className="dx-issues" role="alert">{trSentences(error)}</p> : null}
            <div className="dx-modal-actions">
              <CommandButton command="admin.dispatch.event" className="dash-btn" targetId={editing.name.trim() || "event"} confirmTarget={false} scope="all" before={exists ? "event" : "none"} after={editing.on ? "on" : "off"} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next} disabled={!canEdit || Boolean(error)} onDone={() => { onNotice(tr("Event {0} saved.", [editing.name])); setEditing(null); }}>{tr("Save event")}</CommandButton>
              <button data-command="admin.dispatch.view" type="button" className="dash-btn ghost" disabled={!canBonus || editing.ring.length < 3} title={tr("Opens the driver bonus builder with the same area and time")} onClick={() => {
                giveBonusPrefill({ name: editing.name || "Event bonus", ring: editing.ring, from: editing.from, until: editing.until, note: editing.driverMessage });
                navigate(`/drivers?view=bonuses&country=${market.id}&prefill=event`);
              }}>{trn("{0} Also make a driver bonus", <Flame size={14} aria-hidden="true" />)}</button>
            </div>
          </div>
          <div className="dx-event-map">
            <BonusAreaMap country={market.id} areas={editing.ring.length ? [{ id: "event", name: editing.name || "Event area", ring: editing.ring }] : []} onChange={(areas) => setEditing({ ...editing, ring: areas[areas.length - 1]?.ring ?? [] })} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="dx-events">
      <section className="dash-card" aria-labelledby="dx-events-title">
        <div className="card-head">
          <h3 id="dx-events-title">{trn("{0} Events in {1}", <CalendarDays size={16} aria-hidden="true" />, trx(market.name))}</h3>
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setEditing(blankEvent(market.id, `EV-${Date.now().toString(36)}`))}>{trn("{0} New event", <Plus size={14} aria-hidden="true" />)}</button>
        </div>
        <p className="dx-modal-help">{tr("A concert or a match: draw the area and set the time. During the event, these dispatch rules apply in that area.")}</p>
        {events.length === 0 ? <p className="dx-calm">{trn("No event yet in {0}.", trx(market.name))}</p> : (
          <ul className="dx-event-list" aria-label={tr("Events")}>
            {events.map((event) => {
              const state = eventState(event, now);
              const toggled: DispatchBook = { ...book, draftRev: book.draftRev + 1, events: book.events.map((item) => (item.id === event.id ? { ...item, on: !item.on } : item)) };
              const removed: DispatchBook = { ...book, draftRev: book.draftRev + 1, events: book.events.filter((item) => item.id !== event.id) };
              return (
                <li key={event.id} className={`dx-event ${state}`}>
                  <span className="dx-event-icon" aria-hidden="true">{event.mode === "radar" ? <Radar size={18} /> : <Target size={18} />}</span>
                  <span className="dx-event-main">
                    <b>{event.name}</b>
                    <small>{event.from.replace("T", " ")} – {event.until.slice(11)} · {modeLabel(event.mode)}{event.mode === "radar" ? tr(", {0} drivers", [event.radarDrivers]) : ""}</small>
                    {event.pickupNote ? <small><MapPin size={11} aria-hidden="true" /> {event.pickupNote}</small> : null}
                    {event.driverMessage ? <small className="dx-quote">“{event.driverMessage}”</small> : null}
                  </span>
                  <span className={`dx-state ${state}`}>{trx(STATE_TEXT[state])}</span>
                  <span className="dx-event-actions">
                    <CommandButton command="admin.dispatch.event" className={event.on ? "surge-toggle on" : "surge-toggle"} targetId={event.name} confirmTarget={false} scope="all" before={event.on ? "on" : "off"} after={event.on ? "off" : "on"} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={toggled} disabled={!canEdit} aria-label={`${event.name} ${event.on ? "on" : "off"}`} onDone={() => onNotice(tr("Event {0} switched {1}.", [event.name, event.on ? "off" : "on"]))}>
                      {event.on ? tr("On") : tr("Off")} <span className="switch" aria-hidden="true"><i /></span>
                    </CommandButton>
                    <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing(event)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button>
                    <CommandButton command="admin.dispatch.event" className="icon-ghost" targetId={event.name} confirmTarget={false} scope="all" before="event" after="removed" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={removed} disabled={!canEdit} aria-label={tr("Remove {0}", [event.name])} onDone={() => onNotice(tr("Event {0} removed.", [event.name]))}>
                      <Trash2 size={14} aria-hidden="true" />
                    </CommandButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-card" aria-labelledby="dx-groups-title">
        <div className="card-head">
          <h3 id="dx-groups-title">{trn("{0} Driver groups", <Users size={16} aria-hidden="true" />)}</h3>
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setGroup({ id: `G-${Date.now().toString(36)}`, country: market.id, name: "", driverIds: [] })}>{trn("{0} New group", <Plus size={14} aria-hidden="true" />)}</button>
        </div>
        <p className="dx-modal-help">{tr("Save drivers as a group, then send a waiting ride to the group or put it on the group's radar from Live.")}</p>
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
    </div>
  );
}
