import { useState } from "react";
import { Car, ChevronRight, Clock, Flame, Info, MapPin, MessageSquare } from "lucide-react";
import { maxPerDriver, ruleLines, rewardLine, timeLine, type DriverBonus } from "./bonus";
import { tr, trn } from "../i18n";

/** How the bonus looks in the driver app: the map with the glowing area, and the bonus card with progress. */
export function DriverAppPreview({ bonus, money, categoryName, done = 1 }: { bonus: DriverBonus; money: (value: number) => string; categoryName: (id: string) => string; done?: number }) {
  const [screen, setScreen] = useState<"map" | "details">("map");
  const rules = ruleLines(bonus, money, categoryName);
  const most = maxPerDriver(bonus);
  const target = bonus.reward.type === "target" ? bonus.reward.rides : bonus.reward.type === "steps" ? bonus.reward.steps[0]?.rides ?? 3 : null;
  const shown = target ? Math.min(done, target) : done;

  const all = bonus.areas.flatMap((area) => area.ring);
  const lats = all.map(([lat]) => lat);
  const lngs = all.map(([, lng]) => lng);
  const box = { w: 242, h: 476 };
  let path: string[] = [];
  let car = { x: box.w / 2, y: box.h / 2 + 30 };
  if (all.length) {
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const scaleX = Math.cos((((south + north) / 2) * Math.PI) / 180);
    const w = Math.max((east - west) * scaleX, 1e-6);
    const h = Math.max(north - south, 1e-6);
    const k = Math.min((box.w * 0.62) / w, (box.h * 0.32) / h);
    const ox = (box.w - w * k) / 2;
    const oy = (box.h - h * k) / 2 - 20;
    const x = (lng: number) => ox + (lng - west) * scaleX * k;
    const y = (lat: number) => oy + (north - lat) * k;
    path = bonus.areas.map((area) => `M${area.ring.map(([lat, lng]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L")}Z`);
    car = { x: x(west) - 18, y: y(south) + 22 };
  }

  return (
    <figure className="dp-phone" aria-label={tr("Driver app preview")}>
      <div className="ra-switch" role="tablist" aria-label={tr("Driver app screen")}>
        <button data-command="admin.drivers.bonusForm" type="button" role="tab" aria-selected={screen === "map"} className={screen === "map" ? "active" : undefined} onClick={() => setScreen("map")}>{tr("Map")}</button>
        <button data-command="admin.drivers.bonusForm" type="button" role="tab" aria-selected={screen === "details"} className={screen === "details" ? "active" : undefined} onClick={() => setScreen("details")}>{tr("Bonus details")}</button>
      </div>
      <div className="dp-screen">
        <div className="dp-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        {screen === "map" ? (
          <>
            <svg className="dp-map" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
              <defs>
                <filter id="dp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
                <pattern id="dp-streets" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
                  <path d="M0 22H44M22 0V44" stroke="#2a3a48" strokeWidth="5" />
                </pattern>
              </defs>
              <rect width={box.w} height={box.h} fill="#17222d" />
              <rect width={box.w} height={box.h} fill="url(#dp-streets)" />
              <path d={`M-10 ${box.h * 0.72} C ${box.w * 0.3} ${box.h * 0.6}, ${box.w * 0.6} ${box.h * 0.9}, ${box.w + 10} ${box.h * 0.7}`} stroke="#3c5366" strokeWidth="10" fill="none" />
              {path.map((d, index) => (
                <g key={index}>
                  <path d={d} fill="#f2994a" opacity="0.55" filter="url(#dp-glow)" />
                  <path d={d} fill="#f2994a" fillOpacity="0.32" stroke="#ffb46b" strokeWidth="2.5" strokeLinejoin="round" />
                </g>
              ))}
              {bonus.kind === "rides" ? <rect x="12" y="12" width={box.w - 24} height={box.h - 70} rx="18" fill="#f2994a" fillOpacity="0.12" stroke="#ffb46b" strokeDasharray="6 5" /> : null}
              <circle cx={car.x} cy={car.y} r="13" fill="#215277" stroke="#fff" strokeWidth="3" />
              <Car x={car.x - 7} y={car.y - 7} width={14} height={14} color="#fff" />
            </svg>
            {bonus.kind === "area" && bonus.areas[0] ? <span className="dp-map-tag"><Flame size={11} aria-hidden="true" /> {bonus.areas[0].name}</span> : null}
            {bonus.note.trim() ? <span className="dp-map-note" aria-label={tr("Message on the map")}><MessageSquare size={11} aria-hidden="true" /> {bonus.note}</span> : null}
            <div className="dp-card" aria-label={tr("Bonus card")}>
              <span className="dp-card-icon"><Flame size={16} aria-hidden="true" /></span>
              <span className="dp-card-text">
                <b>{bonus.name || tr("Bonus")}</b>
                <small>{rewardLine(bonus, money)}</small>
                <small><Clock size={10} aria-hidden="true" /> {timeLine(bonus)}</small>
              </span>
              <ChevronRight size={14} aria-hidden="true" />
              {target ? (
                <span className="dp-progress" aria-label={tr("{0} of {1} rides", [shown, target])}>
                  <i style={{ width: `${(shown / target) * 100}%` }} />
                  <em>{trn("{0} of {1} rides", shown, target)}</em>
                </span>
              ) : (
                <span className="dp-progress plain"><em>{trn("{0} ride{1} counted so far", done, done === 1 ? "" : tr("s"))}</em></span>
              )}
            </div>
          </>
        ) : (
          <div className="dp-details">
            <span className="dp-card-icon big"><Flame size={20} aria-hidden="true" /></span>
            <b>{bonus.name || tr("Bonus")}</b>
            <p className="dp-reward">{rewardLine(bonus, money)}</p>
            {bonus.note.trim() ? <p className="dp-note" aria-label={tr("Message from Movera")}><MessageSquare size={12} aria-hidden="true" /> {bonus.note}</p> : null}
            <p><Clock size={12} aria-hidden="true" /> {timeLine(bonus)}</p>
            {bonus.kind === "area" ? <p><MapPin size={12} aria-hidden="true" /> {bonus.areas.map((area) => area.name).join(", ") || tr("Draw an area")}</p> : null}
            {most !== null ? <p className="dp-most">{trn("You can earn up to {0}", money(most))}</p> : null}
            <h5>{tr("How it works")}</h5>
            <ul>
              {rules.length ? rules.map((line) => <li key={line}>{line}</li>) : <li>{tr("Just drive in the time window.")}</li>}
            </ul>
            <small className="dp-foot">{trn("{0} Paid with your weekly payout.", <Info size={11} aria-hidden="true" />)}</small>
          </div>
        )}
      </div>
      <figcaption>{screen === "map" ? tr("Driver app · map with the bonus") : tr("Driver app · bonus details")}</figcaption>
    </figure>
  );
}
