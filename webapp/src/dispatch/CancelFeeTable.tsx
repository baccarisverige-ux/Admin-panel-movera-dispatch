import { useEffect, useState, type CSSProperties } from "react";
import { CalendarClock, Coins, Copy, Eye, Layers, Zap } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { fromSek } from "../pricing/zonePricing";
import { Modal } from "../ui/Modal";
import { Card, Choice, Num } from "./fields";
import type { ZoneDispatch } from "./rules";
import {
  CANCEL_FEE_LIMITS, cancelFeeDefaults, feeRow, feeRows, riderSeesLine, sameForAll,
  type CancelFeeKind, type CancelFeeRow, type CancelFeeTable, type CancelFeeType, type FeeCategory,
} from "./cancelFees";

const FEE_TYPES: { id: CancelFeeType; label: string }[] = [
  { id: "fixed", label: "Fixed" },
  { id: "percent", label: "% of price" },
];

const KIND_WORDS: Record<CancelFeeKind, { name: string; free: string; unit: string; max: number; sampleSek: number; sampleCategory: string }> = {
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
  /** The table with a row for every listed car type, copied as it is shown. */
  onCopyToZones: (zoneIds: string[], table: CancelFeeTable) => void;
  /** The car types Pricing lists for this zone, in Pricing's order and with its names. */
  categories: FeeCategory[];
};

/** Rider cancel fees per car type for one zone: free minutes, then a fixed fee or a % of the price with an optional min and max. */
export function CancelFeeTable({ kind, table, onChange, disabled, symbol, money, countryId, otherZones, onCopyToZones, categories }: Props) {
  const words = KIND_WORDS[kind];
  const [sameOpen, setSameOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [picked, setSample] = useState(words.sampleCategory);
  const sample = categories.some((item) => item.id === picked) ? picked : categories[0]?.id ?? "economy";
  const [fare, setFare] = useState(() => fromSek(words.sampleSek, countryId));
  const setRow = (id: string, patch: Partial<CancelFeeRow>) => onChange({ ...table, [id]: { ...feeRow(table, id), ...patch } });
  const setType = (id: string, type: CancelFeeType) => {
    const row = feeRow(table, id);
    if (type === row.type) return;
    const start = cancelFeeDefaults(kind, countryId)[type === "percent" ? "premium" : "economy"];
    setRow(id, type === "percent" ? { type, value: start.value, min: row.min ?? start.min, max: row.max ?? start.max } : { type, value: start.value });
  };
  const seen = riderSeesLine(kind, feeRow(table, sample), fare, countryId, money);
  const sampleLabel = categories.find((item) => item.id === sample)?.label ?? sample;
  return (
    <div className="dx-fees" role="group" aria-label={`${words.name} cancel fees`}>
      <table className="dx-fee-table" aria-label={`${words.name} cancel fees per car type`}>
        <thead>
          <tr><th scope="col">Car type</th><th scope="col">{words.free}</th><th scope="col">Fee type</th><th scope="col">Fee</th><th scope="col">Min</th><th scope="col">Max</th></tr>
        </thead>
        <tbody>
          {categories.map(({ id, label }) => {
            const row = feeRow(table, id);
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
          {categories.map(({ id, label }) => (
            <button data-command="admin.dispatch.edit" key={id} type="button" className="dash-btn small ghost" onClick={() => { onChange(sameForAll(table, id, categories)); setSameOpen(false); }}>{label}</button>
          ))}
          <small>for every car type.</small>
        </div>
      ) : null}
      <div className="dx-fee-sees" aria-label={`${words.name}: rider sees`}>
        <span className="dx-fee-sample">
          <Eye size={13} aria-hidden="true" /> Rider sees
          <select className="dx-select" aria-label={`${words.name} preview car type`} value={sample} onChange={(event) => setSample(event.target.value)}>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
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
          <button data-command="admin.dispatch.edit" type="button" className="dash-btn" disabled={!ids.length} onClick={() => { onCopyToZones(ids, { ...table, ...feeRows(table, categories) }); setCopyOpen(false); }}>Copy to {ids.length} zone{ids.length === 1 ? "" : "s"}</button>
        </div>
      </Modal>
    </div>
  );
}

type CardProps = {
  zone: ZoneDispatch;
  onChange: (next: ZoneDispatch) => void;
  disabled: boolean;
  symbol: string;
  money: (value: number) => string;
  countryId: MarketId;
  otherZones: { id: string; name: string }[];
  onCopyCancelFees: (kind: CancelFeeKind, table: CancelFeeTable, zoneIds: string[]) => void;
  categories: FeeCategory[];
  tab: CancelFeeKind;
  onTab: (tab: CancelFeeKind) => void;
};

const FEE_TABS: { id: CancelFeeKind; label: string; example: string }[] = [
  { id: "live", label: "Live trips", example: "Booked now (Radar, Exclusive): free for a few minutes after the driver accepts, then the fee." },
  { id: "reservation", label: "Reservations", example: "Booked for later (also Exclusive reservations): free until a set time before pickup, then the late fee." },
];

/** One place for the rider's cancel fees in a zone: live trips and reservations, each per car type. */
export function RiderCancelFeesCard({ zone, onChange, disabled, symbol, money, countryId, otherZones, onCopyCancelFees, categories, tab, onTab }: CardProps) {
  const live = tab === "live";
  const off = live ? !zone.riderCancel.on : !zone.reservation.on;
  const current = FEE_TABS.find((item) => item.id === tab) ?? FEE_TABS[0];
  return (
    <div id="dx-rider-cancel-fees">
      <Card title="Rider cancel fees" tone="green" icon={<Coins size={18} />} help="Set per car type. Live trips and reservations have their own rules.">
        <div className="ra-switch dx-fee-tabs" role="tablist" aria-label="Rider cancel fees for">
          {FEE_TABS.map((item) => (
            <button data-command="admin.dispatch.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => onTab(item.id)}>
              {item.id === "live" ? <Zap size={12} aria-hidden="true" /> : <CalendarClock size={12} aria-hidden="true" />} {item.label}
            </button>
          ))}
        </div>
        <p className="dx-fee-example" role="tabpanel" aria-label={current.label}>{current.example}</p>
        {off ? <p className="dx-note warn">{live ? "The smart cancel check is off in this zone (Rider cancels: smart check), so live trips have no cancel fee." : "Reservations are off in this zone."}</p> : null}
        <CancelFeeTable
          key={tab}
          kind={tab}
          table={live ? zone.riderCancel.fees : zone.reservation.riderFees}
          onChange={(table) => onChange(live ? { ...zone, riderCancel: { ...zone.riderCancel, fees: table } } : { ...zone, reservation: { ...zone.reservation, riderFees: table } })}
          disabled={disabled || off}
          symbol={symbol}
          money={money}
          countryId={countryId}
          otherZones={otherZones}
          onCopyToZones={(ids, table) => onCopyCancelFees(tab, table, ids)}
          categories={categories}
        />
      </Card>
    </div>
  );
}
