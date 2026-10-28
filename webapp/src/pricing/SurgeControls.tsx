import { CircleDot, Flame, Hexagon, Layers, LayoutGrid, Map as MapIcon, Radio, Sparkles, SquareDashed, Sun, Tag } from "lucide-react";
import { LEVEL_COLOR, LEVEL_LABEL, type SurgeLevel } from "./surge";
import { SURGE_STYLES, type SurgeStyle } from "./surgeGeo";
import { tr, trn, trx } from "../i18n";
import { DRIVER_LEVEL_COLOR, DRIVER_LEVEL_LABEL, DRIVER_LEVELS } from "../live/liveSurgeMap";

const ICON: Record<SurgeStyle, typeof MapIcon> = {
  zones: MapIcon,
  glow: Sun,
  hex: Hexagon,
  heat: Flame,
  flat: LayoutGrid,
  label: Tag,
  rings: Radio,
  bubbles: CircleDot,
  dots: Sparkles,
  soft: SquareDashed,
};

/** Surge layer on/off plus the style picker; the style picker only shows while the layer is on. */
export function SurgeControls({ shown, style, onShown, onStyle, compact = false, noStyle = false }: { shown: boolean; style: SurgeStyle; onShown: (shown: boolean) => void; onStyle: (style: SurgeStyle) => void; compact?: boolean; noStyle?: boolean }) {
  return (
    <div className={compact ? "surge-controls compact" : "surge-controls"}>
      <button data-command="admin.ui.surgeLayer" type="button" className={shown ? "surge-toggle on" : "surge-toggle"} aria-pressed={shown} onClick={() => onShown(!shown)}>{trn("{0}Surge layer{1}", <Layers size={14} aria-hidden="true" />, <span className="switch" aria-hidden="true"><i /></span>)}</button>
      {shown && !noStyle ? (
        <div className="surge-style" role="radiogroup" aria-label={tr("Surge map style")}>
          {SURGE_STYLES.map((item) => {
            const Icon = ICON[item.id];
            return (
              <button data-command="admin.ui.surgeLayer" key={item.id} type="button" role="radio" aria-checked={style === item.id} className={style === item.id ? "active" : undefined} onClick={() => onStyle(item.id)}>
                <Icon size={13} aria-hidden="true" />
                {trx(item.label)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function SurgeLegend() {
  return (
    <div className="surge-legend" aria-label={tr("Surge colours")}>
      {(Object.keys(LEVEL_LABEL) as SurgeLevel[]).map((level) => (
        <span key={level}><i style={{ background: LEVEL_COLOR[level] }} />{trx(LEVEL_LABEL[level])}</span>
      ))}
      <span className="legend-note">{trn("{0}Manual", <b className="bolt-dot" aria-hidden="true" />)}</span>
      <span className="legend-note">{trn("{0}Smart (live)", <b className="pulse-dot" aria-hidden="true" />)}</span>
    </div>
  );
}

/** Live maps: the driver map's three colours, light to strong, with no multiplier (contract.json#driverSurgeMap). */
export function DriverSurgeLegend({ failed = false }: { failed?: boolean }) {
  return (
    <div className="surge-legend" aria-label={tr("Surge colours")} data-testid="driver-surge-legend">
      {DRIVER_LEVELS.map((level) => (
        <span key={level}><i style={{ background: DRIVER_LEVEL_COLOR[level] }} />{trx(DRIVER_LEVEL_LABEL[level])}</span>
      ))}
      <span className="legend-note">{failed ? tr("Surge: not connected yet") : tr("Surge now from the server, as drivers see it")}</span>
    </div>
  );
}
