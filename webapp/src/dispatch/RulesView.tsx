import { useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, Flag, CalendarClock, CheckCircle2, Clock, Copy, Gauge, Layers, MapPin, Pause, Plane, Radar, Shield, Smartphone, Star, Target, Timer, TrendingDown, TrendingUp, Users, Wand2 } from "lucide-react";
import type { Market, MarketZone } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { Modal } from "../ui/Modal";
import { beforeAfter, zoneResults } from "./demo";
import { ZoneSettings } from "./ZoneSettings";
import type { WaitBaseRow } from "./PickupWaitCard";
import { DriverOfferPreview, ReservationDriverPreview, ReservationRiderPreview, RiderWaitingPreview } from "./Previews";
import {
  applyPreset, BUILT_IN_PRESETS, copyParts, DISPATCH_KEY, liveRules, mainMode, modeLabel, modeNow, presetFrom, TABS, zoneIssues,
  type CountryDispatch, type DispatchBook, type TabId, type ZoneDispatch,
} from "./rules";

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
};

const TAB_ICON: Record<TabId, typeof Radar> = { modes: Radar, reservations: CalendarClock, best: Star, waiting: Smartphone, rides: MapPin, drivers: Users, destination: Flag, safety: Shield, alerts: Bell };

function ModeBadge({ zone, paused }: { zone: ZoneDispatch; paused: boolean }) {
  if (paused) return <span className="dx-mode-tag paused"><Pause size={10} aria-hidden="true" /> Paused</span>;
  const mode = mainMode(zone);
  return <span className={`dx-mode-tag ${mode}`}>{mode === "auto" ? <><Gauge size={10} aria-hidden="true" /> Automatic</> : mode === "radar" ? <><Radar size={10} aria-hidden="true" /> Radar</> : <><Target size={10} aria-hidden="true" /> Exclusive</>}</span>;
}

