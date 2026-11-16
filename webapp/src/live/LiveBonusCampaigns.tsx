import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Flame, Plus, Trophy, Users, Wallet } from "lucide-react";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import {
  BONUSES_PATH, CAMPAIGN_LIMITS, campaignActions, campaignCommandPath, campaignCreateBody, campaignDriversPath, campaignEditBody, campaignErrorText,
  campaignListPath, campaignMaxOf, campaignPath, campaignProgressText, campaignReasonText, campaignStateText, campaignTargetText, currencySymbol,
  lastEndDate, parseCampaign, parseCampaignPage, parseProgressPage, zoneToday,
  type BonusCampaign, type CampaignForm, type CampaignMeasure, type CampaignNames, type CampaignState, type CampaignZone,
} from "../drivers/campaigns";
import { formatMoney, isCurrency } from "../domain/money";
import { currentLanguage, tr, trx } from "../i18n";
import { market, type MarketId } from "../markets/markets";
import { DateInput } from "../ui/DateInput";
import { formatIsoDate } from "../ui/dateText";
import { zoneName, type ServerZone } from "../zones/live";
import { readDraft } from "./configDocs";
import { useLiveSession } from "./LiveSessionContext";
import { useLiveZoneList } from "./LiveZones";
import { DateText, ErrorLine, LoadMore, isVersionMismatch, useLivePage } from "./ui";
import { SettingInfo } from "../ui/SettingInfo";

/**
 * BQ-V44 (owner G10-5 "Make bonuses real (Recommended)", Rules decisions/driver-g10.md:9; Q12 bonus zones,
 * decisions/admin-fake-by-group.md:40; G10 live items create / edit / toggle / stop / area, :11): Drivers › Bonuses on
 * live. The server's campaigns (contract 0.18.110, /admin/bonuses): list per zone with state, counts and paid total;
 * create (zone, names sv/fr/en, trips or hours online, target, amount in the zone's currency up to the country setting,
 * local dates, the area drawn inside the zone); one campaign with its drivers' progress; Pause / Resume / End and Edit
 * (names, later end date). Every number is the server's; the panel never works progress or money out. Lazy-loaded.
 * Reads need drivers.read, writes drivers.bonuses (one admin is enough, decisions/admin-fake-by-group.md:29).
 */

const LIVE_BONUSES = ["live", "bonusCampaigns"] as const;
const STATE_FILTERS: Array<[CampaignState | "", string]> = [["", "All"], ["active", "Running now"], ["scheduled", "Starts later"], ["paused", "Paused"], ["ended", "Campaign ended"]];

const nameOf = (names: CampaignNames) => {
  const language = currentLanguage();
  return (language === "sv" || language === "fr" ? names[language] : names.en) || names.en;
};
const dayText = (iso: string) => formatIsoDate(iso, currentLanguage()) || iso;

function campaignZoneOf(zone: ServerZone | undefined, max: CampaignZone["max"]): CampaignZone | null {
  if (!zone || !isCurrency(zone.currency)) return null;
  return { zoneId: zone.zoneId, currency: zone.currency, timeZone: zone.timeZone, polygon: zone.polygon, max };
}

