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
          // Doc-dates bug (2026-11-24): a date that is not one real day stays in the box and is said below; it is
          // never emptied silently (the admin thought it was saved and the approval went without his dates).
          rest.onBlur?.(event);
        }}
      />
      {bad ? <small className="vh-help live-error" role="alert" data-testid="date-input-bad">{tr("Not a date. Type it as {0}.", [datePattern(language)])}</small> : null}
      {/* Doc dates (iOS): the real date input lies over the calendar button, so the tap itself opens the phone's own
          picker (iOS Safari does not open a hidden input through showPicker); on a computer the click asks for it. */}
      <span className="date-input-pick">
        <CalendarDays size={14} aria-hidden="true" />
        <input ref={picker} data-command="admin.ui.period" className="date-input-native" type="date" tabIndex={-1} aria-hidden="true" title={tr("Pick a date")} value={value} min={min} max={max} disabled={disabled} onClick={() => { try { picker.current?.showPicker(); } catch { /* the browser opens its picker itself */ } }} onChange={(event) => send(event.target.value)} />
      </span>
    </span>
  );
}
