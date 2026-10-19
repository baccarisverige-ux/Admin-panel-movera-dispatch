import { useEffect, useId, useState } from "react";
import { useFieldErrorReport } from "../ui/fieldErrors";
import { numberInputError, parseNumberInput } from "./numberInput";

type Props = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  changed?: boolean;
  invalid?: boolean;
  title?: string;
  className?: string;
};

/**
 * A number box that lets people type "12," or "0." without the value jumping, with its unit inside.
 * Text that is not a number or is outside min/max is kept as typed and marked invalid with a message; it is
 * never changed silently, and the last valid value stays in the draft until the text is fixed.
 */
export function NumberField({ value, onChange, label, unit, step = 1, min = 0, max, disabled = false, changed = false, invalid = false, title, className }: Props) {
  const [text, setText] = useState(String(value));
  const errorId = useId();
  const report = useFieldErrorReport();
  useEffect(() => {
    setText((current) => (Number(current.replace(",", ".")) === value ? current : String(value)));
  }, [value]);
  const error = disabled ? null : numberInputError(text, min, max, unit);
  useEffect(() => {
    report?.(errorId, error ? `${label}: ${error}` : null);
  }, [report, errorId, error, label]);
  useEffect(() => () => report?.(errorId, null), [report, errorId]);
  return (
    <>
      <span className={["num-field", changed ? "changed" : "", invalid || error ? "invalid" : "", className ?? ""].filter(Boolean).join(" ")} title={title}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid || Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          value={text}
          disabled={disabled}
          data-step={step}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (numberInputError(next, min, max, unit)) return;
            onChange(parseNumberInput(next));
          }}
          onBlur={() => {
            // Only an emptied box goes back to the value; anything else typed stays so its message can be read.
            if (text.trim() === "") setText(String(value));
          }}
        />
        {unit ? <i aria-hidden="true">{unit}</i> : null}
      </span>
      {error ? <small id={errorId} className="num-field-error" role="status">{error}</small> : null}
    </>
  );
}
