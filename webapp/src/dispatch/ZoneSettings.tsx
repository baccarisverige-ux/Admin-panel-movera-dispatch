import { RideCheckCard } from "./RideCheckCard";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowDown, ArrowUp, Baby, Bell, Clock, Gauge, Heart, Home, Layers, ListOrdered, Luggage, Mail, MapPin, MessageSquare,
  MonitorSmartphone, Moon, Power, PawPrint, Plane, Plus, Radar, Route, Scale, Shield, ShieldAlert, Smartphone, Sparkles, Star, Target, Timer, Trash2,
  TrendingUp, UserCheck, UserX, Users, Accessibility, Zap,
} from "lucide-react";
import type { MarketId } from "../markets/markets";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import { Card, Check, Choice, Num, Row, Switch } from "./fields";
import { ReservationSettings } from "./ReservationSettings";
import { DestinationSettings } from "./DestinationSettings";
import { CancelRateCard, OfferCardSettings } from "./OfferSettings";
import { PickupWaitCard, type WaitBaseRow } from "./PickupWaitCard";
import type { PickupWait } from "./offers";
import {
  ALERTS, EXTRAS, FACTORS, modeLabel, WAIT_KINDS,
  type CountryDispatch, type DriverGroup, type ExtraId, type OfferMode, type TabId, type WaitKind, type WaitStep, type ZoneDispatch,
} from "./rules";

const EXTRA_ICON: Record<ExtraId, ReactNode> = {
  child_seat: <Baby size={15} />, pet: <PawPrint size={15} />, wheelchair: <Accessibility size={15} />, luggage: <Luggage size={15} />, long_trip: <Route size={15} />,
};

export const WAIT_ICON: Record<WaitKind, ReactNode> = {
  raise_price: <TrendingUp size={15} />, upgrade: <Sparkles size={15} />, alert_admin: <Bell size={15} />, keep_waiting: <Clock size={15} />, busy: <Moon size={15} />,
};

type Props = {
  tab: TabId;
  zone: ZoneDispatch;
  onChange: (next: ZoneDispatch) => void;
  country: CountryDispatch;
  onCountry: (next: CountryDispatch) => void;
  countryName: string;
  countryId: MarketId;
  airport: boolean;
  zoneName: string;
  symbol: string;
  busy: number;
  disabled: boolean;
  money: (value: number) => string;
  /** Saved driver groups of this country (Events & groups). */
  groups: DriverGroup[];
  /** Movera's commission for a normal ride in this zone (Pricing) and a sample booked-ride fare, for the fare raise check. */
  commissionPct: number;
  sampleFare: number;
  /** Waiting at pickup per category, from Pricing for this zone. */
  waitBases: WaitBaseRow[];
  onWaitAllZones: (pickupWait: PickupWait) => number;
};

export function ZoneSettings(props: Props) {
  const { tab } = props;
  if (tab === "modes") return <Modes {...props} />;
  if (tab === "reservations") return <ReservationSettings zone={props.zone} onChange={props.onChange} disabled={props.disabled} symbol={props.symbol} money={props.money} countryId={props.countryId} countryName={props.countryName} groups={props.groups} commissionPct={props.commissionPct} sampleFare={props.sampleFare} />;
  if (tab === "best") return <Best {...props} />;
  if (tab === "waiting") return <Waiting {...props} />;
  if (tab === "rides") return <Rides {...props} />;
  if (tab === "drivers") return <Drivers {...props} />;
  if (tab === "destination") return <DestinationSettings zone={props.zone} onChange={props.onChange} disabled={props.disabled} zoneName={props.zoneName} />;
  if (tab === "safety") return <Safety {...props} />;
  return <Alerts {...props} />;
}

