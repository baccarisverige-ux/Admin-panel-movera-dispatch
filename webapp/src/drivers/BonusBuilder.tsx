import { useMemo, useState, type ReactNode } from "react";
import { Ban, CalendarDays, Clock, Gauge, Layers, MapPinned, Minus, Plus, Route, Search, ShieldCheck, Star, Tags, Timer, Trophy, Users, Wallet, X, Zap } from "lucide-react";
import { CATEGORIES } from "../domain/contract";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { CommandButton } from "../ui/CommandButton";
import { BonusAreaMap } from "./BonusAreaMap";
import { DriverAppPreview } from "./DriverAppPreview";
import {
  AUDIENCES,
  BONUS_KEY,
  DAY_SHORT,
  inAudience,
  maxPerDriver,
  REWARD_TYPES,
  saveBonus,
  validateBonus,
  windowMinutes,
  type BonusBook,
  type BonusKind,
  type BonusRules,
  type DriverBonus,
  type DriverFacts,
  type RewardType,
} from "./bonus";
import { tr, trn, trx, trSentences } from "../i18n";

export type BonusDriver = { facts: DriverFacts; name: string; code: string; zoneId: string; home: [number, number] };

const SYMBOL: Record<MarketId, string> = { SE: "kr", FR: "€", TN: "DT" };

/** The amount each reward type starts with: a target bonus, an extra per ride, an hourly guarantee. */
const REWARD_START: Record<RewardType, Record<MarketId, number>> = {
  target: { SE: 150, FR: 15, TN: 20 },
  steps: { SE: 150, FR: 15, TN: 20 },
  per_ride: { SE: 20, FR: 2, TN: 3 },
  multiplier: { SE: 0, FR: 0, TN: 0 },
  guarantee: { SE: 300, FR: 25, TN: 20 },
};

