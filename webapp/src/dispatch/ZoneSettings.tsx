import { RideCheckCard } from "./RideCheckCard";
import { RideCheckSettingsCard } from "../safety/RideCheckSettingsCard";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowDown, ArrowUp, Baby, Bell, Clock, Gauge, Heart, Home, Layers, ListOrdered, Luggage, Mail, MapPin, MessageSquare,
  MonitorSmartphone, Moon, PawPrint, Plane, Plus, Route, Scale, Shield, ShieldAlert, Smartphone, Sparkles, Star, Timer, Trash2,
  TrendingUp, UserCheck, UserX, Users, Accessibility, Zap, Coins, Move, KeyRound,
} from "lucide-react";
import type { MarketId } from "../markets/markets";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import { Card, Check, Choice, Num, Row, Switch } from "./fields";
import { ReservationSettings } from "./ReservationSettings";
import { DestinationSettings } from "./DestinationSettings";
import { CancelRateCard, OfferCardSettings, RaiseLimitCard } from "./OfferSettings";
import { ExclusiveRules, RadarRules } from "./OfferSections";
import { MovedCard, offersLink } from "./MovedCard";
import { PICKUP_MOVE_DEFAULT, pickupMoveField } from "./offerRules";
import { PickupWaitCard, type WaitBaseRow } from "./PickupWaitCard";
import { RiderCancelFeesCard } from "./CancelFeeTable";
import type { CancelFeeKind, CancelFeeTable as FeeTable, FeeCategory } from "./cancelFees";
import type { PickupWait } from "./offers";
import {
  ALERTS, EXTRAS, FACTORS, modeLabel, PICKUP_MOVE_MAX_METERS, WAIT_KINDS,
  type CountryDispatch, type DriverGroup, type ExtraId, type OfferMode, type TabId, type WaitKind, type WaitStep, type ZoneDispatch,
} from "./rules";
import { tr, trn, trx } from "../i18n";

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
  /** Other zones of the country this admin can change, and copying one cancel fee table to them. */
  otherZones: { id: string; name: string }[];
  onCopyCancelFees: (kind: CancelFeeKind, table: FeeTable, zoneIds: string[]) => void;
  /** The car types Pricing lists for this zone. */
  feeCategories: FeeCategory[];
  /** Which tab of Rider cancel fees is open, and opening it from another tab. */
  feeTab: CancelFeeKind;
  onFeeTab: (tab: CancelFeeKind) => void;
  onOpenCancelFees: (tab: CancelFeeKind) => void;
};

