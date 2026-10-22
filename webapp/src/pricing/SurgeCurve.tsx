import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Plus } from "lucide-react";
import { CURVE_PRESETS, STEP_MIN, cleanPoints, curvePreset, curveSteps, type CurvePoint, type CurvePreset } from "./surgeCurve";
import { sliderColor } from "./surge";
import { tr, trn, trx } from "../i18n";

const W = 300;
const H = 132;
const PAD = { left: 30, right: 10, top: 10, bottom: 22 };

/**
 * A small surge curve over the chosen time, like a speed curve in a video editor: time goes left to right,
 * the surge level up and down. Drag a point, or focus it and use the arrow keys (↑↓ level, ←→ time).
 * Delete removes a middle point. The stepped line shows the 5-minute steps riders actually get.
 */
export function SurgeCurve({ durationMin, cap, top, points, onChange, disabled = false }: { durationMin: number; cap: number; top: number; points: CurvePoint[]; onChange: (points: CurvePoint[]) => void; disabled?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const yMax = Math.min(cap, Math.max(2, Math.ceil(Math.max(top, ...points.map((point) => point.multiplier)) + 0.5)));
  const x = (minute: number) => PAD.left + (minute / durationMin) * (W - PAD.left - PAD.right);
  const y = (multiplier: number) => PAD.top + (1 - (multiplier - 1) / (yMax - 1)) * (H - PAD.top - PAD.bottom);
  const set = (next: CurvePoint[]) => onChange(cleanPoints(next, durationMin, cap));

  function move(index: number, minute: number, multiplier: number) {
    const last = points.length - 1;
    const low = index === 0 ? 0 : points[index - 1].atMin + 1;
    const high = index === last ? durationMin : points[index + 1].atMin - 1;
    const atMin = index === 0 ? 0 : index === last ? durationMin : Math.min(high, Math.max(low, Math.round(minute)));
    set(points.map((point, i) => (i === index ? { atMin, multiplier } : point)));
  }

  function fromPointer(event: PointerEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const px = ((event.clientX - box.left) / box.width) * W;
    const py = ((event.clientY - box.top) / box.height) * H;
    const minute = ((px - PAD.left) / (W - PAD.left - PAD.right)) * durationMin;
    const multiplier = 1 + (1 - (py - PAD.top) / (H - PAD.top - PAD.bottom)) * (yMax - 1);
    return { minute, multiplier: Math.round(multiplier * 10) / 10 };
  }

  function onKey(event: KeyboardEvent<SVGCircleElement>, index: number) {
    const point = points[index];
    const keys: Record<string, [number, number]> = { ArrowUp: [0, 0.1], ArrowDown: [0, -0.1], ArrowRight: [STEP_MIN, 0], ArrowLeft: [-STEP_MIN, 0] };
    if (keys[event.key]) {
      event.preventDefault();
      const [dm, dv] = keys[event.key];
      move(index, point.atMin + dm, Math.round((point.multiplier + dv) * 10) / 10);
    } else if ((event.key === "Delete" || event.key === "Backspace") && index > 0 && index < points.length - 1) {
      event.preventDefault();
      set(points.filter((_, i) => i !== index));
    }
  }

  function addPoint() {
    // A new point in the middle of the widest gap, on the line.
    let at = 0;
    let gap = -1;
    for (let i = 1; i < points.length; i += 1) if (points[i].atMin - points[i - 1].atMin > gap) { gap = points[i].atMin - points[i - 1].atMin; at = i; }
    if (gap < 2) return;
    const a = points[at - 1];
    const b = points[at];
    const mid = { atMin: Math.round((a.atMin + b.atMin) / 2), multiplier: Math.round(((a.multiplier + b.multiplier) / 2) * 10) / 10 };
    set([...points.slice(0, at), mid, ...points.slice(at)]);
  }

  const steps = curveSteps(points, durationMin);
  const stepPath = steps.map((step, i) => `${i === 0 ? "M" : "L"}${x(step.fromMin)},${y(step.multiplier)} H${x(Math.min(durationMin, step.fromMin + STEP_MIN))}`).join(" ");
  const line = points.map((point, i) => `${i === 0 ? "M" : "L"}${x(point.atMin)},${y(point.multiplier)}`).join(" ");
  const ticks = [0, durationMin / 2, durationMin];

  return (
    <div className="surge-curve" data-testid="surge-curve">
      <div className="surge-curve-presets" role="group" aria-label={tr("Curve shape")}>
        {CURVE_PRESETS.map((preset) => (
          <button data-command="admin.pricing.startSurge" key={preset.id} type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set(curvePreset(preset.id as CurvePreset, durationMin, top))}>{trx(preset.label)}</button>
        ))}
        <button data-command="admin.pricing.startSurge" type="button" className="dash-btn small ghost" disabled={disabled} onClick={addPoint}>{trn("{0} Point", <Plus size={12} aria-hidden="true" />)}</button>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="surge-curve-graph"
        role="group"
        aria-label={tr("Surge curve over {0} min", [durationMin])}
        onPointerMove={(event) => {
          if (drag === null || disabled) return;
          const at = fromPointer(event);
          if (at) move(drag, at.minute, at.multiplier);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {[1, (1 + yMax) / 2, yMax].map((level) => (
          <g key={level}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(level)} y2={y(level)} className="grid" />
            <text x={PAD.left - 4} y={y(level) + 3} textAnchor="end" className="axis">{`×${level.toFixed(1)}`}</text>
          </g>
        ))}
        {ticks.map((minute) => <text key={minute} x={x(minute)} y={H - 6} textAnchor="middle" className="axis">{tr("{0} min", [Math.round(minute)])}</text>)}
        <path d={stepPath} className="steps" />
        <path d={line} className="line" />
        {points.map((point, index) => (
          <circle
            key={`${index}-${point.atMin}`}
            cx={x(point.atMin)}
            cy={y(point.multiplier)}
            r={7}
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-label={tr("Point {0}: ×{1} at {2} min", [index + 1, point.multiplier.toFixed(1), point.atMin])}
            aria-valuemin={1}
            aria-valuemax={cap}
            aria-valuenow={point.multiplier}
            aria-valuetext={tr("×{0} at {1} min", [point.multiplier.toFixed(1), point.atMin])}
            style={{ fill: sliderColor(point.multiplier) }}
            className="point"
            onPointerDown={(event) => {
              if (disabled) return;
              (event.target as Element).setPointerCapture?.(event.pointerId);
              setDrag(index);
            }}
            onKeyDown={(event) => onKey(event, index)}
          />
        ))}
      </svg>
      <small className="fine">{tr("Drag the points or use the arrow keys. The surge moves in 5-minute steps (the stepped line). A ride keeps the price it was quoted.")}</small>
    </div>
  );
}