export function categoryName(id: string): string {
  return CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

type RuleKey = Exclude<keyof BonusRules, "categories">;
const RULES: { key: RuleKey; label: string; hint: string; unit: (symbol: string) => string; icon: ReactNode; max?: number }[] = [
  { key: "maxCancelPct", get label() { return tr("Cancel rate at most"); }, get hint() { return tr("Drivers who cancel more get nothing"); }, unit: () => "%", icon: <Ban size={15} />, max: 100 },
  { key: "minAcceptPct", get label() { return tr("Acceptance at least"); }, get hint() { return tr("Share of ride offers accepted"); }, unit: () => "%", icon: <ShieldCheck size={15} />, max: 100 },
  { key: "backToBack", get label() { return tr("Rides back to back"); }, get hint() { return tr("Max minutes between one ride and the next"); }, unit: () => "min", icon: <Route size={15} /> },
  { key: "minFare", get label() { return tr("Minimum fare per ride"); }, get hint() { return tr("Short cheap rides do not count"); }, unit: (symbol) => symbol, icon: <Wallet size={15} /> },
  { key: "minKm", get label() { return tr("Minimum distance per ride"); }, get hint() { return tr("Rides shorter than this do not count"); }, unit: () => "km", icon: <MapPinned size={15} /> },
  { key: "minRating", get label() { return tr("Rating at least"); }, get hint() { return tr("Driver rating, 1 to 5"); }, unit: () => "stars", icon: <Star size={15} />, max: 5 },
  { key: "minOnlineMin", get label() { return tr("Online at least"); }, get hint() { return tr("Minutes online in the time window"); }, unit: () => "min", icon: <Timer size={15} /> },
  { key: "maxRides", get label() { return tr("Max rides counted"); }, get hint() { return tr("Extra rides after this do not add more"); }, unit: () => "rides", icon: <Gauge size={15} /> },
  { key: "maxPayout", get label() { return tr("Max payout per driver"); }, get hint() { return tr("The most one driver can earn"); }, unit: (symbol) => symbol, icon: <Trophy size={15} /> },
];

function Section({ n, title, icon, children }: { n: number; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="db-section" aria-label={title}>
      <h4><i>{n}</i>{icon}{trx(title)}</h4>
      {children}
    </section>
  );
}

type Props = {
  country: MarketId;
  book: BonusBook;
  agentId: string | null;
  canEdit: boolean;
  drivers: BonusDriver[];
  fleets: { id: string; name: string }[];
  start: DriverBonus;
  now: number;
  onSaved: (message: string) => void;
  onClose: () => void;
};

/** Make or change a driver bonus. Left: the steps. Right: how drivers see it, and what it can cost. */
export function BonusBuilder({ country, book, agentId, canEdit, drivers, fleets, start, now, onSaved, onClose }: Props) {
  const [bonus, setBonus] = useState<DriverBonus>(start);
  const [query, setQuery] = useState("");
  const symbol = SYMBOL[country];
  const info = market(country);
  const money = (value: number) => `${new Intl.NumberFormat(info.locale, { maximumFractionDigits: 2 }).format(value)} ${symbol}`;
  const editing = Boolean(start.id);
  const set = (patch: Partial<DriverBonus>) => setBonus((current) => ({ ...current, ...patch }));
  const setRule = <K extends keyof BonusRules>(key: K, value: Partial<BonusRules[K]>) => setBonus((current) => ({ ...current, rules: { ...current.rules, [key]: { ...current.rules[key], ...value } } }));
  const setReward = (patch: Partial<DriverBonus["reward"]>) => setBonus((current) => ({ ...current, reward: { ...current.reward, ...patch } }));
  const error = validateBonus(bonus);
  const saved = agentId ? saveBonus(book, bonus, agentId, now) : { book, error: "Sign in again." };
  const audience = drivers.filter((driver) => inAudience(bonus, driver.facts));
  const most = maxPerDriver(bonus);
  const shown = useMemo(() => drivers.filter((driver) => !query.trim() || `${driver.name} ${driver.code}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60), [drivers, query]);
  const toggleDay = (day: number) => set({ days: bonus.days.includes(day) ? bonus.days.filter((item) => item !== day) : [...bonus.days, day].sort() });

  function chooseKind(kind: BonusKind) {
    set({ kind, name: bonus.name === "Morning rush" && kind === "area" ? "Area bonus" : bonus.name === "Area bonus" && kind === "rides" ? "Morning rush" : bonus.name });
  }

  return (
    <div className="db-builder">
      <div className="db-form">
        <div className="db-form-head">
          <h3>{editing ? tr("Change {0}", [start.name]) : tr("New driver bonus")}</h3>
          <button data-command="admin.confirm.cancel" type="button" className="icon-ghost" aria-label={tr("Close bonus form")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>

        <Section n={1} title={tr("Kind and name")} icon={<Layers size={15} />}>
          <div className="db-kinds" role="radiogroup" aria-label={tr("Bonus kind")}>
            <button data-command="admin.drivers.bonusForm" type="button" role="radio" aria-checked={bonus.kind === "rides"} className={bonus.kind === "rides" ? "db-kind on" : "db-kind"} onClick={() => chooseKind("rides")}>
              <Zap size={20} aria-hidden="true" />
              <span><b>{tr("Ride bonus")}</b><small>{tr("Do rides in a time window, anywhere in the zones you pick")}</small></span>
            </button>
            <button data-command="admin.drivers.bonusForm" type="button" role="radio" aria-checked={bonus.kind === "area"} className={bonus.kind === "area" ? "db-kind on area" : "db-kind area"} onClick={() => chooseKind("area")}>
              <MapPinned size={20} aria-hidden="true" />
              <span><b>{tr("Area bonus")}</b><small>{tr("Only rides in an area you draw on the map")}</small></span>
            </button>
          </div>
          <label className="field">{trn("Name drivers see{0}", <input aria-label={tr("Bonus name")} value={bonus.name} maxLength={40} onChange={(event) => set({ name: event.target.value })} placeholder={tr("Morning rush")} />)}</label>
          <label className="field">{trn("Message to drivers {0}{1}{2}", <small>{tr("(optional, shown in the app and on the map)")}</small>, <textarea aria-label={tr("Message to drivers")} rows={2} maxLength={140} value={bonus.note} onChange={(event) => set({ note: event.target.value })} placeholder={bonus.kind === "area" ? tr("Concert ends at 22:00. Wait at the north exit.") : tr("Busy morning. Stay online near the station.")} />, <small className="fine">{bonus.note.length} / 140</small>)}</label>
        </Section>

        <Section n={2} title={tr("Reward")} icon={<Trophy size={15} />}>
          <div className="db-rewards" role="radiogroup" aria-label={tr("Reward type")}>
            {REWARD_TYPES.map((item) => (
              <button data-command="admin.drivers.bonusForm" key={item.id} type="button" role="radio" aria-checked={bonus.reward.type === item.id} className={bonus.reward.type === item.id ? "db-reward on" : "db-reward"} onClick={() => setReward({ type: item.id as RewardType, amount: REWARD_START[item.id as RewardType][country] })}>
                <b>{trx(item.label)}</b><small>{trx(item.hint)}</small>
              </button>
            ))}
          </div>
          {bonus.reward.type === "target" ? (
            <div className="db-row">
              <label className="field">{trn("Rides to do{0}", <NumberField label={tr("Rides to do")} value={bonus.reward.rides} unit="rides" max={50} onChange={(value) => setReward({ rides: Math.round(value) })} />)}</label>
              <label className="field">{trn("Bonus{0}", <NumberField label={tr("Bonus amount")} value={bonus.reward.amount} unit={symbol} onChange={(value) => setReward({ amount: value })} />)}</label>
            </div>
          ) : null}
          {bonus.reward.type === "steps" ? (
            <div className="db-steps" aria-label={tr("Steps")}>
              {bonus.reward.steps.map((step, index) => (
                <div key={index} className="db-step">
                  <i>{index + 1}</i>
                  <label className="field">{trn("Rides{0}", <NumberField label={tr("Step {0} rides", [index + 1])} value={step.rides} unit="rides" max={50} onChange={(value) => setReward({ steps: bonus.reward.steps.map((item, at) => (at === index ? { ...item, rides: Math.round(value) } : item)) })} />)}</label>
                  <label className="field">{trn("Bonus{0}", <NumberField label={tr("Step {0} amount", [index + 1])} value={step.amount} unit={symbol} onChange={(value) => setReward({ steps: bonus.reward.steps.map((item, at) => (at === index ? { ...item, amount: value } : item)) })} />)}</label>
                  <button data-command="admin.drivers.bonusForm" type="button" className="icon-ghost" aria-label={tr("Remove step {0}", [index + 1])} disabled={bonus.reward.steps.length <= 2} onClick={() => setReward({ steps: bonus.reward.steps.filter((_, at) => at !== index) })}><Minus size={14} aria-hidden="true" /></button>
                </div>
              ))}
              <button data-command="admin.drivers.bonusForm" type="button" className="dash-btn small ghost" disabled={bonus.reward.steps.length >= 6} onClick={() => {
                const last = bonus.reward.steps[bonus.reward.steps.length - 1] ?? { rides: 2, amount: 50 };
                setReward({ steps: [...bonus.reward.steps, { rides: last.rides + 2, amount: Math.round(last.amount * 1.5) }] });
              }}>{trn("{0} Add a step", <Plus size={13} aria-hidden="true" />)}</button>
              <small className="fine">{tr("Drivers get the highest step they reach, not all of them added up.")}</small>
            </div>
          ) : null}
          {bonus.reward.type === "per_ride" ? (
            <div className="db-row">
              <label className="field">{trn("Extra on each ride{0}", <NumberField label={tr("Extra per ride")} value={bonus.reward.amount} unit={symbol} onChange={(value) => setReward({ amount: value })} />)}</label>
              <small className="fine">{tr("Set \"Max payout per driver\" in the rules so the cost has a limit.")}</small>
            </div>
          ) : null}
          {bonus.reward.type === "multiplier" ? (
            <div className="db-row">
              <label className="field">{trn("Boost on fares{0}", <NumberField label={tr("Earnings boost")} value={bonus.reward.multiplier} unit="×" step={0.05} max={3} onChange={(value) => setReward({ multiplier: value })} />)}</label>
              <small className="fine">{tr("×1.3 means 30% more on the driver's share of each fare. Needs a max payout.")}</small>
            </div>
          ) : null}
          {bonus.reward.type === "guarantee" ? (
            <div className="db-row">
              <label className="field">{trn("At least per hour{0}", <NumberField label={tr("Guaranteed per hour")} value={bonus.reward.amount} unit={symbol} onChange={(value) => setReward({ amount: value })} />)}</label>
              <small className="fine">{tr("If the driver earns less while online in the window, Movera pays the rest. Needs a max payout.")}</small>
            </div>
          ) : null}
        </Section>

        <Section n={3} title={tr("When")} icon={<Clock size={15} />}>
          <div className="db-row">
            <label className="field">{trn("From{0}", <input type="time" aria-label={tr("Start time")} value={bonus.start} onChange={(event) => set({ start: event.target.value })} />)}</label>
            <label className="field">{trn("To{0}", <input type="time" aria-label={tr("End time")} value={bonus.end} onChange={(event) => set({ end: event.target.value })} />)}</label>
            <span className="db-window">{windowMinutes(bonus) ? tr("{0} h {1}", [Math.floor(windowMinutes(bonus) / 60), windowMinutes(bonus) % 60 ? `${windowMinutes(bonus) % 60} min` : ""]) : "—"}{bonus.end < bonus.start ? tr(" · past midnight") : ""}</span>
          </div>
          <div className="db-days" role="group" aria-label={tr("Days")}>
            {DAY_SHORT.map((label, day) => (
              <button data-command="admin.drivers.bonusForm" key={label} type="button" aria-pressed={bonus.days.includes(day)} className={bonus.days.includes(day) ? "db-day on" : "db-day"} onClick={() => toggleDay(day)}>{trx(label)}</button>
            ))}
            <span className="db-quick">
              <button data-command="admin.drivers.bonusForm" type="button" className="zn-chip" onClick={() => set({ days: [0, 1, 2, 3, 4] })}>{tr("Weekdays")}</button>
              <button data-command="admin.drivers.bonusForm" type="button" className="zn-chip" onClick={() => set({ days: [5, 6] })}>{tr("Weekend")}</button>
              <button data-command="admin.drivers.bonusForm" type="button" className="zn-chip" onClick={() => set({ days: [0, 1, 2, 3, 4, 5, 6] })}>{tr("Every day")}</button>
            </span>
          </div>
          <div className="db-row">
            <label className="field">{trn("First day{0}", <input type="date" aria-label={tr("First day")} value={bonus.from} onChange={(event) => set({ from: event.target.value })} />)}</label>
            <label className="field">{trn("Last day {0}{1}", <small>{tr("(empty = no end)")}</small>, <input type="date" aria-label={tr("Last day")} value={bonus.until} onChange={(event) => set({ until: event.target.value })} />)}</label>
          </div>
        </Section>

        <Section n={4} title={tr("Where")} icon={<MapPinned size={15} />}>
          {bonus.kind === "rides" ? (
            <fieldset className="rd-chips">
              <legend>{trn("Zones in {0} {1}", info.name, <small>{tr("(none = the whole country)")}</small>)}</legend>
              {info.zones.map((zone) => (
                <label key={zone.id} className={bonus.zones.includes(zone.id) ? "check-chip on" : "check-chip"}>
                  <input type="checkbox" checked={bonus.zones.includes(zone.id)} onChange={() => set({ zones: bonus.zones.includes(zone.id) ? bonus.zones.filter((id) => id !== zone.id) : [...bonus.zones, zone.id] })} />{zone.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <>
              <div className="zn-seg db-seg" role="radiogroup" aria-label={tr("A ride counts when")}>
                {([["pickup", "Pickup inside"], ["dropoff", "Drop-off inside"], ["both", "Both inside"]] as const).map(([id, label]) => (
                  <button data-command="admin.drivers.bonusForm" key={id} type="button" role="radio" aria-checked={bonus.areaCounts === id} className={bonus.areaCounts === id ? "on" : undefined} onClick={() => set({ areaCounts: id })}>{trx(label)}</button>
                ))}
              </div>
              <BonusAreaMap country={country} areas={bonus.areas} onChange={(areas) => set({ areas })} />
            </>
          )}
        </Section>

        <Section n={5} title={tr("Rules")} icon={<ShieldCheck size={15} />}>
          <p className="fine">{tr("Switch on the rules you want. Off rules do not count.")}</p>
          <ul className="db-rules" aria-label={tr("Rules")}>
            {RULES.map((rule) => {
              const value = bonus.rules[rule.key];
              return (
                <li key={rule.key} className={value.on ? "db-rule on" : "db-rule"}>
                  <label className="db-rule-switch">
                    <input type="checkbox" aria-label={tr("{0} on", [trx(rule.label)])} checked={value.on} onChange={(event) => setRule(rule.key, { on: event.target.checked })} />
                    <span className="zd-switch" aria-hidden="true"><i /></span>
                  </label>
                  <span className="db-rule-icon" aria-hidden="true">{rule.icon}</span>
                  <span className="db-rule-text"><b>{trx(rule.label)}</b><small>{trx(rule.hint)}</small></span>
                  <NumberField label={trx(rule.label)} value={value.value} unit={rule.unit(symbol)} step={rule.key === "minRating" ? 0.1 : 1} max={rule.max} disabled={!value.on} onChange={(next) => setRule(rule.key, { value: next })} />
                </li>
              );
            })}
            <li className={bonus.rules.categories.on ? "db-rule on wide" : "db-rule wide"}>
              <label className="db-rule-switch">
                <input type="checkbox" aria-label={tr("Only some categories on")} checked={bonus.rules.categories.on} onChange={(event) => setRule("categories", { on: event.target.checked })} />
                <span className="zd-switch" aria-hidden="true"><i /></span>
              </label>
              <span className="db-rule-icon" aria-hidden="true"><Tags size={15} /></span>
              <span className="db-rule-text"><b>{tr("Only some categories")}</b><small>{tr("Rides in other categories do not count")}</small></span>
              {bonus.rules.categories.on ? (
                <span className="db-cats">
                  {CATEGORIES.map((category) => (
                    <label key={category.id} className={bonus.rules.categories.value.includes(category.id) ? "check-chip on" : "check-chip"}>
                      <input type="checkbox" aria-label={tr("Bonus category {0}", [trx(category.label)])} checked={bonus.rules.categories.value.includes(category.id)} onChange={() => setRule("categories", { value: bonus.rules.categories.value.includes(category.id) ? bonus.rules.categories.value.filter((id) => id !== category.id) : [...bonus.rules.categories.value, category.id] })} />{trx(category.label)}
                    </label>
                  ))}
                </span>
              ) : null}
            </li>
          </ul>
        </Section>

        <Section n={6} title={tr("Who gets it and budget")} icon={<Users size={15} />}>
          <div className="db-row">
            <label className="field">{trn("Drivers{0}", <select aria-label={tr("Bonus audience")} value={bonus.audience} onChange={(event) => set({ audience: event.target.value as DriverBonus["audience"] })}>
                {AUDIENCES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
              </select>)}</label>
            {bonus.audience === "fleet" ? (
              <label className="field">{trn("Fleet{0}", <select aria-label={tr("Bonus fleet")} value={bonus.fleetId} onChange={(event) => set({ fleetId: event.target.value })}>
                  <option value="">{tr("Pick a fleet")}</option>
                  {fleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}
                </select>)}</label>
            ) : null}
            <label className="field">{trn("Total budget {0}{1}", <small>{tr("(optional)")}</small>, <span className="db-budget">
                <NumberField label={tr("Bonus budget")} value={bonus.budget ?? 0} unit={symbol} onChange={(value) => set({ budget: value > 0 ? value : null })} />
              </span>)}</label>
          </div>
          {bonus.audience === "picked" ? (
            <div className="db-pick">
              <label className="rd-search small"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find drivers for the bonus")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Find by name or code")} /></label>
              <ul className="rd-audience-list" aria-label={tr("Drivers for the bonus")}>
                {shown.map((driver) => (
                  <li key={driver.facts.id} className={bonus.driverIds.includes(driver.facts.id) ? "on" : undefined}>
                    <label>
                      <input type="checkbox" aria-label={tr("Give bonus to {0}", [driver.name])} disabled={driver.facts.status !== "active"} checked={bonus.driverIds.includes(driver.facts.id)} onChange={() => set({ driverIds: bonus.driverIds.includes(driver.facts.id) ? bonus.driverIds.filter((id) => id !== driver.facts.id) : [...bonus.driverIds, driver.facts.id] })} />
                      <span className="rd-aud-name">{driver.name}<small>{driver.code}{driver.facts.status !== "active" ? ` · ${driver.facts.status}` : ""}</small></span>
                      <span className="rd-aud-num">{trn("Rating {0}", driver.facts.rating.toFixed(2))}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="fine">{trn("{0} Only active drivers get bonuses. A driver on hold or suspended earns nothing.", <CalendarDays size={12} aria-hidden="true" />)}</p>
        </Section>
      </div>

      <aside className="db-side">
        <DriverAppPreview bonus={bonus} money={money} categoryName={categoryName} />
        <dl className="rd-cost db-cost">
          <div><dt>{tr("Drivers in it")}</dt><dd>{audience.length}</dd></div>
          <div><dt>{tr("Most per driver, each time")}</dt><dd>{most === null ? tr("No limit") : money(most)}</dd></div>
          <div><dt>{tr("Most it can cost, each time")}</dt><dd>{most === null ? tr("No limit") : money(most * audience.length)}</dd></div>
          <div><dt>{tr("Budget")}</dt><dd>{bonus.budget ? money(bonus.budget) : tr("No budget")}</dd></div>
        </dl>
        {error ? <p className="rd-form-error" role="alert">{trSentences(error)}</p> : null}
        <CommandButton command={editing ? "admin.drivers.bonusEdit" : "admin.drivers.bonusCreate"} className="dash-btn publish" targetId={bonus.name || "bonus"} confirmTarget={false} scope="all" before={editing ? start.name : "none"} after={`${bonus.name}: ${bonus.kind}, ${bonus.start}-${bonus.end}`} expectedSliceRev={book.draftRev} sliceKey={BONUS_KEY} value={saved.book} disabled={!canEdit || Boolean(error) || Boolean(saved.error)} title={error ?? saved.error} onDone={() => onSaved(editing ? `Bonus ${bonus.name} changed.` : `Bonus ${bonus.name} is on for ${audience.length} driver${audience.length === 1 ? "" : "s"}.`)}>
          <Zap size={15} aria-hidden="true" /> {editing ? tr("Save changes") : tr("Start bonus")}
        </CommandButton>
      </aside>
    </div>
  );
}
