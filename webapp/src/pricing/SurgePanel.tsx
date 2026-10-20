import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarClock,
  Clock,
  Cpu,
  Eye,
  Hand,
  Megaphone,
  Plus,
  Square,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Market } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { demandSeries } from "./demand";
import { DemandChart } from "./DemandChart";
import { NumberField } from "./NumberField";
import type { SurgeRow } from "./rows";
import { activeProfile, inActiveHours, priceCheck, smartMultiplier, surgeTimeline, LEVEL_COLOR, type SurgeAlert } from "./surge";
import { SurgeMap } from "./SurgeMap";
import { SurgeSlider } from "./SurgeSlider";
import type { SurgeStyle } from "./surgeGeo";
import {
  SLICE_KEY,
  WEEKDAY_LABELS,
  notifyDriversNow,
  setNotifyDrivers,
  startManualSurge,
  stopManualSurges,
  type PricingStore,
  type Problem,
  type ScheduledSurge,
  type SmartSurge,
  type SurgeProfile,
  type ZoneBook,
  type ZoneLive,
} from "./zonePricing";
import { tr, trn, uiLocale, trx } from "../i18n";

type Props = {
  market: Market;
  zoneId: string;
  zoneName: string;
  rows: SurgeRow[];
  alerts: SurgeAlert[];
  book: ZoneBook;
  live: ZoneLive;
  store: PricingStore;
  problems: Problem[];
  agentId: string | null;
  canEdit: boolean;
  now: number;
  map: { shown: boolean; style: SurgeStyle; setShown: (shown: boolean) => void; setStyle: (style: SurgeStyle) => void };
  onSmart: (patch: Partial<SmartSurge>) => void;
  onScheduled: (list: ScheduledSurge[]) => void;
  onSelectZone: (zoneId: string) => void;
  onNotice: (message: string) => void;
};

const DURATIONS = [15, 30, 60, 120, 240, 480];

