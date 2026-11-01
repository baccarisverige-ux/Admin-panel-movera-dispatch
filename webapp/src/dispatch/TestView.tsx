import { useMemo, useState } from "react";
import { Ban, Bell, CheckCircle2, Clock, MapPin, Play, Radar, Smartphone, Target, UserRound } from "lucide-react";
import { CATEGORIES } from "../domain/contract";
import type { Market, MarketZone } from "../markets/markets";
import { PLACES } from "../zones/cities";
import { Check, Choice, Switch } from "./fields";
import { MapPanel, TestMap } from "./maps";
import { EXTRAS, modeLabel, modeNow, rankDrivers, simulate, withEvent, type Control, type DispatchEvent, type CountryDispatch, type DriverFacts, type ExtraId, type TestRequest, type ZoneDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";

type Props = {
  market: Market;
  zones: MarketZone[];
  zoneId: string;
  onZone: (zoneId: string) => void;
  draftOf: (zoneId: string) => ZoneDispatch;
  liveOf: (zoneId: string) => ZoneDispatch;
  countryDraft: CountryDispatch;
  countryLive: CountryDispatch;
  controlOf: (zoneId: string) => Control | undefined;
  factsFor: (pickup: [number, number]) => DriverFacts[];
  busyOf: (zoneId: string) => number;
  hhmm: string;
  hasChanges: boolean;
  events: DispatchEvent[];
};

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

/** Put a fake ride on the map and see which drivers would get it, in what order, and why. */
export function TestView({ market, zones, zoneId, onZone, draftOf, liveOf, countryDraft, countryLive, controlOf, factsFor, busyOf, hhmm, hasChanges, events }: Props) {
  const zone = zones.find((item) => item.id === zoneId) ?? zones[0];
  const [which, setWhich] = useState<"draft" | "live">(hasChanges ? "draft" : "live");
  const [pickup, setPickup] = useState<[number, number] | null>(zone ? [zone.center[0], zone.center[1]] : null);
  const [category, setCategory] = useState("economy");
  const [extras, setExtras] = useState<ExtraId[]>([]);
  const [womenOnly, setWomenOnly] = useState(false);
  const [tripKm, setTripKm] = useState(8);
  const [showOut, setShowOut] = useState(false);
  const [eventId, setEventId] = useState("");
  const base = zone ? (which === "draft" ? draftOf(zone.id) : liveOf(zone.id)) : null;
  const picked = events.find((event) => event.id === eventId) ?? null;
  const applied = base && pickup ? withEvent(base, picked, pickup) : { rules: base, event: null };
  const rules = applied.rules;
  const country = which === "draft" ? countryDraft : countryLive;
  const facts = useMemo(() => (pickup ? factsFor(pickup) : []), [pickup, factsFor]);
  const request: TestRequest | null = zone && pickup ? { zoneId: zone.id, at: pickup, category, extras: tripKm >= (rules?.longTripKm ?? 50) ? [...extras, "long_trip"] : extras, womenOnly, tripKm, blocked: facts[2] ? [facts[2].id] : [] } : null;
  const ranked = useMemo(() => (rules && request ? rankDrivers(rules, country, request, facts) : []), [rules, country, request?.zoneId, request?.at[0], request?.at[1], category, extras.join(","), womenOnly, tripKm, facts]);
  const rawMode = rules && zone ? modeNow(rules, applied.event ? undefined : controlOf(zone.id), busyOf(zone.id), applied.event ? applied.event.from.slice(11, 16) : hhmm) : null;
  const mode = rawMode && applied.event ? { ...rawMode, why: `Event ${applied.event.name}: ${modeLabel(applied.event.mode)}${applied.event.mode === "radar" ? ` with ${applied.event.radarDrivers} drivers` : ""}.` } : rawMode;
  const steps = rules && mode ? simulate(rules, ranked, mode.mode) : [];
  const able = ranked.filter((row) => !row.out);
  const out = ranked.filter((row) => row.out);
  const highlight = mode?.mode === "radar" ? rules?.radar.drivers ?? 5 : rules?.exclusive.drivers ?? 3;
  const places = PLACES.filter((place) => Math.abs(place.lat - market.center[0]) < 1.2 && Math.abs(place.lng - market.center[1]) < 1.6);

  if (!zone || !rules) return <p className="dx-calm">{tr("No zone to test in this country.")}</p>;

  return (
    <div className="dx-test">
      <section className="dx-test-form dash-card" aria-label={tr("Fake ride")}>
        <h3>{trn("{0} Test a ride", <Play size={15} aria-hidden="true" />)}</h3>
        <p className="dx-modal-help">{tr("Nothing is sent to drivers. Click the map to put the pickup, or pick a place.")}</p>
        <label className="field">{trn("Zone{0}", <select aria-label={tr("Test zone")} value={zone.id} onChange={(event) => { const next = zones.find((item) => item.id === event.target.value); onZone(event.target.value); if (next) setPickup([next.center[0], next.center[1]]); }}>
            {zones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>)}</label>
        <label className="field">{trn("Pickup place{0}", <select aria-label={tr("Test pickup place")} value="" onChange={(event) => { const hit = places.find((item) => item.name === event.target.value); if (hit) setPickup([hit.lat, hit.lng]); }}>
            <option value="">{pickup ? tr("Map point {0}, {1}", [pickup[0].toFixed(4), pickup[1].toFixed(4)]) : tr("Pick a place")}</option>
            {places.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>)}</label>
        <label className="field">{trn("Category{0}", <select aria-label={tr("Test category")} value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
          </select>)}</label>
        <label className="field">{trn("Trip length{0}", <span className="dx-inline"><input type="range" min={1} max={120} aria-label={tr("Test trip length")} value={tripKm} onChange={(event) => setTripKm(Number(event.target.value))} /><b>{trn("{0} km", tripKm)}</b></span>)}</label>
        <div className="field">{trn("The rider asks for{0}", <span className="zn-chips">
            {EXTRAS.filter((extra) => extra.id !== "long_trip").map((extra) => <Check key={extra.id} label={trx(extra.label)} on={extras.includes(extra.id)} onChange={(on) => setExtras(on ? [...extras, extra.id] : extras.filter((id) => id !== extra.id))} />)}
          </span>)}</div>
        <div className="dx-row"><span className="dx-row-text"><b>{tr("Woman driver only")}</b></span><Switch label={tr("Woman driver only")} on={womenOnly} onChange={setWomenOnly} /></div>
        {events.length ? (
          <label className="field">{trn("When{0}", <select aria-label={tr("Test time")} value={eventId} onChange={(event) => { setEventId(event.target.value); const hit = events.find((item) => item.id === event.target.value); if (hit && hit.ring.length) setPickup([hit.ring.reduce((sum, point) => sum + point[0], 0) / hit.ring.length, hit.ring.reduce((sum, point) => sum + point[1], 0) / hit.ring.length]); }}>
              <option value="">{tr("Now")}</option>
              {events.map((item) => <option key={item.id} value={item.id}>{trn("During {0}", item.name)}</option>)}
            </select>)}</label>
        ) : null}
        {picked && !applied.event ? <p className="dx-note">{trn("The pickup is outside the event area{0}. Normal rules are used.", picked.on ? "" : tr(", or the event is off"))}</p> : null}
        <div className="field">{trn("Rules to test{0}", <Choice label={tr("Rules to test")} value={which} onChange={setWhich} options={[{ id: "draft", label: hasChanges ? tr("My changes") : tr("My changes (none)") }, { id: "live", label: tr("Live now") }]} />)}</div>
      </section>

      <div className="dx-test-main">
        <MapPanel title={tr("Test map")} note={<span className="dx-legend">{trn("{0} Pickup {1} Gets the offer first {2} Can take it {3} Cannot take it {4} Search steps", <i className="pickup-pin" />, <i className="top" />, <i className="free" />, <i className="out" />, <i className="ring" />)}</span>}>
          <TestMap market={market} pickup={pickup} ranked={ranked} steps={rules.radius.steps} highlight={highlight} onPick={setPickup} />
        </MapPanel>

        <section className="dash-card dx-test-result" aria-label={tr("Test result")}>
          <div className="dx-test-mode">
            {mode?.mode === "radar" ? <Radar size={18} aria-hidden="true" /> : mode?.mode === "exclusive" ? <Target size={18} aria-hidden="true" /> : <Ban size={18} aria-hidden="true" />}
            <span><b>{mode?.mode ? tr("{0} first", [modeLabel(mode.mode)]) : tr("No offer")}</b><small>{trx(mode?.why)}</small></span>
            <span className="dx-tag">{which === "draft" ? tr("My changes") : tr("Live rules")}</span>
          </div>

          {rules.start.mode === "both" || rules.start.mode === "byDistance" ? <p className="dx-note" data-testid="test-start-note">{tr("The test shows one mode at a time. Start & order “{0}” is not simulated here: the server decides it on the first round.", [rules.start.mode === "both" ? tr("Both at the same time") : tr("By distance")])}</p> : null}
          <h4>{tr("Who gets it, in order")}</h4>
          {able.length === 0 ? <p className="dx-calm">{tr("No driver can take this ride. See why below.")}</p> : (
            <ol className="dx-ranked" aria-label={tr("Drivers in order")}>
              {able.slice(0, 10).map((row, index) => (
                <li key={row.driver.id} className={index < highlight ? "top" : undefined}>
                  <span className="dx-rank">{index + 1}</span>
                  <span className="dx-ranked-main">
                    <b>{row.driver.name}</b>
                    <small>{trn("{0} km · {1} min{2}{3}", row.km, row.etaMin, row.driver.finishing ? tr(" · finishing a ride in {0} min", [row.driver.finishing.inMin]) : "", row.driver.queuePos ? tr(" · queue #{0}", [row.driver.queuePos]) : "")}</small>
                    <span className="dx-parts">{row.parts.map((part) => <i key={part.label}>{trx(part.label)} <em>+{part.points}</em></i>)}</span>
                  </span>
                  <span className="dx-score" aria-label={tr("Score {0}", [row.score])}><i style={{ width: `${Math.min(100, row.score)}%` }} /><b>{row.score}</b></span>
                </li>
              ))}
            </ol>
          )}
          <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" aria-expanded={showOut} onClick={() => setShowOut((value) => !value)}>{trn("{0} drivers who cannot take it ({1})", showOut ? tr("Hide") : tr("Show"), out.length)}</button>
          {showOut ? (
            <ul className="dx-out" aria-label={tr("Drivers who cannot take it")}>
              {out.map((row) => <li key={row.driver.id}><Ban size={12} aria-hidden="true" /> <b>{row.driver.name}</b> <span>{row.out}</span></li>)}
            </ul>
          ) : null}

          <h4>{tr("If nobody accepts")}</h4>
          <ol className="dx-sim" aria-label={tr("What happens second by second")}>
            {steps.map((step, index) => (
              <li key={`${step.atSec}-${index}`} className={step.who}>
                <span className="dx-sim-time">{clock(step.atSec)}</span>
                <span className="dx-sim-icon" aria-hidden="true">{step.who === "rider" ? <Smartphone size={13} /> : step.who === "admin" ? <Bell size={13} /> : step.who === "driver" ? <UserRound size={13} /> : step.title === "Search stops" ? <Clock size={13} /> : <CheckCircle2 size={13} />}</span>
                <span><b>{trx(step.title)}</b><small>{trx(step.detail)}</small></span>
              </li>
            ))}
          </ol>
          <p className="fine-print">{trn("{0} Driver positions and facts are demo data. The rules are the real ones.", <MapPin size={11} aria-hidden="true" />)}</p>
        </section>
      </div>
    </div>
  );
}
