import type { CSSProperties, ReactNode } from "react";
import { NumberField } from "../pricing/NumberField";
import { tr, trx } from "../i18n";

/** Small building blocks for the dispatch settings, so every tab looks and works the same. */

export function Card({ title, icon, help, tone = "blue", aside, children, off = false }: { title: string; icon: ReactNode; help?: string; tone?: "blue" | "purple" | "orange" | "green" | "red" | "pink"; aside?: ReactNode; children: ReactNode; off?: boolean }) {
  return (
    <section className={off ? `dx-card ${tone} off` : `dx-card ${tone}`} aria-label={trx(title)}>
      <header className="dx-card-head">
        <span className="dx-card-icon" aria-hidden="true">{icon}</span>
        <span className="dx-card-title"><b>{trx(title)}</b>{help ? <small>{trx(help)}</small> : null}</span>
        {aside}
      </header>
      <div className="dx-card-body">{children}</div>
    </section>
  );
}

/** An on/off switch. The accessible name is "<label> on". */
export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className={on ? "dx-switch on" : "dx-switch"} title={on ? tr("On") : tr("Off")}>
      <input type="checkbox" role="switch" aria-label={tr("{0} on", [trx(label)])} checked={on} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="dx-switch-track" aria-hidden="true"><i /></span>
      <span className="dx-switch-text">{on ? tr("On") : tr("Off")}</span>
    </label>
  );
}

/** A setting line: title and help on the left, its switch and values on the right. */
export function Row({ label, help, on, onToggle, disabled, children }: { label: string; help?: string; on?: boolean; onToggle?: (next: boolean) => void; disabled?: boolean; children?: ReactNode }) {
  const off = on === false;
  return (
    <div className={off ? "dx-row off" : "dx-row"}>
      <span className="dx-row-text"><b>{trx(label)}</b>{help ? <small>{trx(help)}</small> : null}</span>
      <span className="dx-row-values">
        {children && !off ? children : null}
        {onToggle ? <Switch label={label} on={Boolean(on)} onChange={onToggle} disabled={disabled} /> : null}
      </span>
    </div>
  );
}

export function Num({ label, value, unit, onChange, min = 0, max, step = 1, disabled, before }: { label: string; value: number; unit?: string; onChange: (next: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; before?: string }) {
  const invalid = value < min || (max !== undefined && value > max);
  return (
    <span className="dx-num" style={{ "--u": (unit ?? "").length } as CSSProperties}>
      {before ? <small>{before}</small> : null}
      <NumberField label={label} value={value} unit={unit} min={min} max={max} step={step} disabled={disabled} invalid={invalid} onChange={onChange} />
    </span>
  );
}

export function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly { id: T; label: string; hint?: string }[]; onChange: (next: T) => void; disabled?: boolean }) {
  return (
    <span className="dx-choice" role="radiogroup" aria-label={trx(label)}>
      {options.map((option) => (
        <label key={option.id} className={option.id === value ? "on" : undefined} title={trx(option.hint)}>
          <input type="radio" name={label} checked={option.id === value} disabled={disabled} onChange={() => onChange(option.id)} />
          {trx(option.label)}
        </label>
      ))}
    </span>
  );
}

export function Check({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className={on ? "check-chip on" : "check-chip"}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{trx(label)}
    </label>
  );
}
