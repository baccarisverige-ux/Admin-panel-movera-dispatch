import { useDirtyWarning } from "../ui/useDirtyWarning";
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Car, Eye, Fingerprint, Gauge, ListChecks, ShieldAlert, ShieldCheck, Timer, UserRound } from "lucide-react";
import { DEFAULT_SAFETY, emptySafety, validateSafety, useRecords, useSlice, type SafetyBook, type SafetyPolicy } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { Card, Choice, Num, Row, Switch } from "../dispatch/fields";
import { DISPATCH_KEY, emptyDispatchBook, liveCountry, liveRules, normalizeDispatchBook, type DispatchBook, type RideCheckRules } from "../dispatch/rules";
import { zoneById } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { zoneAllowed } from "../markets/scope";
import { Cards } from "../reports/ui";
import { ACTIONS, RISK_KEY, RULES, emptyRiskOps, flagged, normalizeRiskOps, people, preview, review, ruleChanges, ruleError, saveRules, type Decision, type Person, type RiskOps, type Rule } from "../safety/risk";
import { useQuery } from "@tanstack/react-query";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import type { Page, RiskPerson } from "../live/types";
import { tr, trn } from "../i18n";
import { useRideCheckSettings } from "../safety/RideCheckSettingsCard";
import type { RideCheckThresholds } from "../safety/rideCheckSettings";
import { agentName } from "../trips/TripParts";
import { CommandButton } from "../ui/CommandButton";
import { zoneFilterOf } from "../live/zoneFilter";

const NUMBERS: { key: keyof SafetyPolicy; label: string; title: string; help: string; unit: string }[] = [
  { key: "impossibleTravelMps", label: "Impossible travel (m/s)", title: "Fake GPS: fastest believable speed", help: "A jump faster than this between two GPS points counts as fake GPS. 55 m/s is about 200 km/h.", unit: "m/s" },
  { key: "staleSeconds", label: "Location stale after seconds", title: "Location is old after", help: "After this, the map and the SOS page say the location must be checked by phone.", unit: "s" },
  { key: "trustedContacts", label: "Trusted contacts", title: "Trusted contacts per rider", help: "How many people a rider can share trips with.", unit: "people" },
  { key: "dailyHours", label: "Daily driving hours", title: "Driving hours per day", help: "0 means not set here. The main rest rule is in Dispatch.", unit: "h" },
  { key: "weeklyHours", label: "Weekly driving hours", title: "Driving hours per week", help: "0 means not set.", unit: "h" },
  { key: "breakMinutes", label: "Rest minutes", title: "Break length", help: "How long a break must be to count.", unit: "min" },
  { key: "warningMinutes", label: "Warning minutes", title: "Warn the driver before the limit", help: "Minutes before the limit the driver gets a message.", unit: "min" },
];

/** What Ride check asks on in a zone, in one line. Set in Dispatch → Safety. */
function rideCheckLine(check: RideCheckRules, shared: RideCheckThresholds): string {
  const on = [
    check.farOn ? `finished over ${shared.finishFarFromDropoffKm} km from drop-off` : "",
    check.stopOn ? `stop over ${shared.longStopMinutes} min` : "",
    check.routeOn ? `${check.routeKm} km off the route` : "",
    check.longerOn ? `${check.longerPct}% longer` : "",
    check.crashOn ? "possible crash" : "",
  ].filter(Boolean);
  return on.length ? `Asks on: ${on.join(", ")}.` : "Off in this zone.";
}

const SWITCHES: { key: "pin" | "sharing" | "audio"; label: string; help: string }[] = [
  { key: "pin", label: "PIN at pickup", help: "The rider tells the driver a 4-digit code before the ride starts." },
  { key: "sharing", label: "Share the trip", help: "Riders can send their live trip to trusted contacts." },
  { key: "audio", label: "Audio recording", help: "Rider or driver can record sound during the trip. Check the law in each country first." },
];

type Tab = "safety" | "fraud" | "flagged";
const TABS: { id: Tab; label: string }[] = [
  { id: "safety", label: "Safety rules" },
  { id: "fraud", label: "Fraud rules" },
  { id: "flagged", label: "Flagged people" },
];

