import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  History,
  Layers3,
  MapPinned,
  Plane,
  Plus,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Undo2,
  Users,
} from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { useMarketScope } from "../markets/useMarketScope";
import { Flag } from "../ui/Flag";
import { CommandButton } from "../ui/CommandButton";
import { zoneStore, useZoneUi } from "../zones/bookStore";
import {
  cityGaps,
  citiesWithZones,
  displayName,
  goLiveState,
  validateZones,
  zoneAreaKm,
  zoneChanges,
  zoneHealth,
  zoneImpact,
  zoneStatus,
  zoneTypeLabel,
  ZONE_COLOR,
  type ZoneShape,
} from "../zones/releases";
import { statusTone, ZoneMap } from "./ZoneMap";
import { tr, trn, trx } from "../i18n";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { useLiveZoneList } from "../live/LiveZones";
import { liveIssues } from "../zones/liveIssues";

type Filter = "all" | "operating" | "airport" | "rules" | "pickup" | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", get label() { return tr("All"); } },
  { id: "operating", get label() { return tr("Operating zones"); } },
  { id: "airport", get label() { return tr("Airports"); } },
  { id: "rules", get label() { return tr("Rules (boost, event, no pickup…)"); } },
  { id: "pickup", get label() { return tr("Pickup points"); } },
  { id: "archived", get label() { return tr("Archived"); } },
];

function matchesFilter(zone: ZoneShape, filter: Filter, live = false): boolean {
  // Live: zones are never deleted or archived, only closed; the last chip lists the closed ones.
  if (live && filter === "archived") return !zone.active;
  if (filter === "archived") return zone.archived;
  if (zone.archived) return false;
  if (filter === "all") return zone.kind !== "service";
  if (filter === "rules") return ["boost", "event", "no_pickup", "restricted", "fleet"].includes(zone.kind);
  return zone.kind === filter;
}

