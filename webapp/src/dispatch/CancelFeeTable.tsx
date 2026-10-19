import { useEffect, useState, type CSSProperties } from "react";
import { Copy, Eye, Layers } from "lucide-react";
import type { FareCategoryId } from "../data/catalog";
import type { MarketId } from "../markets/markets";
import { fromSek } from "../pricing/zonePricing";
import { Modal } from "../ui/Modal";
import { Choice, Num } from "./fields";
import {
  CANCEL_FEE_CATEGORIES, CANCEL_FEE_LIMITS, cancelFeeDefaults, riderSeesLine, sameForAll,
  type CancelFeeKind, type CancelFeeRow, type CancelFeeTable, type CancelFeeType,
} from "./cancelFees";

const FEE_TYPES: { id: CancelFeeType; label: string }[] = [
  { id: "fixed", label: "Fixed" },
  { id: "percent", label: "% of price" },
];

const KIND_WORDS: Record<CancelFeeKind, { name: string; free: string; unit: string; max: number; sampleSek: number; sampleCategory: FareCategoryId }> = {
  live: { name: "Live trips", free: "Free cancel", unit: "min after accept", max: CANCEL_FEE_LIMITS.liveFreeMax, sampleSek: 250, sampleCategory: "comfort" },
  reservation: { name: "Reservations", free: "Free cancel until", unit: "min before pickup", max: CANCEL_FEE_LIMITS.reservationFreeMax, sampleSek: 420, sampleCategory: "premium" },
};

/** A money box that can be left empty (no limit). */
function OptionalMoney({ label, value, unit, disabled, onChange }: { label: string; value: number | null; unit: string; disabled?: boolean; onChange: (next: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText((current) => (current.trim() === "" ? value === null : Number(current.replace(",", ".")) === value) ? current : value === null ? "" : String(value));
  }, [value]);
  const invalid = value !== null && (value < 0 || value > CANCEL_FEE_LIMITS.fixedMax);
  return (
    <span className="dx-num" style={{ "--u": unit.length } as CSSProperties}>
      <span className={invalid ? "num-field invalid" : "num-field"}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid || undefined}
          placeholder="none"
          value={text}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d.,]/g, "");
            setText(next);
            if (next.trim() === "") onChange(null);
            else if (Number.isFinite(Number(next.replace(",", ".")))) onChange(Math.min(CANCEL_FEE_LIMITS.fixedMax, Number(next.replace(",", "."))));
          }}
          onBlur={() => setText(value === null ? "" : String(value))}
        />
        <i aria-hidden="true">{unit}</i>
      </span>
    </span>
  );
}

type Props = {
  kind: CancelFeeKind;
  table: CancelFeeTable;
  onChange: (next: CancelFeeTable) => void;
  disabled: boolean;
  symbol: string;
  money: (value: number) => string;
  countryId: MarketId;
  /** Other zones this admin can change, for "Copy to other zones…". */
  otherZones: { id: string; name: string }[];
  onCopyToZones: (zoneIds: string[]) => void;
};