export function ZoneSettings(props: Props) {
  const { tab } = props;
  if (tab === "modes") return <Modes {...props} />;
  if (tab === "radar") return <div className="dx-cards"><RadarRules zone={props.zone} onChange={props.onChange} disabled={props.disabled} zoneId={props.zone.zoneId} /></div>;
  if (tab === "exclusive") return <div className="dx-cards"><ExclusiveRules zone={props.zone} onChange={props.onChange} disabled={props.disabled} zoneId={props.zone.zoneId} /></div>;
  if (tab === "reservations") return <ReservationSettings zone={props.zone} onChange={props.onChange} disabled={props.disabled} symbol={props.symbol} money={props.money} countryId={props.countryId} countryName={props.countryName} groups={props.groups} commissionPct={props.commissionPct} sampleFare={props.sampleFare} onOpenCancelFees={() => props.onOpenCancelFees("reservation")} />;
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
      <MovedCard what="Radar, Exclusive and reservation rules" testId="dx-moved-modes" links={[
        { label: "Radar rules", to: offersLink("radar", zone.zoneId) },
        { label: "Exclusive rules", to: offersLink("exclusive", zone.zoneId) },
        { label: "Reservations", to: offersLink("reservations", zone.zoneId) },
      ]} />

      <OfferCardSettings zone={zone} onChange={onChange} disabled={disabled} />
      <RaiseLimitCard zone={zone} onChange={onChange} disabled={disabled} />

      <Card title={tr("Which mode runs")} tone="green" icon={<Gauge size={18} />} help={tr("Let the system choose by how busy the zone is, or choose yourself.")}>
        <Row label={tr("How to choose")}>
          <Choice label={tr("How the mode is chosen")} value={choose.how} disabled={disabled} onChange={(how) => set({ choose: { ...choose, how } })} options={[{ id: "auto", label: tr("Automatic") }, { id: "manual", label: tr("By hand") }]} />
        </Row>
        {choose.how === "auto" ? (
          <>
            <Row label={tr("Use Radar when busy")} help={tr("Busy = waiting requests ÷ free drivers. Below this level, Exclusive is used.")}>
              <Num label={tr("Busy level for Radar")} value={choose.radarAbove} unit="per driver" step={0.1} min={0.1} max={10} disabled={disabled} onChange={(radarAbove) => set({ choose: { ...choose, radarAbove } })} />
            </Row>
            <div className="dx-meter" aria-label={tr("Busy now")}>
              <span>{trn("Now: {0} requests per free driver", <b>{busy.toFixed(1)}</b>)}</span>
              <span className={busy >= choose.radarAbove ? "dx-mode-tag radar" : "dx-mode-tag exclusive"}>{busy >= choose.radarAbove ? tr("Radar now") : tr("Exclusive now")}</span>
              <i style={{ width: `${Math.min(100, (busy / Math.max(choose.radarAbove * 2, 0.1)) * 100)}%` }} />
              <em style={{ left: "50%" }} aria-hidden="true" />
            </div>
          </>
        ) : (
          <>
            <Row label={tr("Main mode")}><Choice label={tr("Main mode")} value={choose.main} disabled={disabled} onChange={(main) => set({ choose: { ...choose, main, backup: choose.backup === main ? (main === "radar" ? "exclusive" : "radar") : choose.backup } })} options={[{ id: "radar", label: tr("Radar") }, { id: "exclusive", label: tr("Exclusive") }]} /></Row>
            <Row label={tr("Backup mode")} help={tr("Used when the main mode finds nobody.")}>
              <Choice label={tr("Backup mode")} value={choose.backup} disabled={disabled} onChange={(backup) => set({ choose: { ...choose, backup } })} options={[{ id: choose.main === "radar" ? "exclusive" : "radar", label: modeLabel(choose.main === "radar" ? "exclusive" : "radar") }, { id: "none", label: tr("No backup") }] as { id: OfferMode | "none"; label: string }[]} />
            </Row>
          </>
        )}
        <div className="dx-sub">
          <b>{trn("{0} By time of day", <Clock size={13} aria-hidden="true" />)}</b>
          <small>{tr("A time rule wins over the choice above while it runs.")}</small>
          <ul className="dx-time-rules" aria-label={tr("Time rules")}>
            {choose.times.map((rule, index) => (
              <li key={rule.id} className={rule.on ? undefined : "off"}>
                <Switch label={tr("Time rule {0}", [index + 1])} on={rule.on} disabled={disabled} onChange={(on) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, on } : item)) } })} />
                <input type="time" aria-label={tr("Time rule {0} from", [index + 1])} value={rule.from} disabled={disabled} onChange={(event) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, from: event.target.value } : item)) } })} />
                <span>{tr("to")}</span>
                <input type="time" aria-label={tr("Time rule {0} to", [index + 1])} value={rule.to} disabled={disabled} onChange={(event) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, to: event.target.value } : item)) } })} />
                <Choice label={tr("Time rule {0} mode", [index + 1])} value={rule.mode} disabled={disabled} onChange={(mode) => set({ choose: { ...choose, times: choose.times.map((item) => (item.id === rule.id ? { ...item, mode } : item)) } })} options={[{ id: "radar", label: tr("Radar") }, { id: "exclusive", label: tr("Exclusive") }]} />
                <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Remove time rule {0}", [index + 1])} disabled={disabled} onClick={() => set({ choose: { ...choose, times: choose.times.filter((item) => item.id !== rule.id) } })}><Trash2 size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set({ choose: { ...choose, times: [...choose.times, { id: `t${Date.now().toString(36)}`, on: true, from: "07:00", to: "09:00", mode: "radar" }] } })}>{trn("{0} Add a time rule", <Plus size={13} aria-hidden="true" />)}</button>
        </div>
      </Card>

      <Card title={tr("Whose rules")} tone="pink" icon={<Scale size={18} />} help={tr("A rider and a driver can be in different zones. Drivers are matched across zone borders.")}>
        <Row label={tr("Rules come from")}>
          <Choice label={tr("Whose rules")} value={zone.rulesFrom} disabled={disabled} onChange={(rulesFrom) => set({ rulesFrom })} options={[{ id: "driver", label: tr("The driver's zone") }, { id: "pickup", label: tr("The pickup zone") }]} />
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
      <Card title={tr("What makes the best driver")} tone="purple" icon={<Star size={18} />} help={tr("Switch each one on or off and set how much it counts. Shares add up to 100%.")}>
        <div className="dx-mix" aria-hidden="true">
          {zone.factors.filter((item) => item.on && item.weight > 0).map((item, index) => <i key={item.id} className={`c${index}`} style={{ flexGrow: item.weight }} title={item.id} />)}
        </div>
        {zone.factors.map((factor) => {
          const info = FACTORS.find((item) => item.id === factor.id)!;
          return (
            <Row key={factor.id} label={trx(info.label)} help={trx(info.help)} on={factor.on} disabled={disabled} onToggle={(on) => set({ factors: zone.factors.map((item) => (item.id === factor.id ? { ...item, on } : item)) })}>
              <input className="dx-range" type="range" min={0} max={100} step={5} aria-label={tr("{0} weight", [trx(info.label)])} value={factor.weight} disabled={disabled} onChange={(event) => set({ factors: zone.factors.map((item) => (item.id === factor.id ? { ...item, weight: Number(event.target.value) } : item)) })} />
              <b className="dx-share">{Math.round((factor.weight / total) * 100)}%</b>
            </Row>
          );
        })}
      </Card>

      <Card title={tr("Search distance")} tone="blue" icon={<Layers size={18} />} help={tr("The search grows step by step when nobody accepts.")}>
        <div className="dx-steps" role="group" aria-label={tr("Search distance steps")}>
          {steps.map((km, index) => (
            <span key={index} className="dx-step">
              <small>{trn("Step {0}", index + 1)}</small>
              <Num label={tr("Search step {0}", [index + 1])} value={km} unit="km" step={0.5} min={0.5} max={50} disabled={disabled} onChange={(next) => set({ radius: { ...zone.radius, steps: steps.map((item, at) => (at === index ? next : item)) } })} />
              {steps.length > 1 ? <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Remove search step {0}", [index + 1])} disabled={disabled} onClick={() => set({ radius: { ...zone.radius, steps: steps.filter((_, at) => at !== index) } })}><Trash2 size={13} aria-hidden="true" /></button> : null}
            </span>
          ))}
          {steps.length < 5 ? <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set({ radius: { ...zone.radius, steps: [...steps, Math.min(50, (steps[steps.length - 1] ?? 3) + 3)] } })}>{trn("{0} Add a step", <Plus size={13} aria-hidden="true" />)}</button> : null}
        </div>
        <Row label={tr("Longest search")} help={tr("After this, the search stops.")}>
          <Num label={tr("Longest search")} value={zone.radius.maxWaitMin} unit="min" min={1} max={30} disabled={disabled} onChange={(maxWaitMin) => set({ radius: { ...zone.radius, maxWaitMin } })} />
        </Row>
      </Card>

      <Card title={tr("Smart waiting")} tone="green" icon={<Zap size={18} />} help={tr("When busy, collect requests for a few seconds and match them together for the best fit.")} off={!zone.batching.on} aside={<Switch label={tr("Smart waiting")} on={zone.batching.on} disabled={disabled} onChange={(on) => set({ batching: { ...zone.batching, on } })} />}>
        <Row label={tr("Collect for")}><Num label={tr("Smart waiting seconds")} value={zone.batching.seconds} unit="s" min={1} max={10} disabled={disabled || !zone.batching.on} onChange={(seconds) => set({ batching: { ...zone.batching, seconds } })} /></Row>
        <Row label={tr("Starts when busy level is at least")}><Num label={tr("Smart waiting from busy level")} value={zone.batching.fromRatio} unit="per driver" step={0.1} min={0.1} max={10} disabled={disabled || !zone.batching.on} onChange={(fromRatio) => set({ batching: { ...zone.batching, fromRatio } })} /></Row>
      </Card>

      <Card title={tr("Drivers finishing a ride")} tone="orange" icon={<Route size={18} />} help={tr("A driver about to drop off a rider can get the next request, as an Exclusive offer only. Never Radar during a trip.")}>
        <Row label={tr("On Exclusive")} help={tr("Uses Exclusive while driving in Modes.")} on={zone.finishing.exclusive} disabled={disabled} onToggle={(exclusive) => set({ finishing: { ...zone.finishing, exclusive } })} />
        <Row label={tr("Finishes within")}><Num label={tr("Finishing within minutes")} value={zone.finishing.withinMin} unit="min" min={1} max={15} disabled={disabled} onChange={(withinMin) => set({ finishing: { ...zone.finishing, withinMin } })} /></Row>
        <Row label={tr("Drop-off within")}><Num label={tr("Finishing within km")} value={zone.finishing.withinKm} unit="km of the pickup" step={0.5} min={0.5} max={10} disabled={disabled} onChange={(withinKm) => set({ finishing: { ...zone.finishing, withinKm } })} /></Row>
      </Card>

      <Card title={tr("Favourite drivers")} tone="pink" icon={<Heart size={18} />} help={tr("Riders can mark a driver as a favourite. That driver gets the request first.")} off={!zone.favourite.on} aside={<Switch label={tr("Favourite drivers")} on={zone.favourite.on} disabled={disabled} onChange={(on) => set({ favourite: { ...zone.favourite, on } })} />}>
        <Row label={tr("Up to")}><Num label={tr("Favourite max distance")} value={zone.favourite.maxKm} unit="km away" step={0.5} min={0.5} max={20} disabled={disabled || !zone.favourite.on} onChange={(maxKm) => set({ favourite: { ...zone.favourite, maxKm } })} /></Row>
        <Row label={tr("Wait for them")}><Num label={tr("Wait for favourite")} value={zone.favourite.waitSec} unit="s" min={5} max={60} disabled={disabled || !zone.favourite.on} onChange={(waitSec) => set({ favourite: { ...zone.favourite, waitSec } })} /></Row>
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
      <Card title={tr("What the rider sees while waiting")} tone="pink" icon={<Smartphone size={18} />} help={tr("Each step shows in the rider app at its time. Switch steps on or off, change the time and the message.")}>
        <div className="dx-timeline" aria-label={tr("Waiting timeline")}>
          <span className="dx-timeline-line" aria-hidden="true" />
          {steps.filter((step) => step.on).map((step) => (
            <span key={step.id} className={`dx-timeline-dot ${step.kind}`} style={{ left: `${(step.afterMin / max) * 100}%` }} title={tr("{0} min", [step.afterMin])}>{WAIT_ICON[step.kind]}<small>{trn("{0} min", step.afterMin)}</small></span>
          ))}
          <span className="dx-timeline-end" style={{ left: "100%" }}><small>{trn("{0} min stop", zone.radius.maxWaitMin)}</small></span>
        </div>
        <ol className="dx-wait-list" aria-label={tr("Waiting steps")}>
          {steps.map((step, index) => {
            const info = WAIT_KINDS.find((item) => item.id === step.kind)!;
            return (
              <li key={step.id} className={step.on ? `dx-wait ${step.kind}` : `dx-wait ${step.kind} off`}>
                <span className="dx-wait-icon" aria-hidden="true">{WAIT_ICON[step.kind]}</span>
                <span className="dx-wait-main">
                  <span className="dx-wait-top">
                    <b>{trx(info.label)}</b>
                    <Num label={tr("{0} after", [trx(info.label)])} before="after" value={step.afterMin} unit="min" step={0.5} min={0} max={30} disabled={disabled} onChange={(afterMin) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, afterMin } : item)))} />
                    {step.kind === "keep_waiting" ? <Num label={tr("Extra minutes to wait")} before="wait" value={step.extraMin ?? 3} unit="more min" min={1} max={15} disabled={disabled} onChange={(extraMin) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, extraMin } : item)))} /> : null}
                  </span>
                  <small>{trx(info.help)}{step.kind === "raise_price" ? <>{" "}{trn("Price steps are set in {0}.", <Link to="/pricing">{tr("Pricing")}</Link>)}</> : null}</small>
                  <textarea aria-label={tr("{0} message", [trx(info.label)])} rows={2} maxLength={160} value={step.message} disabled={disabled} onChange={(event) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, message: event.target.value } : item)))} />
                </span>
                <span className="dx-wait-tools">
                  <Switch label={trx(info.label)} on={step.on} disabled={disabled} onChange={(on) => setSteps(steps.map((item) => (item.id === step.id ? { ...item, on } : item)))} />
                  <span>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} up", [trx(info.label)])} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} down", [trx(info.label)])} disabled={disabled || index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                    <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Remove {0}", [trx(info.label)])} disabled={disabled} onClick={() => setSteps(steps.filter((item) => item.id !== step.id))}><Trash2 size={14} aria-hidden="true" /></button>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="dx-add-steps" role="group" aria-label={tr("Add a waiting step")}>
          {WAIT_KINDS.map((kind) => (
            <button data-command="admin.dispatch.edit" key={kind.id} type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => setSteps([...steps, { id: `w${Date.now().toString(36)}`, kind: kind.id, on: true, afterMin: Math.min(30, (steps[steps.length - 1]?.afterMin ?? 0) + 1), message: kind.label, extraMin: kind.id === "keep_waiting" ? 3 : undefined }])}>
              <Plus size={12} aria-hidden="true" /> {trx(kind.label)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Rides({ zone, onChange, disabled, airport, symbol, countryId, zoneName, money, waitBases, onWaitAllZones, otherZones, onCopyCancelFees, feeCategories, feeTab, onFeeTab, country, onCountry, countryName }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  return (
    <div className="dx-cards">
      <PickupWaitCard zone={zone} onChange={onChange} disabled={disabled} symbol={symbol} money={money} countryId={countryId} waitBases={waitBases} onAllZones={onWaitAllZones} country={country} onCountry={onCountry} countryName={countryName} />

      <Card title={tr("Special requests")} tone="purple" icon={<ListOrdered size={18} />} help={tr("Only drivers who have it get the request. The badge shows on the driver's offer and in the rider app.")}>
        {zone.extras.map((extra) => {
          const info = EXTRAS.find((item) => item.id === extra.id)!;
          return (
            <Row key={extra.id} label={trx(info.label)} on={extra.on} disabled={disabled} onToggle={(on) => set({ extras: zone.extras.map((item) => (item.id === extra.id ? { ...item, on } : item)) })}>
              <span className="dx-extra-icon" aria-hidden="true">{EXTRA_ICON[extra.id]}</span>
              <Check label={tr("Badge")} on={extra.badge} disabled={disabled} onChange={(badge) => set({ extras: zone.extras.map((item) => (item.id === extra.id ? { ...item, badge } : item)) })} />
              {extra.id === "long_trip" ? <Num label={tr("Long trip from")} before="from" value={zone.longTripKm} unit="km" min={10} max={500} disabled={disabled} onChange={(longTripKm) => set({ longTripKm })} /> : null}
            </Row>
          );
        })}
      </Card>

      <Card title={tr("Stops")} tone="blue" icon={<MapPin size={18} />} help={tr("Riders can add stops. The driver sees every stop before accepting.")} off={!zone.stops.on} aside={<Switch label={tr("Stops")} on={zone.stops.on} disabled={disabled} onChange={(on) => set({ stops: { ...zone.stops, on } })} />}>
        <Row label={tr("Max stops")}><Num label={tr("Max stops")} value={zone.stops.max} unit="stops" min={1} max={5} disabled={disabled || !zone.stops.on} onChange={(max) => set({ stops: { ...zone.stops, max } })} /></Row>
        <Row label={tr("Free wait at each stop")} help={tr("Waiting at a stop is charged only after these minutes. The server charges by this number.")}><Num label={tr("Free wait per stop")} value={zone.stops.freeWaitMin} unit="min" min={0} max={20} disabled={disabled || !zone.stops.on} onChange={(freeWaitMin) => set({ stops: { ...zone.stops, freeWaitMin } })} /></Row>
        <Row label={tr("Then, per minute")} help={tr("0 means no charge.")}><Num label={tr("Wait price per minute")} value={zone.stops.perMin} unit={`${symbol}/min`} step={0.1} min={0} max={100} disabled={disabled || !zone.stops.on} onChange={(perMin) => set({ stops: { ...zone.stops, perMin } })} /></Row>
        <Row label={tr("Extra fee per stop")} help={tr("0 means no fee.")}><Num label={tr("Fee per stop")} value={zone.stops.perStop} unit={symbol} step={0.5} min={0} max={500} disabled={disabled || !zone.stops.on} onChange={(perStop) => set({ stops: { ...zone.stops, perStop } })} /></Row>
        <Row label={tr("Rider can change the destination or add a stop during the trip")} on={zone.stops.changeDuring} disabled={disabled || !zone.stops.on} onToggle={(changeDuring) => set({ stops: { ...zone.stops, changeDuring } })} />
        <Row label={tr("Driver can accept or refuse the change")} on={zone.stops.driverCanRefuse} disabled={disabled || !zone.stops.on || !zone.stops.changeDuring} onToggle={(driverCanRefuse) => set({ stops: { ...zone.stops, driverCanRefuse } })} />
      </Card>

      <Card title={tr("Pickup move after accept")} tone="purple" icon={<Move size={18} />} help={tr("After a driver accepts, the rider can move the pickup point a little. A bigger move means cancel and book again. The driver is told about every move. The rider and driver apps read this.")}>
        {/* v0.18.7 (G5 item 4): default 200 m (was 500), range 0–2000 from the contract; the server refuses a bigger move. */}
        <Row label={tr("Rider can move the pickup up to")} help={tr("0 means the pickup cannot move after accept. At most {0} m. Usual value {1} m; the server refuses a bigger move from the booked pickup.", [PICKUP_MOVE_MAX_METERS, PICKUP_MOVE_DEFAULT])}>
          <Num label={tr("Pickup move limit")} before="up to" value={zone.pickupMove.maxMeters} unit="m" step={pickupMoveField().step} min={pickupMoveField().min} max={pickupMoveField().max} disabled={disabled} onChange={(maxMeters) => set({ pickupMove: { maxMeters: Math.round(maxMeters) } })} />
        </Row>
      </Card>

      <Card title={tr("Driver cancels after accepting")} tone="orange" icon={<UserX size={18} />} help={tr("It only counts in the driver's cancel rate, and the ride searches again.")} off={!zone.driverCancel.on} aside={<Switch label={tr("Search again")} on={zone.driverCancel.on} disabled={disabled} onChange={(on) => set({ driverCancel: { ...zone.driverCancel, on } })} />}>
        <Row label={tr("Lower Movera's commission on that ride")} help={tr("The rider pays the same. The next driver earns more, so it is taken faster.")}>
          <Num label={tr("Lower commission after a driver cancel")} value={zone.driverCancel.commissionCutPct} unit="% lower" min={0} max={30} disabled={disabled || !zone.driverCancel.on} onChange={(commissionCutPct) => set({ driverCancel: { ...zone.driverCancel, commissionCutPct } })} />
        </Row>
      </Card>

      <Card title={tr("Rider cancels: smart check")} tone="green" icon={<Shield size={18} />} help={tr("The system compares the driver's distance to the rider when they accepted and when the rider cancelled.")} off={!zone.riderCancel.on} aside={<Switch label={tr("Smart cancel check")} on={zone.riderCancel.on} disabled={disabled} onChange={(on) => set({ riderCancel: { ...zone.riderCancel, on } })} />}>
        <p className="dx-note">{trn("{0} Free minutes and fees per car type: see Rider cancel fees ↓", <Coins size={13} aria-hidden="true" />)}</p>
        <Row label={tr("Fee when the driver came closer by at least")} help={tr("If the driver did not move or went away, no fee.")}><Num label={tr("Came closer by")} value={zone.riderCancel.closerPct} unit="%" min={5} max={100} disabled={disabled || !zone.riderCancel.on} onChange={(closerPct) => set({ riderCancel: { ...zone.riderCancel, closerPct } })} /></Row>
        <Row label={tr("Driver gets the next nearby request first")} on={zone.riderCancel.priority} disabled={disabled || !zone.riderCancel.on} onToggle={(priority) => set({ riderCancel: { ...zone.riderCancel, priority } })}>
          <Num label={tr("Priority minutes")} value={zone.riderCancel.priorityMin} unit="min" min={1} max={60} disabled={disabled} onChange={(priorityMin) => set({ riderCancel: { ...zone.riderCancel, priorityMin } })} />
        </Row>
        <p className="dx-note">{trn("{0} Every decision is saved with the driver's route, so you can check it by hand in Cancel checks.", <UserCheck size={13} aria-hidden="true" />)}</p>
        <Row label={tr("Driver's share of the cancel fee")} help={tr("What the driver gets of a rider's cancel fee in this zone. Movera keeps the rest. Booked rides keep the share they were booked with.")}><Num label={tr("Driver's share of the cancel fee")} value={zone.riderCancel.driverSharePct ?? 100} unit="%" min={0} max={100} disabled={disabled} onChange={(driverSharePct) => set({ riderCancel: { ...zone.riderCancel, driverSharePct } })} /></Row>
      </Card>

      <RiderCancelFeesCard zone={zone} onChange={onChange} disabled={disabled} symbol={symbol} money={money} countryId={countryId} otherZones={otherZones} onCopyCancelFees={onCopyCancelFees} categories={feeCategories} tab={feeTab} onTab={onFeeTab} />

      <Card title={tr("Airport queue")} tone="pink" icon={<Plane size={18} />} help={airport ? tr("Drivers wait in a queue at the airport.") : tr("Use this when the zone has a waiting area, like an airport or a station.")} off={!zone.airport.on} aside={<Switch label={tr("Airport queue")} on={zone.airport.on} disabled={disabled} onChange={(on) => set({ airport: { ...zone.airport, on } })} />}>
        <Row label={tr("Who gets the ride")}>
          <Choice label={tr("Airport order")} value={zone.airport.order} disabled={disabled || !zone.airport.on} onChange={(order) => set({ airport: { ...zone.airport, order } })} options={[{ id: "fifo", label: tr("First in the queue") }, { id: "best", label: tr("Best driver by the rules") }]} />
        </Row>
        <Row label={tr("Longest time in the queue")}><Num label={tr("Longest time in queue")} value={zone.airport.maxQueueMin} unit="min" min={10} max={480} disabled={disabled || !zone.airport.on} onChange={(maxQueueMin) => set({ airport: { ...zone.airport, maxQueueMin } })} /></Row>
        {zone.airport.on ? (
          <div className="dx-sub">
            <b>{trn("{0} Queue area on the map", <MapPin size={13} aria-hidden="true" />)}</b>
            <small>{trn("Drivers inside this area are in the queue for {0}.", zoneName)}</small>
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
      <Card title={tr("Going home")} tone="green" icon={<Home size={18} />} help={tr("Drivers can ask for rides only towards their destination.")} off={!zone.goingHome.on} aside={<Switch label={tr("Going home")} on={zone.goingHome.on} disabled={disabled} onChange={(on) => set({ goingHome: { ...zone.goingHome, on } })} />}>
        <Row label={tr("Times per day")}><Num label={tr("Going home per day")} value={zone.goingHome.perDay} unit="times" min={1} max={10} disabled={disabled || !zone.goingHome.on} onChange={(perDay) => set({ goingHome: { ...zone.goingHome, perDay } })} /></Row>
        <Row label={tr("How far off the direction is OK")}><Num label={tr("Going home direction")} value={zone.goingHome.maxOffDeg} unit="degrees" min={10} max={90} disabled={disabled || !zone.goingHome.on} onChange={(maxOffDeg) => set({ goingHome: { ...zone.goingHome, maxOffDeg } })} /></Row>
      </Card>

      <Card title={tr("Fairness")} tone="blue" icon={<Users size={18} />} help={tr("Stop the same drivers from getting all the rides.")}>
        <Row label={tr("Boost drivers who waited 20+ min without a ride")} on={zone.fairness.idleBoost} disabled={disabled} onToggle={(idleBoost) => set({ fairness: { ...zone.fairness, idleBoost } })}>
          <Num label={tr("Boost points")} value={zone.fairness.idlePoints} unit="points" min={1} max={50} disabled={disabled} onChange={(idlePoints) => set({ fairness: { ...zone.fairness, idlePoints } })} />
        </Row>
        <Row label={tr("Cap rides per hour for one driver")} on={zone.fairness.hourCap} disabled={disabled} onToggle={(hourCap) => set({ fairness: { ...zone.fairness, hourCap } })}>
          <Num label={tr("Rides per hour")} value={zone.fairness.hourRides} unit="rides" min={1} max={12} disabled={disabled} onChange={(hourRides) => set({ fairness: { ...zone.fairness, hourRides } })} />
        </Row>
        <Row label={tr("Short pause after skipping offers")} on={zone.fairness.skipPause} disabled={disabled} onToggle={(skipPause) => set({ fairness: { ...zone.fairness, skipPause } })}>
          <Num label={tr("Skips in a row")} value={zone.fairness.skips} unit="skips" min={1} max={10} disabled={disabled} onChange={(skips) => set({ fairness: { ...zone.fairness, skips } })} />
          <Num label={tr("Skip pause minutes")} value={zone.fairness.pauseMin} unit="min" min={1} max={60} disabled={disabled} onChange={(pauseMin) => set({ fairness: { ...zone.fairness, pauseMin } })} />
        </Row>
      </Card>

      <Card title={tr("Saying no")} tone="orange" icon={<UserX size={18} />} help={tr("When a driver declines or ignores an offer.")} off={!zone.decline.on} aside={<Switch label={tr("Saying no rules")} on={zone.decline.on} disabled={disabled} onChange={(on) => set({ decline: { ...zone.decline, on } })} />}>
        <Row label={tr("It lowers the acceptance rate")} help={tr("The acceptance rate counts only Exclusive and other one-driver offers. Radar trips never count.")} on={zone.decline.countsAcceptance} disabled={disabled || !zone.decline.on} onToggle={(countsAcceptance) => set({ decline: { ...zone.decline, countsAcceptance } })} />
        <Row label={tr("Pause after no's in a row")}>
          <Num label={tr("Pause after no's")} value={zone.decline.pauseAfter} unit="no's" min={1} max={10} disabled={disabled || !zone.decline.on} onChange={(pauseAfter) => set({ decline: { ...zone.decline, pauseAfter } })} />
          <Num label={tr("No pause minutes")} value={zone.decline.pauseMin} unit="min" min={1} max={60} disabled={disabled || !zone.decline.on} onChange={(pauseMin) => set({ decline: { ...zone.decline, pauseMin } })} />
        </Row>
        <Row label={tr("Saying no to a long trip does not count")} on={zone.decline.longTripFree} disabled={disabled || !zone.decline.on} onToggle={(longTripFree) => set({ decline: { ...zone.decline, longTripFree } })} />
        <Row label={tr("Saying no to a far pickup does not count")} on={zone.decline.farPickupFree} disabled={disabled || !zone.decline.on} onToggle={(farPickupFree) => set({ decline: { ...zone.decline, farPickupFree } })}>
          <Num label={tr("Far pickup from")} before="from" value={zone.decline.farPickupKm} unit="km" step={0.5} min={1} max={30} disabled={disabled} onChange={(farPickupKm) => set({ decline: { ...zone.decline, farPickupKm } })} />
        </Row>
      </Card>

      <MovedCard what="Go offline automatically" testId="dx-moved-auto-offline" links={[{ label: "Radar rules", to: offersLink("radar", zone.zoneId, "Go offline automatically") }]} />

      <Card title={tr("Rest after long work · all of {0}", [countryName])} tone="purple" icon={<Timer size={18} />} help={tr("After this many hours of work, a driver cannot go online until the rest is done. This is a country rule.")} off={!country.rest.on} aside={<Switch label={tr("Rest after long work")} on={country.rest.on} disabled={disabled} onChange={(on) => onCountry({ ...country, rest: { ...country.rest, on } })} />}>
        <Row label={tr("Work hours")}><Num label={tr("Work hours before rest")} value={country.rest.workHours} unit="h" min={4} max={16} disabled={disabled || !country.rest.on} onChange={(workHours) => onCountry({ ...country, rest: { ...country.rest, workHours } })} /></Row>
        <Row label={tr("Rest")}><Num label={tr("Rest hours")} value={country.rest.restHours} unit="h" min={1} max={12} disabled={disabled || !country.rest.on} onChange={(restHours) => onCountry({ ...country, rest: { ...country.rest, restHours } })} /></Row>
        <Row label={tr("Warnings before the limit")} help={tr("On the island and in the app, with the time left.")}>
          <Num label={tr("First driving limit warning")} value={country.rest.warnFirstMin} unit="min left" min={1} max={120} disabled={disabled || !country.rest.on} onChange={(warnFirstMin) => onCountry({ ...country, rest: { ...country.rest, warnFirstMin } })} />
          <Num label={tr("Second driving limit warning")} before="and" value={country.rest.warnLastMin} unit="min left" min={1} max={120} disabled={disabled || !country.rest.on} onChange={(warnLastMin) => onCountry({ ...country, rest: { ...country.rest, warnLastMin } })} />
        </Row>
        <Row label={tr("Block going online at the limit")} help={tr("The driver sees “Rest until 04:30” and can go online again after {0} h of rest.", [country.rest.restHours])} on={country.rest.blockOnline} disabled={disabled || !country.rest.on} onToggle={(blockOnline) => onCountry({ ...country, rest: { ...country.rest, blockOnline } })} />
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
      <Card title={tr("Checks before a driver gets a request")} tone="red" icon={<ShieldAlert size={18} />} help={tr("Drivers whose account is not active cannot go online at all. That is checked in Drivers.")}>
        <Row label={tr("Lowest rating")} help={tr("Drivers under this rating get no requests.")} on={safety.minRating} disabled={disabled} onToggle={(minRating) => set({ minRating })}>
          <Num label={tr("Lowest rating")} value={safety.ratingBelow} unit="stars" step={0.1} min={1} max={5} disabled={disabled} onChange={(ratingBelow) => set({ ratingBelow })} />
        </Row>
        <Row label={tr("Over the cancel rate limit")} help={tr("Drivers over the cancel rate limit get no requests in this zone.")} on={safety.maxCancel} disabled={disabled} onToggle={(maxCancel) => set({ maxCancel })}>
          <span className="dx-limit-link" data-testid="safety-cancel-limit">{trn("Over {0}% · {1}", country.cancelRateLimitPct, <Link to={`/dispatch?zone=${zone.zoneId}&tab=drivers`}>{trn("Cancel rate limit for all of {0}", countryName)}</Link>)}</span>
        </Row>
        <Row label={tr("Do not match list")} help={tr("A rider and a driver who reported each other never meet again.")} on={safety.doNotMatch} disabled={disabled} onToggle={(doNotMatch) => set({ doNotMatch })} />
        <Row label={tr("Women-only rides")} help={tr("A female rider can ask for a female driver.")} on={safety.womenOnly} disabled={disabled} onToggle={(womenOnly) => set({ womenOnly })} />
      </Card>
      {/* v0.18.8 (G6, contract.json#arrivedWaiting.pin): DriverAppConfig.pickupPin, kept on the trip at booking. */}
      <Card title={tr("Rider PIN before Start")} tone="purple" icon={<KeyRound size={18} />} help={tr("The driver must enter the rider’s 4-digit code before the trip starts.")} off={!zone.pickupPin.required} aside={<Switch label={tr("Rider PIN before Start")} on={zone.pickupPin.required} disabled={disabled} onChange={(required) => onChange({ ...zone, pickupPin: { ...zone.pickupPin, required } })} />}>
        <p className="fd-banner amber" data-testid="pickup-pin-compat">{tr("Turn this on only when the driver app with the PIN step is live in this zone. A driver app without it cannot start the trips of this zone.")}</p>
        <Row label={tr("Wrong tries before lock")} help={tr("1 to 10. After this many wrong codes in a row the driver must wait.")}><Num label={tr("Wrong tries before lock")} value={zone.pickupPin.maxAttempts} unit="" min={1} max={10} disabled={disabled || !zone.pickupPin.required} onChange={(maxAttempts) => onChange({ ...zone, pickupPin: { ...zone.pickupPin, maxAttempts: Math.round(maxAttempts) } })} /></Row>
        <Row label={tr("Lock minutes")} help={tr("1 to 60. How long the driver waits after too many wrong codes.")}><Num label={tr("Lock minutes")} value={zone.pickupPin.lockMinutes} unit="min" min={1} max={60} disabled={disabled || !zone.pickupPin.required} onChange={(lockMinutes) => onChange({ ...zone, pickupPin: { ...zone.pickupPin, lockMinutes: Math.round(lockMinutes) } })} /></Row>
        <p className="op-help">{tr("Riders see the code in their app. Admins see it on the trip page. The driver never gets it.")}</p>
      </Card>
      <RideCheckCard zone={zone} onChange={onChange} disabled={disabled} />
      <div id="rc-triggers"><RideCheckSettingsCard where="rules" /></div>
    </div>
  );
}

function Alerts({ zone, onChange, disabled }: Props) {
  return (
    <div className="dx-cards">
      <Card title={tr("When the admin gets an alert")} tone="orange" icon={<Bell size={18} />} help={tr("Alerts show in Live. From an alert you can assign a driver, send to a group or to a radar group.")}>
        {zone.alerts.map((alert) => {
          const info = ALERTS.find((item) => item.id === alert.id)!;
          const set = (patch: Partial<typeof alert>) => onChange({ ...zone, alerts: zone.alerts.map((item) => (item.id === alert.id ? { ...item, ...patch } : item)) });
          return (
            <Row key={alert.id} label={trx(info.label)} help={trx(info.help)} on={alert.on} disabled={disabled} onToggle={(on) => set({ on })}>
              <Num label={tr("{0} limit", [trx(info.label)])} value={alert.limit} unit={info.unit} min={1} max={60} disabled={disabled} onChange={(limit) => set({ limit })} />
              <span className="dx-channels" role="group" aria-label={tr("{0} shows in", [trx(info.label)])}>
                <Check label={tr("Panel")} on={alert.panel} disabled={disabled} onChange={(panel) => set({ panel })} />
                <Check label={tr("Email")} on={alert.email} disabled={disabled} onChange={(email) => set({ email })} />
                <Check label="SMS" on={alert.sms} disabled={disabled} onChange={(sms) => set({ sms })} />
              </span>
            </Row>
          );
        })}
        <p className="dx-note">{trn("{0} Panel alerts show at the top of Live. {1} Email and {2} SMS go to the admins of this zone.", <MonitorSmartphone size={13} aria-hidden="true" />, <Mail size={13} aria-hidden="true" />, <MessageSquare size={13} aria-hidden="true" />)}</p>
      </Card>
    </div>
  );
}
