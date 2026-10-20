import { Hexagon, Layers, Map as MapIcon, Sun } from "lucide-react";
import { LEVEL_COLOR, LEVEL_LABEL, type SurgeLevel } from "./surge";
import { SURGE_STYLES, type SurgeStyle } from "./surgeGeo";
import { tr, trn, trx } from "../i18n";

const ICON: Record<SurgeStyle, typeof MapIcon> = { zones: MapIcon, glow: Sun, hex: Hexagon };

/** Surge layer on/off plus the style picker; the style picker only shows while the layer is on. */
export function SurgeControls({ shown, style, onShown, onStyle, compact = false }: { shown: boolean; style: SurgeStyle; onShown: (shown: boolean) => void; onStyle: (style: SurgeStyle) => void; compact?: boolean }) {
  return (
    <div className={compact ? "surge-controls compact" : "surge-controls"}>
      <button data-command="admin.ui.surgeLayer" type="button" className={shown ? "surge-toggle on" : "surge-toggle"} aria-pressed={shown} onClick={() => onShown(!shown)}>{trn("{0}Surge layer{1}", <Layers size={14} aria-hidden="true" />, <span className="switch" aria-hidden="true"><i /></span>)}</button>
      {shown ? (
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