/** Rider cancel fees per car type for one zone: free minutes, then a fixed fee or a % of the price with an optional min and max. */
export function CancelFeeTable({ kind, table, onChange, disabled, symbol, money, countryId, otherZones, onCopyToZones }: Props) {
  const words = KIND_WORDS[kind];
  const [sameOpen, setSameOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [sample, setSample] = useState<FareCategoryId>(words.sampleCategory);
  const [fare, setFare] = useState(() => fromSek(words.sampleSek, countryId));
  const setRow = (id: FareCategoryId, patch: Partial<CancelFeeRow>) => onChange({ ...table, [id]: { ...table[id], ...patch } });
  const setType = (id: FareCategoryId, type: CancelFeeType) => {
    if (type === table[id].type) return;
    const start = cancelFeeDefaults(kind, countryId)[type === "percent" ? "premium" : "economy"];
    setRow(id, type === "percent" ? { type, value: start.value, min: table[id].min ?? start.min, max: table[id].max ?? start.max } : { type, value: start.value });
  };
  const seen = riderSeesLine(kind, table[sample], fare, countryId, money);
  const sampleLabel = CANCEL_FEE_CATEGORIES.find((item) => item.id === sample)?.label ?? sample;
  return (
    <div className="dx-fees" role="group" aria-label={`${words.name} cancel fees`}>
      <table className="dx-fee-table" aria-label={`${words.name} cancel fees per car type`}>
        <thead>
          <tr><th scope="col">Car type</th><th scope="col">{words.free}</th><th scope="col">Fee type</th><th scope="col">Fee</th><th scope="col">Min</th><th scope="col">Max</th></tr>
        </thead>
        <tbody>
          {CANCEL_FEE_CATEGORIES.map(({ id, label }) => {
            const row = table[id];
            const percent = row.type === "percent";
            const name = `${words.name} ${label}`;
            return (
              <tr key={id}>
                <th scope="row">{label}</th>
                <td data-label={words.free}>
                  <Num label={`${name} free cancel minutes`} value={row.freeMin} unit={words.unit} min={0} max={words.max} disabled={disabled} onChange={(freeMin) => setRow(id, { freeMin: kind === "reservation" ? Math.round(freeMin) : freeMin })} />
                </td>
                <td data-label="Fee type">
                  <Choice label={`${name} fee type`} value={row.type} options={FEE_TYPES} disabled={disabled} onChange={(type) => setType(id, type)} />
                </td>
                <td data-label="Fee">
                  <Num label={`${name} fee`} value={row.value} unit={percent ? "%" : symbol} step={percent ? 1 : 0.5} min={0} max={percent ? CANCEL_FEE_LIMITS.pctMax : CANCEL_FEE_LIMITS.fixedMax} disabled={disabled} onChange={(value) => setRow(id, { value })} />
                </td>
                <td data-label="Min" className={percent ? undefined : "dx-fee-na"}>{percent ? <OptionalMoney label={`${name} lowest fee`} value={row.min} unit={symbol} disabled={disabled} onChange={(min) => setRow(id, { min })} /> : <span className="dx-fee-none" aria-label="No min for a fixed fee">—</span>}</td>
                <td data-label="Max" className={percent ? undefined : "dx-fee-na"}>{percent ? <OptionalMoney label={`${name} highest fee`} value={row.max} unit={symbol} disabled={disabled} onChange={(max) => setRow(id, { max })} /> : <span className="dx-fee-none" aria-label="No max for a fixed fee">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="dx-fee-actions">
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" aria-expanded={sameOpen} disabled={disabled} onClick={() => setSameOpen(!sameOpen)}><Layers size={13} aria-hidden="true" /> Same for all car types</button>
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled || !otherZones.length} onClick={() => { setIds([]); setCopyOpen(true); }}><Copy size={13} aria-hidden="true" /> Copy to other zones…</button>
      </div>
      {sameOpen ? (
        <div className="dx-fee-same" role="group" aria-label={`${words.name}: use one car type's rule for all`}>
          <small>Use the rule of</small>
          {CANCEL_FEE_CATEGORIES.map(({ id, label }) => (
            <button data-command="admin.dispatch.edit" key={id} type="button" className="dash-btn small ghost" onClick={() => { onChange(sameForAll(table, id)); setSameOpen(false); }}>{label}</button>
          ))}
          <small>for every car type.</small>
        </div>
      ) : null}
      <div className="dx-fee-sees" aria-label={`${words.name}: rider sees`}>
        <span className="dx-fee-sample">
          <Eye size={13} aria-hidden="true" /> Rider sees
          <select className="dx-select" aria-label={`${words.name} preview car type`} value={sample} onChange={(event) => setSample(event.target.value as FareCategoryId)}>
            {CANCEL_FEE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <Num label={`${words.name} preview trip price`} before="trip" value={fare} unit={symbol} step={1} min={0} max={100000} onChange={setFare} />
          {kind === "reservation" ? <small>pickup 14:00</small> : null}
        </span>
        <p role="status"><span className="sr-only">{sampleLabel}: </span><b>{seen.line}</b>{seen.detail ? <> {seen.detail}</> : null}</p>
      </div>
      <Modal open={copyOpen} title={`Copy ${words.name.toLowerCase()} cancel fees`} onClose={() => setCopyOpen(false)}>
        <p className="dx-modal-help">The zones you pick get this table, every car type. Nothing goes live until you publish.</p>
        <div className="zn-chips">
          {otherZones.map((zone) => (
            <label key={zone.id} className={ids.includes(zone.id) ? "check-chip on" : "check-chip"}>
              <input type="checkbox" checked={ids.includes(zone.id)} onChange={() => setIds(ids.includes(zone.id) ? ids.filter((item) => item !== zone.id) : [...ids, zone.id])} />{zone.name}
            </label>
          ))}
        </div>
        <div className="dx-modal-actions">
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn ghost" onClick={() => setCopyOpen(false)}>Cancel</button>
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn" disabled={!ids.length} onClick={() => { onCopyToZones(ids); setCopyOpen(false); }}>Copy to {ids.length} zone{ids.length === 1 ? "" : "s"}</button>
        </div>
      </Modal>
    </div>
  );
}