function Modes({ zone, onChange, busy, disabled }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  const choose = zone.choose;
  return (
    <div className="dx-cards">
      <Card title="Radar" tone="purple" icon={<Radar size={18} />} help="One request is shown to several nearby drivers at once. The first to accept gets it." off={!zone.radar.on} aside={<Switch label="Radar" on={zone.radar.on} disabled={disabled} onChange={(on) => set({ radar: { ...zone.radar, on } })} />}>
        <Row label="Drivers who see it" help="The nearest suitable drivers, all at the same time.">
          <Num label="Radar drivers" value={zone.radar.drivers} unit="drivers" min={1} max={30} disabled={disabled || !zone.radar.on} onChange={(drivers) => set({ radar: { ...zone.radar, drivers } })} />
        </Row>
        <Row label="Time on the radar" help="How long the request stays before the next step.">
          <Num label="Radar time" value={zone.radar.seconds} unit="s" min={5} max={120} disabled={disabled || !zone.radar.on} onChange={(seconds) => set({ radar: { ...zone.radar, seconds } })} />
        </Row>
        <Row label="If nobody accepts">
          <Choice label="After Radar" value={zone.radar.then} disabled={disabled || !zone.radar.on} onChange={(then) => set({ radar: { ...zone.radar, then } })} options={[{ id: "widen", label: "Wider area" }, { id: "exclusive", label: "Exclusive" }, { id: "widen_then_exclusive", label: "Wider area, then Exclusive" }]} />
        </Row>
      </Card>

      <Card title="Exclusive" tone="blue" icon={<Target size={18} />} help="One request goes to one driver at a time, the best first." off={!zone.exclusive.on} aside={<Switch label="Exclusive" on={zone.exclusive.on} disabled={disabled} onChange={(on) => set({ exclusive: { ...zone.exclusive, on } })} />}>
        <Row label="Time to accept" help="Each driver has this long to say yes.">
          <Num label="Exclusive time" value={zone.exclusive.seconds} unit="s" min={5} max={60} disabled={disabled || !zone.exclusive.on} onChange={(seconds) => set({ exclusive: { ...zone.exclusive, seconds } })} />
        </Row>
        <Row label="Drivers to try" help="One after the other, before the next step.">
          <Num label="Exclusive drivers" value={zone.exclusive.drivers} unit="drivers" min={1} max={10} disabled={disabled || !zone.exclusive.on} onChange={(drivers) => set({ exclusive: { ...zone.exclusive, drivers } })} />
        </Row>
        <Row label="If all say no">
          <Choice label="After Exclusive" value={zone.exclusive.then} disabled={disabled || !zone.exclusive.on} onChange={(then) => set({ exclusive: { ...zone.exclusive, then } })} options={[{ id: "radar", label: "Radar" }, { id: "widen", label: "Wider area" }, { id: "widen_then_radar", label: "Wider area, then Radar" }]} />
        </Row>
        <Row label="Exclusive while driving" help="Offers for the next ride during a trip. Only Exclusive, never Radar. Off: no offers while driving a rider." on={zone.exclusiveWhileDriving.on} disabled={disabled || !zone.exclusive.on} onToggle={(on) => set({ exclusiveWhileDriving: { ...zone.exclusiveWhileDriving, on } })}>
          <Num label="Exclusive offers while driving" before="up to" value={zone.exclusiveWhileDriving.count} unit="at a time" min={1} max={5} disabled={disabled || !zone.exclusive.on} onChange={(count) => set({ exclusiveWhileDriving: { ...zone.exclusiveWhileDriving, count } })} />
        </Row>
      </Card>

      <OfferCardSettings zone={zone} onChange={onChange} disabled={disabled} />

      <Card title="Radar in the driver app" tone="purple" icon={<Smartphone size={18} />} help="How many Radar offers one driver sees at the same time." off={!zone.radar.on}>
        <Row label="Full-screen radar" help="When the driver opens the radar screen." on={zone.radarApp.fullOn} disabled={disabled || !zone.radar.on} onToggle={(fullOn) => set({ radarApp: { ...zone.radarApp, fullOn } })}>
          <Num label="Offers on full-screen radar" before="up to" value={zone.radarApp.full} unit="offers" min={1} max={20} disabled={disabled || !zone.radar.on} onChange={(full) => set({ radarApp: { ...zone.radarApp, full } })} />
        </Row>
        <Row label="Popup over the map" help="Small offer cards while the driver waits on the map." on={zone.radarApp.popupOn} disabled={disabled || !zone.radar.on} onToggle={(popupOn) => set({ radarApp: { ...zone.radarApp, popupOn } })}>
          <Num label="Offers in the popup" before="up to" value={zone.radarApp.popup} unit="offers" min={1} max={5} disabled={disabled || !zone.radar.on} onChange={(popup) => set({ radarApp: { ...zone.radarApp, popup } })} />
        </Row>
        <Row label="Hidden with ×: comes back after" help="A trip the driver hid in the Live list can come back if nobody took it and it is still in Radar. It never counts against the driver.">
          <Num label="Hidden Radar trip comes back after" value={zone.hiddenComesBackMin} unit="min" min={1} max={60} disabled={disabled || !zone.radar.on} onChange={(hiddenComesBackMin) => set({ hiddenComesBackMin })} />
        </Row>
        <p className="dx-note"><Route size={13} aria-hidden="true" /> No Radar offers while driving a rider. Only Exclusive offers come during a trip.</p>
      </Card>

      <Card title="Which mode runs" tone="green" icon={<Gauge size={18} />} help="Let the system choose by how busy the zone is, or choose yourself.">
        <Row label="How to choose">
          <Choice label="How the mode is chosen" value={choose.how} disabled={disabled} onChange={(how) => set({ choose: { ...choose, how } })} options={[{ id: "auto", label: "Automatic" }, { id: "manual", label: "By hand" }]} />
        </Row>
        {choose.how === "auto" ? (
          <>
            <Row label="Use Radar when busy" help="Busy = waiting requests ÷ free drivers. Below this level, Exclusive is used.">
              <Num label="Busy level for Radar" value={choose.radarAbove} unit="per driver" step={0.1} min={0.1} max={10} disabled={disabled} onChange={(radarAbove) => set({ choose: { ...choose, radarAbove } })} />
            </Row>
            <div className="dx-meter" aria-label="Busy now">
              <span>Now: <b>{busy.toFixed(1)}</b> requests per free driver</span>
              <span className={busy >= choose.radarAbove ? "dx-mode-tag radar" : "dx-mode-tag exclusive"}>{busy >= choose.radarAbove ? "Radar now" : "Exclusive now"}</span>
              <i style={{ width: `${Math.min(100, (busy / Math.max(choose.radarAbove * 2, 0.1)) * 100)}%` }} />
              <em style={{ left: "50%" }} aria-hidden="true" />
            </div>
          </>
        ) : (
          <>
            <Row label="Main mode"><Choice label="Main mode" value={choose.main} disabled={disabled} onChange={(main) => set({ choose: { ...choose, main, backup: choose.backup === main ? (main === "radar" ? "exclusive" : "radar") : choose.backup } })} options={[{ id: "radar", label: "Radar" }, { id: "exclusive", label: "Exclusive" }]} /></Row>
            <Row label="Backup mode" help="Used when the main mode finds nobody.">
              <Choice label="Backup mode" value={choose.backup} disabled={disabled} onChange={(backup) => set({ choose: { ...choose, backup } })} options={[{ id: choose.main === "radar" ? "exclusive" : "radar", label: modeLabel(choose.main === "radar" ? "exclusive" : "radar") }, { id: "none", label: "No backup" }] as { id: OfferMode | "none"; label: string }[]} />
            </Row>
          </>
        )}
        <div className="dx-sub">
          <b><Clock size={13} aria-hidden="true" /> By time of day</b>
          <small>A time rule wins over the choice above while it runs.</small>
          <ul className="dx-time-rules" aria-label="Time rules">
            {choose.times.map((rule, index) => (
              <li key={rule.id} className={rule.on ? undefined : "off"}>
                <Switch label={`Time rule ${index + 1}`} on={rule.on} disabled={disabled} onChange={(on) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, on } : item)) } })} />
                <input type="time" aria-label={`Time rule ${index + 1} from`} value={rule.from} disabled={disabled} onChange={(event) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, from: event.target.value } : item)) } })} />
                <span>to</span>
                <input type="time" aria-label={`Time rule ${index + 1} to`} value={rule.to} disabled={disabled} onChange={(event) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, to: event.target.value } : item)) } })} />
                <Choice label={`Time rule ${index + 1} mode`} value={rule.mode} disabled={disabled} onChange={(mode) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, mode } : item)) } })} options={[{ id: "radar", label: "Radar" }, { id: "exclusive", label: "Exclusive" }]} />
                <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={`Remove time rule ${index + 1}`} disabled={disabled} onClick={() => set({ choose: { ...choose, times: choose.times.filter((item) => item.id !== rule.id) } })}><Trash2 size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set({ choose: { ...choose, times: [...choose.times, { id: `t${Date.now().toString(36)}`, on: true, from: "07:00", to: "09:00", mode: "radar" }] } })}><Plus size={13} aria-hidden="true" /> Add a time rule</button>
        </div>
      </Card>

      <Card title="Whose rules" tone="pink" icon={<Scale size={18} />} help="A rider and a driver can be in different zones. Drivers are matched across zone borders.">
        <Row label="Rules come from">
          <Choice label="Whose rules" value={zone.rulesFrom} disabled={disabled} onChange={(rulesFrom) => set({ rulesFrom })} options={[{ id: "driver", label: "The driver's zone" }, { id: "pickup", label: "The pickup zone" }]} />
        </Row>
      </Card>
    </div>
  );
}