export function RulesView(props: Props) {
  const { book, market, zones, zoneId, onZone, tab, onTab, rulesOf, onRules, changed, canEdit, busyOf, hhmm, money, symbol } = props;
  const [copyOpen, setCopyOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [phone, setPhone] = useState<"auto" | "driver" | "rider">("auto");
  const zone = zones.find((item) => item.id === zoneId) ?? null;
  const groups = Array.from(new Set(zones.map((item) => (item.kind === "airport" ? "Airports" : item.city)))).map((label) => ({ label, zones: zones.filter((item) => (item.kind === "airport" ? "Airports" : item.city) === label) }));

  const rail = (
    <nav className={zone ? "dx-rail has-zone" : "dx-rail"} aria-label="Zones">
      <p className="dx-rail-help">Pick a zone to see and change its dispatch rules.</p>
      {groups.map((group) => (
        <div key={group.label} className="dx-rail-group">
          <h4>{group.label === "Airports" ? <Plane size={12} aria-hidden="true" /> : <MapPin size={12} aria-hidden="true" />} {group.label}</h4>
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
                      {changed.has(item.id) ? <span className="dx-dot changed" title="Changed, not live yet">Changed</span> : null}
                      {waiting ? <span className="dx-dot waiting" title="Waiting for a second admin">Waiting</span> : null}
                      {zoneIssues(rules).length ? <AlertTriangle size={13} className="dx-warn" aria-label="Has a problem" /> : null}
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
          <b>Pick a zone on the left</b>
          <p>{tab === "reservations" ? "Each zone has its own reservation rules. The reservation policy for all zones is there too." : "Each zone has its own rules: Radar, Exclusive, reservations, the best driver, what the rider sees while waiting, and more."}</p>
        </div>
      </div>
    );
  }

  const rules = rulesOf(zone.id);
  const issues = zoneIssues(rules);
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
      <div className="dx-zone" aria-label={`${zone.name} rules`}>
        <header className="dx-zone-head">
          <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost dx-back-zones" onClick={() => onZone(null)}><ArrowLeft size={14} aria-hidden="true" /> All zones</button>
          <div className="dx-zone-title">
            <h3>{zone.name} <code>{zone.id}</code></h3>
            <p>{zone.kind === "airport" ? "Airport" : zone.city} · New requests now: <b>{now.mode ? modeLabel(now.mode) : "none"}</b> · {now.why}</p>
          </div>
          <div className="dx-zone-actions">
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => setPresetOpen(true)}><Wand2 size={14} aria-hidden="true" /> Presets</button>
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => setCopyOpen(true)}><Copy size={14} aria-hidden="true" /> Copy to other zones</button>
          </div>
        </header>

        <section className="dx-results" aria-label={`${zone.name} results today`}>
          <div><Timer size={15} aria-hidden="true" /><span><b>{results.findSec} s</b><small>Time to find a driver</small></span>{changed.has(zone.id) ? delta(results.findSec, preview.findSec, true) : null}</div>
          <div><CheckCircle2 size={15} aria-hidden="true" /><span><b>{results.acceptedPct}%</b><small>Requests accepted</small></span>{changed.has(zone.id) ? delta(results.acceptedPct, preview.acceptedPct, false) : null}</div>
          <div className="warn"><AlertTriangle size={15} aria-hidden="true" /><span><b>{results.noDriverPct}%</b><small>No driver found</small></span>{changed.has(zone.id) ? delta(results.noDriverPct, preview.noDriverPct, true) : null}</div>
          <div><Clock size={15} aria-hidden="true" /><span><b>{results.pickupMin} min</b><small>Average pickup time</small></span>{changed.has(zone.id) ? delta(results.pickupMin, preview.pickupMin, true) : null}</div>
          <div><Radar size={15} aria-hidden="true" /><span><b>{results.radarPct}% · {results.exclusivePct}%</b><small>Accepted on Radar · Exclusive</small></span></div>
          {compare ? (
            <p className="dx-compare" aria-label="Before and after the last publish">
              Last publish {compare.at.slice(0, 16).replace("T", " ")}: time to find a driver {compare.before.findSec} s → <b>{compare.after.findSec} s</b>, no driver {compare.before.noDriverPct}% → <b>{compare.after.noDriverPct}%</b>
            </p>
          ) : null}
          {changed.has(zone.id) ? <p className="dx-compare soft">Small arrows show the expected effect of your changes.</p> : null}
        </section>

        <div className="dx-tabs" role="tablist" aria-label="Zone settings">
          {TABS.map((item) => {
            const Icon = TAB_ICON[item.id];
            return <button data-command="admin.dispatch.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => onTab(item.id)}><Icon size={14} aria-hidden="true" /> {item.label}</button>;
          })}
        </div>

        {!editable ? <p className="dx-readonly" role="status">You can view these rules. Only Super admin and Operations can change dispatch in their own zones.</p> : null}
        {issues.length ? <ul className="dx-issues" role="alert">{issues.map((line) => <li key={line}><AlertTriangle size={13} aria-hidden="true" /> {line}</li>)}</ul> : null}

        <div className="dx-zone-body">
          <div className="dx-zone-main" role="tabpanel" aria-label={TABS.find((item) => item.id === tab)?.label}>
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
              onWaitAllZones={(pickupWait) => {
                const targets = zones.filter((item) => canEdit(item.id));
                for (const item of targets) onRules(item.id, { ...rulesOf(item.id), pickupWait: JSON.parse(JSON.stringify(pickupWait)) as typeof pickupWait });
                return targets.length;
              }}
            />
          </div>
          <aside className="dx-zone-side" aria-label="Phone preview">
            <div className="ra-switch" role="tablist" aria-label="Which phone">
              <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shownPhone === "driver"} className={shownPhone === "driver" ? "active" : undefined} onClick={() => setPhone("driver")}>Driver app</button>
              <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shownPhone === "rider"} className={shownPhone === "rider" ? "active" : undefined} onClick={() => setPhone("rider")}>Rider app</button>
            </div>
            {tab === "reservations"
              ? (shownPhone === "driver" ? <ReservationDriverPreview zone={rules} money={money} country={market.id} /> : <ReservationRiderPreview zone={rules} money={money} />)
              : shownPhone === "driver" ? <DriverOfferPreview zone={rules} money={money} country={market.id} commissionPct={props.commissionOf(zone.id)} /> : <RiderWaitingPreview zone={rules} />}
          </aside>
        </div>
      </div>

      <CopyDialog open={copyOpen} onClose={() => setCopyOpen(false)} from={rules} zones={zones.filter((item) => item.id !== zone.id && canEdit(item.id))} rulesOf={rulesOf} onApply={(ids, parts) => {
        for (const id of ids) onRules(id, copyParts(rules, rulesOf(id), parts));
        props.onNotice(`Copied ${parts.length} part${parts.length === 1 ? "" : "s"} from ${zone.name} to ${ids.length} zone${ids.length === 1 ? "" : "s"}. Not live yet.`);
        setCopyOpen(false);
      }} />
      <PresetDialog open={presetOpen} onClose={() => setPresetOpen(false)} book={book} zone={rules} zoneName={zone.name} countryId={market.id} agentId={props.agentId} onUse={(next, name) => {
        onRules(zone.id, next);
        props.onNotice(`Preset ${name} used for ${zone.name}. Not live yet.`);
        setPresetOpen(false);
      }} onSaved={(name) => props.onNotice(`Preset ${name} saved.`)} />
    </div>
  );
}

