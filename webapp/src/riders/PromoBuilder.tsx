import { useMemo, useState } from "react";
import { Crown, Dices, KeyRound, ListChecks, Search, Sparkles, UserPlus, Users, X } from "lucide-react";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { CommandButton } from "../ui/CommandButton";
import { CARE_KEY, createPromotion, maxCost, promoReach, validatePromo, type PromoDraft, type RiderCare } from "./care";
import { categoryName } from "./profile";
import { pickAudience, type RiderRow, type SegmentId } from "./segments";
import { CURRENCY_SYMBOL, money, PromoTicketCard } from "./ui";
import { CARD_IMAGES, RiderAppPreview, imageUrl } from "./RiderAppPreview";
import { useCategoryPrices } from "./useCategoryPrices";
import { tr, trn, trx, trSentences } from "../i18n";

const CATEGORIES = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet", "child_seat"];
const QUICK: { id: SegmentId; label: string }[] = [
  { id: "new", get label() { return tr("New riders"); } },
  { id: "top", get label() { return tr("Top riders"); } },
  { id: "loyal", get label() { return tr("Loyal riders"); } },
  { id: "inactive", get label() { return tr("Inactive"); } },
  { id: "all", get label() { return tr("Everyone"); } },
];

type Mode = "pick" | "random" | "newest" | "code";
const MODES: { id: Mode; label: string; hint: string; icon: typeof Users }[] = [
  { id: "pick", get label() { return tr("Riders I pick"); }, get hint() { return tr("A group or riders by name"); }, icon: ListChecks },
  { id: "random", get label() { return tr("Random riders"); }, get hint() { return tr("Type how many"); }, icon: Dices },
  { id: "newest", get label() { return tr("Newest riders"); }, get hint() { return tr("The last ones who joined"); }, icon: UserPlus },
  { id: "code", get label() { return tr("Anyone with the code"); }, get hint() { return tr("Riders type it in the app"); }, icon: KeyRound },
];

type Props = {
  country: MarketId;
  care: RiderCare;
  agentId: string | null;
  canEdit: boolean;
  /** Riders to choose from (group promotion). One row means a promotion for that rider only. */
  rows: RiderRow[];
  preselected?: string[];
  single?: boolean;
  /** ticketId is given for a code promotion, so it can be sent right away. */
  onCreated: (message: string, ticketId?: string) => void;
  onClose?: () => void;
};

function isoDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** Build a promotion like "30% off the next 10 rides, max 50 kr per ride" for one rider or a group. */
export function PromoBuilder({ country, care, agentId, canEdit, rows, preselected = [], single = false, onCreated, onClose }: Props) {
  const symbol = CURRENCY_SYMBOL[country];
  const defaults = { SE: [50, 0], FR: [5, 0], TN: [15, 0] }[country];
  const [code, setCode] = useState(single ? `${(rows[0]?.rider.name.split(" ")[0] ?? "RIDER").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8)}30` : "");
  const [title, setTitle] = useState(single ? "A gift from Movera" : "");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState(30);
  const [rides, setRides] = useState(10);
  const [maxPerRide, setMaxPerRide] = useState(defaults[0]);
  const [minFare, setMinFare] = useState(defaults[1]);
  const [from, setFrom] = useState(isoDay(0));
  const [to, setTo] = useState(isoDay(30));
  const [categories, setCategories] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [budget, setBudget] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(single ? rows.map((row) => row.rider.id) : preselected));
  const [group, setGroup] = useState(single ? "One rider" : preselected.length ? "Picked riders" : "");
  const [query, setQuery] = useState("");
  const [image, setImage] = useState("gradient");
  const [mode, setMode] = useState<Mode>("pick");
  const [count, setCount] = useState(20);
  const [seed, setSeed] = useState(1);
  const [maxUses, setMaxUses] = useState(500);
  const prices = useCategoryPrices(country);

  const draft: PromoDraft = {
    code: code.trim().toUpperCase(), title, kind, value, rides, maxPerRide: kind === "percent" ? maxPerRide : value, minFare,
    validFrom: from ? new Date(`${from}T00:00:00`).toISOString() : "", validTo: to ? new Date(`${to}T23:59:00`).toISOString() : "",
    country, zones, categories, budget: budget > 0 ? budget : null, image,
    audience: mode === "code" ? "code" : "riders", maxUses: mode === "code" ? maxUses : null,
    riderIds: mode === "code" ? [] : [...picked], group: mode === "code" ? "Anyone with the code" : group || "Picked riders",
  };
  const error = validatePromo(draft);
  const created = agentId ? createPromotion(care, draft, agentId, Date.now()) : { care, error: "Sign in again." };
  // Riders chosen by a group, random or newest go to the top; ticking by hand does not move rows.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(preselected));
  const shown = useMemo(() => rows
    .filter((row) => !query.trim() || `${row.rider.name} ${row.profile.code}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(pinned.has(b.rider.id)) - Number(pinned.has(a.rider.id)))
    .slice(0, 80), [rows, query, pinned]);
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

  function pickMany(next: Mode, many: number, round: number) {
    if (next !== "random" && next !== "newest") return;
    const ids = new Set(pickAudience(rows, next, many, round).map((row) => row.rider.id));
    setPicked(ids);
    setPinned(ids);
    setGroup(next === "random" ? `${many} random riders` : `${many} newest riders`);
  }

  function chooseMode(next: Mode) {
    setMode(next);
    pickMany(next, count, seed);
  }

  function quickPick(id: SegmentId, label: string) {
    const ids = new Set(rows.filter((row) => row.segments.has(id) && !row.segments.has("blocked")).map((row) => row.rider.id));
    setPicked(ids);
    setPinned(ids);
    setGroup(label);
  }

  return (
    <div className={single ? "rd-builder single" : "rd-builder"}>
      <div className="rd-builder-form">
        <div className="rd-builder-head">
          <h3>{single ? tr("New promotion for this rider") : tr("New group promotion")}</h3>
          {onClose ? <button data-command="admin.confirm.cancel" type="button" className="icon-ghost" aria-label={tr("Close promotion")} onClick={onClose}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <div className="rd-form-grid">
          <label className="field">{trn("Code{0}", <input aria-label={tr("Promotion code")} value={code} maxLength={16} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="SPRING30" />)}</label>
          <label className="field">{trn("Title riders see{0}", <input aria-label={tr("Promotion title")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tr("Thank you for riding")} />)}</label>
        </div>
        <div className="rd-kind" role="radiogroup" aria-label={tr("Discount type")}>
          <button data-command="admin.ui.quickAction" type="button" role="radio" aria-checked={kind === "percent"} className={kind === "percent" ? "active" : undefined} onClick={() => setKind("percent")}>{tr("% off")}</button>
          <button data-command="admin.ui.quickAction" type="button" role="radio" aria-checked={kind === "fixed"} className={kind === "fixed" ? "active" : undefined} onClick={() => setKind("fixed")}>{tr("Fixed amount off")}</button>
        </div>
        <div className="rd-form-grid four">
          <label className="field">{kind === "percent" ? tr("Discount") : tr("Amount off")}<NumberField label={tr("Promotion discount")} value={value} unit={kind === "percent" ? "%" : symbol} max={kind === "percent" ? 100 : undefined} onChange={setValue} /></label>
          <label className="field">{trn("For the next{0}", <NumberField label={tr("Promotion rides")} value={rides} unit="rides" max={100} onChange={(next) => setRides(Math.round(next))} />)}</label>
          {kind === "percent" ? <label className="field">{trn("Max per ride{0}", <NumberField label={tr("Promotion max per ride")} value={maxPerRide} unit={symbol} onChange={setMaxPerRide} />)}</label> : null}
          <label className="field">{trn("Min fare{0}", <NumberField label={tr("Promotion min fare")} value={minFare} unit={symbol} onChange={setMinFare} />)}</label>
          <label className="field">{trn("Starts{0}", <input type="date" aria-label={tr("Promotion starts")} value={from} onChange={(event) => setFrom(event.target.value)} />)}</label>
          <label className="field">{trn("Ends{0}", <input type="date" aria-label={tr("Promotion ends")} value={to} onChange={(event) => setTo(event.target.value)} />)}</label>
          <label className="field">{trn("Budget (optional){0}", <NumberField label={tr("Promotion budget")} value={budget} unit={symbol} onChange={setBudget} />)}</label>
        </div>
        <fieldset className="rd-chips rd-pictures">
          <legend>{tr("Picture on the promotion")}</legend>
          {CARD_IMAGES.map((item) => (
            <label key={item.id} className={image === item.id ? "rd-pic on" : "rd-pic"}>
              <input type="radio" name="promo-picture" aria-label={tr("Picture {0}", [trx(item.label)])} checked={image === item.id} onChange={() => setImage(item.id)} />
              <span className="rd-pic-thumb" style={imageUrl(item.id) ? { backgroundImage: `url(${imageUrl(item.id)})` } : undefined} aria-hidden="true" />
              {trx(item.label)}
            </label>
          ))}
        </fieldset>
        <fieldset className="rd-chips">
          <legend>{trn("Categories {0}", <small>{tr("(none = all)")}</small>)}</legend>
          {CATEGORIES.map((id) => (
            <label key={id} className={categories.includes(id) ? "check-chip on" : "check-chip"}>
              <input type="checkbox" checked={categories.includes(id)} onChange={() => setCategories(toggle(categories, id))} />{categoryName(id)}
            </label>
          ))}
        </fieldset>
        <fieldset className="rd-chips">
          <legend>{trn("Zones in {0} {1}", market(country).name, <small>{tr("(none = all)")}</small>)}</legend>
          {market(country).zones.map((zone) => (
            <label key={zone.id} className={zones.includes(zone.id) ? "check-chip on" : "check-chip"}>
              <input type="checkbox" checked={zones.includes(zone.id)} onChange={() => setZones(toggle(zones, zone.id))} />{zone.name}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="rd-builder-side">
        <RiderAppPreview promo={draft} prices={prices.rows} zoneName={prices.zoneName} />
        <PromoTicketCard ticket={{ ...draft, status: "active" }} locale={market(country).locale} />
        <dl className="rd-cost">
          <div><dt>{mode === "code" ? tr("Can use it") : tr("Riders")}</dt><dd>{promoReach(draft)}</dd></div>
          <div><dt>{tr("Most it can cost")}</dt><dd>{money(Math.round(maxCost(draft) * market(country).minorUnits), country)}</dd></div>
          <div><dt>{tr("Budget")}</dt><dd>{budget > 0 ? money(budget * market(country).minorUnits, country) : tr("No limit")}</dd></div>
        </dl>
        {error ? <p className="rd-form-error" role="alert">{trSentences(error)}</p> : null}
        <CommandButton command="admin.riders.promoCreate" className="dash-btn publish" targetId={draft.code || "promotion"} confirmTarget={false} scope="all" before="none" after={`${draft.code} for ${picked.size} riders`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={created.care} disabled={!canEdit || Boolean(error) || Boolean(created.error)} title={error ?? created.error} onDone={() => onCreated(mode === "code" ? `Promotion ${draft.code} ready: up to ${maxUses} riders can use the code.` : `Promotion ${draft.code} given to ${picked.size} rider${picked.size === 1 ? "" : "s"}.`, mode === "code" ? created.ticket?.id : undefined)}>{trn("{0} Give promotion", <Sparkles size={15} aria-hidden="true" />)}</CommandButton>
      </div>

      {!single ? (
        <div className="rd-audience">
          <h4>{trn("{0} Who gets it{1}", <Users size={15} aria-hidden="true" />, mode === "code" ? "" : tr(" · {0} selected", [picked.size]))}</h4>
          <div className="rd-modes" role="radiogroup" aria-label={tr("Who gets it")}>
            {MODES.map((item) => (
              <button data-command="admin.riders.select" key={item.id} type="button" role="radio" aria-checked={mode === item.id} className={mode === item.id ? "rd-mode on" : "rd-mode"} onClick={() => chooseMode(item.id)}>
                <item.icon size={16} aria-hidden="true" />
                <span><b>{trx(item.label)}</b><small>{trx(item.hint)}</small></span>
              </button>
            ))}
          </div>
          {mode === "pick" ? (
            <div className="rd-quick" role="group" aria-label={tr("Quick groups")}>
              {QUICK.map((item) => <button data-command="admin.riders.select" key={item.id} type="button" className={group === item.label ? "check-chip on" : "check-chip"} onClick={() => quickPick(item.id, item.label)}>{trx(item.label)}</button>)}
              <button data-command="admin.riders.select" type="button" className="check-chip" onClick={() => { setPicked(new Set()); setGroup(""); }}>{tr("Clear")}</button>
            </div>
          ) : null}
          {mode === "random" || mode === "newest" ? (
            <div className="rd-mode-row">
              <label className="field">{trn("How many riders{0}", <NumberField label={tr("How many riders")} value={count} unit="riders" max={10000} onChange={(value) => { const next = Math.max(1, Math.round(value)); setCount(next); pickMany(mode, next, seed); }} />)}</label>
              {mode === "random" ? <button data-command="admin.riders.select" type="button" className="dash-btn small ghost" onClick={() => { setSeed(seed + 1); pickMany(mode, count, seed + 1); }}>{trn("{0} Pick others", <Dices size={13} aria-hidden="true" />)}</button> : null}
              <small className="fine">{trn("{0} You can still untick riders below.", mode === "random" ? tr("Picked by chance among riders who are not blocked.") : tr("The riders who joined last."))}</small>
            </div>
          ) : null}
          {mode === "code" ? (
            <div className="rd-mode-row">
              <label className="field">{trn("How many riders can use it{0}", <NumberField label={tr("Code uses")} value={maxUses} unit="riders" max={100000} onChange={(value) => setMaxUses(Math.max(1, Math.round(value)))} />)}</label>
              <small className="fine">{tr("No list: riders type the code in the app (Account, then Vouchers). Each rider can use it once. Send it after: push, SMS, email, popup or a flyer.")}</small>
            </div>
          ) : null}
          {mode === "code" ? null : <>
          <label className="rd-search small"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find riders for the promotion")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Find by name or code")} /></label>
          <ul className="rd-audience-list" aria-label={tr("Riders for the promotion")}>
            {shown.map((row) => (
              <li key={row.rider.id} className={picked.has(row.rider.id) ? "on" : undefined}>
                <label>
                  <input type="checkbox" aria-label={tr("Give promotion to {0}", [row.rider.name])} checked={picked.has(row.rider.id)} disabled={row.segments.has("blocked")} onChange={() => {
                    setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(row.rider.id)) next.delete(row.rider.id);
                      else next.add(row.rider.id);
                      return next;
                    });
                    setGroup("Picked riders");
                  }} />
                  <span className="rd-aud-name">{row.rider.name}<small>{row.profile.code}</small></span>
                  {row.isNew ? <span className="rd-badge new">{trn("{0}New", <Sparkles size={11} aria-hidden="true" />)}</span> : null}
                  {row.segments.has("top") ? <span className="rd-badge top">{trn("{0}Top", <Crown size={11} aria-hidden="true" />)}</span> : null}
                  <span className="rd-aud-num">{trn("{0} rides", <b>{row.profile.completed}</b>)}</span>
                  <span className="rd-aud-num">{money(row.profile.spentMinor, row.profile.country, true)}</span>
                </label>
              </li>
            ))}
          </ul>
          {rows.length > shown.length ? <small className="fine">{trn("Showing {0} of {1}. Use a quick group or search to reach the rest.", shown.length, rows.length)}</small> : null}
          </>}
        </div>
      ) : null}
    </div>
  );
}
