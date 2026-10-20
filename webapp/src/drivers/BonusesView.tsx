import { useEffect, useMemo, useState } from "react";
import { Copy, Flame, MapPinned, Pencil, Plus, Radio, Trophy, Users, Wallet, Zap } from "lucide-react";
import { useSlice } from "../api/hooks";
import { market, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { BonusBuilder, categoryName, type BonusDriver } from "./BonusBuilder";
import { DriverAppPreview } from "./DriverAppPreview";
import { bonusSummary } from "./bonusDemo";
import { clearBonusPrefill, takeBonusPrefill } from "../dispatch/prefill";
import { BONUS_KEY, bonusState, emptyBonusBook, newBonus, normalizeBonusBook, rewardLine, setBonusStatus, timeLine, type BonusBook, type DriverBonus } from "./bonus";
import { tr, trn, trx, trSentences } from "../i18n";

const STATE_LABEL = { live: "Live now", today: "Later today", done: "Done for today", scheduled: "Next days", paused: "Off", ended: "Ended" } as const;
type Filter = "all" | "rides" | "area" | "ended";

/** Small drawing of the bonus areas for the list. */
function AreaThumb({ bonus }: { bonus: DriverBonus }) {
  const all = bonus.areas.flatMap((area) => area.ring);
  if (bonus.kind !== "area" || !all.length) return <span className="db-thumb rides" aria-hidden="true"><Zap size={22} /></span>;
  const lats = all.map(([lat]) => lat);
  const lngs = all.map(([, lng]) => lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const scaleX = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const w = Math.max((Math.max(...lngs) - west) * scaleX, 1e-6);
  const h = Math.max(north - south, 1e-6);
  const k = 44 / Math.max(w, h);
  const x = (lng: number) => 8 + (lng - west) * scaleX * k + (44 - w * k) / 2;
  const y = (lat: number) => 8 + (north - lat) * k + (44 - h * k) / 2;
  return (
    <svg className="db-thumb" viewBox="0 0 60 60" aria-hidden="true">
      <rect width="60" height="60" rx="14" fill="#17222d" />
      {bonus.areas.map((area) => <path key={area.id} d={`M${area.ring.map(([lat, lng]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L")}Z`} fill="#f2994a" fillOpacity="0.45" stroke="#ffb46b" strokeWidth="1.5" />)}
    </svg>
  );
}

export function BonusesView({ country, drivers, fleets, agentId, canEdit }: { country: MarketId; drivers: BonusDriver[]; fleets: { id: string; name: string }[]; agentId: string | null; canEdit: boolean }) {
  const slice = useSlice<BonusBook>(BONUS_KEY, emptyBonusBook());
  const book = useMemo(() => normalizeBonusBook(slice.value), [slice.value]);
  const [now] = useState(() => Date.now());
  // An event from Dispatch opens the builder with its area, time and message.
  const [editing, setEditing] = useState<DriverBonus | null>(() => {
    const prefill = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("prefill") === "event" ? takeBonusPrefill() : null;
    if (!prefill) return null;
    const base = newBonus("area", country, agentId ?? "", now);
    const day = (iso: string) => (new Date(`${iso.slice(0, 10)}T12:00:00`).getDay() + 6) % 7;
    return { ...base, name: prefill.name, note: prefill.note.slice(0, 140), areas: [{ id: "A-event", name: prefill.name, ring: prefill.ring }], start: prefill.from.slice(11, 16), end: prefill.until.slice(11, 16), days: [day(prefill.from)], from: prefill.from.slice(0, 10), until: prefill.until.slice(0, 10) };
  });
  useEffect(() => clearBonusPrefill(), []);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");
  const info = market(country);
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
  const money = (value: number) => `${new Intl.NumberFormat(info.locale, { maximumFractionDigits: 2 }).format(value)} ${symbol}`;
  const mine = book.bonuses.filter((bonus) => bonus.country === country);
  const summaries = useMemo(() => new Map(mine.map((bonus) => [bonus.id, bonusSummary(bonus, drivers.map((driver) => ({ facts: driver.facts, home: driver.home, zoneId: driver.zoneId })), now, info.timeZone)])), [mine, drivers, now, info.timeZone]);
  const states = new Map(mine.map((bonus) => [bonus.id, bonusState(bonus, now, info.timeZone)]));
  const shown = mine.filter((bonus) => (filter === "all" ? states.get(bonus.id) !== "ended" : filter === "ended" ? states.get(bonus.id) === "ended" : bonus.kind === filter && states.get(bonus.id) !== "ended"));
  const live = mine.filter((bonus) => states.get(bonus.id) === "live").length;
  const running = mine.filter((bonus) => bonus.status === "active" && states.get(bonus.id) !== "ended").length;
  const paid = [...summaries.values()].reduce((sum, item) => sum + item.paid, 0);
  const reached = [...summaries.values()].reduce((sum, item) => sum + item.reached, 0);

  if (slice.loading) return <p className="state-line">{tr("Loading bonuses.")}</p>;

  if (editing) {
    return (
      <section className="dash-card db-card">
        <BonusBuilder key={editing.id || "new"} country={country} book={book} agentId={agentId} canEdit={canEdit} drivers={drivers} fleets={fleets} start={editing} now={now} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setNotice(text); }} />
      </section>
    );
  }

  return (
    <div className="db-view">
      <section className="db-kpis" aria-label={tr("Bonuses at a glance")}>
        <div className="zn-kpi"><Radio size={18} aria-hidden="true" /><span><b>{live}</b><small>{tr("Live now")}</small></span></div>
        <div className="zn-kpi"><Flame size={18} aria-hidden="true" /><span><b>{running}</b><small>{tr("Bonuses running")}</small></span></div>
        <div className="zn-kpi"><Users size={18} aria-hidden="true" /><span><b>{reached}</b><small>{tr("Drivers reached a bonus today")}</small></span></div>
        <div className="zn-kpi"><Wallet size={18} aria-hidden="true" /><span><b>{money(paid)}</b><small>{tr("Earned by drivers today")}</small></span></div>
      </section>

      <div className="db-new">
        <button data-command="admin.drivers.bonusCreate" type="button" className="db-new-tile" disabled={!canEdit} onClick={() => setEditing(newBonus("rides", country, agentId ?? "", now))}>
          <span className="db-new-icon"><Zap size={20} aria-hidden="true" /></span>
          <span><b>{tr("New ride bonus")}</b><small>{trn("Do 3 rides from 07 to 09, earn {0}", money({ SE: 150, FR: 15, TN: 20 }[country]))}</small></span>
          <Plus size={18} aria-hidden="true" />
        </button>
        <button data-command="admin.drivers.bonusCreate" type="button" className="db-new-tile area" disabled={!canEdit} onClick={() => setEditing(newBonus("area", country, agentId ?? "", now))}>
          <span className="db-new-icon"><MapPinned size={20} aria-hidden="true" /></span>
          <span><b>{tr("New area bonus")}</b><small>{tr("Draw an area on the map, set the time and reward")}</small></span>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>

      {notice || slice.message ? <p className="pricing-notice" role="status">{trSentences(notice)} {trSentences(slice.message)}</p> : null}

      <section className="dash-card" aria-labelledby="bonus-list-title">
        <div className="card-head">
          <h3 id="bonus-list-title">{trn("{0} Driver bonuses in {1}", <Trophy size={16} aria-hidden="true" />, info.name)}</h3>
          <div className="zn-filters" role="group" aria-label={tr("Filter bonuses")}>
            {([["all", "Running"], ["rides", "Ride bonuses"], ["area", "Area bonuses"], ["ended", "Ended"]] as const).map(([id, label]) => (
              <button data-command="admin.drivers.view" key={id} type="button" aria-pressed={filter === id} className={filter === id ? "zn-chip on" : "zn-chip"} onClick={() => setFilter(id)}>{trx(label)}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? <p className="zn-empty">{trn("No bonus here yet in {0}. Start one above.", info.name)}</p> : (
          <ul className="db-list" aria-label={tr("Driver bonuses")}>
            {shown.map((bonus) => {
              const state = states.get(bonus.id) ?? "scheduled";
              const sum = summaries.get(bonus.id);
              const on = bonus.status === "active";
              const used = bonus.budget && sum?.budgetLeft !== null && sum ? Math.min(100, ((bonus.budget - (sum.budgetLeft ?? 0)) / bonus.budget) * 100) : null;
              return (
                <li key={bonus.id} className={`db-item ${state}`}>
                  <div className="db-item-main">
                    <AreaThumb bonus={bonus} />
                    <div className="db-item-text">
                      <span className="db-item-tags">
                        <span className={bonus.kind === "area" ? "db-tag area" : "db-tag"}>{bonus.kind === "area" ? tr("Area bonus") : tr("Ride bonus")}</span>
                        <span className={`db-state ${state}`}>{state === "live" ? <i aria-hidden="true" /> : null}{trx(STATE_LABEL[state])}</span>
                      </span>
                      <b>{bonus.name}</b>
                      <span className="db-item-line">{rewardLine(bonus, money)}</span>
                      {bonus.note ? <span className="db-item-note">“{bonus.note}”</span> : null}
                      <small>{timeLine(bonus)} · {bonus.from}{bonus.until ? ` – ${bonus.until}` : tr(" onwards")}{bonus.kind === "area" ? ` · ${bonus.areas.map((area) => area.name).join(", ")}` : bonus.zones.length ? tr(" · {0} zones", [bonus.zones.length]) : tr(" · all zones")}</small>
                    </div>
                    <div className="db-item-actions">
                      {state !== "ended" ? (
                        <CommandButton command="admin.drivers.bonusToggle" className={on ? "surge-toggle on" : "surge-toggle"} targetId={bonus.name} confirmTarget={false} scope="all" before={bonus.status} after={on ? "paused" : "active"} expectedSliceRev={book.draftRev} sliceKey={BONUS_KEY} value={setBonusStatus(book, bonus.id, on ? "paused" : "active")} disabled={!canEdit} aria-label={`${bonus.name} ${on ? "on" : "off"}`} onDone={() => setNotice(`Bonus ${bonus.name} switched ${on ? "off" : "on"}.`)}>
                          {on ? tr("On") : tr("Off")} <span className="switch" aria-hidden="true"><i /></span>
                        </CommandButton>
                      ) : null}
                      {state !== "ended" ? <button data-command="admin.drivers.bonusEdit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing(bonus)}>{trn("{0} Edit", <Pencil size={13} aria-hidden="true" />)}</button> : null}
                      <button data-command="admin.drivers.bonusCreate" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing({ ...bonus, id: "", name: `${bonus.name} copy`, status: "active" })}>{trn("{0} Copy", <Copy size={13} aria-hidden="true" />)}</button>
                      <button data-command="admin.drivers.bonusForm" type="button" className="dash-btn small ghost" aria-pressed={previewId === bonus.id} onClick={() => setPreviewId(previewId === bonus.id ? null : bonus.id)}>{previewId === bonus.id ? tr("Hide driver app") : tr("See in driver app")}</button>
                    </div>
                  </div>
                  {sum ? (
                    <dl className="db-stats" aria-label={tr("{0} today", [bonus.name])}>
                      <div><dt>{tr("Drivers in it")}</dt><dd>{sum.drivers}</dd></div>
                      <div><dt>{tr("Started today")}</dt><dd>{sum.started}</dd></div>
                      <div><dt>{tr("Reached it")}</dt><dd>{sum.reached}</dd></div>
                      <div><dt>{tr("Blocked by rules")}</dt><dd>{sum.blocked}</dd></div>
                      <div><dt>{tr("Earned today")}</dt><dd>{money(sum.paid)}</dd></div>
                      {used !== null ? <span className="rd-budget" aria-label={tr("{0}% of budget used", [Math.round(used)])}><i style={{ width: `${used}%` }} /></span> : null}
                    </dl>
                  ) : null}
                  {previewId === bonus.id ? <div className="db-item-preview"><DriverAppPreview bonus={bonus} money={money} categoryName={categoryName} done={Math.max(1, Math.round((sum?.rows[0]?.result.counted ?? 1)))} /></div> : null}
                  <footer className="db-item-foot">
                    <small>{trn("Made by {0}{1}{2}", bonus.createdBy, bonus.editedBy ? tr(" · changed by {0}", [bonus.editedBy]) : "", bonus.budget ? tr(" · budget {0}", [money(bonus.budget)]) : tr(" · no budget"))}</small>
                    {state !== "ended" ? (
                      <CommandButton command="admin.drivers.bonusStop" className="dash-btn small ghost" targetId={bonus.name} confirmTarget={false} scope="all" before={bonus.status} after="ended" expectedSliceRev={book.draftRev} sliceKey={BONUS_KEY} value={setBonusStatus(book, bonus.id, "ended")} disabled={!canEdit} onDone={() => setNotice(`Bonus ${bonus.name} ended.`)}>{tr("End bonus")}</CommandButton>
                    ) : null}
                  </footer>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
