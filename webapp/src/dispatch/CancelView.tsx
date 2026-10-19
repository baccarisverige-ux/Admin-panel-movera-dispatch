import { useState } from "react";
import { ArrowRight, Ban, CheckCircle2, ChevronDown, ChevronUp, Coins, Scale } from "lucide-react";
import type { Market } from "../markets/markets";
import { zoneById } from "../markets/markets";
import { FARE_CATEGORIES } from "../data/catalog";
import { CommandButton } from "../ui/CommandButton";
import type { CancelFeeRow } from "./cancelFees";
import { cancelDecision, DISPATCH_KEY, type CancelRecord, type DispatchBook, type ZoneDispatch } from "./rules";

/** The driver's route from accept to cancel, as a small drawing: start, end and the pickup. */
function RouteSketch({ record }: { record: CancelRecord }) {
  const points = [...record.path, record.pickup];
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const k = Math.min(200 / Math.max(east - west, 1e-6), 110 / Math.max(north - south, 1e-6));
  const x = (lng: number) => 20 + (lng - west) * k;
  const y = (lat: number) => 15 + (north - lat) * k;
  const path = record.path.map(([lat, lng], index) => `${index ? "L" : "M"}${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("");
  const start = record.path[0];
  const end = record.path[record.path.length - 1];
  return (
    <svg className="dx-sketch" viewBox="0 0 240 140" role="img" aria-label={`Route from accept to cancel for ${record.driver}`}>
      <rect width="240" height="140" rx="12" fill="#f4f6f8" />
      <path d={`M${x(end[1])},${y(end[0])}L${x(record.pickup[1])},${y(record.pickup[0])}`} stroke="#c5ccd2" strokeWidth="2" strokeDasharray="4 4" fill="none" />
      <path d={path} stroke="#2a78d6" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(start[1])} cy={y(start[0])} r="6" fill="#fff" stroke="#2a78d6" strokeWidth="3" />
      <circle cx={x(end[1])} cy={y(end[0])} r="6" fill="#2a78d6" stroke="#fff" strokeWidth="2" />
      <circle cx={x(record.pickup[1])} cy={y(record.pickup[0])} r="7" fill="#e34948" stroke="#fff" strokeWidth="3" />
      <text x={x(start[1]) + 9} y={y(start[0]) + 4} fontSize="10" fill="#52514e">accept</text>
      <text x={x(end[1]) + 9} y={y(end[0]) + 4} fontSize="10" fill="#52514e">cancel</text>
      <text x={x(record.pickup[1]) + 10} y={y(record.pickup[0]) + 4} fontSize="10" fill="#b0302a">rider</text>
    </svg>
  );
}

/** "45 kr" for a fixed fee, "15% of 420 kr = 63 kr (50–150 kr)" for a % fee. */
function feeRule(row: CancelFeeRow, fare: number, money: (value: number) => string): string {
  if (row.type === "fixed") return `${money(row.value)} fixed`;
  const limits = [row.min !== null ? `at least ${money(row.min)}` : "", row.max !== null ? `at most ${money(row.max)}` : ""].filter(Boolean).join(", ");
  return `${row.value}% of the ${money(fare)} trip${limits ? `, ${limits}` : ""}`;
}

type Props = {
  book: DispatchBook;
  market: Market;
  records: CancelRecord[];
  rulesOf: (zoneId: string) => ZoneDispatch;
  canDecide: boolean;
  agentId: string;
  money: (value: number) => string;
  onNotice: (text: string) => void;
};

export function CancelView({ book, market, records, rulesOf, canDecide, agentId, money, onNotice }: Props) {
  const [open, setOpen] = useState<string | null>(records[0]?.id ?? null);
  const time = (iso: string) => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <section className="dash-card" aria-labelledby="dx-cancel-title">
      <div className="card-head"><h3 id="dx-cancel-title"><Scale size={16} aria-hidden="true" /> Rider cancels after a driver accepted</h3></div>
      <p className="dx-modal-help">The system decides the fee by comparing the driver's distance to the rider when they accepted and when the rider cancelled. If a driver complains, open the record and change the decision.</p>
      {records.length === 0 ? <p className="dx-calm">No cancel to check.</p> : (
        <ul className="dx-cancels" aria-label="Cancel checks">
          {records.map((record) => {
            const rules = rulesOf(record.zoneId);
            const auto = cancelDecision(record, rules);
            const manual = book.cancelChecks[record.id];
            const fee = manual ? manual.fee : auto.fee;
            const expanded = open === record.id;
            const next = (give: boolean): DispatchBook => ({ ...book, draftRev: book.draftRev + 1, cancelChecks: { ...book.cancelChecks, [record.id]: { fee: give, by: agentId, reason: "", at: new Date().toISOString() } } });
            return (
              <li key={record.id} className={fee ? "dx-cancel fee" : "dx-cancel"}>
                <button data-command="admin.dispatch.view" type="button" className="dx-cancel-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : record.id)}>
                  <span className={fee ? "dx-verdict fee" : "dx-verdict"}>{fee ? <Coins size={14} aria-hidden="true" /> : <Ban size={14} aria-hidden="true" />} {fee ? `Fee ${money(auto.amount)}` : "No fee"}</span>
                  <span className="dx-cancel-who"><b>{record.rider}</b><small>{FARE_CATEGORIES.find((item) => item.id === record.category)?.label ?? record.category} · Driver {record.driver} · {zoneById(record.zoneId)?.name ?? record.zoneId} · {time(record.cancelledAt)} · {record.tripId}</small></span>
                  {manual ? <span className="dx-tag mine">Changed by {manual.by}</span> : <span className="dx-tag">Automatic</span>}
                  {expanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                </button>
                {expanded ? (
                  <div className="dx-cancel-body">
                    <RouteSketch record={record} />
                    <dl className="dx-cancel-facts">
                      <div><dt>When the driver accepted</dt><dd>{time(record.acceptedAt)} · {record.atAccept.km} km · {record.atAccept.etaMin} min away</dd></div>
                      <div><dt>When the rider cancelled</dt><dd>{time(record.cancelledAt)} · {record.atCancel.km} km · {record.atCancel.etaMin} min away</dd></div>
                      <div><dt>Time after accept</dt><dd>{record.minutesAfterAccept} min (free: {auto.freeMin} min)</dd></div>
                      <div><dt>Fee for this car type</dt><dd>{feeRule(rules.riderCancel.fees[record.category], record.fare, money)}</dd></div>
                      <div><dt>Came closer</dt><dd>{Math.max(0, auto.closerPct)}% (fee from {rules.riderCancel.closerPct}%)</dd></div>
                      <div className="wide"><dt>Automatic decision</dt><dd>{auto.fee ? <CheckCircle2 size={13} aria-hidden="true" /> : <Ban size={13} aria-hidden="true" />} {auto.why}</dd></div>
                    </dl>
                    <div className="dx-cancel-actions">
                      {fee ? (
                        <CommandButton command="admin.dispatch.cancelCheck" className="dash-btn small ghost" targetId={record.tripId} confirmTarget={false} scope={record.zoneId} before="fee" after="no fee" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next(false)} disabled={!canDecide} onDone={() => onNotice(`Fee removed for ${record.rider}'s cancel.`)}>
                          Remove the fee
                        </CommandButton>
                      ) : (
                        <CommandButton command="admin.dispatch.cancelCheck" className="dash-btn small" targetId={record.tripId} confirmTarget={false} scope={record.zoneId} before="no fee" after="fee" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={next(true)} disabled={!canDecide} onDone={() => onNotice(`Fee given to ${record.driver} for ${record.rider}'s cancel.`)}>
                          Give the fee to the driver <ArrowRight size={12} aria-hidden="true" />
                        </CommandButton>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