function CopyDialog({ open, onClose, from, zones, onApply }: { open: boolean; onClose: () => void; from: ZoneDispatch; zones: MarketZone[]; rulesOf: (zoneId: string) => ZoneDispatch; onApply: (zoneIds: string[], parts: TabId[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const [parts, setParts] = useState<TabId[]>(TABS.map((item) => item.id));
  void from;
  return (
    <Modal open={open} title="Copy to other zones" onClose={onClose}>
      <p className="dx-modal-help">Pick the zones and the parts to copy. The other zones get the same settings. Nothing goes live until you publish.</p>
      <h5 className="dx-modal-h">Zones</h5>
      <div className="zn-chips">
        {zones.map((zone) => (
          <label key={zone.id} className={ids.includes(zone.id) ? "check-chip on" : "check-chip"}>
            <input type="checkbox" checked={ids.includes(zone.id)} onChange={() => setIds(ids.includes(zone.id) ? ids.filter((id) => id !== zone.id) : [...ids, zone.id])} />{zone.name}
          </label>
        ))}
      </div>
      <h5 className="dx-modal-h">Parts</h5>
      <div className="zn-chips">
        {TABS.map((item) => (
          <label key={item.id} className={parts.includes(item.id) ? "check-chip on" : "check-chip"}>
            <input type="checkbox" checked={parts.includes(item.id)} onChange={() => setParts(parts.includes(item.id) ? parts.filter((id) => id !== item.id) : [...parts, item.id])} />{item.label}
          </label>
        ))}
      </div>
      <div className="dx-modal-actions">
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn ghost" onClick={onClose}>Cancel</button>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn" disabled={!ids.length || !parts.length} onClick={() => { onApply(ids, parts); setIds([]); }}>Copy to {ids.length} zone{ids.length === 1 ? "" : "s"}</button>
      </div>
    </Modal>
  );
}

function PresetDialog({ open, onClose, book, zone, zoneName, countryId, agentId, onUse, onSaved }: { open: boolean; onClose: () => void; book: DispatchBook; zone: ZoneDispatch; zoneName: string; countryId: Market["id"]; agentId: string; onUse: (next: ZoneDispatch, name: string) => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const presets = [...BUILT_IN_PRESETS, ...book.presets];
  const saved = presetFrom(zone, name.trim(), `P-${book.draftRev + 1}`);
  return (
    <Modal open={open} title="Presets" onClose={onClose}>
      <p className="dx-modal-help">Start from a ready-made set of rules. It replaces the settings of {zoneName}; nothing goes live until you publish.</p>
      <ul className="dx-presets" aria-label="Presets">
        {presets.map((preset) => (
          <li key={preset.id}>
            <span><b>{preset.name}</b><small>{preset.note}</small></span>
            {preset.builtIn ? <span className="dx-tag">Ready-made</span> : <span className="dx-tag mine">Yours</span>}
            <button data-command="admin.dispatch.edit" type="button" className="dash-btn small" onClick={() => onUse(applyPreset(zone, preset, countryId), preset.name)}>Use</button>
          </li>
        ))}
      </ul>
      <h5 className="dx-modal-h">Save {zoneName}'s settings as a preset</h5>
      <div className="dx-modal-row">
        <label className="field">Preset name<input aria-label="Preset name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="For example Weekend nights" /></label>
        <CommandButton command="admin.dispatch.preset" className="dash-btn" targetId={name.trim() || "preset"} confirmTarget={false} scope="all" before={`${book.presets.length} presets`} after={`${book.presets.length + 1} presets`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={{ ...book, draftRev: book.draftRev + 1, presets: [...book.presets, { ...saved, note: `${saved.note} by ${agentId}` }] }} disabled={!name.trim() || presets.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())} onDone={() => { onSaved(name.trim()); setName(""); }}>
          Save preset
        </CommandButton>
      </div>
    </Modal>
  );
}
