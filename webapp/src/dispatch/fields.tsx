import type { CSSProperties, ReactNode } from "react";
import { NumberField } from "../pricing/NumberField";
import { tr, trx } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";

/** Small building blocks for the dispatch settings, so every tab looks and works the same. */

/** info: the id of the card's own setting (its on/off in aside), shown as a small "i" by the title (ui/SettingInfo.ts). */
export function Card({ title, icon, help, tone = "blue", aside, children, off = false, info }: { title: string; icon: ReactNode; help?: string; tone?: "blue" | "purple" | "orange" | "green" | "red" | "pink"; aside?: ReactNode; children: ReactNode; off?: boolean; info?: string }) {
  return (
    <section className={off ? `dx-card ${tone} off` : `dx-card ${tone}`} aria-label={trx(title)}>
      <header className="dx-card-head">
        <span className="dx-card-icon" aria-hidden="true">{icon}</span>
        <span className="dx-card-title"><b>{trx(title)}{info ? <SettingInfo id={info} label={trx(title)} /> : null}</b>{help ? <small>{trx(help)}</small> : null}</span>
        {aside}
      </header>
      <div className="dx-card-body">{children}</div>
    </section>
  );
}

/** An on/off switch. The accessible name is "<label> on". */
export function Switch({ label, on, onChange, disabled, info }: { label: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean; info?: string }) {
  const box = (
    <label className={on ? "dx-switch on" : "dx-switch"} title={on ? tr("On") : tr("Off")}>
      <input type="checkbox" role="switch" aria-label={tr("{0} on", [trx(label)])} checked={on} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="dx-switch-track" aria-hidden="true"><i /></span>
      <span className="dx-switch-text">{on ? tr("On") : tr("Off")}</span>
    </label>
  );
  return info ? <>{box}<SettingInfo id={info} label={trx(label)} /></> : box;
}

/** A setting line: title and help on the left, its switch and values on the right. */
/** info: the id of this line's text for the small "i" by the label (ui/SettingInfo.ts); it explains the whole line. */
export function Row({ label, help, on, onToggle, disabled, children, info }: { label: string; help?: string; on?: boolean; onToggle?: (next: boolean) => void; disabled?: boolean; children?: ReactNode; info?: string }) {
  const off = on === false;
  return (
    <div className={off ? "dx-row off" : "dx-row"}>
      <span className="dx-row-text"><b>{trx(label)}{info ? <SettingInfo id={info} label={trx(label)} /> : null}</b>{help ? <small>{trx(help)}</small> : null}</span>
      <span className="dx-row-values">
        {children && !off ? children : null}
        {onToggle ? <Switch label={label} on={Boolean(on)} onChange={onToggle} disabled={disabled} /> : null}
      </span>
    </div>
  );
}

export function Num({ label, value, unit, onChange, min = 0, max, step = 1, disabled, before, info }: { label: string; value: number; unit?: string; onChange: (next: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; before?: string; info?: string }) {
  const invalid = value < min || (max !== undefined && value > max);
  return (
    <span className="dx-num" style={{ "--u": (unit ?? "").length } as CSSProperties}>
      {before ? <small>{trx(before)}</small> : null}
      <NumberField label={label} value={value} unit={trx(unit)} min={min} max={max} step={step} disabled={disabled} invalid={invalid} onChange={onChange} info={info} />
    </span>
  );
}

export function Choice<T extends string>({ label, value, options, onChange, disabled, info }: { label: string; value: T; options: readonly { id: T; label: string; hint?: string }[]; onChange: (next: T) => void; disabled?: boolean; info?: string }) {
  const group = (
    <span className="dx-choice" role="radiogroup" aria-label={trx(label)}>
      {options.map((option) => (
        <label key={option.id} className={option.id === value ? "on" : undefined} title={trx(option.hint)}>
          <input type="radio" name={label} checked={option.id === value} disabled={disabled} onChange={() => onChange(option.id)} />
          {trx(option.label)}
        </label>
      ))}
    </span>
  );
  return info ? <>{group}<SettingInfo id={info} label={trx(label)} /></> : group;
}

export function Check({ label, on, onChange, disabled, info }: { label: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean; info?: string }) {
  const chip = (
    <label className={on ? "check-chip on" : "check-chip"}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{trx(label)}
    </label>
  );
  return info ? <>{chip}<SettingInfo id={info} label={trx(label)} /></> : chip;
}
