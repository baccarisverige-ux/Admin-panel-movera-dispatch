import { useState } from "react";
import { ArrowLeft, ListChecks, MapPinned, Pencil, Plus, Radar, Trash2, Users } from "lucide-react";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import type { Market, MarketZone } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { Choice, Num, Switch } from "./fields";
import { ringAreaKm } from "../zones/releases";
import {
  blankRadarRule, blankRadarZone, driversInRadarZone, RADAR_RULE_LIMITS, radarRuleError, radarRuleFor, radarRulesIn, radarZoneError, radarZonesIn, radarZonesOf,
  withoutRadarRule, withoutRadarZone, withRadarRule, withRadarZone,
} from "./radarZones";
import { DISPATCH_KEY, type DispatchBook, type RadarZone, type RadarZoneRule } from "./rules";
import { tr, trn, trx, trSentences } from "../i18n";

type ZonesProps = {
  book: DispatchBook;
  market: Market;
  zone: MarketZone;
  /** Online drivers of the country with their live position; free ones are counted inside each radar zone. */
  drivers: readonly { id: string; lat: number; lng: number; state: string }[];
  canEdit: boolean;
  onNotice: (text: string) => void;
};

/** Radar · Exclusive · Reservations › Radar: the radar zones drawn inside one market zone, with who is inside right now. */
export function RadarZonesCard({ book, market, zone, drivers, canEdit, onNotice }: ZonesProps) {
  const [editing, setEditing] = useState<RadarZone | null>(null);
  const zones = radarZonesOf(book, zone.id);
  const free = drivers.filter((driver) => driver.state === "free");

  if (editing) {
    const exists = book.radarZones.some((item) => item.id === editing.id);
    const error = radarZoneError(editing, book.radarZones);
    return (
      <section className="dash-card dx-card purple dx-event-edit" aria-label={tr("Radar zone")} data-testid="radar-zone-edit">
        <div className="card-head">
          <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={() => setEditing(null)}>{trn("{0} Back to radar zones", <ArrowLeft size={14} aria-hidden="true" />)}</button>
          <h3>{exists ? tr("Change {0}", [editing.name]) : tr("New radar zone")}</h3>
        </div>
        <div className="dx-event-grid">
          <div className="dx-event-fields">
            <label className="field">{trn("Radar zone name{0}", <input aria-label={tr("Radar zone name")} maxLength={60} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={tr("For example Södermalm")} />)}</label>
            <p className="dx-note">{trn("{0} Draw it on the map like a zone: shape, rectangle, circle or free hand. It belongs to {1}. Radar zones may overlap; a radar sent to this one goes to the free drivers inside it at that moment.", <MapPinned size={13} aria-hidden="true" />, <b>{zone.name}</b>)}</p>
            {editing.ring.length >= 3 ? <p className="dx-note">{trn("{0} km² · {1} free driver{2} inside right now", ringAreaKm(editing.ring).toFixed(2), driversInRadarZone(editing, free).length, driversInRadarZone(editing, free).length === 1 ? "" : tr("s"))}</p> : null}
            {error ? <p className="dx-issues" role="alert">{trSentences(error)}</p> : null}
            <div className="dx-modal-actions">
              <CommandButton command="admin.dispatch.radarZone" className="dash-btn" targetId={editing.name.trim() || "radar zone"} confirmTarget={false} scope={zone.id} before={exists ? "radar zone" : "none"} after={`${editing.ring.length} points`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={withRadarZone(book, editing)} disabled={!canEdit || Boolean(error)} onDone={() => { onNotice(tr("Radar zone {0} saved.", [editing.name.trim()])); setEditing(null); }}>{tr("Save radar zone")}</CommandButton>
            </div>
          </div>
          <div className="dx-event-map">
            <BonusAreaMap country={market.id} areas={editing.ring.length ? [{ id: "radar", name: editing.name || tr("Radar zone"), ring: editing.ring }] : []} onChange={(areas) => setEditing({ ...editing, ring: areas[areas.length - 1]?.ring ?? [] })} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dash-card dx-card purple" aria-label={tr("Radar zones")} aria-labelledby="dx-radar-zones-title" data-testid="radar-zones">
      <div className="card-head">
        <h3 id="dx-radar-zones-title">{trn("{0} Radar zones in {1}", <MapPinned size={16} aria-hidden="true" />, zone.name)}</h3>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setEditing(blankRadarZone(market.id, zone.id, `RZ-${Date.now().toString(36)}`, new Date().toISOString()))}>{trn("{0} New radar zone", <Plus size={14} aria-hidden="true" />)}</button>
      </div>
      <p className="dx-modal-help">{tr("Areas inside the zone, drawn on the map and saved. From Live or the Dashboard a waiting ride can be put on the radar of one area: the free drivers inside it see it. Zones are independent and may overlap, so start small and widen if nobody accepts. The whole zone needs no radar zone.")}</p>
      {zones.length === 0 ? <p className="dx-calm">{trn("No radar zone yet in {0}.", zone.name)}</p> : (
        <ul className="dx-event-list dx-radar-zones" aria-label={tr("Radar zones")}>
          {zones.map((item) => {
            const inside = driversInRadarZone(item, free).length;
            const rule = radarRuleFor(book, item.id, market.id);
            return (
              <li key={item.id} className="dx-event on">
                <span className="dx-event-icon" aria-hidden="true"><Radar size={18} /></span>
                <span className="dx-event-main">
                  <b>{item.name}</b>
                  <small>{trn("{0} km² · {1}", ringAreaKm(item.ring).toFixed(2), rule ? trn("rule {0}: {1} s, up to {2} drivers", <b>{rule.name}</b>, rule.seconds, rule.maxDrivers) : tr("the zone's normal radar time and drivers"))}</small>
                </span>
                <span className={inside ? "dx-state on" : "dx-state off"} data-testid={`radar-zone-free-${item.id}`}>{trn("{0} {1} free", <Users size={11} aria-hidden="true" />, inside)}</span>
                <span className="dx-event-actions">
                  <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing(item)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button>
                  <CommandButton command="admin.dispatch.radarZone" className="icon-ghost" targetId={item.name} confirmTarget={false} scope={zone.id} before="radar zone" after="removed" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={withoutRadarZone(book, item.id)} disabled={!canEdit} aria-label={tr("Remove {0}", [item.name])} onDone={() => onNotice(tr("Radar zone {0} removed.", [item.name]))}>
                    <Trash2 size={14} aria-hidden="true" />
                  </CommandButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type RulesProps = { book: DispatchBook; market: Market; canEdit: boolean; onNotice: (text: string) => void };

/** Rules for radar zones, for the whole country: which radar zones each one applies to, its time, most drivers and repeat. */
export function RadarZoneRulesCard({ book, market, canEdit, onNotice }: RulesProps) {
  const [editing, setEditing] = useState<RadarZoneRule | null>(null);
  const rules = radarRulesIn(book, market.id);
  const zones = radarZonesIn(book, market.id);
  const zoneName = (id: string) => market.zones.find((zone) => zone.id === id)?.name ?? id;
  const appliesTo = (rule: RadarZoneRule) => (rule.radarZoneIds === "all" ? tr("All radar zones") : rule.radarZoneIds.map((id) => zones.find((zone) => zone.id === id)?.name ?? id).join(", ") || tr("No radar zone"));

  return (
    <section className="dash-card dx-card blue" aria-label={tr("Radar zone rules")} aria-labelledby="dx-radar-rules-title" data-testid="radar-zone-rules">
      <div className="card-head">
        <h3 id="dx-radar-rules-title">{trn("{0} Radar zone rules · all of {1}", <ListChecks size={16} aria-hidden="true" />, trx(market.name))}</h3>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setEditing(blankRadarRule(market.id, `RR-${Date.now().toString(36)}`))}>{trn("{0} New rule", <Plus size={14} aria-hidden="true" />)}</button>
      </div>
      <p className="dx-modal-help">{tr("A rule applies to all radar zones, several or one. The rule follows the radar zone the ride was sent to, never where a driver stands, so overlapping zones never clash. A rule naming a radar zone wins over the rule for all of them.")}</p>
      {rules.length === 0 ? <p className="dx-calm">{tr("No rule yet: every radar zone uses its zone's normal radar time and drivers.")}</p> : (
        <ul className="dx-event-list" aria-label={tr("Radar zone rules")}>
          {rules.map((rule) => (
            <li key={rule.id} className="dx-event on">
              <span className="dx-event-icon" aria-hidden="true"><ListChecks size={18} /></span>
              <span className="dx-event-main">
                <b>{rule.name}</b>
                <small>{trn("{0} s · up to {1} drivers · {2}", rule.seconds, rule.maxDrivers, rule.repeat ? tr("sends again by itself") : tr("sends once"))}</small>
                <small>{trn("Applies to: {0}", appliesTo(rule))}</small>
              </span>
              <span className="dx-event-actions">
                <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing(rule)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button>
                <CommandButton command="admin.dispatch.radarRule" className="icon-ghost" targetId={rule.name} confirmTarget={false} scope="all" before="rule" after="removed" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={withoutRadarRule(book, rule.id)} disabled={!canEdit} aria-label={tr("Remove {0}", [rule.name])} onDone={() => onNotice(tr("Radar zone rule {0} removed.", [rule.name]))}>
                  <Trash2 size={14} aria-hidden="true" />
                </CommandButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing ? (() => {
        const exists = book.radarZoneRules.some((item) => item.id === editing.id);
        const error = radarRuleError(editing, book.radarZoneRules);
        const picked = Array.isArray(editing.radarZoneIds) ? editing.radarZoneIds : [];
        const toggle = (id: string) => setEditing({ ...editing, radarZoneIds: picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id] });
        return (
          <div className="dx-group-edit" aria-label={tr("Radar zone rule")} data-testid="radar-rule-edit">
            <label className="field">{trn("Rule name{0}", <input aria-label={tr("Rule name")} maxLength={40} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder={tr("For example Friday nights")} />)}</label>
            <div className="field">{trn("Applies to{0}", <Choice label={tr("Rule applies to")} value={editing.radarZoneIds === "all" ? "all" : "some"} onChange={(value) => setEditing({ ...editing, radarZoneIds: value === "all" ? "all" : [] })} options={[{ id: "all", label: tr("All radar zones") }, { id: "some", label: tr("Pick radar zones") }]} />)}</div>
            {editing.radarZoneIds !== "all" ? (
              zones.length ? (
                <div className="zn-chips" role="group" aria-label={tr("Radar zones the rule applies to")}>
                  {zones.map((zone) => (
                    <label key={zone.id} className={picked.includes(zone.id) ? "check-chip on" : "check-chip"}>
                      <input type="checkbox" checked={picked.includes(zone.id)} onChange={() => toggle(zone.id)} />{zone.name} <small>· {zoneName(zone.zoneId)}</small>
                    </label>
                  ))}
                </div>
              ) : <p className="dx-calm">{tr("No radar zone yet. Draw one first.")}</p>
            ) : null}
            <div className="dx-modal-row">
              <label className="field">{trn("Time on the radar{0}", <Num label={tr("Rule radar time")} value={editing.seconds} unit="s" min={RADAR_RULE_LIMITS.seconds.min} max={RADAR_RULE_LIMITS.seconds.max} onChange={(seconds) => setEditing({ ...editing, seconds })} />)}</label>
              <label className="field">{trn("Most drivers who see it{0}", <Num label={tr("Rule most drivers")} before="up to" value={editing.maxDrivers} unit="drivers" min={RADAR_RULE_LIMITS.maxDrivers.min} max={RADAR_RULE_LIMITS.maxDrivers.max} onChange={(maxDrivers) => setEditing({ ...editing, maxDrivers: Math.round(maxDrivers) })} />)}</label>
            </div>
            <div className="dx-row"><span className="dx-row-text"><b>{tr("Send again by itself")}</b><small>{tr("When the time runs out and nobody accepted, the same radar goes out again until an admin stops it or a driver accepts.")}</small></span><Switch label={tr("Send again by itself")} on={editing.repeat} onChange={(repeat) => setEditing({ ...editing, repeat })} /></div>
            {error ? <p className="dx-issues" role="alert">{trSentences(error)}</p> : null}
            <div className="dx-modal-actions">
              <button data-command="admin.dispatch.view" type="button" className="dash-btn ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
              <CommandButton command="admin.dispatch.radarRule" className="dash-btn" targetId={editing.name.trim() || "rule"} confirmTarget={false} scope="all" before={exists ? "rule" : "none"} after={`${editing.seconds} s, ${editing.maxDrivers} drivers`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={withRadarRule(book, editing)} disabled={!canEdit || Boolean(error)} onDone={() => { onNotice(tr("Radar zone rule {0} saved.", [editing.name.trim()])); setEditing(null); }}>{tr("Save rule")}</CommandButton>
            </div>
          </div>
        );
      })() : null}
    </section>
  );
}
