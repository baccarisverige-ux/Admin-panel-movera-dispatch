import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { AlertTriangle, ArrowLeft, Bell, Flag, CalendarClock, CheckCircle2, Clock, Copy, Gauge, Layers, MapPin, Pause, Plane, Radar, Shield, Smartphone, Star, Target, Timer, TrendingDown, TrendingUp, Users, Wand2 } from "lucide-react";
import type { Market, MarketZone } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { Modal } from "../ui/Modal";
import { beforeAfter, zoneResults } from "./demo";
import { ZoneSettings } from "./ZoneSettings";
import type { WaitBaseRow } from "./PickupWaitCard";
import type { CancelFeeKind, FeeCategory } from "./cancelFees";
import { DriverOfferPreview, ReservationDriverPreview, ReservationRiderPreview, RiderWaitingPreview } from "./Previews";
import {
  applyPreset, BUILT_IN_PRESETS, copyParts, DISPATCH_KEY, liveRules, mainMode, modeLabel, modeNow, presetFrom, TABS, zoneIssues,
  type CountryDispatch, type DispatchBook, type TabId, type ZoneDispatch,
} from "./rules";
import { tr, trn, trx } from "../i18n";

type Props = {
  book: DispatchBook;
  market: Market;
  zones: MarketZone[];
  zoneId: string;
  onZone: (zoneId: string | null) => void;
  tab: TabId;
  onTab: (tab: TabId) => void;
  rulesOf: (zoneId: string) => ZoneDispatch;
  onRules: (zoneId: string, next: ZoneDispatch) => void;
  country: CountryDispatch;
  onCountry: (next: CountryDispatch) => void;
  changed: Set<string>;
  canEdit: (zoneId: string) => boolean;
  busyOf: (zoneId: string) => number;
  hhmm: string;
  money: (value: number) => string;
  symbol: string;
  agentId: string;
  onNotice: (text: string) => void;
  /** Movera's commission for a normal ride in a zone (Pricing), and a sample booked-ride fare there. */
  commissionOf: (zoneId: string) => number;
  sampleFareOf: (zoneId: string) => number;
  /** Waiting at pickup per category, from Pricing. */
  waitBasesOf: (zoneId: string) => WaitBaseRow[];
  /** The car types Pricing lists for a zone, for the rider cancel fees. */
  feeCategoriesOf: (zoneId: string) => FeeCategory[];
  /** The tabs of this section: Dispatch rules (TABS) or Radar · Exclusive · Reservations (OFFER_TABS). */
  tabs?: { id: TabId; label: string }[];
  /** Extra cards under a tab's settings, for example the radar zones under Radar. */
  below?: (zoneId: string, tab: TabId) => ReactNode;
};

const TAB_ICON: Record<TabId, typeof Radar> = { modes: Gauge, radar: Radar, exclusive: Target, reservations: CalendarClock, best: Star, waiting: Smartphone, rides: MapPin, drivers: Users, destination: Flag, safety: Shield, alerts: Bell };

function ModeBadge({ zone, paused }: { zone: ZoneDispatch; paused: boolean }) {
  if (paused) return <span className="dx-mode-tag paused">{trn("{0} Paused", <Pause size={10} aria-hidden="true" />)}</span>;
  const mode = mainMode(zone);
  return <span className={`dx-mode-tag ${mode}`}>{mode === "auto" ? <>{trn("{0} Automatic", <Gauge size={10} aria-hidden="true" />)}</> : mode === "radar" ? <>{trn("{0} Radar", <Radar size={10} aria-hidden="true" />)}</> : <>{trn("{0} Exclusive", <Target size={10} aria-hidden="true" />)}</>}</span>;
}

