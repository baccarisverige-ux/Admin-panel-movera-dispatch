import { useState, type CSSProperties } from "react";
import { AlertTriangle } from "lucide-react";
import { sliderColor } from "./surge";
import { HIGH_SURGE, SLIDER_MAX, SLIDER_MIN } from "./zonePricing";
import { trn, trx } from "../i18n";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Lower and upper bound when a step must stay between its neighbours. */
  min?: number;
  max?: number;
  compact?: boolean;
};

/**
 * Drag to set a surge from ×1.0 to ×6.0. The colour follows the level, and going above ×3
 * asks the admin to keep it or step back, so a slip of the mouse does not price riders out.
 */
export function SurgeSlider({ label, value, onChange, disabled = false, min = SLIDER_MIN, max = SLIDER_MAX, compact = false }: Props) {
  const [pending, setPending] = useState<number | null>(null);
  const [before, setBefore] = useState(value);
  const shown = pending ?? value;
  const color = sliderColor(shown);
  const fill = ((shown - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  function commit() {
    if (value > HIGH_SURGE && before <= HIGH_SURGE) setPending(value);
    else setBefore(value);
  }

  return (
    <div className={compact ? "surge-slider compact" : "surge-slider"} style={{ "--slider-color": color, "--slider-fill": `${fill}%` } as CSSProperties}>
      <div className="surge-slider-head">
        <span>{trx(label)}</span>
        <output aria-live="polite">×{shown.toFixed(1)}</output>
      </div>
      <input
        type="range"
        aria-label={label}
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={0.1}
        value={shown}
        disabled={disabled || pending !== null}
        onPointerDown={() => setBefore(value)}
        onChange={(event) => {
          const next = Math.min(max, Math.max(min, Number(event.target.value)));
          onChange(Math.round(next * 10) / 10);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {!compact ? (
        <div className="surge-slider-scale" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((tick) => <span key={tick}>×{tick}</span>)}
        </div>
      ) : null}
      {pending !== null ? (
        <div className="surge-high" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{trn("×{0} is a high surge. Riders pay {1} times the normal trip price.", pending.toFixed(1), pending.toFixed(1))}</span>
          <button data-command="admin.pricing.edit" type="button" className="dash-btn small" onClick={() => { setBefore(pending); setPending(null); }}>{trn("Keep ×{0}", pending.toFixed(1))}</button>
          <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" onClick={() => { onChange(Math.max(min, HIGH_SURGE)); setBefore(Math.max(min, HIGH_SURGE)); setPending(null); }}>{trn("Back to ×{0}", Math.max(min, HIGH_SURGE).toFixed(1))}</button>
        </div>
      ) : null}
    </div>
  );
}
