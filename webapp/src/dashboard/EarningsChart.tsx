import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "./earnings";
import { tr, trn, trx } from "../i18n";

type Props = {
  points: SeriesPoint[];
  format: (minor: number) => string;
  formatAxis: (minor: number) => string;
  compareLabel: string;
};

const HEIGHT = 240;
const PAD = { top: 16, right: 12, bottom: 28, left: 56 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((step) => step * magnitude >= value) ?? 10) * magnitude;
}

/** Area for this period, dashed line for the one before, crosshair tooltip on hover or arrow keys. */
export function EarningsChart({ points, format, formatAxis, compareLabel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();

  useEffect(() => {
    const node = host.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const values = points.flatMap((point) => [Number.isFinite(point.current) ? point.current : 0, point.previous ?? 0]);
    const max = niceMax(Math.max(...values, 0) * 1.05);
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const x = (index: number) => PAD.left + (points.length > 1 ? index * step : innerW / 2);
    const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
    const current = points.map((point, index) => (Number.isFinite(point.current) ? [x(index), y(point.current)] as const : null));
    const drawn = current.filter((point): point is readonly [number, number] => point !== null);
    const line = drawn.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    const area = drawn.length ? `${line}L${drawn[drawn.length - 1][0].toFixed(1)},${y(0)}L${drawn[0][0].toFixed(1)},${y(0)}Z` : "";
    const previous = points
      .map((point, index) => (point.previous === null ? null : `${x(index).toFixed(1)},${y(point.previous).toFixed(1)}`))
      .filter(Boolean)
      .map((pair, index) => `${index ? "L" : "M"}${pair}`)
      .join("");
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => ({ value: max * share, y: y(max * share) }));
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 64))));
    return { x, y, line, area, previous, ticks, labelEvery, step, innerW, current };
  }, [points, width]);

  function pick(clientX: number) {
    const node = host.current;
    if (!node || !points.length) return;
    const left = node.getBoundingClientRect().left;
    const raw = (clientX - left - PAD.left) / (geometry.step || 1);
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(raw))));
  }

  const point = active === null ? null : points[active];
  const tipLeft = active === null ? 0 : Math.min(Math.max(geometry.x(active), 90), width - 90);

  return (
    <div className="earnings-chart" ref={host}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={tr("Gross bookings per period, {0}. Use the arrow keys to read values.", [compareLabel])}
        tabIndex={0}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setActive((value) => Math.max(0, Math.min(points.length - 1, (value ?? (event.key === "ArrowLeft" ? points.length : -1)) + (event.key === "ArrowLeft" ? -1 : 1))));
        }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-series-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--viz-series-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {geometry.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={PAD.left} x2={width - PAD.right} y1={tick.y} y2={tick.y} className={tick.value === 0 ? "viz-baseline" : "viz-grid"} />
            <text x={PAD.left - 8} y={tick.y + 4} textAnchor="end" className="viz-axis">{formatAxis(tick.value)}</text>
          </g>
        ))}
        {points.map((item, index) => (index % geometry.labelEvery === 0 ? (
          <text key={item.at} x={geometry.x(index)} y={HEIGHT - 8} textAnchor="middle" className="viz-axis">{trx(item.label)}</text>
        ) : null))}
        {geometry.previous ? <path d={geometry.previous} className="viz-previous" /> : null}
        {geometry.area ? <path d={geometry.area} fill={`url(#${gradient})`} /> : null}
        {geometry.line ? <path d={geometry.line} className="viz-current" /> : null}
        {active !== null ? (
          <g>
            <line x1={geometry.x(active)} x2={geometry.x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="viz-crosshair" />
            {geometry.current[active] ? <circle cx={geometry.current[active]![0]} cy={geometry.current[active]![1]} r={5} className="viz-dot" /> : null}
          </g>
        ) : null}
      </svg>
      {point ? (
        <div className="viz-tooltip" style={{ left: tipLeft }} role="status">
          <span className="viz-tip-title">{trx(point.label)}</span>
          <span className="viz-tip-row">{trn("{0}{1} This period", <i className="key current" />, <strong>{Number.isFinite(point.current) ? format(point.current) : "—"}</strong>)}</span>
          <span className="viz-tip-row">{trn("{0}{1} Before", <i className="key previous" />, <strong>{point.previous === null ? "—" : format(point.previous)}</strong>)}</span>
        </div>
      ) : null}
      <div className="viz-legend" aria-hidden="true">
        <span>{trn("{0}This period", <i className="key current" />)}</span>
        <span><i className="key previous" />{compareLabel.replace(/^vs /, "")}</span>
      </div>
      <div className="sr-only">
      <table>
        <caption>{tr("Gross bookings by period")}</caption>
        <thead><tr><th>{tr("Period")}</th><th>{tr("This period")}</th><th>{tr("Before")}</th></tr></thead>
        <tbody>
          {points.map((item) => (
            <tr key={item.at}><td>{trx(item.label)}</td><td>{Number.isFinite(item.current) ? format(item.current) : "—"}</td><td>{item.previous === null ? "—" : format(item.previous)}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