export function RulesView(props: Props) {
  const { book, market, zones, zoneId, onZone, tab, onTab, rulesOf, onRules, changed, canEdit, busyOf, hhmm, money, symbol, tabs = TABS, below } = props;
  const [copyOpen, setCopyOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [phone, setPhone] = useState<"auto" | "driver" | "rider">("auto");
  const [feeTab, setFeeTab] = useState<CancelFeeKind>("live");
  const { hash } = useLocation();
  // Pricing links here (#dx-rider-cancel-fees): show the Rider cancel fees card once it is on screen.
  useEffect(() => {
    if (hash !== "#dx-rider-cancel-fees" || tab !== "rides" || !zoneId) return;
    const timer = window.setTimeout(() => document.getElementById("dx-rider-cancel-fees")?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(timer);
  }, [hash, tab, zoneId]);
  const zone = zones.find((item) => item.id === zoneId) ?? null;
  const groups = Array.from(new Set(zones.map((item) => (item.kind === "airport" ? "Airports" : item.city)))).map((label) => ({ label, zones: zones.filter((item) => (item.kind === "airport" ? "Airports" : item.city) === label) }));

  const rail = (
    <nav className={zone ? "dx-rail has-zone" : "dx-rail"} aria-label={tr("Zones")}>
      <p className="dx-rail-help">{tr("Pick a zone to see and change its dispatch rules.")}</p>
      {groups.map((group) => (
        <div key={group.label} className="dx-rail-group">
          <h4>{group.label === "Airports" ? <Plane size={12} aria-hidden="true" /> : <MapPin size={12} aria-hidden="true" />} {trx(group.label)}</h4>
          <ul>
            {group.zones.map((item) => {
              const rules = rulesOf(item.id);
              const paused = Boolean(book.control[item.id]?.paused);
              const waiting = book.approvals.some((entry) => entry.zoneIds.includes(item.id));
              return (
                <li key={item.id}>
                  <button data-command="admin.dispatch.view" type="button" aria-current={item.id === zoneId ? "true" : undefined} className={item.id === zoneId ? "dx-rail-zone on" : "dx-rail-zone"} onClick={() => onZone(item.id)}>
                    <span className="dx-rail-name"><b>{item.name}</b><code>{item.id}</code></span>
                    <span className="dx-rail-tags">
                      <ModeBadge zone={rules} paused={paused} />
                      {changed.has(item.id) ? <span className="dx-dot changed" title={tr("Changed, not live yet")}>{tr("Changed")}</span> : null}
                      {waiting ? <span className="dx-dot waiting" title={tr("Waiting for a second admin")}>{tr("Waiting")}</span> : null}
                      {zoneIssues(rules, props.feeCategoriesOf(item.id)).length ? <AlertTriangle size={13} className="dx-warn" aria-label={tr("Has a problem")} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  if (!zone) {
    return (
      <div className="dx-rules">
        {rail}
        <div className="dx-zone dx-zone-empty">
          <Layers size={34} aria-hidden="true" />
          <b>{tr("Pick a zone on the left")}</b>
          <p>{tab === "reservations" ? tr("Each zone has its own reservation rules. The reservation policy for all zones is there too.") : tab === "radar" || tab === "exclusive" ? tr("Each zone has its own Radar and Exclusive rules, its radar zones drawn on the map, and what the driver app shows.") : tr("Each zone has its own rules: the best driver, what the rider sees while waiting, rides and stops, and more. Radar, Exclusive and reservations have their own section.")}</p>
        </div>
      </div>
    );
  }

  const rules = rulesOf(zone.id);
  const issues = zoneIssues(rules, props.feeCategoriesOf(zone.id));
  const editable = canEdit(zone.id);
  const busy = busyOf(zone.id);
  const now = modeNow(rules, book.control[zone.id], busy, hhmm);
  const results = zoneResults(zone.id, liveRules(book, zone.id));
  const preview = zoneResults(zone.id, rules);
  const compare = beforeAfter(zone.id, book.versions, liveRules(book, zone.id));
  const shownPhone = phone === "auto" ? (tab === "waiting" ? "rider" : "driver") : phone;
  const delta = (a: number, b: number, goodDown: boolean) => {
    const diff = Math.round((b - a) * 10) / 10;
    if (!diff) return null;
    const good = goodDown ? diff < 0 : diff > 0;
    return <em className={good ? "good" : "bad"}>{good ? <TrendingUp size={10} aria-hidden="true" /> : <TrendingDown size={10} aria-hidden="true" />} {diff > 0 ? "+" : ""}{diff}</em>;
  };

  return (
    <div className="dx-rules">
      {rail}
      <div className="dx-zone" aria-label={tr("{0} rules", [zone.name])}>
        <header className="dx-zone-head">
          <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost dx-back-zones" onClick={() => onZone(null)}>{trn("{0} All zones", <ArrowLeft size={14} aria-hidden="true" />)}</button>
          <div className="dx-zone-title">
            <h3>{zone.name} <code>{zone.id}</code></h3>
            <p>{trn("{0} · New requests now: {1} · {2}", zone.kind === "airport" ? tr("Airport") : zone.city, <b>{now.mode ? modeLabel(now.mode) : tr("none")}</b>, trx(now.why))}</p>
          </div>
          <div className="dx-zone-actions">
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => setPresetOpen(true)}>{trn("{0} Presets", <Wand2 size={14} aria-hidden="true" />)}</button>
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => setCopyOpen(true)}>{trn("{0} Copy to other zones", <Copy size={14} aria-hidden="true" />)}</button>
          </div>
        </header>

        {/* Live: the server reports no dispatch results yet, so the box is left out (owner rule: no "Not connected yet" on a live page). */}
        {!results || !preview ? null : <section className="dx-results" aria-label={tr("{0} results today", [zone.name])}>
          <div><Timer size={15} aria-hidden="true" /><span><b>{trn("{0} s", results.findSec)}</b><small>{tr("Time to find a driver")}</small></span>{changed.has(zone.id) ? delta(results.findSec, preview.findSec, true) : null}</div>
          <div><CheckCircle2 size={15} aria-hidden="true" /><span><b>{results.acceptedPct}%</b><small>{tr("Requests accepted")}</small></span>{changed.has(zone.id) ? delta(results.acceptedPct, preview.acceptedPct, false) : null}</div>
          <div className="warn"><AlertTriangle size={15} aria-hidden="true" /><span><b>{results.noDriverPct}%</b><small>{tr("No driver found")}</small></span>{changed.has(zone.id) ? delta(results.noDriverPct, preview.noDriverPct, true) : null}</div>
          <div><Clock size={15} aria-hidden="true" /><span><b>{trn("{0} min", results.pickupMin)}</b><small>{tr("Average pickup time")}</small></span>{changed.has(zone.id) ? delta(results.pickupMin, preview.pickupMin, true) : null}</div>
          <div><Radar size={15} aria-hidden="true" /><span><b>{results.radarPct}% · {results.exclusivePct}%</b><small>{tr("Accepted on Radar · Exclusive")}</small></span></div>
          {compare ? (
            <p className="dx-compare" aria-label={tr("Before and after the last publish")}>{trn("Last publish {0}: time to find a driver {1} s → {2}, no driver {3}% → {4}", compare.at.slice(0, 16).replace("T", " "), compare.before.findSec, <b>{trn("{0} s", compare.after.findSec)}</b>, compare.before.noDriverPct, <b>{compare.after.noDriverPct}%</b>)}</p>
          ) : null}
          {changed.has(zone.id) ? <p className="dx-compare soft">{tr("Small arrows show the expected effect of your changes.")}</p> : null}
        </section>}

        <div className="dx-tabs" role="tablist" aria-label={tr("Zone settings")}>
          {tabs.map((item) => {
            const Icon = TAB_ICON[item.id];
            return <button data-command="admin.dispatch.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => onTab(item.id)}><Icon size={14} aria-hidden="true" /> {trx(item.label)}</button>;
          })}
        </div>

        {!editable ? <p className="dx-readonly" role="status">{tr("You can view these rules. Only Super admin and Operations can change dispatch in their own zones.")}</p> : null}
        {issues.length ? <ul className="dx-issues" role="alert">{issues.map((line) => <li key={line}><AlertTriangle size={13} aria-hidden="true" /> {line}</li>)}</ul> : null}

        <div className="dx-zone-body">
          <div className="dx-zone-main" role="tabpanel" aria-label={trx(tabs.find((item) => item.id === tab)?.label)}>
            <ZoneSettings
              tab={tab}
              zone={rules}
              onChange={(next) => onRules(zone.id, next)}
              country={props.country}
              onCountry={props.onCountry}
              countryName={market.name}
              countryId={market.id}
              airport={zone.kind === "airport"}
              zoneName={zone.name}
              symbol={symbol}
              busy={busy}
              disabled={!editable}
              money={money}
              groups={book.groups.filter((item) => item.country === market.id)}
              commissionPct={props.commissionOf(zone.id)}
              sampleFare={props.sampleFareOf(zone.id)}
              waitBases={props.waitBasesOf(zone.id)}
              otherZones={zones.filter((item) => item.id !== zone.id && canEdit(item.id)).map((item) => ({ id: item.id, name: item.name }))}
              feeCategories={props.feeCategoriesOf(zone.id)}
              feeTab={feeTab}
              onFeeTab={setFeeTab}
              onOpenCancelFees={(kind) => {
                setFeeTab(kind);
                onTab("rides");
                window.setTimeout(() => document.getElementById("dx-rider-cancel-fees")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
              }}
              onCopyCancelFees={(kind, table, ids) => {
                const copy = () => JSON.parse(JSON.stringify(table)) as typeof table;
                for (const id of ids) {
                  const target = rulesOf(id);
                  onRules(id, kind === "live" ? { ...target, riderCancel: { ...target.riderCancel, fees: copy() } } : { ...target, reservation: { ...target.reservation, riderFees: copy() } });
                }
                props.onNotice(tr("{0} cancel fees copied from {1} to {2} zone{3}. Not live yet.", [kind === "live" ? "Live trip" : "Reservation", zone.name, ids.length, ids.length === 1 ? "" : "s"]));
              }}
              onWaitAllZones={(pickupWait) => {
                const targets = zones.filter((item) => canEdit(item.id));
                for (const item of targets) onRules(item.id, { ...rulesOf(item.id), pickupWait: JSON.parse(JSON.stringify(pickupWait)) as typeof pickupWait });
                return targets.length;
              }}
            />
            {below ? below(zone.id, tab) : null}
          </div>
          <aside className="dx-zone-side" aria-label={tr("Phone preview")}>
            <div className="ra-switch" role="tablist" aria-label={tr("Which phone")}>
              <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shownPhone === "driver"} className={shownPhone === "driver" ? "active" : undefined} onClick={() => setPhone("driver")}>{tr("Driver app")}</button>
              <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shownPhone === "rider"} className={shownPhone === "rider" ? "active" : undefined} onClick={() => setPhone("rider")}>{tr("Rider app")}</button>
            </div>
            {tab === "reservations"
              ? (shownPhone === "driver" ? <ReservationDriverPreview zone={rules} money={money} country={market.id} /> : <ReservationRiderPreview zone={rules} money={money} country={market.id} fare={props.sampleFareOf(zone.id)} />)
              : shownPhone === "driver" ? <DriverOfferPreview zone={rules} money={money} country={market.id} commissionPct={props.commissionOf(zone.id)} /> : <RiderWaitingPreview zone={rules} />}
          </aside>
        </div>
      </div>

      <CopyDialog open={copyOpen} tabs={tabs} onClose={() => setCopyOpen(false)} from={rules} zones={zones.filter((item) => item.id !== zone.id && canEdit(item.id))} rulesOf={rulesOf} onApply={(ids, parts) => {
        for (const id of ids) onRules(id, copyParts(rules, rulesOf(id), parts));
        props.onNotice(tr("Copied {0} part{1} from {2} to {3} zone{4}. Not live yet.", [parts.length, parts.length === 1 ? "" : "s", zone.name, ids.length, ids.length === 1 ? "" : "s"]));
        setCopyOpen(false);
      }} />
      <PresetDialog open={presetOpen} onClose={() => setPresetOpen(false)} book={book} zone={rules} zoneName={zone.name} countryId={market.id} agentId={props.agentId} onUse={(next, name) => {
        onRules(zone.id, next);
        props.onNotice(tr("Preset {0} used for {1}. Not live yet.", [name, zone.name]));
        setPresetOpen(false);
      }} onSaved={(name) => props.onNotice(tr("Preset {0} saved.", [name]))} />
    </div>
  );
}

function CopyDialog({ open, tabs, onClose, from, zones, onApply }: { open: boolean; tabs: { id: TabId; label: string }[]; onClose: () => void; from: ZoneDispatch; zones: MarketZone[]; rulesOf: (zoneId: string) => ZoneDispatch; onApply: (zoneIds: string[], parts: TabId[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const [parts, setParts] = useState<TabId[]>(tabs.map((item) => item.id));
  void from;
  return (
    <Modal open={open} title={tr("Copy to other zones")} onClose={onClose}>
      <p className="dx-modal-help">{tr("Pick the zones and the parts to copy. The other zones get the same settings. Nothing goes live until you publish.")}</p>
      <h5 className="dx-modal-h">{tr("Zones")}</h5>
      <div className="zn-chips">
        {zones.map((zone) => (
          <label key={zone.id} className={ids.includes(zone.id) ? "check-chip on" : "check-chip"}>
            <input type="checkbox" checked={ids.includes(zone.id)} onChange={() => setIds(ids.includes(zone.id) ? ids.filter((id) => id !== zone.id) : [...ids, zone.id])} />{zone.name}
          </label>
        ))}
      </div>
      <h5 className="dx-modal-h">{tr("Parts")}</h5>
      <div className="zn-chips">
        {tabs.map((item) => (
          <label key={item.id} className={parts.includes(item.id) ? "check-chip on" : "check-chip"}>
            <input type="checkbox" checked={parts.includes(item.id)} onChange={() => setParts(parts.includes(item.id) ? parts.filter((id) => id !== item.id) : [...parts, item.id])} />{trx(item.label)}
          </label>
        ))}
      </div>
      <div className="dx-modal-actions">
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn ghost" onClick={onClose}>{tr("Cancel")}</button>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn" disabled={!ids.length || !parts.length} onClick={() => { onApply(ids, parts); setIds([]); }}>{trn("Copy to {0} zone{1}", ids.length, ids.length === 1 ? "" : tr("s"))}</button>
      </div>
    </Modal>
  );
}

function PresetDialog({ open, onClose, book, zone, zoneName, countryId, agentId, onUse, onSaved }: { open: boolean; onClose: () => void; book: DispatchBook; zone: ZoneDispatch; zoneName: string; countryId: Market["id"]; agentId: string; onUse: (next: ZoneDispatch, name: string) => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const presets = [...BUILT_IN_PRESETS, ...book.presets];
  const saved = presetFrom(zone, name.trim(), `P-${book.draftRev + 1}`);
  return (
    <Modal open={open} title={tr("Presets")} onClose={onClose}>
      <p className="dx-modal-help">{trn("Start from a ready-made set of rules. It replaces the settings of {0}; nothing goes live until you publish.", zoneName)}</p>
      <ul className="dx-presets" aria-label={tr("Presets")}>
        {presets.map((preset) => (
          <li key={preset.id}>
            <span><b>{preset.name}</b><small>{preset.note}</small></span>
            {preset.builtIn ? <span className="dx-tag">{tr("Ready-made")}</span> : <span className="dx-tag mine">{tr("Yours")}</span>}
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" onClick={() => onUse(applyPreset(zone, preset, countryId), preset.name)}>{tr("Use")}</button>
          </li>
        ))}
      </ul>
      <h5 className="dx-modal-h">{trn("Save {0}'s settings as a preset", zoneName)}</h5>
      <div className="dx-modal-row">
        <label className="field">{trn("Preset name{0}", <input aria-label={tr("Preset name")} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder={tr("For example Weekend nights")} />)}</label>
        <CommandButton command="admin.dispatch.preset" className="dash-btn" targetId={name.trim() || "preset"} confirmTarget={false} scope="all" before={`${book.presets.length} presets`} after={`${book.presets.length + 1} presets`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={{ ...book, draftRev: book.draftRev + 1, presets: [...book.presets, { ...saved, note: `${saved.note} by ${agentId}` }] }} disabled={!name.trim() || presets.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())} onDone={() => { onSaved(name.trim()); setName(""); }}>{tr("Save preset")}</CommandButton>
      </div>
    </Modal>
  );
}