function Best({ zone, onChange, disabled }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  const total = zone.factors.filter((item) => item.on).reduce((sum, item) => sum + item.weight, 0) || 1;
  const steps = zone.radius.steps;
  return (
    <div className="dx-cards">
      <Card title="What makes the best driver" tone="purple" icon={<Star size={18} />} help="Switch each one on or off and set how much it counts. Shares add up to 100%.">
        <div className="dx-mix" aria-hidden="true">
          {zone.factors.filter((item) => item.on && item.weight > 0).map((item, index) => <i key={item.id} className={`c${index}`} style={{ flexGrow: item.weight }} title={item.id} />)}
        </div>
        {zone.factors.map((factor) => {
          const info = FACTORS.find((item) => item.id === factor.id)!;
          return (
            <Row key={factor.id} label={info.label} help={info.help} on={factor.on} disabled={disabled} onToggle={(on) => set({ factors: zone.factors.map((item) => (item.id === factor.id ? { ...item, on } : item)) })}>
              <input className="dx-range" type="range" min={0} max={100} step={5} aria-label={`${info.label} weight`} value={factor.weight} disabled={disabled} onChange={(event) => set({ factors: zone.factors.map((item) => (item.id === factor.id ? { ...item, weight: Number(event.target.value) } : item)) })} />
              <b className="dx-share">{Math.round((factor.weight / total) * 100)}%</b>
            </Row>
          );
        })}
      </Card>

      <Card title="Search distance" tone="blue" icon={<Layers size={18} />} help="The search grows step by step when nobody accepts.">
        <div className="dx-steps" role="group" aria-label="Search distance steps">
          {steps.map((km, index) => (
            <span key={index} className="dx-step">
              <small>Step {index + 1}</small>
              <Num label={`Search step ${index + 1}`} value={km} unit="km" step={0.5} min={0.5} max={50} disabled={disabled} onChange={(next) => set({ radius: { ...zone.radius, steps: steps.map((item, at) => (at === index ? next : item)) } })} />
              {steps.length > 1 ? <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={`Remove search step ${index + 1}`} disabled={disabled} onClick={() => set({ radius: { ...zone.radius, steps: steps.filter((_, at) => at !== index) } })}><Trash2 size={13} aria-hidden="true" /></button> : null}
            </span>
          ))}
          {steps.length < 5 ? <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set({ radius: { ...zone.radius, steps: [...steps, Math.min(50, (steps[steps.length - 1] ?? 3) + 3)] } })}><Plus size={13} aria-hidden="true" /> Add a step</button> : null}
        </div>
        <Row label="Longest search" help="After this, the search stops.">
          <Num label="Longest search" value={zone.radius.maxWaitMin} unit="min" min={1} max={30} disabled={disabled} onChange={(maxWaitMin) => set({ radius: { ...zone.radius, maxWaitMin } })} />
        </Row>
      </Card>

      <Card title="Smart waiting" tone="green" icon={<Zap size={18} />} help="When busy, collect requests for a few seconds and match them together for the best fit." off={!zone.batching.on} aside={<Switch label="Smart waiting" on={zone.batching.on} disabled={disabled} onChange={(on) => set({ batching: { ...zone.batching, on } })} />}>
        <Row label="Collect for"><Num label="Smart waiting seconds" value={zone.batching.seconds} unit="s" min={1} max={10} disabled={disabled || !zone.batching.on} onChange={(seconds) => set({ batching: { ...zone.batching, seconds } })} /></Row>
        <Row label="Starts when busy level is at least"><Num label="Smart waiting from busy level" value={zone.batching.fromRatio} unit="per driver" step={0.1} min={0.1} max={10} disabled={disabled || !zone.batching.on} onChange={(fromRatio) => set({ batching: { ...zone.batching, fromRatio } })} /></Row>
      </Card>

      <Card title="Drivers finishing a ride" tone="orange" icon={<Route size={18} />} help="A driver about to drop off a rider can get the next request, as an Exclusive offer only. Never Radar during a trip.">
        <Row label="On Exclusive" help="Uses Exclusive while driving in Modes." on={zone.finishing.exclusive} disabled={disabled} onToggle={(exclusive) => set({ finishing: { ...zone.finishing, exclusive } })} />
        <Row label="Finishes within"><Num label="Finishing within minutes" value={zone.finishing.withinMin} unit="min" min={1} max={15} disabled={disabled} onChange={(withinMin) => set({ finishing: { ...zone.finishing, withinMin } })} /></Row>
        <Row label="Drop-off within"><Num label="Finishing within km" value={zone.finishing.withinKm} unit="km of the pickup" step={0.5} min={0.5} max={10} disabled={disabled} onChange={(withinKm) => set({ finishing: { ...zone.finishing, withinKm } })} /></Row>
      </Card>

      <Card title="Favourite drivers" tone="pink" icon={<Heart size={18} />} help="Riders can mark a driver as a favourite. That driver gets the request first." off={!zone.favourite.on} aside={<Switch label="Favourite drivers" on={zone.favourite.on} disabled={disabled} onChange={(on) => set({ favourite: { ...zone.favourite, on } })} />}>
        <Row label="Up to"><Num label="Favourite max distance" value={zone.favourite.maxKm} unit="km away" step={0.5} min={0.5} max={20} disabled={disabled || !zone.favourite.on} onChange={(maxKm) => set({ favourite: { ...zone.favourite, maxKm } })} /></Row>
        <Row label="Wait for them"><Num label="Wait for favourite" value={zone.favourite.waitSec} unit="s" min={5} max={60} disabled={disabled || !zone.favourite.on} onChange={(waitSec) => set({ favourite: { ...zone.favourite, waitSec } })} /></Row>
      </Card>
    </div>
  );
}

