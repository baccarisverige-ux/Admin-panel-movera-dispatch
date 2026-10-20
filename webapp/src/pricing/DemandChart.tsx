import { useState } from "react";
import type { DemandPoint } from "./demand";
import { trn, uiLocale } from "../i18n";

type Props = { points: DemandPoint[]; surge: number[]; locale: string; timeZone: string };

const W = 680;
const H = 220;
const PAD = { left: 34, right: 12, top: 14, bottom: 52 };
const BAND = 26;

/** Ride requests against free online drivers over the last hours, with the surge level as a band below. */
export function DemandChart({ points, surge, timeZone }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const max = Math.max(4, ...points.map((point) => Math.max(point.requests, point.free)));
  const top = Math.ceil(max / 4) * 4;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;
  const path = (key: "requests" | "free") => points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const area = `${path("requests")} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const time = new Intl.DateTimeFormat(uiLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const bandY = H - PAD.bottom + 22;
  const maxSurge = Math.max(2, ...surge);
  const active = hover ?? points.length - 1;
  const point = points[active];
  const label = `Ride requests and free online drivers, last ${Math.round((points[points.length - 1].at - points[0].at) / 3_600_000)} hours. Now ${point.requests} requests, ${point.free} free online drivers, surge ×${(surge[active] ?? 1).toFixed(1)}.`;
  return (
    <figure className="demand-chart">
      <div className="demand-legend" aria-hidden="true">
        <span>{trn("{0}Ride requests", <i className="req" />)}</span>
        <span>{trn("{0}Free online drivers", <i className="free" />)}</span>
        <span>{trn("{0}Surge", <i className="srg" />)}</span>
        <b>{trn("{0} · {1} requests · {2} free drivers · ×{3}", time.format(point.at), point.requests, point.free, (surge[active] ?? 1).toFixed(1))}</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="req-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d55181" stopOpacity="0.28" />
            <stop offset="1" stopColor="#d55181" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="srg-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#f2994a" />
            <stop offset="1" stopColor="#7b3fe4" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <g key={step}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(top * step)} y2={y(top * step)} className="grid" />
            <text x={PAD.left - 6} y={y(top * step) + 4} className="axis" textAnchor="end">{Math.round(top * step)}</text>
          </g>
        ))}
        <path d={area} fill="url(#req-fill)" />
        <path d={path("free")} className="line free" />
        <path d={path("requests")} className="line req" />
        {points.map((item, index) => index % Math.max(1, Math.round(points.length / 7)) === 0 ? <text key={item.at} x={x(index)} y={H - PAD.bottom + 14} className="axis" textAnchor="middle">{time.format(item.at)}</text> : null)}
        <rect x={PAD.left} y={bandY} width={W - PAD.left - PAD.right} height={BAND - 10} rx={4} className="band-bg" />
        {surge.map((value, index) => value > 1 && index < points.length - 1 ? (
          <rect key={points[index].at} x={x(index)} y={bandY + (BAND - 10) * (1 - (value - 1) / (maxSurge - 1))} width={x(index + 1) - x(index) + 0.5} height={(BAND - 10) * ((value - 1) / (maxSurge - 1))} fill="url(#srg-fill)" />
        ) : null)}
        <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={bandY + BAND - 10} className="cursor" />
        <circle cx={x(active)} cy={y(point.requests)} r={4} className="dot req" />
        <circle cx={x(active)} cy={y(point.free)} r={4} className="dot free" />
        {points.map((item, index) => (
          <rect key={`hit-${item.at}`} x={x(index) - (W / points.length) / 2} y={0} width={W / points.length} height={H} fill="transparent" onMouseEnter={() => setHover(index)} />
        ))}
      </svg>
    </figure>
  );
}
