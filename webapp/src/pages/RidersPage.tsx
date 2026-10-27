import { isLiveData } from "../live/realData";
import { logExport } from "../reports/activityLog";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  Crown,
  Dices,
  Download,
  Gift,
  Heart,
  MessageCircleWarning,
  MessageSquare,
  Moon,
  Plus,
  Radio,
  Search,
  Send,
  ShieldOff,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { AccountChip, Avatar, ContactActions } from "../fleet/ui";
import { market, zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { AUTO_AUDIENCES, CARE_KEY, REPLY_TEMPLATES, autoState, type AutoAudience, editPromotion, messageGroup, promoResults, promoUsed, saveFilter, setAutoPromos, setPromotionOn, stopPromotion, type AutoPromos, type PromoEdit, type RiderCare } from "../riders/care";
import { PromoBuilder } from "../riders/PromoBuilder";
import { PromoShare } from "../riders/PromoShare";
import { RiderPicker } from "../riders/RiderPicker";
import { RiderAppPreview } from "../riders/RiderAppPreview";
import { useCategoryPrices } from "../riders/useCategoryPrices";
import { categoryName } from "../riders/profile";
import { PERIODS, SEGMENTS, SORTS, pickAudience, insights, matches, ridersCsv, segmentCounts, sortRows, type Period, type RiderRow, type SegmentId, type SortId } from "../riders/segments";
import { LiveChip, PromoTicketCard, RiderBadges, Stars, money } from "../riders/ui";
import { useRidersData } from "../riders/useRidersData";
import { NumberField } from "../pricing/NumberField";
import { CommandButton } from "../ui/CommandButton";
import { useDialogFocus } from "../ui/useDialogFocus";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

type View = "riders" | "promotions" | "insights";

const ICONS: Record<SegmentId, ReactNode> = {
  all: <Users size={17} />,
  new: <Sparkles size={17} />,
  top: <Crown size={17} />,
  loyal: <Heart size={17} />,
  online: <Radio size={17} />,
  attention: <AlertTriangle size={17} />,
  reply: <MessageCircleWarning size={17} />,
  unpaid: <Wallet size={17} />,
  cancels: <XCircle size={17} />,
  inactive: <Moon size={17} />,
  promo: <Gift size={17} />,
  blocked: <ShieldOff size={17} />,
};

const TONE: Record<SegmentId, string> = {
  all: "blue", new: "violet", top: "amber", loyal: "pink", online: "green", attention: "red",
  reply: "red", unpaid: "orange", cancels: "orange", inactive: "grey", promo: "aqua", blocked: "grey",
};

const PAGE = 40;

export function RidersPage() {
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { market: place, country } = useMarketScope();
  const view = (["riders", "promotions", "insights"].includes(params.get("view") ?? "") ? params.get("view") : "riders") as View;
  const segment = (SEGMENTS.find((item) => item.id === params.get("seg"))?.id ?? "all") as SegmentId;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>(segment === "top" ? "rides" : "recent");
  const [period, setPeriod] = useState<Period>("month");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [notice, setNotice] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [builder, setBuilder] = useState<string[] | null>(null);
  const [filterName, setFilterName] = useState<string | null>(null);
  const data = useRidersData(period);
  const { rows, care, now } = data;
  const counts = useMemo(() => segmentCounts(rows), [rows]);
  const filtered = useMemo(() => sortRows(rows.filter((row) => row.segments.has(segment) && matches(row, query)), sort), [rows, segment, query, sort]);
  const shown = filtered.slice(0, limit);
  const chosen = rows.filter((row) => selected.has(row.rider.id));
  const keep = params.get("country") ? `?country=${params.get("country")}` : "";
  const date = new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short", year: "2-digit" });

  function go(next: { view?: View; seg?: SegmentId }) {
    const search = new URLSearchParams(params);
    if (next.view) search.set("view", next.view);
    if (next.seg) search.set("seg", next.seg);
    setParams(search);
    setLimit(PAGE);
    if (next.seg === "top") setSort("rides");
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv(list: RiderRow[]) {
    const csv = ridersCsv(list, (row, minor) => money(minor, row.profile.country));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `movera-riders-${country}-${new Date(now).toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    logExport(agent?.id, `${list.length} riders (CSV)`);
    setNotice(`Exported ${list.length} rider${list.length === 1 ? "" : "s"} to CSV.`);
  }

  const save = agent && filterName !== null ? saveFilter(care, { name: filterName, by: agent.id, segment, query, sort, period }) : { care, error: "Name the filter." };
  const mine = care.savedFilters.filter((item) => item.by === agent?.id);

  return (
    <div className="fd-page rd-page">
      <div className="fd-head">
        <div>
          <h2>{tr("Riders")}</h2>
          <p>{trn("{0} Click a rider to see every booking, payment, message and promotion.", data.loading ? tr("Loading riders.") : tr("{0} riders in {1}.", [rows.length, trx(place.name)]))}</p>
        </div>
        {can(role, "riders.promotions") ? (
          <button data-command="admin.riders.promoCreate" type="button" className="dash-btn publish" onClick={() => { setBuilder([]); go({ view: "promotions" }); }}>{trn("{0} New promotion", <Ticket size={15} aria-hidden="true" />)}</button>
        ) : null}
      </div>

      <div className="dash-tabs" role="tablist" aria-label={tr("Riders sections")}>
        {([["riders", "Riders", <Users key="u" size={15} />], ["promotions", "Promotions", <Gift key="g" size={15} />], ["insights", "Insights", <BarChart3 key="b" size={15} />]] as const).map(([id, label, icon]) => (
          <button data-command="admin.riders.view" key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : undefined} onClick={() => go({ view: id })}>
            {icon}{trx(label)}
            {id === "riders" && counts.attention ? <span className="tab-count">{counts.attention}</span> : null}
          </button>
        ))}
      </div>

      {notice || data.careSlice.message ? <p className="fd-notice" role="status">{trSentences(notice)} {trSentences(data.careSlice.message)}</p> : null}

      {view === "riders" ? (
        <>
          <section className="rd-segments" aria-label={tr("Rider categories")}>
            {SEGMENTS.map((item) => (
              <button data-command="admin.table.filter" key={item.id} type="button" className={`rd-seg tone-${TONE[item.id]}${segment === item.id ? " active" : ""}`} aria-pressed={segment === item.id} title={trx(item.hint)} onClick={() => go({ seg: item.id })}>
                <span className="rd-seg-icon" aria-hidden="true">{ICONS[item.id]}</span>
                <span className="rd-seg-label">{trx(item.label)}</span>
                <strong>{counts[item.id]}</strong>
              </button>
            ))}
          </section>

          <div className="rd-toolbar">
            <label className="rd-search"><Search size={15} aria-hidden="true" /><input aria-label={tr("Find rider")} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} placeholder={tr("Name, phone, email, rider code or trip")} /></label>
            <label className="fd-select"><span>{tr("Sort")}</span>
              <select aria-label={tr("Sort riders")} value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
                {SORTS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
              </select>
            </label>
            <div className="rd-period" role="radiogroup" aria-label={tr("Ranking period")}>
              {PERIODS.map((item) => <button data-command="admin.ui.period" key={item.id} type="button" role="radio" aria-checked={period === item.id} className={period === item.id ? "active" : undefined} onClick={() => setPeriod(item.id)}>{trx(item.label)}</button>)}
            </div>
            <label className="fd-select"><span>{trn("{0} Saved", <Bookmark size={12} aria-hidden="true" />)}</span>
              <select aria-label={tr("Saved filters")} value="" onChange={(event) => {
                const found = mine.find((item) => item.id === event.target.value);
                if (!found) return;
                setQuery(found.query);
                setSort(found.sort as SortId);
                setPeriod(found.period as Period);
                go({ seg: found.segment as SegmentId });
              }}>
                <option value="">{mine.length ? tr("Pick a saved filter") : tr("No saved filter")}</option>
                {mine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {filterName === null ? (
              <button data-command="admin.riders.saveFilter" type="button" className="dash-btn ghost small" onClick={() => setFilterName("")}>{trn("{0} Save filter", <Bookmark size={13} aria-hidden="true" />)}</button>
            ) : (
              <span className="rd-inline">
                <input aria-label={tr("Filter name")} value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder={tr("Top riders in Norrmalm")} />
                <CommandButton command="admin.riders.saveFilter" className="dash-btn small" targetId="saved-filter" confirmTarget={false} scope="all" before="" after={filterName} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={save.care} disabled={Boolean(save.error)} onDone={() => { setNotice(`Filter "${filterName}" saved.`); setFilterName(null); }}>{tr("Save")}</CommandButton>
                <button data-command="admin.confirm.cancel" type="button" className="link-action" onClick={() => setFilterName(null)}>{tr("Cancel")}</button>
              </span>
            )}
            <button data-command="admin.riders.export" type="button" className="dash-btn ghost small" onClick={() => exportCsv(filtered)}>{trn("{0} Export", <Download size={13} aria-hidden="true" />)}</button>
          </div>

          {segment === "top" ? (
            <div className="rd-topbar">
              <Crown size={16} aria-hidden="true" />
              <span>{trn("{0} Ranked by completed rides, then money spent.", <b>{trn("Top bookers · {0}", PERIODS.find((item) => item.id === period)?.label.toLowerCase())}</b>)}</span>
              {[10, 25, 50].map((size) => <button data-command="admin.riders.select" key={size} type="button" className="dash-btn small ghost" onClick={() => setSelected(new Set(filtered.slice(0, size).map((row) => row.rider.id)))}>{trn("Select top {0}", size)}</button>)}
            </div>
          ) : null}

          {selected.size ? (
            <div className="rd-bulk" role="region" aria-label={tr("Selected riders")}>
              <b>{trn("{0} selected", selected.size)}</b>
              {can(role, "support.reply") ? <button data-command="admin.riders.bulkMessage" type="button" className="dash-btn small" onClick={() => setMessageOpen(true)}>{trn("{0} Message", <MessageSquare size={13} aria-hidden="true" />)}</button> : null}
              {can(role, "riders.promotions") ? <button data-command="admin.riders.promoCreate" type="button" className="dash-btn small" onClick={() => { setBuilder([...selected]); go({ view: "promotions" }); }}>{trn("{0} Add promotion", <Gift size={13} aria-hidden="true" />)}</button> : null}
              <button data-command="admin.riders.export" type="button" className="dash-btn small ghost" onClick={() => exportCsv(chosen)}>{trn("{0} Export", <Download size={13} aria-hidden="true" />)}</button>
              <button data-command="admin.riders.select" type="button" className="link-action" onClick={() => setSelected(new Set())}>{tr("Clear")}</button>
            </div>
          ) : null}

          <div className="rd-list-wrap">
            <div className="rd-row head" aria-hidden="true">
              <span><input type="checkbox" tabIndex={-1} checked={shown.length > 0 && shown.every((row) => selected.has(row.rider.id))} onChange={() => setSelected((current) => (shown.every((row) => current.has(row.rider.id)) ? new Set() : new Set(shown.map((row) => row.rider.id))))} /></span>
              <span>#</span><span /><span>{tr("Rider")}</span><span>{tr("Now")}</span><span>{tr("Rating")}</span><span>{tr("Rides")}</span><span>{tr("Spent")}</span><span>{tr("Last ride")}</span><span>{tr("Status")}</span><span />
            </div>
            {data.loading ? <p className="state-line">{tr("Loading riders.")}</p> : shown.length === 0 ? <p className="state-line">{trn("No rider in {0}{1}.", SEGMENTS.find((item) => item.id === segment)?.label.toLowerCase(), query ? tr(" matching \"{0}\"", [query]) : "")}</p> : (
              <ul className="rd-list" aria-label={tr("Riders")}>
                {shown.map((row, index) => (
                  <li key={row.rider.id} className={selected.has(row.rider.id) ? "rd-row on" : "rd-row"} onClick={() => navigate({ pathname: `/riders/${row.rider.id}`, search: keep })}>
                    <span onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={tr("Select {0}", [row.rider.name])} checked={selected.has(row.rider.id)} onChange={() => toggle(row.rider.id)} /></span>
                    <span className="rd-rank">{index + 1}</span>
                    <Avatar name={row.rider.name} size={38} />
                    <span className="rd-who">
                      <Link to={{ pathname: `/riders/${row.rider.id}`, search: keep }} onClick={(event) => event.stopPropagation()}>{row.rider.name}</Link>
                      <small>{row.profile.code} · {zoneById(row.rider.zoneId)?.name ?? row.rider.zoneId}</small>
                      <RiderBadges row={row} compact />
                    </span>
                    <LiveChip state={row.live} />
                    <Stars value={row.profile.rating} />
                    <span className="rd-num" title={tr("{0} in the chosen period · {1} in total", [row.periodRides, row.profile.completed])}><b>{isLiveData() ? tr("Not connected yet") : period === "year" || sort === "rides" || segment === "top" ? row.periodRides : row.profile.completed}</b>{isLiveData() ? null : <small>{period === "year" || sort === "rides" || segment === "top" ? tr("{0} total", [row.profile.completed]) : tr("{0} this {1}", [row.periodRides, period === "today" ? "day" : period])}</small>}</span>
                    <span className="rd-num"><b>{money(isLiveData() ? NaN : segment === "top" || sort === "spent" ? row.periodSpentMinor : row.profile.spentMinor, row.profile.country, true)}</b><small>{segment === "top" || sort === "spent" ? tr("in period") : tr("all time")}</small></span>
                    <span className="rd-date">{row.profile.lastRideAt ? date.format(row.profile.lastRideAt) : isLiveData() ? tr("Not connected yet") : tr("Never")}</span>
                    <AccountChip status={row.rider.status} />
                    <span onClick={(event) => event.stopPropagation()}>
                      <ContactActions kind="rider" compact id={row.rider.id} name={row.rider.name} phone={row.rider.phone} zoneId={row.rider.zoneId} messageTo={`/riders/${row.rider.id}?tab=messages`} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {filtered.length > limit ? <button data-command="admin.table.filter" type="button" className="dash-btn ghost rd-more" onClick={() => setLimit((value) => value + PAGE)}>{trn("Show {0} more of {1}", Math.min(PAGE, filtered.length - limit), filtered.length - limit)}</button> : null}
          </div>
        </>
      ) : null}

      {view === "promotions" ? (
        <PromotionsView
          care={care}
          rows={rows}
          country={country}
          agentId={agent?.id ?? null}
          canEdit={can(role, "riders.promotions")}
          builder={builder}
          onBuilder={setBuilder}
          onNotice={(text) => { setNotice(text); setSelected(new Set()); }}
          now={now}
        />
      ) : null}

      {view === "insights" ? <InsightsView rows={rows} now={now} locale={place.locale} country={country} onSegment={(seg) => go({ view: "riders", seg })} /> : null}

      {messageOpen ? <GroupMessage care={care} rows={chosen} agentId={agent?.id ?? ""} now={now} onClose={() => setMessageOpen(false)} onSent={(count) => { setMessageOpen(false); setSelected(new Set()); setNotice(`Message sent to ${count} rider${count === 1 ? "" : "s"}.`); }} /> : null}
    </div>
  );
}

function GroupMessage({ care, rows, agentId, now, onClose, onSent }: { care: RiderCare; rows: RiderRow[]; agentId: string; now: number; onClose: () => void; onSent: (count: number) => void }) {
  const root = useDialogFocus(true, onClose);
  const [text, setText] = useState("");
  return (
    <div ref={root} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={tr("Message riders")}>
      <div className="modal-card rd-modal">
        <h3>{trn("Message {0} rider{1}", rows.length, rows.length === 1 ? "" : tr("s"))}</h3>
        <p className="fine">{rows.slice(0, 6).map((row) => row.rider.name).join(", ")}{rows.length > 6 ? tr(" and {0} more", [rows.length - 6]) : ""}</p>
        <div className="fd-templates">{REPLY_TEMPLATES.map((item) => <button key={item} data-command="admin.ui.quickAction" type="button" className="fd-template" onClick={() => setText(item)}>{item}</button>)}</div>
        <textarea aria-label={tr("Group message")} rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={tr("Write to the selected riders")} />
        <div className="cat-actions end">
          <button data-command="admin.confirm.cancel" type="button" className="dash-btn ghost" onClick={onClose}>{tr("Cancel")}</button>
          <CommandButton command="admin.riders.bulkMessage" className="dash-btn" targetId={`${rows.length}-riders`} confirmTarget={false} scope="all" before="" after={`message to ${rows.length}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={messageGroup(care, rows.map((row) => row.rider), text, agentId, now)} disabled={!text.trim() || !rows.length} onDone={() => onSent(rows.length)}>{trn("{0} Send to {1}", <MessageSquare size={14} aria-hidden="true" />, rows.length)}</CommandButton>
        </div>
      </div>
    </div>
  );
}

function PromotionsView({ care, rows, country, agentId, canEdit, builder, onBuilder, onNotice, now }: { care: RiderCare; rows: RiderRow[]; country: "SE" | "FR" | "TN"; agentId: string | null; canEdit: boolean; builder: string[] | null; onBuilder: (ids: string[] | null) => void; onNotice: (text: string) => void; now: number }) {
  const [editing, setEditing] = useState<{ id: string; edit: PromoEdit } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [chosenPart, setPart] = useState<"list" | "auto">("list");
  // A new promotion always opens in the list part, whichever button started it.
  const part = builder ? "list" : chosenPart;
  const [sharingId, setSharingId] = useState<string | null>(null);
  const sharing = care.promotions.find((ticket) => ticket.id === sharingId) ?? null;
  const prices = useCategoryPrices(country);
  const byId = useMemo(() => new Map(rows.map((row) => [row.rider.id, row])), [rows]);
  const tickets = care.promotions.filter((ticket) => ticket.country === country);
  const locale = market(country).locale;
  const date = new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short" });
  return (
    <div className="rd-promos">
      <div className="dash-tabs small rd-promo-parts" role="tablist" aria-label={tr("Promotion types")}>
        <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={part === "list"} className={part === "list" ? "active" : undefined} onClick={() => setPart("list")}>{trn("{0} Promotions and codes {1}", <Ticket size={14} aria-hidden="true" />, <b className="rd-count">{tickets.length}</b>)}</button>
        <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={part === "auto"} className={part === "auto" ? "active" : undefined} onClick={() => { onBuilder(null); setPart("auto"); }}>{trn("{0} Automatic {1}", <Sparkles size={14} aria-hidden="true" />, <b className="rd-count">{trn("{0} running", Object.values(care.autoPromos).filter((item) => autoState(item, now) === "running").length)}</b>)}</button>
      </div>
      {part === "auto" ? <AutoPromosCard key={JSON.stringify(care.autoPromos)} care={care} rows={rows} country={country} canEdit={canEdit} onNotice={onNotice} now={now} /> : <>
      {builder ? (
        <section className="dash-card">
          <PromoBuilder country={country} care={care} agentId={agentId} canEdit={canEdit} rows={rows} preselected={builder} onClose={() => onBuilder(null)} onCreated={(text, id) => { onBuilder(null); onNotice(text); if (id) setSharingId(id); }} />
        </section>
      ) : (
        <button data-command="admin.riders.promoCreate" type="button" className="rd-new-promo" disabled={!canEdit} onClick={() => onBuilder([])}>
          <Plus size={18} aria-hidden="true" /> <span><b>{tr("New promotion")}</b><small>{tr("For riders you pick, random or newest riders, or a code anyone can use")}</small></span>
        </button>
      )}

      <section className="dash-card" aria-labelledby="promo-list-title">
        <div className="card-head">
          <h3 id="promo-list-title">{trn("{0} Promotions in {1}", <Ticket size={16} aria-hidden="true" />, market(country).name)}</h3>
          <span className="fine-print">{trn("{0} active", tickets.filter((ticket) => ticket.status === "active").length)}</span>
        </div>
        {tickets.length === 0 ? <p className="state-line">{trn("No promotion yet in {0}.", market(country).name)}</p> : (
          <ul className="rd-promo-list" aria-label={tr("Promotions")}>
            {tickets.map((ticket) => {
              const results = promoResults(ticket, (id) => {
                const row = byId.get(id);
                return row ? { used: promoUsed(ticket, id, row.bookings), avgFare: row.profile.avgFareMinor / market(country).minorUnits } : { used: 0, avgFare: 0 };
              });
              const spent = ticket.budget ? Math.min(100, (results.cost / ticket.budget) * 100) : null;
              const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
              const draft = editing?.id === ticket.id ? editing.edit : null;
              const edited = draft && agentId ? editPromotion(care, ticket.id, draft, agentId, now) : null;
              const on = ticket.status === "active";
              return (
                <li key={ticket.id}>
                  <div className="rd-promo-card">
                    <PromoTicketCard ticket={draft ? { ...ticket, ...draft, maxPerRide: ticket.kind === "percent" ? draft.maxPerRide : draft.value } : ticket} locale={locale} />
                    {ticket.status !== "stopped" ? (
                      <div className="rd-promo-controls">
                        <CommandButton command="admin.riders.promoToggle" className={on ? "surge-toggle on" : "surge-toggle"} targetId={ticket.code} confirmTarget={false} scope="all" before={ticket.status} after={on ? "off" : "on"} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={setPromotionOn(care, ticket.id, !on)} disabled={!canEdit} aria-label={`${ticket.code} ${on ? "on" : "off"}`} onDone={() => onNotice(tr("Promotion {0} switched {1}.", [ticket.code, on ? "off" : "on"]))}>
                          {on ? tr("On") : tr("Off")} <span className="switch" aria-hidden="true"><i /></span>
                        </CommandButton>
                        {draft ? null : <button data-command="admin.riders.promoEdit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => setEditing({ id: ticket.id, edit: { value: ticket.value, maxPerRide: ticket.maxPerRide, rides: ticket.rides } })}>{tr("Edit")}</button>}
                        <button data-command="admin.ui.quickAction" type="button" className="dash-btn small ghost" aria-pressed={previewId === ticket.id} onClick={() => setPreviewId(previewId === ticket.id ? null : ticket.id)}>{previewId === ticket.id ? tr("Hide app preview") : tr("See in rider app")}</button>
                        {on ? <button data-command="admin.riders.promoSend" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setSharingId(ticket.id)}>{trn("{0} Send and share", <Send size={13} aria-hidden="true" />)}</button> : null}
                      </div>
                    ) : null}
                    {draft ? (
                      <div className="rd-promo-edit" role="group" aria-label={tr("Change {0}", [ticket.code])}>
                        <label className="field">{ticket.kind === "percent" ? tr("Discount") : tr("Amount off")}<NumberField label={tr("{0} discount", [ticket.code])} value={draft.value} unit={ticket.kind === "percent" ? "%" : symbol} max={ticket.kind === "percent" ? 100 : undefined} onChange={(value) => setEditing({ id: ticket.id, edit: { ...draft, value } })} /></label>
                        {ticket.kind === "percent" ? <label className="field">{trn("Max per ride{0}", <NumberField label={tr("{0} max per ride", [ticket.code])} value={draft.maxPerRide} unit={symbol} onChange={(value) => setEditing({ id: ticket.id, edit: { ...draft, maxPerRide: value } })} />)}</label> : null}
                        <label className="field">{trn("Rides{0}", <NumberField label={tr("{0} rides", [ticket.code])} value={draft.rides} unit="rides" max={100} onChange={(value) => setEditing({ id: ticket.id, edit: { ...draft, rides: Math.round(value) } })} />)}</label>
                        {edited?.error ? <p className="rd-form-error">{trSentences(edited.error)}</p> : null}
                        <div className="cat-actions">
                          <CommandButton command="admin.riders.promoEdit" className="dash-btn small" targetId={ticket.code} confirmTarget={false} scope="all" before={`${ticket.value} · max ${ticket.maxPerRide} · ${ticket.rides} rides`} after={`${draft.value} · max ${draft.maxPerRide} · ${draft.rides} rides`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={edited?.care ?? care} disabled={!canEdit || !edited || Boolean(edited.error)} onDone={() => { setEditing(null); onNotice(tr("Promotion {0} changed.", [ticket.code])); }}>{tr("Save changes")}</CommandButton>
                          <button data-command="admin.confirm.cancel" type="button" className="dash-btn small ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
                        </div>
                      </div>
                    ) : null}
                    {previewId === ticket.id || draft ? <RiderAppPreview promo={draft ? { ...ticket, ...draft, maxPerRide: ticket.kind === "percent" ? draft.maxPerRide : draft.value } : ticket} prices={prices.rows} zoneName={prices.zoneName} off={ticket.status !== "active"} popup={ticket.popup} /> : null}
                  </div>
                  <div className="rd-promo-stats">
                    {ticket.audience === "code"
                      ? <div><span>{tr("Code can be used by")}</span><b>{ticket.maxUses ?? 0}</b><small>{tr("Anyone with the code")}</small></div>
                      : <div><span>{tr("Riders")}</span><b>{results.reached}</b><small>{trx(ticket.group)}</small></div>}
                    <div><span>{tr("Used by")}</span><b>{results.usedBy}</b><small>{results.reached ? Math.round((results.usedBy / results.reached) * 100) : 0}%</small></div>
                    <div><span>{tr("Rides with promo")}</span><b>{results.ridesUsed}</b><small>{trn("+{0} extra rides", results.ridesGained)}</small></div>
                    <div><span>{tr("Cost so far")}</span><b>{money(results.cost * market(country).minorUnits, country, true)}</b><small>{ticket.budget ? tr("of {0}", [money(ticket.budget * market(country).minorUnits, country, true)]) : tr("no budget")}</small></div>
                    {spent !== null ? <span className="rd-budget" aria-label={tr("{0}% of budget used", [Math.round(spent)])}><i style={{ width: `${spent}%` }} /></span> : null}
                    {ticket.sends?.length || ticket.popup ? (
                      <p className="rd-sent-line">
                        {ticket.popup ? <span className="rd-badge promo">{tr("Popup on")}</span> : null}
                        {ticket.sends?.length ? <span>{trn("Sent {0} time{1} · {2} people", ticket.sends.length, ticket.sends.length === 1 ? "" : tr("s"), ticket.sends.reduce((sum, item) => sum + item.riders + item.emails, 0))}</span> : null}
                      </p>
                    ) : null}
                    <p className="fine">{trn("Created {0} by {1}{2} · {3}", date.format(Date.parse(ticket.createdAt)), ticket.createdBy, ticket.editedBy ? tr(" · changed by {0}", [ticket.editedBy]) : "", ticket.status === "stopped" ? tr("Stopped") : ticket.status === "paused" ? tr("Off: riders cannot use it now") : tr("Ends {0}", [date.format(Date.parse(ticket.validTo))]))}</p>
                    {ticket.status !== "stopped" ? (
                      <CommandButton command="admin.riders.promoStop" className="dash-btn small ghost" targetId={ticket.code} confirmTarget={false} scope="all" before="active" after="stopped" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={stopPromotion(care, ticket.id)} disabled={!canEdit} onDone={() => onNotice(tr("Promotion {0} stopped.", [ticket.code]))}>{tr("Stop promotion")}</CommandButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      </>}
      {sharing ? <PromoShare ticket={sharing} care={care} rows={rows} country={country} agentId={agentId} canEdit={canEdit} now={now} onClose={() => setSharingId(null)} onNotice={onNotice} /> : null}
    </div>
  );
}

/** Keyed on the saved settings, so the form shows them once they load or after a save. */
const PROMO_CATEGORIES = ["economy", "comfort", "premium", "priority", "xl", "electric", "pet", "child_seat"];

const AUTO_STATE: Record<ReturnType<typeof autoState>, string> = { off: "Off", running: "Running now", waiting: "Starts later", ended: "Ended" };

function AutoPromosCard({ care, rows, country, canEdit, onNotice, now }: { care: RiderCare; rows: RiderRow[]; country: "SE" | "FR" | "TN"; canEdit: boolean; onNotice: (text: string) => void; now: number }) {
  const [draft, setAuto] = useState<AutoPromos>(care.autoPromos);
  const [preview, setPreview] = useState<keyof AutoPromos | null>(null);
  const [choosing, setChoosing] = useState<keyof AutoPromos | null>(null);
  const [seed, setSeed] = useState(1);
  const names = useMemo(() => new Map(rows.map((row) => [row.rider.id, row.rider.name])), [rows]);
  const randomIds = (count: number, round: number) => pickAudience(rows, "random", count, round).map((row) => row.rider.id);
  // Random riders picked before the rider list loaded come out empty; pick them once the list is here.
  const auto = useMemo(() => {
    if (!rows.length) return draft;
    const keys = Object.keys(draft) as (keyof AutoPromos)[];
    if (!keys.some((key) => draft[key].audience === "random" && !draft[key].riderIds.length)) return draft;
    return Object.fromEntries(keys.map((key) => [key, draft[key].audience === "random" && !draft[key].riderIds.length ? { ...draft[key], riderIds: pickAudience(rows, "random", draft[key].count, seed).map((row) => row.rider.id) } : draft[key]])) as AutoPromos;
  }, [draft, rows, seed]);
  const saved = setAutoPromos(care, auto);
  function setAudience(key: keyof AutoPromos, audience: AutoAudience) {
    const item = auto[key];
    const riderIds = audience === "random" ? randomIds(item.count, seed) : audience === "picked" ? item.riderIds : [];
    setAuto({ ...auto, [key]: { ...item, audience, riderIds } });
  }
  const prices = useCategoryPrices(country);
  return (
        <section className="dash-card" aria-labelledby="auto-title">
          <div className="card-head">
            <h3 id="auto-title">{trn("{0} Automatic promotions", <Sparkles size={16} aria-hidden="true" />)}</h3>
            <span className="fine-print">{tr("Given by the system when the moment comes")}</span>
          </div>
          <div className="rd-auto">
            {([["firstRide", "First ride", "New riders get a discount on their first ride"], ["birthday", "Birthday", "A gift on the rider's birthday"], ["winBack", "Come back", "Riders with no ride for a while"]] as const).map(([key, label, hint]) => (
              <div key={key} className={auto[key].on ? "rd-auto-card on" : "rd-auto-card"}>
                <div className="rd-auto-top">
                <label className="mini-switch big">
                  <input type="checkbox" aria-label={tr("{0} promotion on", [label])} checked={auto[key].on} disabled={!canEdit} onChange={(event) => setAuto({ ...auto, [key]: { ...auto[key], on: event.target.checked } })} />
                  <span aria-hidden="true"><i /></span>
                  <b>{trx(label)}</b>
                </label>
                <span className={`rd-auto-state ${autoState(auto[key], now)}`}>{AUTO_STATE[autoState(auto[key], now)]}</span>
                </div>
                <small>{trx(hint)}</small>
                <div className="rd-form-grid">
                  <label className="field">{trn("Discount{0}", <NumberField label={tr("{0} discount", [label])} value={auto[key].percent} unit="%" max={100} disabled={!canEdit} onChange={(value) => setAuto({ ...auto, [key]: { ...auto[key], percent: value } })} />)}</label>
                  <label className="field">{trn("Max per ride{0}", <NumberField label={tr("{0} max per ride", [label])} value={auto[key].maxPerRide} unit={{ SE: "kr", FR: "€", TN: "DT" }[country]} disabled={!canEdit} onChange={(value) => setAuto({ ...auto, [key]: { ...auto[key], maxPerRide: value } })} />)}</label>
                  <label className="field">{trn("For how many rides{0}", <NumberField label={tr("{0} rides", [label])} value={auto[key].rides} unit="rides" max={20} disabled={!canEdit} onChange={(value) => setAuto({ ...auto, [key]: { ...auto[key], rides: Math.max(1, Math.round(value)) } })} />)}</label>
                  {key === "winBack" ? <label className="field">{trn("After no ride for{0}", <NumberField label={tr("Come back after days")} value={auto.winBack.afterDays} unit="days" disabled={!canEdit} onChange={(value) => setAuto({ ...auto, winBack: { ...auto.winBack, afterDays: Math.round(value) } })} />)}</label> : null}
                  <label className="field">{trn("Who gets it{0}", <select aria-label={tr("{0} audience", [label])} value={auto[key].audience} disabled={!canEdit} onChange={(event) => setAudience(key, event.target.value as AutoAudience)}>
                      {AUTO_AUDIENCES.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
                    </select>)}</label>
                </div>
                {auto[key].audience === "random" || auto[key].audience === "picked" ? (
                  <div className="rd-mode-row rd-auto-who">
                    {auto[key].audience === "random" ? (
                      <>
                        <label className="field">{trn("How many riders{0}", <NumberField label={tr("{0} how many riders", [label])} value={auto[key].count} unit="riders" max={10000} disabled={!canEdit} onChange={(value) => { const count = Math.max(1, Math.round(value)); setAuto({ ...auto, [key]: { ...auto[key], count, riderIds: randomIds(count, seed) } }); }} />)}</label>
                        <button data-command="admin.riders.select" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => { setSeed(seed + 1); setAuto({ ...auto, [key]: { ...auto[key], riderIds: randomIds(auto[key].count, seed + 1) } }); }}>{trn("{0} Pick others", <Dices size={13} aria-hidden="true" />)}</button>
                      </>
                    ) : null}
                    <p className="rd-share-who" aria-label={tr("{0} riders", [label])}>{trn("{0} rider{1}{2}", <b>{auto[key].riderIds.length}</b>, auto[key].riderIds.length === 1 ? "" : tr("s"), auto[key].riderIds.length ? `: ${auto[key].riderIds.slice(0, 3).map((id) => names.get(id) ?? id).join(", ")}${auto[key].riderIds.length > 3 ? ` and ${auto[key].riderIds.length - 3} more` : ""}` : "")}</p>
                    <button data-command="admin.riders.select" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => setChoosing(key)}>{auto[key].audience === "picked" ? tr("Choose riders") : tr("See or change riders")}</button>
                  </div>
                ) : null}
                <fieldset className="rd-when">
                  <legend>{trn("When it runs {0}", <small>{tr("(empty = always)")}</small>)}</legend>
                  <label className="field">{trn("Starts{0}", <input type="date" aria-label={tr("{0} starts", [label])} value={auto[key].from} disabled={!canEdit} onChange={(event) => setAuto({ ...auto, [key]: { ...auto[key], from: event.target.value } })} />)}</label>
                  <label className="field">{trn("Ends{0}", <input type="date" aria-label={tr("{0} ends", [label])} value={auto[key].to} disabled={!canEdit} onChange={(event) => setAuto({ ...auto, [key]: { ...auto[key], to: event.target.value } })} />)}</label>
                </fieldset>
                <fieldset className="rd-chips">
                  <legend>{trn("Categories {0}", <small>{tr("(none = all)")}</small>)}</legend>
                  {PROMO_CATEGORIES.map((id) => (
                    <label key={id} className={auto[key].categories.includes(id) ? "check-chip on" : "check-chip"}>
                      <input type="checkbox" aria-label={`${label} ${categoryName(id)}`} disabled={!canEdit} checked={auto[key].categories.includes(id)} onChange={() => setAuto({ ...auto, [key]: { ...auto[key], categories: auto[key].categories.includes(id) ? auto[key].categories.filter((item) => item !== id) : [...auto[key].categories, id] } })} />{categoryName(id)}
                    </label>
                  ))}
                </fieldset>
                <button data-command="admin.ui.quickAction" type="button" className="dash-btn small ghost" aria-pressed={preview === key} onClick={() => setPreview(preview === key ? null : key)}>{preview === key ? tr("Hide app preview") : tr("See in rider app")}</button>
                {preview === key ? (
                  <RiderAppPreview promo={{ title: label, kind: "percent", value: auto[key].percent, rides: auto[key].rides, maxPerRide: auto[key].maxPerRide, minFare: 0, country, categories: auto[key].categories }} prices={prices.rows} zoneName={prices.zoneName} off={!auto[key].on} />
                ) : null}
              </div>
            ))}
          </div>
          {choosing ? (
            <RiderPicker rows={rows} picked={auto[choosing].riderIds} title={tr("Who gets {0}", [{ firstRide: "First ride", birthday: "Birthday", winBack: "Come back" }[choosing]])} onClose={() => setChoosing(null)} onSave={(ids) => { setAuto({ ...auto, [choosing]: { ...auto[choosing], riderIds: ids } }); setChoosing(null); }} />
          ) : null}
          {saved.error ? <p className="rd-form-error" role="alert">{trSentences(saved.error)}</p> : null}
          <CommandButton command="admin.riders.autoPromo" className="dash-btn" targetId="auto-promotions" confirmTarget={false} scope="all" before={JSON.stringify(care.autoPromos)} after={JSON.stringify(auto)} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={saved.care} disabled={!canEdit || Boolean(saved.error) || JSON.stringify(auto) === JSON.stringify(care.autoPromos)} title={saved.error} onDone={() => onNotice(tr("Automatic promotions saved."))}>{tr("Save automatic promotions")}</CommandButton>
        </section>
  );
}

function InsightsView({ rows, now, country, onSegment }: { rows: RiderRow[]; now: number; locale: string; country: "SE" | "FR" | "TN"; onSegment: (seg: SegmentId) => void }) {
  const facts = useMemo(() => insights(rows, now), [rows, now]);
  const day = new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short" });
  const peak = Math.max(1, ...facts.signups.map((item) => item.count));
  const maxZone = Math.max(1, ...facts.topZones.map((item) => item.rides));
  const newThisWeek = facts.signups.slice(-7).reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="rd-insights">
      <section className="fd-cards" aria-label={tr("Rider insights")}>
        <article className="fd-card tone-violet"><span className="fd-card-icon" aria-hidden="true"><Sparkles size={18} /></span><span className="fd-card-label">{tr("New riders this week")}</span><strong>{newThisWeek}</strong><small className="fd-card-hint">{trn("{0} today", facts.signups.slice(-1)[0]?.count ?? 0)}</small></article>
        <article className="fd-card tone-green"><span className="fd-card-icon" aria-hidden="true"><TrendingUp size={18} /></span><span className="fd-card-label">{tr("First ride within 7 days")}</span><strong>{facts.firstRideIn7}%</strong><small className="fd-card-hint">{tr("of riders who joined lately")}</small></article>
        <article className="fd-card tone-blue"><span className="fd-card-icon" aria-hidden="true"><Heart size={18} /></span><span className="fd-card-label">{tr("Came back for a 2nd ride")}</span><strong>{facts.retention}%</strong><small className="fd-card-hint">{tr("retention")}</small></article>
        <article className="fd-card tone-red"><span className="fd-card-icon" aria-hidden="true"><Moon size={18} /></span><span className="fd-card-label">{tr("Stopped riding this month")}</span><strong>{facts.churned}</strong><small className="fd-card-hint"><button data-command="admin.table.filter" type="button" className="link-action" onClick={() => onSegment("inactive")}>{tr("See inactive riders")}</button></small></article>
      </section>
      <div className="surge-two">
        <section className="dash-card" aria-labelledby="signups-title">
          <div className="card-head"><h3 id="signups-title">{trn("{0} New riders per day", <Users size={16} aria-hidden="true" />)}</h3><span className="fine-print">{tr("Last 14 days")}</span></div>
          <div className="rd-bars" role="img" aria-label={tr("New riders per day: {0}", [facts.signups.map((item) => item.count).join(", ")])}>
            {facts.signups.map((item) => (
              <span key={item.day} className="rd-bar"><i style={{ height: `${(item.count / peak) * 100}%` }} /><b>{item.count}</b><small>{day.format(item.day)}</small></span>
            ))}
          </div>
        </section>
        <section className="dash-card" aria-labelledby="zones-title">
          <div className="card-head"><h3 id="zones-title">{trn("{0} Where riders book most", <BarChart3 size={16} aria-hidden="true" />)}</h3><span className="fine-print">{tr("Last 30 days")}</span></div>
          <ul className="rd-zone-bars">
            {facts.topZones.map((item) => (
              <li key={item.zoneId}><span>{zoneById(item.zoneId)?.name ?? item.zoneId}</span><i style={{ width: `${(item.rides / maxZone) * 100}%` }} /><b>{item.rides}</b></li>
            ))}
          </ul>
        </section>
      </div>
      <p className="fine">{trn("Spend in the last 30 days: {0}", money(rows.reduce((sum, row) => sum + row.bookings.filter((booking) => booking.status === "completed" && booking.at > now - 30 * 86_400_000).reduce((acc, booking) => acc + booking.fareMinor, 0), 0), country))}</p>
    </div>
  );
}