function Waiting({ zone, onChange, disabled }: Props) {
  const steps = zone.waiting;
  const setSteps = (waiting: WaitStep[]) => onChange({ ...zone, waiting });
  const max = Math.max(zone.radius.maxWaitMin, ...steps.map((step) => step.afterMin), 1);
  const move = (index: number, by: number) => {
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setSteps(next);
  };
  return (
    <div className="dx-cards">
      <Card title="What the rider sees while waiting" tone="pink" icon={<Smartphone size={18} />} help="Each step shows in the rider app at its time. Switch steps on or off, change the time and the message.">
        <div className="dx-timeline" aria-label="Waiting timeline">
          <span className="dx-timeline-line" aria-hidden="true" />
          {steps.filter((step) => step.on).map((step) => (
            <span key={step.id} className={`dx-timeline-dot ${step.kind}`} style={{ left: `${(step.afterMin / max) * 100}%` }} title={`${step.afterMin} min`}>{WAIT_ICON[step.kind]}<small>{step.afterMin} min</small></span>
          ))}
          <span className="dx-timeline-end" style={{ left: "100%" }}><small>{zone.radius.maxWaitMin} min stop</small></span>
        </div>
        <ol className="dx-wait-list" aria-label="Waiting steps">
          {steps.map((step, index) => {
            const info = WAIT_KINDS.find((item) => item.id === step.kind)!;
            return (
              <li key={step.id} className={step.on ? `dx-wait ${step.kind}` : `dx-wait ${step.kind} off`}>
                <span className="dx-wait-icon" aria-hidden="true">{WAIT_ICON[step.kind]}</span>
                <span className="dx-wait-main">
                  <span className="dx-wait-top">
                    <b>{info.label}</b>
                    <Num label={`${info.label} after`} before="after" value={step.afterMin} unit="min" step={0.5} min={0} max={30} disabled={disabled} onChange={(afterMin) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, afterMin } : item)))} />
                    {step.kind === "keep_waiting" ? <Num label="Extra minutes to wait" before="wait" value={step.extraMin ?? 3} unit="more min" min={1} max={15} disabled={disabled} onChange={(extraMin) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, extraMin } : item)))} /> : null}
                  </span>
                  <small>{info.help}{step.kind === "raise_price" ? <> Price steps are set in <Link to="/pricing">Pricing</Link>.</> : null}</small>
                  <textarea aria-label={`${info.label} message`} rows={2} maxLength={160} value={step.message} disabled={disabled} onChange={(event) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, message: event.target.value } : item)))} />
                </span>
                <span className="dx-wait-tools">
                  <Switch label={info.label} on={step.on} disabled={disabled} onChange={(on) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, on } : item)))} />
                  <span>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={`Move ${info.label} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={`Move ${info.label} down`} disabled={disabled || index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={`Remove ${info.label}`} disabled={disabled} onClick={() => setSteps(steps.filter((item) => item.id !== step.id))}><Trash2 size={14} aria-hidden="true" /></button>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="dx-add-steps" role="group" aria-label="Add a waiting step">
          {WAIT_KINDS.map((kind) => (
            <button data-command="admin.dispatch.edit" key={kind.id} type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => setSteps([...steps, { id: `w${Date.now().toString(36)}`, kind: kind.id, on: true, afterMin: Math.min(30, (steps[steps.length - 1]?.afterMin ?? 0) + 1), message: kind.label, extraMin: kind.id === "keep_waiting" ? 3 : undefined }])}>
              <Plus size={12} aria-hidden="true" /> {kind.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Rides({ zone, onChange, disabled, airport, symbol, countryId, zoneName, money, waitBases, onWaitAllZones }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  return (
    <div className="dx-cards">
      <PickupWaitCard zone={zone} onChange={onChange} disabled={disabled} symbol={symbol} money={money} countryId={countryId} waitBases={waitBases} onAllZones={onWaitAllZones} />

      <Card title="Special requests" tone="purple" icon={<ListOrdered size={18} />} help="Only drivers who have it get the request. The badge shows on the driver's offer and in the rider app.">
        {zone.extras.map((extra) => {
          const info = EXTRAS.find((item) => item.id === extra.id)!;
          return (
            <Row key={extra.id} label={info.label} on={extra.on} disabled={disabled} onToggle={(on) => set({ extras: zone.extras.map((item) => (item.id === extra.id ? { ...item, on } : item)) })}>
              <span className="dx-extra-icon" aria-hidden="true">{EXTRA_ICON[extra.id]}</span>
              <Check label="Badge" on={extra.badge} disabled={disabled} onChange={(badge) => set({ extras: zone.extras.map((item) => (item.id === extra.id ? { ...item, badge } : item)) })} />
              {extra.id === "long_trip" ? <Num label="Long trip from" before="from" value={zone.longTripKm} unit="km" min={10} max={500} disabled={disabled} onChange={(longTripKm) => set({ longTripKm })} /> : null}
            </Row>
          );
        })}
      </Card>

      <Card title="Stops" tone="blue" icon={<MapPin size={18} />} help="Riders can add stops. The driver sees every stop before accepting." off={!zone.stops.on} aside={<Switch label="Stops" on={zone.stops.on} disabled={disabled} onChange={(on) => set({ stops: { ...zone.stops, on } })} />}>
        <Row label="Max stops"><Num label="Max stops" value={zone.stops.max} unit="stops" min={1} max={5} disabled={disabled || !zone.stops.on} onChange={(max) => set({ stops: { ...zone.stops, max } })} /></Row>
        <Row label="Free wait at each stop"><Num label="Free wait per stop" value={zone.stops.freeWaitMin} unit="min" min={0} max={20} disabled={disabled || !zone.stops.on} onChange={(freeWaitMin) => set({ stops: { ...zone.stops, freeWaitMin } })} /></Row>
        <Row label="Then, per minute" help="0 means no charge."><Num label="Wait price per minute" value={zone.stops.perMin} unit={`${symbol}/min`} step={0.1} min={0} max={100} disabled={disabled || !zone.stops.on} onChange={(perMin) => set({ stops: { ...zone.stops, perMin } })} /></Row>
        <Row label="Extra fee per stop" help="0 means no fee."><Num label="Fee per stop" value={zone.stops.perStop} unit={symbol} step={0.5} min={0} max={500} disabled={disabled || !zone.stops.on} onChange={(perStop) => set({ stops: { ...zone.stops, perStop } })} /></Row>
        <Row label="Rider can change the destination or add a stop during the trip" on={zone.stops.changeDuring} disabled={disabled || !zone.stops.on} onToggle={(changeDuring) => set({ stops: { ...zone.stops, changeDuring } })} />
        <Row label="Driver can accept or refuse the change" on={zone.stops.driverCanRefuse} disabled={disabled || !zone.stops.on || !zone.stops.changeDuring} onToggle={(driverCanRefuse) => set({ stops: { ...zone.stops, driverCanRefuse } })} />
      </Card>

      <Card title="Driver cancels after accepting" tone="orange" icon={<UserX size={18} />} help="It only counts in the driver's cancel rate, and the ride searches again." off={!zone.driverCancel.on} aside={<Switch label="Search again" on={zone.driverCancel.on} disabled={disabled} onChange={(on) => set({ driverCancel: { ...zone.driverCancel, on } })} />}>
        <Row label="Lower Movera's commission on that ride" help="The rider pays the same. The next driver earns more, so it is taken faster.">
          <Num label="Lower commission after a driver cancel" value={zone.driverCancel.commissionCutPct} unit="% lower" min={0} max={30} disabled={disabled || !zone.driverCancel.on} onChange={(commissionCutPct) => set({ driverCancel: { ...zone.driverCancel, commissionCutPct } })} />
        </Row>
      </Card>

      <Card title="Rider cancels: smart check" tone="green" icon={<Shield size={18} />} help="The system compares the driver's distance to the rider when they accepted and when the rider cancelled." off={!zone.riderCancel.on} aside={<Switch label="Smart cancel check" on={zone.riderCancel.on} disabled={disabled} onChange={(on) => set({ riderCancel: { ...zone.riderCancel, on } })} />}>
        <Row label="Free cancel" help="No fee inside these minutes after accept."><Num label="Free cancel minutes" value={zone.riderCancel.freeMin} unit="min" min={0} max={15} disabled={disabled || !zone.riderCancel.on} onChange={(freeMin) => set({ riderCancel: { ...zone.riderCancel, freeMin } })} /></Row>
        <Row label="Fee when the driver came closer by at least" help="If the driver did not move or went away, no fee."><Num label="Came closer by" value={zone.riderCancel.closerPct} unit="%" min={5} max={100} disabled={disabled || !zone.riderCancel.on} onChange={(closerPct) => set({ riderCancel: { ...zone.riderCancel, closerPct } })} /></Row>
        <Row label="Cancel fee" help="Paid to the driver."><Num label="Cancel fee" value={zone.riderCancel.fee} unit={symbol} step={0.5} min={0} max={1000} disabled={disabled || !zone.riderCancel.on} onChange={(fee) => set({ riderCancel: { ...zone.riderCancel, fee } })} /></Row>
        <Row label="Driver gets the next nearby request first" on={zone.riderCancel.priority} disabled={disabled || !zone.riderCancel.on} onToggle={(priority) => set({ riderCancel: { ...zone.riderCancel, priority } })}>
          <Num label="Priority minutes" value={zone.riderCancel.priorityMin} unit="min" min={1} max={60} disabled={disabled} onChange={(priorityMin) => set({ riderCancel: { ...zone.riderCancel, priorityMin } })} />
        </Row>
        <p className="dx-note"><UserCheck size={13} aria-hidden="true" /> Every decision is saved with the driver's route, so you can check it by hand in Cancel checks.</p>
      </Card>

      <Card title="Airport queue" tone="pink" icon={<Plane size={18} />} help={airport ? "Drivers wait in a queue at the airport." : "Use this when the zone has a waiting area, like an airport or a station."} off={!zone.airport.on} aside={<Switch label="Airport queue" on={zone.airport.on} disabled={disabled} onChange={(on) => set({ airport: { ...zone.airport, on } })} />}>
        <Row label="Who gets the ride">
          <Choice label="Airport order" value={zone.airport.order} disabled={disabled || !zone.airport.on} onChange={(order) => set({ airport: { ...zone.airport, order } })} options={[{ id: "fifo", label: "First in the queue" }, { id: "best", label: "Best driver by the rules" }]} />
        </Row>
        <Row label="Longest time in the queue"><Num label="Longest time in queue" value={zone.airport.maxQueueMin} unit="min" min={10} max={480} disabled={disabled || !zone.airport.on} onChange={(maxQueueMin) => set({ airport: { ...zone.airport, maxQueueMin } })} /></Row>
        {zone.airport.on ? (
          <div className="dx-sub">
            <b><MapPin size={13} aria-hidden="true" /> Queue area on the map</b>
            <small>Drivers inside this area are in the queue for {zoneName}.</small>
            <BonusAreaMap country={countryId} areas={zone.airport.queueAreas} onChange={(queueAreas) => set({ airport: { ...zone.airport, queueAreas } })} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Drivers({ zone, onChange, disabled, country, onCountry, countryName }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  return (
    <div className="dx-cards">
      <Card title="Going home" tone="green" icon={<Home size={18} />} help="Drivers can ask for rides only towards their destination." off={!zone.goingHome.on} aside={<Switch label="Going home" on={zone.goingHome.on} disabled={disabled} onChange={(on) => set({ goingHome: { ...zone.goingHome, on } })} />}>
        <Row label="Times per day"><Num label="Going home per day" value={zone.goingHome.perDay} unit="times" min={1} max={10} disabled={disabled || !zone.goingHome.on} onChange={(perDay) => set({ goingHome: { ...zone.goingHome, perDay } })} /></Row>
        <Row label="How far off the direction is OK"><Num label="Going home direction" value={zone.goingHome.maxOffDeg} unit="degrees" min={10} max={90} disabled={disabled || !zone.goingHome.on} onChange={(maxOffDeg) => set({ goingHome: { ...zone.goingHome, maxOffDeg } })} /></Row>
      </Card>

      <Card title="Fairness" tone="blue" icon={<Users size={18} />} help="Stop the same drivers from getting all the rides.">
        <Row label="Boost drivers who waited 20+ min without a ride" on={zone.fairness.idleBoost} disabled={disabled} onToggle={(idleBoost) => set({ fairness: { ...zone.fairness, idleBoost } })}>
          <Num label="Boost points" value={zone.fairness.idlePoints} unit="points" min={1} max={50} disabled={disabled} onChange={(idlePoints) => set({ fairness: { ...zone.fairness, idlePoints } })} />
        </Row>
        <Row label="Cap rides per hour for one driver" on={zone.fairness.hourCap} disabled={disabled} onToggle={(hourCap) => set({ fairness: { ...zone.fairness, hourCap } })}>
          <Num label="Rides per hour" value={zone.fairness.hourRides} unit="rides" min={1} max={12} disabled={disabled} onChange={(hourRides) => set({ fairness: { ...zone.fairness, hourRides } })} />
        </Row>
        <Row label="Short pause after skipping offers" on={zone.fairness.skipPause} disabled={disabled} onToggle={(skipPause) => set({ fairness: { ...zone.fairness, skipPause } })}>
          <Num label="Skips in a row" value={zone.fairness.skips} unit="skips" min={1} max={10} disabled={disabled} onChange={(skips) => set({ fairness: { ...zone.fairness, skips } })} />
          <Num label="Skip pause minutes" value={zone.fairness.pauseMin} unit="min" min={1} max={60} disabled={disabled} onChange={(pauseMin) => set({ fairness: { ...zone.fairness, pauseMin } })} />
        </Row>
      </Card>

      <Card title="Saying no" tone="orange" icon={<UserX size={18} />} help="When a driver declines or ignores an offer." off={!zone.decline.on} aside={<Switch label="Saying no rules" on={zone.decline.on} disabled={disabled} onChange={(on) => set({ decline: { ...zone.decline, on } })} />}>
        <Row label="It lowers the acceptance rate" help="The acceptance rate counts only Exclusive and other one-driver offers. Radar trips never count." on={zone.decline.countsAcceptance} disabled={disabled || !zone.decline.on} onToggle={(countsAcceptance) => set({ decline: { ...zone.decline, countsAcceptance } })} />
        <Row label="Pause after no's in a row">
          <Num label="Pause after no's" value={zone.decline.pauseAfter} unit="no's" min={1} max={10} disabled={disabled || !zone.decline.on} onChange={(pauseAfter) => set({ decline: { ...zone.decline, pauseAfter } })} />
          <Num label="No pause minutes" value={zone.decline.pauseMin} unit="min" min={1} max={60} disabled={disabled || !zone.decline.on} onChange={(pauseMin) => set({ decline: { ...zone.decline, pauseMin } })} />
        </Row>
        <Row label="Saying no to a long trip does not count" on={zone.decline.longTripFree} disabled={disabled || !zone.decline.on} onToggle={(longTripFree) => set({ decline: { ...zone.decline, longTripFree } })} />
        <Row label="Saying no to a far pickup does not count" on={zone.decline.farPickupFree} disabled={disabled || !zone.decline.on} onToggle={(farPickupFree) => set({ decline: { ...zone.decline, farPickupFree } })}>
          <Num label="Far pickup from" before="from" value={zone.decline.farPickupKm} unit="km" step={0.5} min={1} max={30} disabled={disabled} onChange={(farPickupKm) => set({ decline: { ...zone.decline, farPickupKm } })} />
        </Row>
      </Card>

      <Card title="Go offline automatically" tone="red" icon={<Power size={18} />} help="A driver who does not accept offers is set offline, so riders are not kept waiting." off={!zone.autoOffline.on} aside={<Switch label="Go offline automatically" on={zone.autoOffline.on} disabled={disabled} onChange={(on) => set({ autoOffline: { ...zone.autoOffline, on } })} />}>
        <Row label="After offers not accepted in a row" help="Exclusive and other one-driver offers, declined or left to run out, also rides given by Movera and offers while driving. Radar trips never count, here or in the acceptance rate. The driver can go online again at once.">
          <Num label="Offline after offers not accepted" value={zone.autoOffline.after} unit="offers" min={1} max={99} disabled={disabled || !zone.autoOffline.on} onChange={(after) => set({ autoOffline: { ...zone.autoOffline, after: Math.round(after) } })} />
        </Row>
      </Card>

      <Card title={`Rest after long work · all of ${countryName}`} tone="purple" icon={<Timer size={18} />} help="After this many hours of work, a driver cannot go online until the rest is done. This is a country rule." off={!country.rest.on} aside={<Switch label="Rest after long work" on={country.rest.on} disabled={disabled} onChange={(on) => onCountry({ ...country, rest: { ...country.rest, on } })} />}>
        <Row label="Work hours"><Num label="Work hours before rest" value={country.rest.workHours} unit="h" min={4} max={16} disabled={disabled || !country.rest.on} onChange={(workHours) => onCountry({ ...country, rest: { ...country.rest, workHours } })} /></Row>
        <Row label="Rest"><Num label="Rest hours" value={country.rest.restHours} unit="h" min={1} max={12} disabled={disabled || !country.rest.on} onChange={(restHours) => onCountry({ ...country, rest: { ...country.rest, restHours } })} /></Row>
        <Row label="Warnings before the limit" help="On the island and in the app, with the time left.">
          <Num label="First driving limit warning" value={country.rest.warnFirstMin} unit="min left" min={1} max={120} disabled={disabled || !country.rest.on} onChange={(warnFirstMin) => onCountry({ ...country, rest: { ...country.rest, warnFirstMin } })} />
          <Num label="Second driving limit warning" before="and" value={country.rest.warnLastMin} unit="min left" min={1} max={120} disabled={disabled || !country.rest.on} onChange={(warnLastMin) => onCountry({ ...country, rest: { ...country.rest, warnLastMin } })} />
        </Row>
        <Row label="Block going online at the limit" help={`The driver sees “Rest until 04:30” and can go online again after ${country.rest.restHours} h of rest.`} on={country.rest.blockOnline} disabled={disabled || !country.rest.on} onToggle={(blockOnline) => onCountry({ ...country, rest: { ...country.rest, blockOnline } })} />
      </Card>

      <CancelRateCard country={country} onCountry={onCountry} countryName={countryName} disabled={disabled} />
    </div>
  );
}

function Safety({ zone, onChange, disabled, country, countryName }: Props) {
  const safety = zone.safety;
  const set = (patch: Partial<ZoneDispatch["safety"]>) => onChange({ ...zone, safety: { ...safety, ...patch } });
  return (
    <div className="dx-cards">
      <Card title="Checks before a driver gets a request" tone="red" icon={<ShieldAlert size={18} />} help="Drivers whose account is not active cannot go online at all. That is checked in Drivers.">
        <Row label="Lowest rating" help="Drivers under this rating get no requests." on={safety.minRating} disabled={disabled} onToggle={(minRating) => set({ minRating })}>
          <Num label="Lowest rating" value={safety.ratingBelow} unit="stars" step={0.1} min={1} max={5} disabled={disabled} onChange={(ratingBelow) => set({ ratingBelow })} />
        </Row>
        <Row label="Over the cancel rate limit" help="Drivers over the cancel rate limit get no requests in this zone." on={safety.maxCancel} disabled={disabled} onToggle={(maxCancel) => set({ maxCancel })}>
          <span className="dx-limit-link" data-testid="safety-cancel-limit">Over {country.cancelRateLimitPct}% · <Link to={`/dispatch?zone=${zone.zoneId}&tab=drivers`}>Cancel rate limit for all of {countryName}</Link></span>
        </Row>
        <Row label="Do not match list" help="A rider and a driver who reported each other never meet again." on={safety.doNotMatch} disabled={disabled} onToggle={(doNotMatch) => set({ doNotMatch })} />
        <Row label="Women-only rides" help="A female rider can ask for a female driver." on={safety.womenOnly} disabled={disabled} onToggle={(womenOnly) => set({ womenOnly })} />
      </Card>
      <RideCheckCard zone={zone} onChange={onChange} disabled={disabled} />
      <div id="rc-triggers"><RideCheckSettingsCard where="rules" /></div>
    </div>
  );
}

function Alerts({ zone, onChange, disabled }: Props) {
  return (
    <div className="dx-cards">
      <Card title="When the admin gets an alert" tone="orange" icon={<Bell size={18} />} help="Alerts show in Live. From an alert you can assign a driver, send to a group or to a radar group.">
        {zone.alerts.map((alert) => {
          const info = ALERTS.find((item) => item.id === alert.id)!;
          const set = (patch: Partial<typeof alert>) => onChange({ ...zone, alerts: zone.alerts.map((item) => (item.id === alert.id ? { ...item, ...patch } : item)) });
          return (
            <Row key={alert.id} label={info.label} help={info.help} on={alert.on} disabled={disabled} onToggle={(on) => set({ on })}>
              <Num label={`${info.label} limit`} value={alert.limit} unit={info.unit} min={1} max={60} disabled={disabled} onChange={(limit) => set({ limit })} />
              <span className="dx-channels" role="group" aria-label={`${info.label} shows in`}>
                <Check label="Panel" on={alert.panel} disabled={disabled} onChange={(panel) => set({ panel })} />
                <Check label="Email" on={alert.email} disabled={disabled} onChange={(email) => set({ email })} />
                <Check label="SMS" on={alert.sms} disabled={disabled} onChange={(sms) => set({ sms })} />
              </span>
            </Row>
          );
        })}
        <p className="dx-note"><MonitorSmartphone size={13} aria-hidden="true" /> Panel alerts show at the top of Live. <Mail size={13} aria-hidden="true" /> Email and <MessageSquare size={13} aria-hidden="true" /> SMS go to the admins of this zone.</p>
      </Card>
    </div>
  );
}