function localInput(iso: string, timeZone: string): string {
  if (!iso) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(Date.parse(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Turn a wall-clock time in the zone's time zone into an instant. */
function fromLocalInput(value: string, timeZone: string): string {
  if (!value) return "";
  const guess = Date.parse(`${value}:00Z`);
  const shown = Date.parse(`${localInput(new Date(guess).toISOString(), timeZone)}:00Z`);
  return new Date(guess - (shown - guess)).toISOString();
}

export function SurgePanel({ market, zoneId, zoneName, rows, alerts, book, live, store, problems, agentId, canEdit, now, map, onSmart, onScheduled, onSelectZone, onNotice }: Props) {
  const [manual, setManual] = useState(1.5);
  const [minutes, setMinutes] = useState(60);
  const current = rows.find((row) => row.surge.zoneId === zoneId)?.surge;
  const at = new Date(now).toISOString();
  const time = new Intl.DateTimeFormat(uiLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: market.timeZone });
  const dateTime = new Intl.DateTimeFormat(uiLocale(), { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: market.timeZone });
  const bad = new Set(problems.map((problem) => problem.path.split(".").slice(0, 2).join(".")));
  const running = live.manual && Date.parse(live.manual.endsAt) > now ? live.manual : null;
  const start = agentId ? startManualSurge(store, zoneId, manual, minutes, agentId, "Manual surge", at) : { store, error: "Sign in again." };
  const stop = agentId ? stopManualSurges(store, [zoneId], agentId, "Manual surge stopped", at) : { store, error: "Sign in again.", stopped: [] };
  const profileNow = activeProfile(book.smart, now, market.timeZone);
  const hoursOn = inActiveHours(book.smart, now, market.timeZone);
  const bucket = Math.floor(now / 600_000) * 600_000;
  const series = useMemo(() => demandSeries(zoneId, bucket, 6, 10), [zoneId, bucket]);
  const seriesSurge = series.map((point) => {
    if (running && point.at >= Date.parse(running.startedAt)) return running.multiplier;
    const profile = activeProfile(book.smart, point.at, market.timeZone);
    return book.smart.enabled && profile && inActiveHours(book.smart, point.at, market.timeZone) ? smartMultiplier(profile, point.ratio) : 1;
  });
  const timeline = surgeTimeline(book, store.surgeLog, now, 8).slice(0, 12);
  const check = current ? priceCheck(current) : { saw: 0, left: 0, leftPct: 0 };

  const patchProfile = (id: string, patch: Partial<SurgeProfile>) => onSmart({ profiles: book.smart.profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)) });
  const moveProfile = (id: string, by: number) => {
    const list = [...book.smart.profiles];
    const index = list.findIndex((profile) => profile.id === id);
    const target = index + by;
    if (target < 0 || target >= list.length || list[target].isDefault || list[index].isDefault) return;
    [list[index], list[target]] = [list[target], list[index]];
    onSmart({ profiles: list });
  };

  return (
    <div className="surge-panel">
      {/* Live status and manual control for the chosen zone */}
      <div className="surge-top">
        <section className={`surge-now lvl-${current?.level ?? "none"}`} aria-label={tr("Surge now in {0}", [zoneName])}>
          <div className="surge-now-head">
            <span className="eyebrow">{trn("{0} Live · {1}", <span className="live-dot" aria-hidden="true" />, zoneName)}</span>
            <span className={`source-chip ${current?.source ?? "off"}`}>
              {current?.source === "manual" ? <Hand size={12} aria-hidden="true" /> : current?.source === "scheduled" ? <CalendarClock size={12} aria-hidden="true" /> : current?.source === "smart" ? <Cpu size={12} aria-hidden="true" /> : null}
              {current?.source === "manual" ? tr("Manual") : current?.source === "scheduled" ? tr("Scheduled") : current?.source === "smart" ? tr("Smart") : tr("No surge")}
            </span>
          </div>
          <div className="surge-big" data-testid="surge-now">×{(current?.multiplier ?? 1).toFixed(1)}</div>
          <div className="surge-gauge" aria-hidden="true"><i style={{ width: `${Math.min(100, (((current?.multiplier ?? 1) - 1) / 5) * 100)}%`, background: LEVEL_COLOR[current?.level ?? "none"] }} /></div>
          <dl className="surge-facts">
            <div><dt>{tr("Ride requests")}</dt><dd>{current?.requests ?? 0}</dd></div>
            <div><dt>{tr("Free online drivers")}</dt><dd>{current?.free ?? 0}</dd></div>
            <div><dt>{tr("Requests per free driver")}</dt><dd>{(current?.ratio ?? 0).toFixed(1)}</dd></div>
            <div><dt>{tr("Time profile")}</dt><dd>{profileNow?.name ?? "—"}</dd></div>
          </dl>
          <p className="surge-note">
            {current?.source === "manual" && running ? tr("Manual surge until {0}, started by {1}. Smart surge is paused.", [time.format(Date.parse(running.endsAt)), running.by])
              : current?.source === "scheduled" ? tr("Scheduled \"{0}\" until {1}.", [current.scheduledName, time.format(Date.parse(current.endsAt!))])
              : current?.smartNote ? `${current.smartNote}.`
              : current?.source === "smart" ? tr("Smart surge follows demand and stops by itself when requests per free online driver stay under {0} for {1} min.", [profileNow?.steps[0]?.ratio ?? 1.5, book.smart.stopAfterMin])
              : tr("Enough drivers. Smart surge is watching.")}
          </p>
        </section>

        <section className="surge-manual" aria-labelledby="manual-title">
          <h3 id="manual-title">{trn("{0} Manual surge", <Zap size={16} aria-hidden="true" />)}</h3>
          {running ? (
            <div className="manual-running">
              <strong>{trn("×{0} running", running.multiplier.toFixed(1))}</strong>
              <span>{trn("Ends {0} · {1} min left", time.format(Date.parse(running.endsAt)), Math.max(0, Math.round((Date.parse(running.endsAt) - now) / 60_000)))}</span>
              <CommandButton command="admin.pricing.stopSurge" className="dash-btn danger" targetId={zoneId} confirmTarget={false} scope={zoneId} before={`×${running.multiplier}`} after="stopped" expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={stop.store} disabled={!canEdit || Boolean(stop.error)} title={stop.error} onDone={() => onNotice(tr("Manual surge in {0} stopped.", [zoneName]))}>{trn("{0} Stop surge", <Square size={13} aria-hidden="true" />)}</CommandButton>
            </div>
          ) : (
            <>
              <SurgeSlider label={tr("Manual surge")} value={manual} onChange={setManual} disabled={!canEdit} />
              <label className="field inline">{trn("Runs for{0}", <select aria-label={tr("Manual surge duration")} value={minutes} disabled={!canEdit} onChange={(event) => setMinutes(Number(event.target.value))}>
                  {DURATIONS.map((value) => <option key={value} value={value}>{value < 60 ? tr("{0} min", [value]) : tr("{0} h", [value / 60])}</option>)}
                </select>)}</label>
              <CommandButton command="admin.pricing.startSurge" className="dash-btn surge-go" targetId={zoneId} confirmTarget={false} scope={zoneId} before="no manual surge" after={`×${manual.toFixed(1)} for ${minutes} min`} expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={start.store} disabled={!canEdit || manual <= 1 || Boolean(start.error)} title={manual <= 1 ? tr("Move the slider above ×1.0") : start.error} onDone={() => onNotice(tr("Manual surge ×{0} started in {1} for {2}.{3}", [manual.toFixed(1), zoneName, minutes < 60 ? `${minutes} min` : `${minutes / 60} h`, live.notifyDrivers ? " Drivers were told." : ""]))}>{trn("{0} Start surge ×{1}", <Zap size={14} aria-hidden="true" />, manual.toFixed(1))}</CommandButton>
              <small className="fine">{tr("It stops by itself at the end. Manual surge wins over smart and scheduled surge.")}</small>
            </>
          )}
          <div className="notify-row">
            <CommandButton command="admin.pricing.notifySetting" className={live.notifyDrivers ? "surge-toggle on" : "surge-toggle"} targetId={zoneId} confirmTarget={false} scope={zoneId} before={String(live.notifyDrivers)} after={String(!live.notifyDrivers)} expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={setNotifyDrivers(store, zoneId, !live.notifyDrivers)} disabled={!canEdit} aria-label={tr("Tell drivers when a surge starts")}>{trn("{0} Tell drivers when a surge starts {1}", <BellRing size={14} aria-hidden="true" />, <span className="switch" aria-hidden="true"><i /></span>)}</CommandButton>
            <CommandButton command="admin.pricing.notifyDrivers" className="dash-btn small ghost" targetId={zoneId} confirmTarget={false} scope={zoneId} before="" after={`drivers told ×${(current?.multiplier ?? 1).toFixed(1)}`} expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={agentId ? notifyDriversNow(store, zoneId, current?.multiplier ?? 1, agentId, at) : store} disabled={!canEdit || (current?.multiplier ?? 1) <= 1} title={(current?.multiplier ?? 1) <= 1 ? tr("No surge to tell drivers about") : undefined} onDone={() => onNotice(tr("Drivers in and near {0} were told about surge ×{1}.", [zoneName, (current?.multiplier ?? 1).toFixed(1)]))}>{trn("{0} Tell drivers now", <Megaphone size={13} aria-hidden="true" />)}</CommandButton>
          </div>
          {live.lastNotifiedAt ? <small className="fine">{trn("Drivers last told {0}.", dateTime.format(Date.parse(live.lastNotifiedAt)))}</small> : null}
        </section>
      </div>

      {/* Alerts only when a person is needed */}
      <section className="surge-alerts" aria-label={tr("Surge alerts")}>
        {alerts.length === 0 ? (
          <p className="all-good">{trn("{0} All zones are fine. Smart surge is handling demand.", <Activity size={15} aria-hidden="true" />)}</p>
        ) : alerts.map((alert) => (
          <div key={alert.id} className={`surge-alert ${alert.tone}`} role={alert.tone === "critical" ? "alert" : undefined}>
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
              <strong>{trx(alert.title)}</strong>
              <small>{trx(alert.detail)}</small>
            </div>
            <button data-command="admin.pricing.zone" type="button" className="dash-btn small" onClick={() => { onSelectZone(alert.zoneId); document.getElementById(alert.action === "settings" ? "smart-title" : "manual-title")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
              {alert.action === "manual" ? tr("Start manual surge") : alert.action === "stop" ? tr("Review surge") : tr("Open settings")}
            </button>
          </div>
        ))}
      </section>

      <section className="dash-card surge-map-card" aria-labelledby="surge-map-title">
        <div className="card-head">
          <h3 id="surge-map-title">{trn("{0} Surge map · {1}", <Zap size={16} aria-hidden="true" />, trx(market.name))}</h3>
          <span className="fine-print">{tr("Click a zone to open it")}</span>
        </div>
        <SurgeMap market={market} rows={rows.map((row) => row.surge)} selectedId={zoneId} onSelect={onSelectZone} shown={map.shown} style={map.style} onShown={map.setShown} onStyle={map.setStyle} />
        <ul className="zone-surge-strip" aria-label={tr("Surge by zone")}>
          {[...rows].sort((a, b) => b.surge.multiplier - a.surge.multiplier || b.surge.ratio - a.surge.ratio).map(({ surge }) => (
            <li key={surge.zoneId}>
              <button data-command="admin.pricing.zone" type="button" className={surge.zoneId === zoneId ? "active" : undefined} onClick={() => onSelectZone(surge.zoneId)}>
                <i style={{ background: LEVEL_COLOR[surge.level] }} />
                <span>{surge.name}</span>
                <b>×{surge.multiplier.toFixed(1)}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="surge-two">
        <section className="dash-card" aria-labelledby="demand-title">
          <div className="card-head">
            <h3 id="demand-title">{trn("{0} Demand · {1}", <TrendingUp size={16} aria-hidden="true" />, zoneName)}</h3>
            <span className="fine-print">{tr("Last 6 hours")}</span>
          </div>
          <DemandChart points={series} surge={seriesSurge} locale={market.locale} timeZone={market.timeZone} />
        </section>
        <section className="dash-card" aria-labelledby="check-title">
          <div className="card-head">
            <h3 id="check-title">{trn("{0} Rider price check", <Eye size={16} aria-hidden="true" />)}</h3>
            <span className="fine-print">{tr("Last hour")}</span>
          </div>
          {check.saw ? (
            <div className="price-check">
              <div><span>{tr("Saw the surge price")}</span><strong>{check.saw}</strong></div>
              <div className={check.leftPct >= 25 ? "warn" : undefined}><span>{tr("Left without booking")}</span><strong>{check.left}</strong><small>{check.leftPct}%</small></div>
              <p>{check.leftPct >= 25 ? tr("Many riders leave at this price. Consider a lower surge or a driver boost.") : tr("Most riders still book at this price.")}</p>
            </div>
          ) : <p className="state-line">{trn("No surge in {0} in the last hour, so no rider saw a higher price.", zoneName)}</p>}
        </section>
      </div>

      {/* Smart surge settings, saved with the draft */}
      <section className="dash-card smart-card" aria-labelledby="smart-title">
        <div className="card-head">
          <h3 id="smart-title">{trn("{0} Smart surge · {1}", <Cpu size={16} aria-hidden="true" />, zoneName)}</h3>
          <label className="mini-switch big">
            <input type="checkbox" aria-label={tr("Smart surge on")} checked={book.smart.enabled} disabled={!canEdit} onChange={(event) => onSmart({ enabled: event.target.checked })} />
            <span aria-hidden="true"><i /></span>
            {book.smart.enabled ? tr("On") : tr("Off")}
          </label>
        </div>
        <p className="smart-explain">{trn("Every {0} min smart surge compares {1} with {2} (online and not on a trip). Many drivers and few requests means no surge. It starts only when a level holds for {3} min, goes down one step at a time, waits {4} min between changes, and stops by itself when the level stays low for {5} min.", book.smart.checkEveryMin, <b>{tr("ride requests")}</b>, <b>{tr("free online drivers")}</b>, book.smart.holdMin, book.smart.cooldownMin, book.smart.stopAfterMin)}</p>
        <div className={bad.has("smart.active") || bad.has("smart.checkEveryMin") ? "timing-grid invalid" : "timing-grid"}>
          <label className="field">{trn("Active from{0}", <input type="time" aria-label={tr("Smart surge active from")} value={book.smart.activeFrom} disabled={!canEdit} onChange={(event) => onSmart({ activeFrom: event.target.value })} />)}</label>
          <label className="field">{trn("Active until{0}", <input type="time" aria-label={tr("Smart surge active until")} value={book.smart.activeTo} disabled={!canEdit} onChange={(event) => onSmart({ activeTo: event.target.value })} />)}</label>
          <label className="field">{trn("Check every{0}", <NumberField label={tr("Check every")} value={book.smart.checkEveryMin} unit="min" max={15} disabled={!canEdit} onChange={(value) => onSmart({ checkEveryMin: value })} />)}</label>
          <label className="field">{trn("Start only if it holds{0}", <NumberField label={tr("Start only if it holds")} value={book.smart.holdMin} unit="min" max={30} disabled={!canEdit} onChange={(value) => onSmart({ holdMin: value })} />)}</label>
          <label className="field">{trn("Stop after low for{0}", <NumberField label={tr("Stop after low for")} value={book.smart.stopAfterMin} unit="min" max={60} disabled={!canEdit} onChange={(value) => onSmart({ stopAfterMin: value })} />)}</label>
          <label className="field">{trn("Wait between changes{0}", <NumberField label={tr("Wait between changes")} value={book.smart.cooldownMin} unit="min" max={30} disabled={!canEdit} onChange={(value) => onSmart({ cooldownMin: value })} />)}</label>
        </div>
        <small className="fine">{trn("{0} {1} The first matching profile from the top wins; Normal is used the rest of the time.", book.smart.activeFrom === book.smart.activeTo ? tr("Active all day.") : tr("Active {0}–{1}.", [book.smart.activeFrom, book.smart.activeTo]), hoursOn ? "" : tr("Outside active hours now."))}</small>

        <div className="profile-list">
          {book.smart.profiles.map((profile, index) => {
            const isNow = profileNow?.id === profile.id;
            const invalid = bad.has(`smart.${profile.id}`);
            return (
              <article key={profile.id} className={["profile-card", isNow ? "now" : "", invalid ? "invalid" : ""].filter(Boolean).join(" ")} aria-label={tr("Time profile {0}", [profile.name])}>
                <div className="profile-head">
                  <input className="profile-name" aria-label={tr("Profile name")} value={profile.name} disabled={!canEdit} onChange={(event) => patchProfile(profile.id, { name: event.target.value })} />
                  {isNow ? <span className="badge-live">{tr("Active now")}</span> : null}
                  {profile.isDefault ? <span className="badge-soft">{tr("Fallback")}</span> : (
                    <span className="profile-tools">
                      <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} up", [profile.name])} disabled={!canEdit || index === 0} onClick={() => moveProfile(profile.id, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                      <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={tr("Move {0} down", [profile.name])} disabled={!canEdit || book.smart.profiles[index + 1]?.isDefault !== false} onClick={() => moveProfile(profile.id, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                      <button data-command="admin.pricing.edit" type="button" className="icon-ghost danger" aria-label={tr("Delete profile {0}", [profile.name])} disabled={!canEdit} onClick={() => onSmart({ profiles: book.smart.profiles.filter((item) => item.id !== profile.id) })}><Trash2 size={14} aria-hidden="true" /></button>
                    </span>
                  )}
                </div>
                {profile.isDefault ? <p className="fine">{tr("Used whenever no other profile matches.")}</p> : (
                  <>
                    <div className="day-chips" role="group" aria-label={tr("{0} days", [profile.name])}>
                      {WEEKDAY_LABELS.map((day, dayIndex) => (
                        <label key={day} className={profile.days.includes(dayIndex) ? "day on" : "day"}>
                          <input type="checkbox" aria-label={`${profile.name} ${day}`} checked={profile.days.includes(dayIndex)} disabled={!canEdit} onChange={(event) => patchProfile(profile.id, { days: event.target.checked ? [...profile.days, dayIndex].sort() : profile.days.filter((item) => item !== dayIndex) })} />
                          {day}
                        </label>
                      ))}
                    </div>
                    <div className="window-list">
                      {profile.windows.map((window, windowIndex) => (
                        <span key={windowIndex} className="window">
                          <Clock size={13} aria-hidden="true" />
                          <input type="time" aria-label={tr("{0} from", [profile.name])} value={window.from} disabled={!canEdit} onChange={(event) => patchProfile(profile.id, { windows: profile.windows.map((item, i) => (i === windowIndex ? { ...item, from: event.target.value } : item)) })} />
                          –
                          <input type="time" aria-label={tr("{0} to", [profile.name])} value={window.to} disabled={!canEdit} onChange={(event) => patchProfile(profile.id, { windows: profile.windows.map((item, i) => (i === windowIndex ? { ...item, to: event.target.value } : item)) })} />
                          {profile.windows.length > 1 ? <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={tr("Remove time window")} disabled={!canEdit} onClick={() => patchProfile(profile.id, { windows: profile.windows.filter((_, i) => i !== windowIndex) })}><Trash2 size={12} aria-hidden="true" /></button> : null}
                        </span>
                      ))}
                      <button data-command="admin.pricing.edit" type="button" className="link-action" disabled={!canEdit} onClick={() => patchProfile(profile.id, { windows: [...profile.windows, { from: "12:00", to: "14:00" }] })}>{tr("+ time")}</button>
                    </div>
                  </>
                )}
                <div className="step-list">
                  {profile.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="step-row">
                      <span className="step-when">{tr("When requests per free driver reach")}</span>
                      <NumberField label={tr("{0} step {1} level", [profile.name, stepIndex + 1])} value={step.ratio} step={0.1} max={20} disabled={!canEdit} onChange={(value) => patchProfile(profile.id, { steps: profile.steps.map((item, i) => (i === stepIndex ? { ...item, ratio: value } : item)) })} />
                      <SurgeSlider compact label={tr("{0} step {1} surge", [profile.name, stepIndex + 1])} value={step.multiplier} disabled={!canEdit} onChange={(value) => patchProfile(profile.id, { steps: profile.steps.map((item, i) => (i === stepIndex ? { ...item, multiplier: value } : item)) })} />
                      {profile.steps.length > 1 ? <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={tr("Remove {0} step {1}", [profile.name, stepIndex + 1])} disabled={!canEdit} onClick={() => patchProfile(profile.id, { steps: profile.steps.filter((_, i) => i !== stepIndex) })}><Trash2 size={13} aria-hidden="true" /></button> : <span />}
                    </div>
                  ))}
                  {profile.steps.length < 5 ? (
                    <button data-command="admin.pricing.edit" type="button" className="link-action" disabled={!canEdit} onClick={() => {
                      const last = profile.steps[profile.steps.length - 1] ?? { ratio: 1, multiplier: 1 };
                      patchProfile(profile.id, { steps: [...profile.steps, { ratio: Math.round((last.ratio + 1) * 10) / 10, multiplier: Math.min(profile.cap, Math.round((last.multiplier + 0.3) * 10) / 10) }] });
                    }}>{tr("+ step")}</button>
                  ) : null}
                </div>
                <SurgeSlider compact label={tr("{0} cap", [profile.name])} value={profile.cap} disabled={!canEdit} onChange={(value) => patchProfile(profile.id, { cap: value })} />
              </article>
            );
          })}
        </div>
        <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => {
          const list = [...book.smart.profiles];
          const fallback = list.findIndex((profile) => profile.isDefault);
          list.splice(fallback < 0 ? list.length : fallback, 0, { id: `profile-${Date.now() % 1_000_000}`, name: "New profile", days: [5, 6], windows: [{ from: "10:00", to: "14:00" }], steps: [{ ratio: 1.5, multiplier: 1.2 }, { ratio: 2, multiplier: 1.5 }], cap: 2, isDefault: false });
          onSmart({ profiles: list });
        }}>{trn("{0} Add time profile", <Plus size={14} aria-hidden="true" />)}</button>
      </section>

      <div className="surge-two">
        <section className="dash-card" aria-labelledby="scheduled-title">
          <div className="card-head">
            <h3 id="scheduled-title">{trn("{0} Scheduled surges", <CalendarClock size={16} aria-hidden="true" />)}</h3>
            <span className="fine-print">{tr("Events, holidays")}</span>
          </div>
          {book.scheduled.length === 0 ? <p className="state-line">{trn("Nothing planned for {0}.", zoneName)}</p> : (
            <ul className="scheduled-list" aria-label={tr("Scheduled surges")}>
              {book.scheduled.map((item) => (
                <li key={item.id} className={bad.has(`scheduled.${item.id}`) ? "invalid" : undefined}>
                  <input aria-label={tr("Scheduled surge name")} placeholder={tr("Name, e.g. Concert")} value={item.name} disabled={!canEdit} onChange={(event) => onScheduled(book.scheduled.map((row) => (row.id === item.id ? { ...row, name: event.target.value } : row)))} />
                  <div className="sched-times">
                    <input type="datetime-local" aria-label={tr("Scheduled surge start")} value={localInput(item.startsAt, market.timeZone)} disabled={!canEdit} onChange={(event) => onScheduled(book.scheduled.map((row) => (row.id === item.id ? { ...row, startsAt: fromLocalInput(event.target.value, market.timeZone) } : row)))} />
                    <input type="datetime-local" aria-label={tr("Scheduled surge end")} value={localInput(item.endsAt, market.timeZone)} disabled={!canEdit} onChange={(event) => onScheduled(book.scheduled.map((row) => (row.id === item.id ? { ...row, endsAt: fromLocalInput(event.target.value, market.timeZone) } : row)))} />
                  </div>
                  <SurgeSlider compact label={tr("{0} surge", [item.name || "Scheduled"])} value={item.multiplier} disabled={!canEdit} onChange={(value) => onScheduled(book.scheduled.map((row) => (row.id === item.id ? { ...row, multiplier: value } : row)))} />
                  <button data-command="admin.pricing.edit" type="button" className="icon-ghost danger" aria-label={tr("Remove scheduled surge {0}", [item.name])} disabled={!canEdit} onClick={() => onScheduled(book.scheduled.filter((row) => row.id !== item.id))}><Trash2 size={14} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          <button data-command="admin.pricing.schedule" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => {
            const startAt = Math.ceil(now / 3_600_000) * 3_600_000 + 2 * 3_600_000;
            onScheduled([...book.scheduled, { id: `${zoneId}-sched-${startAt}-${book.scheduled.length}`, name: "", multiplier: 1.5, startsAt: new Date(startAt).toISOString(), endsAt: new Date(startAt + 3 * 3_600_000).toISOString() }]);
          }}>{trn("{0} Plan a surge", <Plus size={14} aria-hidden="true" />)}</button>
        </section>

        <section className="dash-card" aria-labelledby="timeline-title">
          <div className="card-head">
            <h3 id="timeline-title">{trn("{0} Surge timeline and effect", <Activity size={16} aria-hidden="true" />)}</h3>
            <span className="fine-print">{tr("Last 8 hours")}</span>
          </div>
          {timeline.length === 0 ? <p className="state-line">{trn("No surge in {0} in the last hours.", zoneName)}</p> : (
            <ol className="surge-timeline" aria-label={tr("Surge timeline")}>
              {timeline.map((item) => (
                <li key={item.id} className={`src-${item.source}`}>
                  <time>{dateTime.format(item.at)}</time>
                  <div>
                    <strong>{trx(item.title)}</strong>
                    <small>{item.by}</small>
                    {item.effect ? (
                      <span className="effect">
                        <b className="good">{trn("+{0} drivers came", item.effect.drivers)}</b>
                        <b className={item.effect.ridesPct >= 0 ? "good" : "bad"}>{trn("rides {0}{1}%", item.effect.ridesPct >= 0 ? "+" : "", item.effect.ridesPct)}</b>
                        <b className={item.effect.leftPct >= 25 ? "bad" : "soft"}>{trn("{0}% left on price", item.effect.leftPct)}</b>
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
