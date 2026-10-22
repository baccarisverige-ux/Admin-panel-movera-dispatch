import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Flame, Maximize2, X } from "lucide-react";
import { useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { market as marketOf, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trx } from "../i18n";
import { BONUS_KEY, bonusState, emptyBonusBook, localParts, normalizeBonusBook, rewardLine, saveBonus, type BonusBook, type DriverBonus } from "./bonus";

const END_CHIPS = [30, 60, 120] as const;
const pad = (value: number) => String(value).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(((minutes % 1440) + 1440) % 1440 / 60))}:${pad(((minutes % 60) + 60) % 60)}`;

/**
 * Click a driver bonus area on a live map: change the amount, the time window or switch it off right there.
 * OK saves through the same "Change driver bonus" command as Drivers › Bonuses, with its reason and checks.
 */
export function BonusQuickPopup({ bonusId, country, fullLink, onClose, onNotice }: { bonusId: string; country: MarketId; fullLink: string | null; onClose: () => void; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  const slice = useSlice<BonusBook>(BONUS_KEY, emptyBonusBook());
  const book = useMemo(() => normalizeBonusBook(slice.value), [slice.value]);
  const bonus = book.bonuses.find((item) => item.id === bonusId) ?? null;
  const canEdit = Boolean(agent && can(agent.role, "drivers.bonuses"));
  const place = marketOf(country);
  const money = (value: number) => new Intl.NumberFormat(place.locale, { style: "currency", currency: place.currency, maximumFractionDigits: 2 }).format(value);

  const [on, setOn] = useState(bonus ? bonus.status === "active" : true);
  const [amount, setAmount] = useState(bonus ? String(bonus.reward.type === "multiplier" ? bonus.reward.multiplier : bonus.reward.amount) : "");
  const [start, setStart] = useState(bonus?.start ?? "");
  const [end, setEnd] = useState(bonus?.end ?? "");

  if (!bonus) {
    return (
      <aside className="map-quick-pop" role="dialog" aria-label={tr("Driver bonus")}>
        <header className="mq-head"><strong>{tr("Driver bonus")}</strong><button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label={tr("Close")} onClick={onClose}><X size={14} /></button></header>
        <p className="fine">{slice.loading ? tr("Loading.") : tr("This bonus is no longer there.")}</p>
      </aside>
    );
  }

  const now = Date.now();
  const state = bonusState(bonus, now, place.timeZone);
  const editsAmount = bonus.reward.type !== "steps";
  const value = Number(amount);
  const reward = !editsAmount ? bonus.reward : bonus.reward.type === "multiplier" ? { ...bonus.reward, multiplier: value } : { ...bonus.reward, amount: value };
  const edited: DriverBonus = { ...bonus, reward, start, end, status: bonus.status === "ended" ? "ended" : on ? "active" : "paused" };
  const saved = agent ? saveBonus(book, edited, agent.id, now) : { book, error: "Sign in again." };
  const unchanged = JSON.stringify(edited) === JSON.stringify(bonus);
  const local = localParts(now, place.timeZone);

  function endIn(minutes: number) {
    if (state !== "live") setStart(hhmm(local.minutes));
    setEnd(hhmm(local.minutes + minutes));
  }

  return (
    <aside className="map-quick-pop bonus-quick" role="dialog" aria-label={tr("Driver bonus {0}", [bonus.name])} data-testid="bonus-quick-popup">
      <header className="mq-head">
        <span className="mq-icon" style={{ background: "#f2994a" }}><Flame size={14} aria-hidden="true" /></span>
        <div>
          <strong>{bonus.name}</strong>
          <small>{rewardLine(bonus, money)} · {state === "live" ? tr("Live now") : state === "paused" ? tr("Paused") : tr("{0} – {1}", [bonus.start, bonus.end])}</small>
        </div>
        <button data-command="admin.ui.mapClose" type="button" className="map-popup-close" aria-label={tr("Close")} onClick={onClose}><X size={14} /></button>
      </header>

      {bonus.status !== "ended" ? (
        <button data-command="admin.drivers.bonusToggle" type="button" className={on ? "surge-toggle on" : "surge-toggle"} aria-pressed={on} disabled={!canEdit} onClick={() => setOn((value) => !value)}>
          {trn("Bonus on {0}", <span className="switch" aria-hidden="true"><i /></span>)}
        </button>
      ) : <p className="fine">{tr("This bonus has ended.")}</p>}

      {on ? (
        <>
          {editsAmount ? (
            <label className="mq-field">
              {bonus.reward.type === "multiplier" ? tr("Fare multiplier") : bonus.reward.type === "per_ride" ? tr("Extra per ride ({0})", [place.currency]) : bonus.reward.type === "guarantee" ? tr("At least per hour ({0})", [place.currency]) : tr("Bonus amount ({0})", [place.currency])}
              <input type="number" min={0} step={bonus.reward.type === "multiplier" ? 0.1 : 1} value={amount} disabled={!canEdit} onChange={(event) => setAmount(event.target.value)} />
            </label>
          ) : <p className="fine">{tr("Step bonuses are changed in full screen.")}</p>}
          <fieldset className="mq-time">
            <legend>{tr("Time window (local)")}</legend>
            <div className="mq-time-row">
              <label>{tr("From")}<input type="time" value={start} disabled={!canEdit} aria-label={tr("Bonus starts at")} onChange={(event) => setStart(event.target.value)} /></label>
              <label>{tr("Until")}<input type="time" value={end} disabled={!canEdit} aria-label={tr("Bonus ends at")} onChange={(event) => setEnd(event.target.value)} /></label>
            </div>
            <div className="mq-chips">
              {END_CHIPS.map((minutes) => <button data-command="admin.drivers.bonusEdit" key={minutes} type="button" className="mq-chip" disabled={!canEdit} onClick={() => endIn(minutes)}>{minutes < 60 ? tr("Ends in {0} min", [minutes]) : tr("Ends in {0} h", [minutes / 60])}</button>)}
            </div>
          </fieldset>
        </>
      ) : null}

      <footer className="mq-foot">
        <CommandButton command="admin.drivers.bonusEdit" className="dash-btn small surge-go" targetId={bonus.name} confirmTarget={false} scope="all" before={`${bonus.status} ${bonus.start}-${bonus.end} ${bonus.reward.amount}`} after={`${edited.status} ${edited.start}-${edited.end} ${edited.reward.amount}`} expectedSliceRev={book.draftRev} sliceKey={BONUS_KEY} value={saved.book} disabled={!canEdit || unchanged || Boolean(saved.error)} title={!canEdit ? tr("Your role cannot change driver bonuses.") : saved.error ? trx(saved.error) : unchanged ? tr("Nothing changed yet.") : undefined} onDone={() => { onNotice(tr("Bonus {0} changed.", [bonus.name])); onClose(); }}>
          {tr("OK")}
        </CommandButton>
        {fullLink ? <Link className="dash-btn small ghost" to={fullLink}>{trn("{0} Open full screen ›", <Maximize2 size={12} aria-hidden="true" />)}</Link> : null}
      </footer>
    </aside>
  );
}