export function LiveBonusCampaigns({ country }: { country: MarketId }) {
  const { can } = useLiveSession();
  const canWrite = can("drivers.bonuses");
  const zoneList = useLiveZoneList();
  const zones = useMemo(() => (zoneList ?? []).filter((zone) => zone.country === country && zone.kind === "operating"), [zoneList, country]);
  const [zoneId, setZoneId] = useState("");
  const [state, setState] = useState<CampaignState | "">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const list = useLivePage<unknown>([...LIVE_BONUSES, "list", zoneId, state], (cursor) => campaignListPath({ zoneId: zoneId || null, state: state || null, cursor }));
  // A list without a zone holds the campaigns of every zone in the admin's scope: this page shows its country's.
  const campaigns = useMemo(() => parseCampaignPage({ items: list.items }).items.filter((item) => item.country === country), [list.items, country]);
  const zoneLabel = (id: string) => {
    const zone = zones.find((item) => item.zoneId === id);
    return zone ? zoneName(zone.names, currentLanguage()) : id;
  };

  if (openId) return <CampaignDetail bonusId={openId} canWrite={canWrite} zoneLabel={zoneLabel} onBack={(text) => { setOpenId(null); setNotice(text); list.reload(); }} />;
  if (creating) return <CampaignCreate country={country} zones={zones} onClose={(text, bonusId) => { setCreating(false); setNotice(text); list.reload(); if (bonusId) setOpenId(bonusId); }} />;

  return (
    <div className="db-view" data-testid="live-bonus-campaigns">
      <div className="db-new">
        <button data-command="admin.server.bonusCampaignCreate" type="button" className="db-new-tile area" disabled={!canWrite || zones.length === 0} onClick={() => setCreating(true)}>
          <span className="db-new-icon"><Flame size={20} aria-hidden="true" /></span>
          <span><b>{tr("New campaign")}</b><small>{tr("Drivers who reach the target inside the area and the dates earn the amount once, with the next payout.")}</small></span>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {notice ? <p className="pricing-notice" role="status">{notice}</p> : null}
      <section className="dash-card" aria-labelledby="campaign-list-title">
        <div className="card-head">
          <h3 id="campaign-list-title"><Trophy size={16} aria-hidden="true" /> {tr("Bonus campaigns in {0}", [trx(market(country).name)])}</h3>
          <div className="zn-filters" role="group" aria-label={tr("Filter bonuses")}>
            {STATE_FILTERS.map(([id, label]) => (
              <button data-command="admin.table.filter" key={id || "all"} type="button" aria-pressed={state === id} className={state === id ? "zn-chip on" : "zn-chip"} onClick={() => setState(id)}>{trx(label)}</button>
            ))}
          </div>
        </div>
        <label className="fd-select">
          <span>{tr("Zone")}</span>
          {/* info-skip: list filter, not a setting */}
          <select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
            <option value="">{tr("All zones")}</option>
            {zones.map((zone) => <option key={zone.zoneId} value={zone.zoneId}>{zoneName(zone.names, currentLanguage())}</option>)}
          </select>
        </label>
        {list.error ? <ErrorLine error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isLoading ? <p className="state-line">{tr("Loading bonuses.")}</p> : campaigns.length === 0 && !list.error ? <p className="zn-empty">{tr("No bonus campaign here yet.")}</p> : (
          <table className="data-table" aria-label={tr("Bonus campaigns")}>
            <thead>
              <tr><th>{tr("Name")}</th><th>{tr("Zone")}</th><th>{tr("Target")}</th><th>{tr("Amount")}</th><th>{tr("Dates")}</th><th>{tr("Status")}</th><th>{tr("Drivers with progress")}</th><th>{tr("Earned it")}</th><th>{tr("Paid so far")}</th><th>{tr("Actions")}</th></tr>
            </thead>
            <tbody>
              {campaigns.map((item) => (
                <tr key={item.bonusId} data-testid={`campaign-${item.bonusId}`}>
                  <td>{nameOf(item.names)}</td>
                  <td>{zoneLabel(item.zoneId)}</td>
                  <td>{campaignTargetText(item.measure, item.target)}</td>
                  <td>{formatMoney(item.amount)}</td>
                  <td>{dayText(item.startDate)} – {dayText(item.endDate)}</td>
                  <td><span className={`db-state ${item.state}`}>{campaignStateText(item.state)}</span></td>
                  <td>{item.driversWithProgress}</td>
                  <td>{item.driversEarned}</td>
                  <td>{formatMoney(item.paidTotal)}</td>
                  <td><button data-command="admin.server.bonusCampaignOpen" type="button" className="dash-btn small ghost" onClick={() => setOpenId(item.bonusId)}>{tr("Open")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={() => void list.loadMore()} />
      </section>
    </div>
  );
}

const EMPTY_NAMES: CampaignNames = { sv: "", fr: "", en: "" };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `bon-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function NamesFields({ names, onChange, disabled }: { names: CampaignNames; onChange: (next: CampaignNames) => void; disabled?: boolean }) {
  return (
    <div className="zd-fields">
      {([["sv", "Name in Swedish"], ["fr", "Name in French"], ["en", "Name in English"]] as const).map(([lang, label]) => (
        <label key={lang} className="field">
          <span>{trx(label)}<SettingInfo id="bonus.campaign.names" label={trx(label)} /></span>
          <input aria-label={trx(label)} value={names[lang]} maxLength={80} disabled={disabled} onChange={(event) => onChange({ ...names, [lang]: event.target.value })} />
        </label>
      ))}
    </div>
  );
}

function CampaignCreate({ country, zones, onClose }: { country: MarketId; zones: ServerZone[]; onClose: (notice: string, bonusId?: string) => void }) {
  const { client } = useLiveSession();
  const [form, setForm] = useState<CampaignForm>(() => ({ zoneId: zones[0]?.zoneId ?? "", names: EMPTY_NAMES, measure: "trips", target: "", amount: "", startDate: "", endDate: "", polygon: [] }));
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [error, setError] = useState<unknown>(null);
  const zone = zones.find((item) => item.zoneId === form.zoneId);
  // The limit the server checks with: the zone's CountryRules (own, else its country standard), else the contract default.
  const rules = useQuery({ queryKey: ["live", "bonusCampaignMax", form.zoneId], queryFn: () => readDraft(client, "country_rules", form.zoneId).then((draft) => draft?.document ?? null).catch(() => null), enabled: Boolean(form.zoneId), staleTime: 60_000 });
  const max = campaignMaxOf(rules.data ?? null, country);
  const target = campaignZoneOf(zone, max);
  const today = zone ? zoneToday(zone.timeZone, Date.now()) : "";
  const set = (patch: Partial<CampaignForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setProblem("");
    setKey(newKey());
  };

  async function save() {
    if (!target) return;
    const made = campaignCreateBody(form, target, today);
    if ("error" in made) {
      setProblem(campaignReasonText(made.error) ?? "");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // One Idempotency-Key per filled form: a second click or a retry never makes a second campaign.
      const saved = parseCampaign(await client.json<unknown>(BONUSES_PATH, { method: "POST", body: JSON.stringify(made.body), idempotencyKey: key }));
      onClose(tr("Campaign {0} made.", [nameOf(made.body.names)]), saved?.bonusId);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dash-card db-card" aria-labelledby="campaign-new-title" data-testid="campaign-create">
      <div className="card-head">
        <h3 id="campaign-new-title"><Flame size={16} aria-hidden="true" /> {tr("New campaign")}</h3>
        <button data-command="admin.server.dialogCancel" type="button" className="dash-btn small ghost" onClick={() => onClose("")}><ArrowLeft size={13} aria-hidden="true" /> {tr("Back")}</button>
      </div>
      <div className="zd-fields">
        <label className="field">
          <span>{tr("Zone")}<SettingInfo id="bonus.campaign.zone" label={tr("Zone")} /></span>
          <select aria-label={tr("Zone")} value={form.zoneId} onChange={(event) => set({ zoneId: event.target.value, polygon: [] })}>
            {zones.map((item) => <option key={item.zoneId} value={item.zoneId}>{zoneName(item.names, currentLanguage())}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{tr("Counts")}<SettingInfo id="bonus.campaign.measure" label={tr("Counts")} /></span>
          <select aria-label={tr("Counts")} value={form.measure} onChange={(event) => set({ measure: event.target.value as CampaignMeasure })}>
            <option value="trips">{tr("Trips")}</option>
            <option value="online_hours">{tr("Hours online")}</option>
          </select>
        </label>
        <label className="field">
          <span>{form.measure === "trips" ? tr("Target (trips)") : tr("Target (hours online)")}<SettingInfo id="bonus.campaign.target" label={tr("Target")} /></span>
          <input aria-label={form.measure === "trips" ? tr("Target (trips)") : tr("Target (hours online)")} inputMode="numeric" value={form.target} maxLength={3} onChange={(event) => set({ target: event.target.value })} />
          <small>{tr("{0} to {1}", CAMPAIGN_LIMITS.target[form.measure])}</small>
        </label>
        <label className="field">
          <span>{tr("Amount")} ({target ? currencySymbol(target.currency) : ""})<SettingInfo id="bonus.campaign.amount" label={tr("Amount")} /></span>
          <input aria-label={tr("Amount")} inputMode="decimal" value={form.amount} maxLength={12} onChange={(event) => set({ amount: event.target.value })} />
          <small data-testid="campaign-max">{tr("At most {0} (Pricing › Tips & limits).", [formatMoney(max)])}</small>
        </label>
        <label className="field">
          <span>{tr("Start date")}<SettingInfo id="bonus.campaign.dates" label={tr("Start date")} /></span>
          <DateInput aria-label={tr("Start date")} value={form.startDate} min={today} onChange={(event) => set({ startDate: event.target.value, endDate: form.endDate && form.endDate < event.target.value ? "" : form.endDate })} />
        </label>
        <label className="field">
          <span>{tr("End date")}<SettingInfo id="bonus.campaign.dates" label={tr("End date")} /></span>
          <DateInput aria-label={tr("End date")} value={form.endDate} min={form.startDate || today} max={form.startDate ? lastEndDate(form.startDate) : undefined} onChange={(event) => set({ endDate: event.target.value })} />
          <small>{tr("Local dates of the zone, at most {0} days.", [CAMPAIGN_LIMITS.maxDays])}</small>
        </label>
      </div>
      <NamesFields names={form.names} onChange={(names) => set({ names })} />
      <h4>{tr("Campaign area")}<SettingInfo id="bonus.campaign.area" label={tr("Campaign area")} /></h4>
      <p className="fine">{tr("Its own shape, separate from the operating zones. Every point must be inside the zone.")}</p>
      {zone ? <BonusAreaMap key={zone.zoneId} country={country} areas={form.polygon.length ? [{ id: "campaign", name: tr("Campaign area"), ring: form.polygon }] : []} onChange={(next) => set({ polygon: next[next.length - 1]?.ring ?? [] })} view={zone.polygon} /> : null}
      <p className="fine">{form.polygon.length ? tr("Area: {0} points", [form.polygon.length]) : tr("No area drawn yet.")}</p>
      {problem ? <p className="state-line live-error" role="alert">{problem}</p> : null}
      {error ? <p className="state-line live-error" role="alert">{campaignErrorText(error)}</p> : null}
      <div className="cat-actions">
        <button data-command="admin.server.bonusCampaignCreate" type="button" className="dash-btn" disabled={busy || !target} onClick={() => void save()}>{tr("Start campaign")}</button>
      </div>
    </section>
  );
}

function CampaignDetail({ bonusId, canWrite, zoneLabel, onBack }: { bonusId: string; canWrite: boolean; zoneLabel: (zoneId: string) => string; onBack: (notice: string) => void }) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const key = [...LIVE_BONUSES, "one", bonusId];
  const one = useQuery({ queryKey: key, queryFn: async () => parseCampaign(await client.json<unknown>(campaignPath(bonusId))) });
  const drivers = useLivePage<unknown>([...LIVE_BONUSES, "drivers", bonusId], (cursor) => campaignDriversPath(bonusId, cursor));
  const rows = useMemo(() => parseProgressPage({ items: drivers.items }).items, [drivers.items]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [editing, setEditing] = useState<{ names: CampaignNames; endDate: string } | null>(null);
  const campaign = one.data ?? null;

  async function run(call: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const saved = parseCampaign(await call());
      if (saved) queryClient.setQueryData(key, saved);
      setNotice(done);
      setConfirmEnd(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: [...LIVE_BONUSES, "list"] });
    } catch (failure) {
      setError(failure);
      if (isVersionMismatch(failure)) void one.refetch();
    } finally {
      setBusy(false);
    }
  }
  const command = (item: BonusCampaign, action: "pause" | "resume" | "end", done: string) => run(() => client.post(campaignCommandPath(item.bonusId, action), { expectedVersion: item.version }), done);
  function saveEdit(item: BonusCampaign) {
    if (!editing) return;
    const made = campaignEditBody(item, editing);
    if ("error" in made) {
      setError(new Error(campaignReasonText(made.error) ?? ""));
      return;
    }
    void run(() => client.put(campaignPath(item.bonusId), made.body), tr("Campaign saved."));
  }

  if (one.isLoading) return <p className="state-line">{tr("Loading.")}</p>;
  if (one.error || !campaign) return <ErrorLine error={one.error ?? new Error(tr("Something failed."))} onRetry={() => void one.refetch()} />;
  const actions = canWrite ? campaignActions(campaign) : [];
  return (
    <section className="dash-card db-card" aria-labelledby="campaign-title" data-testid="campaign-detail">
      <div className="card-head">
        <h3 id="campaign-title"><Trophy size={16} aria-hidden="true" /> {nameOf(campaign.names)} <span className={`db-state ${campaign.state}`}>{campaignStateText(campaign.state)}</span></h3>
        <button data-command="admin.server.dialogCancel" type="button" className="dash-btn small ghost" onClick={() => onBack(notice)}><ArrowLeft size={13} aria-hidden="true" /> {tr("Back")}</button>
      </div>
      <dl className="db-stats">
        <div><dt>{tr("Zone")}</dt><dd>{zoneLabel(campaign.zoneId)}</dd></div>
        <div><dt>{tr("Target")}</dt><dd>{campaignTargetText(campaign.measure, campaign.target)}</dd></div>
        <div><dt>{tr("Amount")}</dt><dd>{formatMoney(campaign.amount)}</dd></div>
        <div><dt>{tr("Dates")}</dt><dd>{dayText(campaign.startDate)} – {dayText(campaign.endDate)}</dd></div>
        <div><dt><Users size={12} aria-hidden="true" /> {tr("Drivers with progress")}</dt><dd>{campaign.driversWithProgress}</dd></div>
        <div><dt>{tr("Earned it")}</dt><dd>{campaign.driversEarned}</dd></div>
        <div><dt><Wallet size={12} aria-hidden="true" /> {tr("Paid so far")}</dt><dd>{formatMoney(campaign.paidTotal)}</dd></div>
      </dl>
      {notice ? <p className="pricing-notice" role="status">{notice}</p> : null}
      {error ? <p className="state-line live-error" role="alert">{campaignErrorText(error)}</p> : null}
      {actions.length ? (
        <div className="cat-actions">
          {actions.includes("pause") ? <button data-command="admin.server.bonusCampaignPause" type="button" className="dash-btn small" disabled={busy} onClick={() => void command(campaign, "pause", tr("Campaign paused. Nothing counts until you resume it."))}>{tr("Pause campaign")}</button> : null}
          {actions.includes("resume") ? <button data-command="admin.server.bonusCampaignResume" type="button" className="dash-btn small" disabled={busy} onClick={() => void command(campaign, "resume", tr("Campaign running again. The drivers keep their progress."))}>{tr("Resume campaign")}</button> : null}
          {actions.includes("edit") ? <button data-command="admin.server.bonusCampaignEdit" type="button" className="dash-btn small ghost" disabled={busy} onClick={() => setEditing({ names: campaign.names, endDate: campaign.endDate })}>{tr("Edit")}</button> : null}
          {actions.includes("end") ? <button data-command="admin.server.bonusCampaignEnd" type="button" className="dash-btn small ghost" disabled={busy} onClick={() => setConfirmEnd(true)}>{tr("End campaign")}</button> : null}
        </div>
      ) : null}
      {confirmEnd ? (
        <div className="cat-actions" role="alertdialog" aria-label={tr("End campaign")}>
          <span>{tr("End it now for every driver? Nothing counts any more; bonuses already earned stay paid. It cannot start again.")}</span>
          <button data-command="admin.server.dialogConfirm" type="button" className="dash-btn small" disabled={busy} onClick={() => void command(campaign, "end", tr("Campaign ended."))}>{tr("End campaign")}</button>
          <button data-command="admin.server.dialogCancel" type="button" className="dash-btn small ghost" onClick={() => setConfirmEnd(false)}>{tr("Cancel")}</button>
        </div>
      ) : null}
      {editing ? (
        <div className="fd-box" data-testid="campaign-edit">
          <p className="fine">{tr("Only the names and a later end date can change. To change anything else, end it and make a new campaign.")}</p>
          <NamesFields names={editing.names} onChange={(names) => setEditing({ ...editing, names })} />
          <label className="field">
            <span>{tr("End date")}<SettingInfo id="bonus.campaign.laterEnd" label={tr("End date")} /></span>
            <DateInput aria-label={tr("End date")} value={editing.endDate} min={campaign.endDate} max={lastEndDate(campaign.startDate)} onChange={(event) => setEditing({ ...editing, endDate: event.target.value })} />
          </label>
          <div className="cat-actions">
            <button data-command="admin.server.bonusCampaignEdit" type="button" className="dash-btn small" disabled={busy} onClick={() => saveEdit(campaign)}>{tr("Save")}</button>
            <button data-command="admin.server.dialogCancel" type="button" className="dash-btn small ghost" onClick={() => setEditing(null)}>{tr("Cancel")}</button>
          </div>
        </div>
      ) : null}
      <h4>{tr("Drivers' progress")}</h4>
      {drivers.error ? <ErrorLine error={drivers.error} onRetry={() => void drivers.refetch()} /> : null}
      {drivers.isLoading ? <p className="state-line">{tr("Loading.")}</p> : rows.length === 0 ? <p className="zn-empty">{tr("No driver has progress in this campaign yet.")}</p> : (
        <table className="data-table" aria-label={tr("Drivers' progress")}>
          <thead><tr><th>{tr("Driver")}</th><th>{tr("Progress")}</th><th>{tr("Earned it")}</th><th>{tr("Earned on")}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driverId}>
                <td>{row.firstName || row.driverId}</td>
                <td>{campaignProgressText(campaign.measure, row.progress)}</td>
                <td>{row.earned ? tr("Yes") : tr("Not yet")}</td>
                <td><DateText value={row.earnedAt} withTime /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LoadMore hasMore={drivers.hasMore} loading={drivers.loadingMore} onClick={() => void drivers.loadMore()} />
    </section>
  );
}
