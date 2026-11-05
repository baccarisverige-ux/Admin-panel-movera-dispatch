import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { currentLanguage, tr, uiLocale } from "../i18n";
import { datePattern, formatIsoDate, parseDateText } from "./dateText";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "defaultValue"> & {
  /** ISO YYYY-MM-DD, or "". */
  value: string;
  /** Called with an ISO day (or "" when the box is emptied), in the same shape as a native date input's change. */
  onChange?: (event: { target: { value: string } }) => void;
};

/**
 * FIX JOB 7 B-l: the admin's date box. It shows and takes the date in the admin's language (ui/dateText.ts), never
 * the browser's mm/dd/yyyy; the calendar button opens the browser's own date picker. The value stays ISO.
 */
export function DateInput({ value, onChange, min, max, disabled, required, className, ...rest }: Props) {
  const language = currentLanguage();
  const [text, setText] = useState(() => formatIsoDate(value, language));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => setText(formatIsoDate(value, language)), [value, language]);
  const send = (iso: string) => { if (iso !== value) onChange?.({ target: { value: iso } }); };
  const bad = text.trim() !== "" && parseDateText(text, language) === null;
  return (
    <span className={className ? `date-input ${className}` : "date-input"}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        lang={uiLocale()}
        autoComplete="off"
        placeholder={datePattern(language)}
        value={text}
        disabled={disabled}
        required={required}
        aria-invalid={rest["aria-invalid"] ?? (bad || undefined)}
        onChange={(event) => {
          setText(event.target.value);
          const iso = parseDateText(event.target.value, language);
          if (iso !== null) send(iso);
        }}
        onBlur={(event) => {
          if (parseDateText(text, language) === null) setText(formatIsoDate(value, language));
          rest.onBlur?.(event);
        }}
      />
      <button data-command="admin.ui.period" type="button" className="date-input-pick" aria-hidden="true" title={tr("Pick a date")} disabled={disabled} tabIndex={-1} onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}>
        <CalendarDays size={14} aria-hidden="true" />
      </button>
      <input ref={picker} className="date-input-native" type="date" tabIndex={-1} aria-hidden="true" value={value} min={min} max={max} disabled={disabled} onChange={(event) => send(event.target.value)} />
    </span>
  );
}
