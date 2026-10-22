import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Maximize2, Minus, Plus, X, Zap } from "lucide-react";
import { useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { localParts } from "../dashboard/time";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";
import { SurgeCurve } from "./SurgeCurve";
import { DURATION_CHIPS, curvePreset, minutesUntil, type CurvePoint } from "./surgeCurve";
import { sliderColor, type ZoneSurge } from "./surge";
import { HIGH_SURGE, SLICE_KEY, SLIDER_MAX, emptyPricingStore, normalizeStore, startManualSurge, stopManualSurges, zoneLive } from "./zonePricing";

const SOURCE_LABEL: Record<ZoneSurge["source"], string> = { manual: "Manual", scheduled: "Scheduled", smart: "Smart", off: "No surge" };
const round1 = (value: number) => Math.round(value * 10) / 10;

type TimeMode = "chip" | "minutes" | "until";

/**
 * Click a surge zone on a live map: change its surge right there. Level − / +, on or off, how long
 * (quick chips, minutes or an exact end time) and, if wanted, a curve over that time. OK goes through
 * the same Pricing › Surge commands, with the same limits, reasons and approvals.
 */
export function SurgeQuickPopup({ zone, timeZone, fullLink, onClose, onNotice }: { zone: ZoneSurge; timeZone: string; fullLink: string | null; onClose: () => void; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  const slice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  const store = useMemo(() => normalizeStore(slice.value), [slice.value]);
  const canEdit = Boolean(agent && can(agent.role, "settings.publish"));
  const now = Date.now();
  const at = new Date(now).toISOString();
  const live = zoneLive(store, zone.zoneId);
  const running = live.manual && Date.parse(live.manual.endsAt) > now ? live.manual : null;

  const [on, setOn] = useState(true);
  const [level, setLevel] = useState(() => round1(zone.multiplier > 1 ? zone.multiplier : 1.5));
  const [mode, setMode] = useState<TimeMode>("chip");
  const [chip, setChip] = useState<number>(30);
  const [custom, setCustom] = useState("45");
  const [until, setUntil] = useState("");
  const [shaped, setShaped] = useState(false);
  const [points, setPoints] = useState<CurvePoint[]>(() => curvePreset("flat", 30, level));
  const [keepHigh, setKeepHigh] = useState(false);

  const local = localParts(now, timeZone);
  const minutes = mode === "chip" ? chip : mode === "minutes" ? Number(custom) : minutesUntil(until, local.hour * 60 + local.minute) ?? Number.NaN;
  const endsAt = Number.isFinite(minutes) ? new Date(now + minutes * 60_000) : null;
  const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone });
  const curve = shaped && Number.isFinite(minutes) ? points.map((point) => ({ ...point, atMin: Math.min(point.atMin, minutes) })) : undefined;
  const peak = curve ? Math.max(1, ...curve.map((point) => point.multiplier)) : level;
  const high = peak > HIGH_SURGE;

  const start = agent && Number.isFinite(minutes) ? startManualSurge(store, zone.zoneId, level, minutes, agent.id, "Manual surge from the live map", at, curve) : { store, error: agent ? tr("Pick how long it runs.") : tr("Sign in again.") };
  const stop = agent ? stopManualSurges(store, [zone.zoneId], agent.id, "Manual surge stopped from the live map", at) : { store, error: tr("Sign in again."), stopped: [] };
  const startBlocked = !canEdit || (!curve && level <= 1) || Boolean(start.error) || (high && !keepHigh);
  const startWhy = !canEdit ? tr("Your role cannot change surge.") : !curve && level <= 1 ? tr("Raise the surge above ×1.0") : start.error ? trx(start.error) : high && !keepHigh ? tr("Tick to keep a surge above ×{0}.", [HIGH_SURGE]) : undefined;

  function pickMinutes(next: number) {
    setMode("chip");
    setChip(next);
    if (shaped) setPoints(curvePreset("flat", next, level));
  }

  function changeShape(nextOn: boolean) {
    setShaped(nextOn);
    if (nextOn && Number.isFinite(minutes)) setPoints(curvePreset("rampDown", minutes, level));
  }

  return (
    <aside className="map-quick-pop surge-quick" role="dialog" aria-label={tr("Surge in {0}", [zone.name])} data-testid="surge-quick-popup">
      <header className="mq-head">
        <span className="mq-icon" style={{ background: sliderColor(zone.multiplier) }}><Zap size={14} aria-hidden="true" /></span>
        <div>
          <strong>{zone.name}</strong>
          <small>{trn("Now ×{0} · {1}", zone.multiplier.toFixed(1), trx(SOURCE_LABEL[zone.source]))}{running ? tr(" · until {0}", [clock.format(Date.parse(running.endsAt))]) : ""}{running?.curve ? tr(" · curve") : ""}</small>
        </div>
        <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label={tr("Close")} onClick={onClose}><X size={14} /></button>
      </header>

      <button data-command="admin.pricing.startSurge" type="button" className={on ? "surge-toggle on" : "surge-toggle"} aria-pressed={on} disabled={!canEdit} onClick={() => setOn((value) => !value)}>
        {trn("Manual surge {0}", <span className="switch" aria-hidden="true"><i /></span>)}
      </button>

      {on ? (
        <>
          {!shaped ? (
            <div className="mq-level" role="group" aria-label={tr("Surge level")}>
              <button data-command="admin.pricing.startSurge" type="button" className="dash-btn small ghost" aria-label={tr("Lower the surge")} disabled={!canEdit || level <= 1.1} onClick={() => setLevel((value) => Math.max(1.1, round1(value - 0.1)))}><Minus size={14} /></button>
              <output aria-live="polite" style={{ color: sliderColor(level) }}>{`×${level.toFixed(1)}`}</output>
              <button data-command="admin.pricing.startSurge" type="button" className="dash-btn small ghost" aria-label={tr("Raise the surge")} disabled={!canEdit || level >= SLIDER_MAX} onClick={() => setLevel((value) => Math.min(SLIDER_MAX, round1(value + 0.1)))}><Plus size={14} /></button>
            </div>
          ) : null}

          <fieldset className="mq-time">
            <legend>{tr("How long")}</legend>
            <div className="mq-chips">
              {DURATION_CHIPS.map((value) => (
                <button data-command="admin.pricing.startSurge" key={value} type="button" className={mode === "chip" && chip === value ? "mq-chip active" : "mq-chip"} aria-pressed={mode === "chip" && chip === value} onClick={() => pickMinutes(value)}>
                  {value < 60 ? tr("{0} min", [value]) : tr("{0} h", [value / 60])}
                </button>
              ))}
            </div>
            <div className="mq-time-row">
              <label>{tr("Minutes")}<input type="number" min={5} max={720} step={5} value={mode === "minutes" || !Number.isFinite(minutes) ? custom : String(minutes)} aria-label={tr("Surge minutes")} onFocus={() => { if (mode !== "minutes" && Number.isFinite(minutes)) setCustom(String(minutes)); setMode("minutes"); }} onChange={(event) => { setMode("minutes"); setCustom(event.target.value); }} /></label>
              <label>{tr("Until")}<input type="time" value={until} aria-label={tr("Surge ends at")} onFocus={() => setMode("until")} onChange={(event) => { setMode("until"); setUntil(event.target.value); }} /></label>
            </div>
            <small className="fine">{endsAt ? tr("Ends by itself at {0}, then back to normal.", [clock.format(endsAt)]) : tr("Pick how long it runs.")}</small>
          </fieldset>

          <button data-command="admin.pricing.startSurge" type="button" className={shaped ? "surge-toggle on" : "surge-toggle"} aria-pressed={shaped} disabled={!canEdit || !Number.isFinite(minutes)} onClick={() => changeShape(!shaped)}>
            {trn("Shape it over time (curve) {0}", <span className="switch" aria-hidden="true"><i /></span>)}
          </button>
          {shaped && Number.isFinite(minutes) ? <SurgeCurve durationMin={minutes} cap={SLIDER_MAX} top={level} points={curve ?? points} onChange={setPoints} disabled={!canEdit} /> : null}

          {high ? (
            <label className="mq-warn check-row">
              <AlertTriangle size={14} aria-hidden="true" />
              <input type="checkbox" checked={keepHigh} onChange={(event) => setKeepHigh(event.target.checked)} />
              {tr("Keep a surge above ×{0}. Riders may find it too expensive.", [HIGH_SURGE])}
            </label>
          ) : null}
        </>
      ) : (
        <p className="fine">{running ? tr("OK stops the manual surge now. Smart and scheduled surge take over again.") : tr("No manual surge is running here.")}</p>
      )}

      <footer className="mq-foot">
        {on ? (
          <CommandButton command="admin.pricing.startSurge" className="dash-btn small surge-go" targetId={zone.zoneId} confirmTarget={false} scope={zone.zoneId} before={running ? `×${running.multiplier}` : "no manual surge"} after={curve ? `curve up to ×${peak.toFixed(1)} for ${minutes} min` : `×${level.toFixed(1)} for ${minutes} min`} expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={start.store} disabled={startBlocked} title={startWhy} onDone={() => { onNotice(tr("Surge in {0} set: {1} for {2} min.", [zone.name, curve ? tr("curve up to ×{0}", [peak.toFixed(1)]) : `×${level.toFixed(1)}`, minutes])); onClose(); }}>
            {tr("OK")}
          </CommandButton>
        ) : (
          <CommandButton command="admin.pricing.stopSurge" className="dash-btn small danger" targetId={zone.zoneId} confirmTarget={false} scope={zone.zoneId} before={running ? `×${running.multiplier}` : "none"} after="stopped" expectedSliceRev={store.draftRev} sliceKey={SLICE_KEY} value={stop.store} disabled={!canEdit || Boolean(stop.error)} title={stop.error ? trx(stop.error) : undefined} onDone={() => { onNotice(tr("Manual surge in {0} stopped.", [zone.name])); onClose(); }}>
            {tr("OK")}
          </CommandButton>
        )}
        {fullLink ? <Link className="dash-btn small ghost" to={fullLink}>{trn("{0} Open full screen ›", <Maximize2 size={12} aria-hidden="true" />)}</Link> : null}
      </footer>
      <small className="fine">{tr("A ride keeps the price it was quoted. Big changes may need a second admin, like in Pricing.")}</small>
    </aside>
  );
}
