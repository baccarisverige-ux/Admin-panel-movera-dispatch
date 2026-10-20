import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Info, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { change, type Card, type Format, type Note } from "./engine";
import { tr, trx } from "../i18n";

export type Fmt = (value: number, format: Format) => string;

/** One number with what it means, and the change against the compare period. */
export function Cards({ cards, fmt, compareLabel, compare }: { cards: readonly Card[]; fmt: Fmt; compareLabel: string; compare: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rp-cards" aria-label={tr("Numbers")}>
      {cards.map((card) => {
        const diff = compare ? change(card.value, card.previous) : null;
        const good = diff === null ? null : card.goodDown ? diff <= 0 : diff >= 0;
        return (
          <div key={card.id} className="rp-card">
            <span className="rp-card-head">
              <small>{trx(card.label)}</small>
              <button data-command="admin.reports.view" type="button" className="rp-info" aria-label={tr("What is {0}?", [trx(card.label)])} aria-expanded={open === card.id} onClick={() => setOpen(open === card.id ? null : card.id)}><Info size={12} aria-hidden="true" /></button>
            </span>
            <b>{fmt(card.value, card.format)}</b>
            {diff !== null ? (
              <span className={good ? "rp-change good" : "rp-change bad"}>{diff >= 0 ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />} {diff > 0 ? "+" : ""}{diff}% <em>{compareLabel}</em></span>
            ) : <span className="rp-change none">{!compare ? "" : card.previous === null ? tr("Right now") : tr("No earlier number")}</span>}
            {open === card.id ? <p className="rp-card-info" role="note">{trx(card.info)}</p> : null}
          </div>
        );
      })}
    </section>
  );
}

export function Notes({ notes }: { notes: readonly Note[] }) {
  if (!notes.length) return null;
  return (
    <ul className="rp-notes" aria-label={tr("What changed")}>
      {notes.slice(0, 4).map((note) => (
        <li key={note.text} className={note.tone}><Lightbulb size={13} aria-hidden="true" /> {note.text}</li>
      ))}
    </ul>
  );
}

export function Panel({ title, icon, children, aside, wide = false }: { title: string; icon: ReactNode; children: ReactNode; aside?: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? "dash-card rp-panel wide" : "dash-card rp-panel"} aria-label={title}>
      <div className="card-head"><h3>{icon} {trx(title)}</h3>{aside}</div>
      {children}
    </section>
  );
}

/** Horizontal bars, biggest first. */
export function Bars({ rows, format }: { rows: readonly { label: string; value: number; hint?: string }[]; format: (value: number) => string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="rp-bars">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="rp-bar-label">{trx(row.label)}</span>
          <span className="rp-bar-track"><i style={{ width: `${(row.value / max) * 100}%` }} /></span>
          <b>{format(row.value)}</b>
          {row.hint ? <small>{trx(row.hint)}</small> : null}
        </li>
      ))}
    </ul>
  );
}

/** 24 columns, one per hour of the day. */
export function HourBars({ rows }: { rows: readonly { hour: number; trips: number }[] }) {
  const max = Math.max(...rows.map((row) => row.trips), 1);
  const peak = rows.reduce((best, row) => (row.trips > best.trips ? row : best), rows[0] ?? { hour: 0, trips: 0 });
  return (
    <div className="rp-hours" role="img" aria-label={tr("Busiest hour {0}:00", [String(peak.hour).padStart(2, "0")])}>
      {rows.map((row) => (
        <span key={row.hour} className={row.hour === peak.hour ? "peak" : undefined} title={`${String(row.hour).padStart(2, "0")}:00 · ${row.trips}`}>
          <i style={{ height: `${(row.trips / max) * 100}%` }} />
          {row.hour % 3 === 0 ? <small>{String(row.hour).padStart(2, "0")}</small> : null}
        </span>
      ))}
    </div>
  );
}

export type Column<T> = { id: string; label: string; value: (row: T) => number | string; show?: (row: T) => ReactNode; numeric?: boolean };

/** A table you can sort by clicking a column. */
export function SortTable<T>({ label, columns, rows, rowKey, initial, limit = 50 }: { label: string; columns: readonly Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; initial?: string; limit?: number }) {
  const [sort, setSort] = useState<{ id: string; desc: boolean }>({ id: initial ?? columns.find((column) => column.numeric)?.id ?? columns[0].id, desc: true });
  const [all, setAll] = useState(false);
  const column = columns.find((item) => item.id === sort.id) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const x = column.value(a);
    const y = column.value(b);
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return sort.desc ? -result : result;
  });
  const shown = all ? sorted : sorted.slice(0, limit);
  return (
    <div className="rp-table-wrap">
      <table className="rp-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((item) => (
              <th key={item.id} className={item.numeric ? "num" : undefined} aria-sort={item.id === sort.id ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button data-command="admin.reports.view" type="button" onClick={() => setSort({ id: item.id, desc: item.id === sort.id ? !sort.desc : true })}>
                  {trx(item.label)} {item.id === sort.id ? (sort.desc ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronUp size={11} aria-hidden="true" />) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((item) => <td key={item.id} className={item.numeric ? "num" : undefined}>{item.show ? item.show(row) : item.value(row)}</td>)}
            </tr>
          ))}
          {shown.length === 0 ? <tr><td colSpan={columns.length} className="rp-empty">{tr("Nothing in this period.")}</td></tr> : null}
        </tbody>
      </table>
      {sorted.length > limit ? <button data-command="admin.reports.view" type="button" className="dash-btn small ghost" onClick={() => setAll((value) => !value)}>{all ? tr("Show fewer") : tr("Show all {0}", [sorted.length])}</button> : null}
    </div>
  );
}

export function Delta({ now, before, goodDown = false }: { now: number; before: number; goodDown?: boolean }) {
  const diff = change(now, before);
  if (diff === null) return null;
  const good = goodDown ? diff <= 0 : diff >= 0;
  return <span className={good ? "rp-delta good" : "rp-delta bad"}>{diff >= 0 ? <ArrowUp size={10} aria-hidden="true" /> : <ArrowDown size={10} aria-hidden="true" />}{Math.abs(diff)}%</span>;
}
