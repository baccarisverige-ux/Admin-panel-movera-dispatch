import { useState } from "react";
import { CalendarDays, CalendarRange } from "lucide-react";
import type { Period, PeriodKind } from "./period";
import { tr, trn, trx } from "../i18n";

const PRESETS: { id: PeriodKind; label: string }[] = [
  { id: "today", get label() { return tr("Today"); } },
  { id: "week", get label() { return tr("Week"); } },
  { id: "month", get label() { return tr("Month"); } },
  { id: "year", get label() { return tr("Year"); } },
];

type Props = { period: Period; today: string; onChange: (period: Period) => void };

/** Today / Week / Month / Year, one specific date, or a custom range. */
export function PeriodPicker({ period, today, onChange }: Props) {
  const [rangeOpen, setRangeOpen] = useState(period.kind === "range");
  const [from, setFrom] = useState(period.from ?? today);
  const [to, setTo] = useState(period.to ?? today);
  const rangeError = from && to && from > to ? "The start date must be before the end date." : "";

  return (
    <div className="period-picker">
      <div className="segmented" role="radiogroup" aria-label={tr("Period")}>
        {PRESETS.map((preset) => (
          <button data-command="admin.ui.period"
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={period.kind === preset.id}
            className={period.kind === preset.id ? "active" : undefined}
            onClick={() => {
              setRangeOpen(false);
              onChange({ kind: preset.id });
            }}
          >
            {trx(preset.label)}
          </button>
        ))}
      </div>
      <label className={period.kind === "date" ? "date-chip active" : "date-chip"}>
        <CalendarDays size={15} aria-hidden="true" />
        <span className="sr-only">{tr("Pick a date")}</span>
        <input
          type="date"
          value={period.kind === "date" ? period.on : ""}
          max="2099-12-31"
          onChange={(event) => {
            if (!event.target.value) return;
            setRangeOpen(false);
            onChange({ kind: "date", on: event.target.value });
          }}
        />
      </label>
      <button data-command="admin.ui.period" type="button" className={period.kind === "range" || rangeOpen ? "date-chip active" : "date-chip"} aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}>{trn("{0}Range", <CalendarRange size={15} aria-hidden="true" />)}</button>
      {rangeOpen ? (
        <form
          className="range-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!rangeError) onChange({ kind: "range", from, to });
          }}
        >
          <label>{trn("From{0}", <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />)}</label>
          <label>{trn("To{0}", <input type="date" value={to} onChange={(event) => setTo(event.target.value)} required />)}</label>
          <button data-command="admin.ui.period" type="submit" className="dash-btn small" disabled={Boolean(rangeError)}>{tr("Apply")}</button>
          {rangeError ? <p role="alert">{rangeError}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