export function RiskPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "safety") as Tab;
  const scope = useMarketScope();
  const { agent } = useSession();
  const editable = Boolean(agent && can(agent.role, "safety.edit"));
  const set = (patch: Record<string, string | null>) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    return next;
  }, { replace: true });

  return (
    <div className="dx-page op-page">
      <header className="dx-head">
        <button data-command="admin.risk.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
        <div className="dx-head-text">
          <h2>{trn("Risk in {0}", scope.market.name)}</h2>
          <p>{tr("Safety rules per zone, fraud rules per country, and the people the rules flag. Every change is logged with your name.")}</p>
        </div>
      </header>
      <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Risk sections")}>
        {TABS.map((item) => <button data-command="admin.risk.view" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => set({ tab: item.id === "safety" ? null : item.id })}>{item.label}</button>)}
      </div>
      {!editable ? <p className="dx-readonly">{tr("You can look, but only the safety team can change rules.")}</p> : null}
      {tab === "safety" ? <SafetyRules editable={editable} /> : tab === "fraud" ? <FraudRules editable={editable} /> : <FlaggedPeople editable={editable} />}
    </div>
  );
}

/* ------------------------------------------------------------------ safety rules per zone */

function SafetyRules({ editable }: { editable: boolean }) {
  const scope = useMarketScope();
  const { agent } = useSession();
  const zones = useRecords("zones");
  const store = useSlice<SafetyBook>("safetyOps", emptySafety());
  const dispatch = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const [zone, setZone] = useState("");
  const [draft, setDraft] = useState<SafetyPolicy | null>(null);
  const access = agent?.scope ?? { zones: "all" as const };
  const list = (zones.data ?? []).filter((row) => zoneAllowed(access, row.id));
  const id = zone || list[0]?.id || "";
  const policy = draft ?? store.value.policies[id] ?? DEFAULT_SAFETY;
  const error = validateSafety(policy);
  const dispatchBook = normalizeDispatchBook(dispatch.value);
  const rideCheckShared = useRideCheckSettings();
  const rest = liveCountry(dispatchBook, scope.market.id).rest;
  useDirtyWarning(Boolean(draft));
  return (
    <div className="op-risk-grid">
      <aside className="op-zone-pick" aria-label={tr("Zones")}>
        <label className="op-field"><span>{tr("Safety zone")}</span>
          <select aria-label={tr("Safety zone")} value={id} onChange={(event) => { setZone(event.target.value); setDraft(null); }}>
            {list.map((row) => <option key={row.id} value={row.id}>{row.id} · {row.name}</option>)}
          </select>
        </label>
        <p className="op-help">{tr("Each zone has its own safety rules. Zones without their own rules use the defaults.")}</p>
        <div className="op-rest">
          <Timer size={16} aria-hidden="true" />
          <span><b>{tr("Driving and rest (Dispatch)")}</b><small>{rest.on ? tr("After {0} h of work, {1} h rest before going online.", [rest.workHours, rest.restHours]) : tr("Off in Dispatch.")}</small></span>
          <Link className="dash-btn small ghost" to="/dispatch">{tr("Open Dispatch")}</Link>
        </div>
        {id ? (
          <div className="op-rest rc-risk">
            <ListChecks size={16} aria-hidden="true" />
            <span><b>{tr("Ride check (Dispatch)")}</b><small>{rideCheckLine(liveRules(dispatchBook, id).rideCheck, rideCheckShared.settings)}</small></span>
            <Link className="dash-btn small ghost" to={`/dispatch?zone=${id}&tab=safety`}>{tr("Ride check settings")}</Link>
          </div>
        ) : null}
      </aside>
      <div className="op-settings">
        <fieldset className="op-fieldset" disabled={!editable || store.loading}>
          <Card title={tr("Numbers for {0}", [zoneById(id)?.name ?? id])} icon={<Gauge size={18} />} tone="blue">
            {NUMBERS.map((item) => (
              <Row key={item.key} label={item.title} help={item.help}>
                <span className="op-unit-input"><input aria-label={item.label} type="number" min="0" value={Number(policy[item.key])} onChange={(event) => setDraft({ ...policy, [item.key]: Number(event.target.value) })} /><small>{item.unit}</small></span>
              </Row>
            ))}
          </Card>
          <Card title={tr("In the apps")} icon={<ShieldCheck size={18} />} tone="green">
            {SWITCHES.map((item) => <Row key={item.key} label={item.label} help={item.help} on={policy[item.key]} onToggle={(on) => setDraft({ ...policy, [item.key]: on })} />)}
          </Card>
        </fieldset>
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{draft ? tr("Changes not saved") : tr("Everything is saved")}</b><small>{error ?? tr("Saved rules are versioned and logged.")}</small></span>
          <button data-command="admin.risk.view" type="button" className="dash-btn small ghost" disabled={!draft} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <span role="alert" className="dx-warn">{draft ? error : null}</span>
          <CommandButton command="admin.safetyOps.save" className="dash-btn small" scope={id} targetId={id} confirmTarget={false} sliceKey="safetyOps" expectedSliceRev={store.value.draftRev} value={{ ...store.value, draftRev: store.value.draftRev + 1, policies: { ...store.value.policies, [id]: policy } }} disabled={!id || !draft || Boolean(error) || store.loading} onDone={() => setDraft(null)}>{tr("Save safety rules")}</CommandButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fraud rules per country */

function useRisk() {
  const { agent } = useSession();
  const slice = useSlice<RiskOps>(RISK_KEY, emptyRiskOps(), { enabled: Boolean(agent && can(agent.role, "safety.edit")) });
  const drivers = useRecords("drivers");
  const riders = useRecords("riders");
  const ops = normalizeRiskOps(slice.value);
  // Live (contract v0.9.0): the three signals the server counts (GET /admin/risk/signals); demo: the demo signals.
  const live = useLiveSessionMaybe();
  // v0.17.2: the server counts only the people of the zones picked in the top bar.
  const riskScope = useMarketScope();
  const riskFilter = new URLSearchParams(zoneFilterOf(riskScope.effective).params).toString();
  const signals = useQuery({ queryKey: ["live", "risk", riskFilter], queryFn: () => live!.client.json<Page<RiskPerson>>(`/admin/risk/signals?limit=200${riskFilter ? `&${riskFilter}` : ""}`), enabled: Boolean(live) && !riskScope.denied });
  const demoList = useMemo(() => people(drivers.data ?? [], riders.data ?? []), [drivers.data, riders.data]);
  // v0.17.2: the people of the country and zones picked in the top bar (a person without a zone stays).
  const effective = riskScope.effective;
  const zones = new Set(Array.isArray(effective) ? effective : [effective]);
  const list = live ? (signals.data?.items ?? []).filter((person) => !person.zoneId || zones.has(person.zoneId)).map(serverPerson) : demoList;
  return { ops, list, loading: slice.loading || drivers.isLoading || riders.isLoading || signals.isLoading, live: Boolean(live) };
}

/** A server risk person in the page's shape: only the signals the server counted. */
function serverPerson(person: RiskPerson): Person {
  const signals: Person["signals"] = {};
  for (const [id, signal] of Object.entries(person.signals)) if (signal) signals[id as keyof Person["signals"]] = signal.value;
  return { key: `${person.who}:${person.id}`, id: person.id, who: person.who, name: person.name, zoneId: person.zoneId ?? "", signals };
}

/** contract.json#risk.later: rules with no server signal yet. */
const LATER: readonly string[] = ["fake_gps", "multi_account", "shared_card", "promo_abuse"];

function FraudRules({ editable }: { editable: boolean }) {
  const { agent } = useSession();
  const scope = useMarketScope();
  const country = scope.market.id;
  const { ops, list, loading, live } = useRisk();
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const rules = draft ?? ops.rules[country];
  const changes = ruleChanges(ops.rules[country], rules);
  const error = ruleError(rules);
  const counts = useMemo(() => preview(list, ops.rules[country], rules, ops), [list, ops, country, rules]);
  const result = saveRules(ops, country, rules, agent?.id ?? "", new Date().toISOString());
  const patch = (id: Rule["id"], next: Partial<Rule>) => setDraft(rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));
  useDirtyWarning(changes.length > 0);
  return (
    <div className="op-settings">
      <section className="op-preview" aria-label={tr("Test before saving")}>
        <Eye size={18} aria-hidden="true" />
        <span><b>{changes.length ? tr("With your changes: {0} people flagged (now {1})", [counts.after, counts.now]) : tr("{0} people flagged in {1} right now", [counts.now, scope.market.name])}</b><small>{trn("{0} would be blocked at once. Test the numbers here before you save; nothing changes for anyone until then.", counts.blocked)}</small></span>
      </section>
      <fieldset className="op-fieldset" disabled={!editable || loading}>
        <Card title={tr("Fraud rules for {0}", [scope.market.name])} icon={<Fingerprint size={18} />} tone="purple" help={tr("Each rule has a limit and what happens when someone goes over it.")}>
          {RULES.map((def) => {
            const rule = rules.find((item) => item.id === def.id)!;
            const count = counts.byRule.find((item) => item.id === def.id);
            return (
              <Row key={def.id} label={def.label} help={live && LATER.includes(def.id) ? `${def.help} ${tr("Not connected yet")}.` : tr("{0} For {1}. Flags {2}{3}.", [def.help, def.who.map((item) => `${item}s`).join(" and "), count?.after ?? 0, count && count.after !== count.now ? ` (now ${count.now})` : ""])} on={rule.on} onToggle={(on) => patch(def.id, { on })}>
                <Num label={tr("{0} limit", [def.label])} before={def.worse === "up" ? "From" : "Below"} value={rule.limit} unit={def.unit} min={def.min} max={def.max} step={def.step} onChange={(value) => patch(def.id, { limit: value })} />
                <Choice label={tr("{0} action", [def.label])} value={rule.action} options={ACTIONS.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} onChange={(action) => patch(def.id, { action })} />
              </Row>
            );
          })}
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{changes.length ? tr("{0} change{1} not saved", [changes.length, changes.length === 1 ? "" : "s"]) : tr("Everything is saved")}</b><small>{error ?? (changes.slice(0, 3).join(" · ") || tr("Rules apply to the whole country."))}</small></span>
          <button data-command="admin.risk.view" type="button" className="dash-btn small ghost" disabled={!changes.length} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.risk.rules" className="dash-btn small" targetId={`fraud rules ${country}`} scope="all" confirmTarget={false} before="saved" after={changes.join("; ")} sliceKey={RISK_KEY} value={result.ops} expectedSliceRev={ops.draftRev} disabled={!changes.length || Boolean(error)} onDone={() => setDraft(null)}>{tr("Save fraud rules")}</CommandButton>
        </div>
      ) : null}
      {ops.history.filter((item) => item.country === country).length ? (
        <section className="op-section" aria-label={tr("Rule changes")}>
          <header className="op-section-head"><h3>{tr("Changes")}</h3></header>
          <ul className="op-history">
            {ops.history.filter((item) => item.country === country).slice(-10).reverse().map((item) => <li key={item.at}><time>{new Date(item.at).toLocaleString(scope.market.locale)}</time><b>{agentName(item.by)}</b><span>{item.changes.join(" · ")}</span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ flagged people */

const DECISIONS: { id: Decision; label: string; help: string }[] = [
  { id: "cleared", label: "All fine", help: "Checked: nothing wrong." },
  { id: "watch", label: "Keep watching", help: "Stays on the list with a mark." },
  { id: "warned", label: "Warn", help: "Send a warning in the app." },
  { id: "blocked", label: "Block", help: "Block the account." },
];

function FlaggedPeople({ editable }: { editable: boolean }) {
  const { agent } = useSession();
  const scope = useMarketScope();
  const { ops, list, loading } = useRisk();
  const [who, setWho] = useState<"all" | "driver" | "rider">("all");
  const [showReviewed, setShowReviewed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const all = useMemo(() => flagged(list, ops.rules[scope.market.id], ops), [list, ops, scope.market.id]);
  const rows = all.filter((person) => (who === "all" || person.who === who) && (showReviewed || !person.review || person.review.decision === "watch"));
  return (
    <div className="op-settings">
      <Cards
        compare={false}
        compareLabel=""
        fmt={(value) => String(value)}
        cards={[
          { id: "all", label: "Flagged", value: all.length, previous: null, format: "count", info: "People at least one rule flags." },
          { id: "todo", label: "Not checked yet", value: all.filter((person) => !person.review).length, previous: null, format: "count", info: "Nobody has looked at these yet.", goodDown: true },
          { id: "block", label: "Rules say block", value: all.filter((person) => person.action === "block").length, previous: null, format: "count", info: "At least one rule with the action Block.", goodDown: true },
          { id: "drivers", label: "Drivers", value: all.filter((person) => person.who === "driver").length, previous: null, format: "count", info: "Flagged drivers." },
          { id: "riders", label: "Riders", value: all.filter((person) => person.who === "rider").length, previous: null, format: "count", info: "Flagged riders." },
        ]}
      />
      <div className="op-inline wrap">
        <Choice label={tr("Who")} value={who} options={[{ id: "all", label: "Everyone" }, { id: "driver", label: "Drivers" }, { id: "rider", label: "Riders" }]} onChange={setWho} />
        <Switch label={tr("Show people already checked")} on={showReviewed} onChange={setShowReviewed} />
        <small className="op-help">{tr("Show people already checked")}</small>
      </div>
      {loading ? <p className="dx-calm">{tr("Loading…")}</p> : null}
      <ul className="op-flagged" aria-label={tr("Flagged people")}>
        {rows.slice(0, 60).map((person) => (
          <li key={person.key} className={person.action}>
            <span className="op-score" style={{ "--s": person.score } as CSSProperties} aria-label={tr("Score {0} of 100", [person.score])}><b>{person.score}</b></span>
            <span className="op-flag-main">
              <span className="op-flag-name">{person.who === "driver" ? <Car size={13} aria-hidden="true" /> : <UserRound size={13} aria-hidden="true" />} <Link to={`/${person.who}s/${person.id}`}>{person.name}</Link> <small>{person.who} · {zoneById(person.zoneId)?.name ?? person.zoneId}</small></span>
              <span className="op-hits">{person.hits.map((hit) => <span key={hit.rule.id} className={`op-hit ${hit.action}`} title={hit.rule.help}>{hit.rule.label}: {hit.value} {hit.rule.unit}</span>)}</span>
              {person.review ? <small className="op-help"><ShieldAlert size={11} aria-hidden="true" />{" "}{trn("{0} by {1}{2}", DECISIONS.find((item) => item.id === person.review?.decision)?.label, agentName(person.review.by), person.review.note ? `: ${person.review.note}` : "")}</small> : null}
            </span>
            {editable ? (
              <span className="op-flag-actions">
                <input aria-label={tr("Note about {0}", [person.name])} placeholder={tr("Note (optional)")} value={notes[person.key] ?? ""} onChange={(event) => setNotes({ ...notes, [person.key]: event.target.value })} />
                {DECISIONS.map((item) => (
                  <CommandButton key={item.id} command="admin.risk.review" className={item.id === "blocked" ? "dash-btn small danger-ghost" : "dash-btn small ghost"} targetId={person.id} scope={person.zoneId} confirmTarget={false} before={person.review?.decision ?? "not checked"} after={item.id} sliceKey={RISK_KEY} value={review(ops, person.key, item.id, notes[person.key] ?? "", agent?.id ?? "", new Date().toISOString())} expectedSliceRev={ops.draftRev} title={item.help} onDone={() => setNotes({ ...notes, [person.key]: "" })}>{item.label}</CommandButton>
                ))}
              </span>
            ) : null}
          </li>
        ))}
        {!rows.length && !loading ? <li className="dx-calm">{tr("Nobody to check. Good.")}</li> : null}
      </ul>
      {rows.length > 60 ? <p className="op-help">{trn("Showing the 60 with the highest score of {0}.", rows.length)}</p> : null}
    </div>
  );
}