export function ZonesPage() {
  const { agent } = useSession();
  const { country, market, zones: scopeZones } = useMarketScope();
  const [params] = useSearchParams();
  const ui = useZoneUi();
  const liveSession = useLiveSessionMaybe();
  const isLive = Boolean(liveSession);
  const serverZones = useLiveZoneList();
  const canEdit = liveSession ? liveSession.can("zones.edit") : Boolean(agent && can(agent.role, "zones.edit"));
  const canPublish = Boolean(agent && can(agent.role, "zones.publish"));
  const [wizard, setWizard] = useState<{ city?: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [gapCity, setGapCity] = useState<string | null>(null);
  const zones = useMemo(() => ui.book.draft.filter((zone) => zone.country === country), [ui.book.draft, country]);
  const live = zones.filter((zone) => !zone.archived && zone.kind !== "service" && zone.kind !== "pickup");
  const issues = useMemo(() => (isLive ? liveIssues : validateZones)(ui.book.draft), [ui.book.draft, isLive]);
  const openCount = isLive ? zones.filter((zone) => zone.active).length : 0;
  const changes = useMemo(() => zoneChanges(ui.book.published, ui.book.draft, country), [ui.book.published, ui.book.draft, country]);
  const otherChanges = useMemo(() => (["SE", "FR", "TN"] as const).filter((id) => id !== country).reduce((sum, id) => sum + zoneChanges(ui.book.published, ui.book.draft, id).length, 0), [ui.book.published, ui.book.draft, country]);
  const impact = useMemo(() => zoneImpact(ui.book.published, ui.book.draft, country), [ui.book.published, ui.book.draft, country]);
  const health = useMemo(() => new Map(live.map((zone) => [zone.id, zoneHealth(zone)])), [live]);
  const attention = live.filter((zone) => health.get(zone.id)?.tone === "bad" || issues.some((issue) => issue.zoneId === zone.id && issue.level === "error"));
  const drivers = [...health.values()].reduce((sum, item) => sum + item.drivers, 0);
  const requests = [...health.values()].reduce((sum, item) => sum + item.requests, 0);
  const groups = citiesWithZones(ui.book.draft, country);
  const errors = issues.filter((issue) => issue.level === "error" && zones.some((zone) => zone.id === issue.zoneId));
  const version = ui.book.versions.length;
  const inReview = ui.book.status === "in_review";
  const preferred = params.get("zone") ?? (scopeZones.length === 1 ? scopeZones[0] : undefined);

  // The zone chosen in the top bar is picked on the map.
  useEffect(() => zoneStore.ensureCountry(country, preferred), [country, preferred]);

  function pick(zone: ZoneShape) {
    setWizard(null);
    zoneStore.select(zone.id);
    document.querySelector(".zn-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function newZone(city?: string) {
    zoneStore.clearSketch();
    zoneStore.cancelTool();
    setWizard({ city });
    window.setTimeout(() => document.querySelector(".zn-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  return (
    <div className="zones">
      <header className="pricing-hero zn-hero">
        <div className="pricing-title">
          <h2>{tr("Zones")}</h2>
          <p>{isLive ? trn("{0} {1} · {2} cities with zones · {3} zones", <Flag id={country} />, trx(market.name), groups.filter((group) => group.zones.length).length, live.length) : trn("{0} {1} · {2} cities with zones · {3} zones · version {4}", <Flag id={country} />, trx(market.name), groups.filter((group) => group.zones.length).length, live.length, version)}</p>
        </div>
        <div className="zn-hero-actions">
          {isLive ? <span className="zn-release-pill live" data-testid="zones-server">{trn("{0} {1} open · {2} closed", <CheckCircle2 size={14} aria-hidden="true" />, openCount, zones.length - openCount)}</span> : <span className={`zn-release-pill ${inReview ? "review" : changes.length ? "draft" : "live"}`}>
            {inReview ? <>{trn("{0} In review", <ShieldCheck size={14} aria-hidden="true" />)}</> : changes.length ? <>{trn("{0} {1} change{2} not published", <ClipboardList size={14} aria-hidden="true" />, changes.length, changes.length === 1 ? "" : tr("s"))}</> : <>{trn("{0} All published", <CheckCircle2 size={14} aria-hidden="true" />)}</>}
          </span>}
          <button data-command="admin.zone.create" type="button" className="dash-btn publish" disabled={!canEdit} onClick={() => newZone()}>{trn("{0} New zone", <Plus size={15} aria-hidden="true" />)}</button>
        </div>
      </header>

      {isLive ? (
      <section className="zn-kpis" aria-label={tr("Zones at a glance")}>
        <div className="zn-kpi"><Layers3 size={18} aria-hidden="true" /><span><b>{openCount}</b><small>{tr("Open zones")}</small></span></div>
        <div className={zones.length - openCount ? "zn-kpi bad" : "zn-kpi"}><EyeOff size={18} aria-hidden="true" /><span><b>{zones.length - openCount}</b><small>{tr("Closed zones")}</small></span></div>
        <div className="zn-kpi"><Plane size={18} aria-hidden="true" /><span><b>{zones.filter((zone) => zone.kind === "airport").length}</b><small>{tr("Airports")}</small></span></div>
        <div className="zn-kpi"><MapPinned size={18} aria-hidden="true" /><span><b>{trn("{0} km²", zones.filter((zone) => zone.active && zone.kind === "operating").reduce((sum, zone) => sum + zoneAreaKm(zone), 0).toFixed(0))}</b><small>{tr("Service area")}</small></span></div>
      </section>
      ) : (
      <section className="zn-kpis" aria-label={tr("Zones at a glance")}>
        <div className="zn-kpi"><Layers3 size={18} aria-hidden="true" /><span><b>{live.length}</b><small>{tr("Live zones")}</small></span></div>
        <div className="zn-kpi"><Car size={18} aria-hidden="true" /><span><b>{drivers}</b><small>{tr("Drivers online in zones")}</small></span></div>
        <div className="zn-kpi"><Users size={18} aria-hidden="true" /><span><b>{requests}</b><small>{tr("Open requests")}</small></span></div>
        <div className={attention.length ? "zn-kpi bad" : "zn-kpi"}><AlertTriangle size={18} aria-hidden="true" /><span><b>{attention.length}</b><small>{tr("Need attention")}</small></span></div>
        <div className="zn-kpi"><MapPinned size={18} aria-hidden="true" /><span><b>{trn("{0} km²", impact.areaKm.toFixed(0))}</b><small>{tr("Service area")}</small></span></div>
      </section>
      )}

      {isLive ? (
        <section className="zn-release" aria-label={tr("Zones on the server")}>
          <p className="fine" data-testid="zones-live-note">{trn("{0} The list comes from the server. A change goes to the apps at once; one admin is enough. A zone is never deleted, only closed.", <ShieldCheck size={13} aria-hidden="true" />)}</p>
          {serverZones === null ? <p className="state-line">{tr("Loading.")}</p> : null}
        </section>
      ) : (
      <section className="zn-release" aria-label={tr("Publish zones")}>
        <ol className="zn-flow" aria-label={tr("How zones go live")}>
          <li className={!inReview ? "on" : "done"}><i>1</i><span><b>{tr("Edit")}</b><small>{tr("Drafts only riders don't see")}</small></span></li>
          <li className={inReview ? "on" : undefined}><i>2</i><span><b>{tr("Send for review")}</b><small>{tr("Checks must pass")}</small></span></li>
          <li><i>3</i><span><b>{tr("Second admin publishes")}</b><small>{tr("Goes live for riders and drivers")}</small></span></li>
        </ol>
        <div className="zn-release-actions">
          <button data-command="admin.zone.changes" type="button" className="dash-btn small ghost" aria-expanded={changesOpen} onClick={() => setChangesOpen(!changesOpen)}>{trn("{0} {1} changes and impact ({2})", <ClipboardList size={13} aria-hidden="true" />, changesOpen ? tr("Hide") : tr("See"), changes.length)}</button>
          <CommandButton command="admin.zone.review" className="dash-btn small" type="button" disabled={!canEdit || inReview || (changes.length === 0 && otherChanges === 0)} onDone={() => { if (agent) zoneStore.review(agent.id); }}>{trn("{0} Send for review", <Send size={13} aria-hidden="true" />)}</CommandButton>
          <CommandButton command="admin.zone.publish" className="dash-btn small publish" type="button" disabled={!canPublish || !inReview} onDone={() => { if (agent) zoneStore.publish(agent.id); }}>{trn("{0} Publish", <Rocket size={13} aria-hidden="true" />)}</CommandButton>
          <CommandButton command="admin.zone.rollback" className="dash-btn small ghost" type="button" disabled={!canPublish || version < 2} onDone={() => zoneStore.rollback(agent?.id)}>{trn("{0} Undo last publish", <Undo2 size={13} aria-hidden="true" />)}</CommandButton>
        </div>
        {errors.length ? <p className="zn-alert bad">{trn("{0} {1} problem{2} block publishing: {3}", <AlertTriangle size={14} aria-hidden="true" />, errors.length, errors.length === 1 ? "" : tr("s"), errors[0]!.message)}</p> : null}
        {otherChanges ? <p className="fine">{trn("Also {0} change{1} in other countries go in the same review.", otherChanges, otherChanges === 1 ? "" : tr("s"))}</p> : null}
        {changesOpen ? (
          <div className="zn-changes" aria-label={tr("Changes and impact")}>
            {changes.length === 0 ? <p className="fine">{trn("Nothing changed in {0} since version {1}.", trx(market.name), version)}</p> : (
              <ul>
                {changes.map((item) => (
                  <li key={item.zoneId} className={item.change}>
                    <b>{item.change === "added" ? tr("New") : item.change === "removed" ? tr("Deleted") : item.change === "archived" ? tr("Archived") : tr("Changed")}</b>
                    <span>{item.name}</span>
                    {item.fields.length ? <small>{item.fields.join(", ")}</small> : null}
                  </li>
                ))}
              </ul>
            )}
            <dl className="zn-impact" data-impact="zones">
              <div><dt>{tr("Service area")}</dt><dd>{trn("{0} km² ({1}{2})", impact.areaKm.toFixed(0), impact.deltaKm >= 0 ? "+" : "", impact.deltaKm.toFixed(1))}</dd></div>
              <div><dt>{tr("Drivers online inside")}</dt><dd>{impact.drivers}</dd></div>
              <div><dt>{tr("Trips now")}</dt><dd>{impact.trips}</dd></div>
              <div><dt>{tr("Bookings made ahead")}</dt><dd>{impact.reservations}</dd></div>
              <div><dt>{tr("Price changes")}</dt><dd>{impact.feeChanges.length ? impact.feeChanges.join(", ") : tr("None")}</dd></div>
            </dl>
          </div>
        ) : null}
        <p className="zn-version" data-versions={version}>{trn("{0} Versions: {1} · status {2}", <History size={13} aria-hidden="true" />, version, inReview ? tr("in review") : tr("draft"))}</p>
      </section>
      )}

      <ZoneMap country={country} wizard={wizard} onWizard={setWizard} />

      <section className="zn-list" aria-label={tr("Zones by city")}>
        <div className="zn-list-head">
          <div className="zn-filters" role="group" aria-label={tr("Filter zones")}>
            {FILTERS.filter((item) => !isLive || item.id === "all" || item.id === "operating" || item.id === "airport" || item.id === "archived").map((item) => (
              <button data-command="admin.zone.filter" key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? "zn-chip on" : "zn-chip"} onClick={() => setFilter(item.id)}>{isLive && item.id === "archived" ? tr("Closed") : trx(item.label)}</button>
            ))}
          </div>
          <label className="rd-search small"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find a zone")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Find by name or code")} /></label>
        </div>

        {groups.map(({ city, zones: cityZones }) => {
          const shown = cityZones.filter((zone) => matchesFilter(zone, filter, isLive) && (!query.trim() || `${zone.name} ${zone.code}`.toLowerCase().includes(query.trim().toLowerCase())));
          if (!cityZones.length && (filter !== "all" || query.trim())) return null;
          const gaps = gapCity === city.id || ui.layers.gaps ? cityGaps(ui.book.draft, city, 20) : null;
          const coverage = gaps?.coverage ?? cityGaps(ui.book.draft, city, 12).coverage;
          return (
            <article key={city.id} className="zn-city-block" aria-label={tr("{0} zones", [city.name])}>
              <header className="zn-city-head">
                <div>
                  <h3>{city.name} <small>{city.code}</small></h3>
                  <span className="zn-cover-line"><span className="zn-cover" aria-hidden="true"><i style={{ width: `${coverage}%` }} /></span>{cityZones.length ? tr("{0}% of the city has a zone", [coverage]) : tr("No zones yet")}</span>
                </div>
                <div className="zn-city-actions">
                  <button data-command="admin.zone.gaps" type="button" className="dash-btn small ghost" aria-pressed={ui.layers.gaps} onClick={() => { setGapCity(city.id); zoneStore.toggleLayer("gaps"); zoneStore.focusOn(city.center[0], city.center[1]); }}>{ui.layers.gaps ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />} {ui.layers.gaps ? tr("Hide gaps") : tr("Show gaps on map")}</button>
                  <button data-command="admin.zone.create" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => newZone(city.id)}>{trn("{0} New zone in {1}", <Plus size={13} aria-hidden="true" />, city.name)}</button>
                </div>
              </header>
              {shown.length === 0 ? <p className="zn-empty">{cityZones.length ? tr("No zone matches.") : tr("Launch {0}: make the first zone, for example the whole city.", [city.name])}</p> : (
                <ul className="zn-cards" aria-label={tr("{0} zone list", [city.name])}>
                  {shown.map((zone) => {
                    const status = zoneStatus(zone, ui.book);
                    const item = health.get(zone.id) ?? zoneHealth(zone);
                    const scheduled = goLiveState(zone, Date.now()) === "scheduled";
                    const zoneErrors = issues.filter((issue) => issue.zoneId === zone.id && issue.level === "error");
                    return (
                      <li key={zone.id}>
                        <article className={zone.id === ui.selectedId ? "zn-card on" : "zn-card"} style={{ ["--zc" as string]: zone.color || ZONE_COLOR[zone.kind] }}>
                          <button data-command="admin.zone.pick" type="button" className="zn-card-main" aria-label={tr("Show {0} on the map", [displayName(zone)])} onClick={() => pick(zone)}>
                            <span className="zn-card-type">{zone.kind === "airport" ? <Plane size={12} aria-hidden="true" /> : <i aria-hidden="true" />}{zoneTypeLabel(zone.kind)}</span>
                            <b>{zone.name.replace(`${city.name} · `, "")}</b>
                            <small>{zone.code} · {zone.kind === "pickup" ? tr("pin") : tr("{0} km²", [zoneAreaKm(zone).toFixed(1)])}</small>
                            {isLive ? null : <span className="zn-card-health">
                              <span title={tr("Drivers online")}><Car size={12} aria-hidden="true" /> {item.drivers}</span>
                              <span title={tr("Open requests")}><Users size={12} aria-hidden="true" /> {item.requests}</span>
                              {!zone.active ? <em className="bad">{tr("Off")}</em> : null}
                            </span>}
                          </button>
                          <footer>
                            {isLive ? <span className={`zn-status ${zone.active ? "good" : "muted"}`} data-zone-open={zone.active}>{zone.active ? tr("Open for rides") : tr("Closed to new rides")}</span> : <span className={`zn-status ${statusTone(status)}`}>{scheduled ? tr("Scheduled") : status}</span>}
                            {zoneErrors.length ? <span className="zn-flag bad" title={zoneErrors[0]!.message}>{trn("{0} Fix", <AlertTriangle size={11} aria-hidden="true" />)}</span> : !isLive && item.alert ? <span className={`zn-flag ${item.tone}`} title={trx(item.alert)}><AlertTriangle size={11} aria-hidden="true" /> {trx(item.alert)}</span> : null}
                            <Link to={`/zones/${zone.id}`} aria-label={tr("Open {0}", [displayName(zone)])}>{tr("Open")}</Link>
                          </footer>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
