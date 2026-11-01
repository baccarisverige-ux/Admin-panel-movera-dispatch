import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, GitCompare, LayoutGrid, Search, Server } from "lucide-react";
import { configDiff, emptyConfig, normalizeConfig, useSlice, type ConfigBook } from "../api/hooks";
import { Card, Row, Switch } from "../dispatch/fields";
import { CommandButton } from "../ui/CommandButton";
import { PANEL_OPS_KEY, emptyPanelOps, normalizePanelOps, type PanelOps } from "./panel";
import { tr, trn, trx } from "../i18n";

/** Settings that live in their own section, so they can be found from one place. */
export const ELSEWHERE: { label: string; what: string; path: string; section: string }[] = [
  { section: "Rides", get label() { return tr("Dispatch rules"); }, what: "Who gets a ride first, offer time, search radius", path: "/dispatch?view=rules" },
  { section: "Rides", get label() { return tr("Trip settings"); }, what: "What admins may change on a trip, call masking", path: "/trips?view=settings" },
  { section: "Rides", get label() { return tr("Pricing"); }, what: "Prices, fees and surge per zone", path: "/pricing" },
  { section: "Rides", get label() { return tr("Tips & limits"); }, what: "Tips, raise-offer steps, promo cap and driver bonus limit per country", path: "/pricing?tab=extras" },
  { section: "Rides", get label() { return tr("Zones"); }, what: "Where Movera drives, and what each zone allows", path: "/zones" },
  { section: "Safety", get label() { return tr("Incident settings"); }, what: "Levels and time limits", path: "/incidents?view=settings" },
  { section: "Safety", get label() { return tr("Risk rules"); }, what: "Safety and fraud rules", path: "/risk?tab=safety" },
  { section: "Safety", get label() { return tr("Alert settings"); }, what: "Who gets which alert", path: "/alerts?view=settings" },
  { section: "Fleet", get label() { return tr("Vehicle rules"); }, what: "Car age, seats and fuel per category", path: "/vehicles?view=rules" },
  { section: "Fleet", get label() { return tr("Onboarding steps"); }, what: "Steps, papers and reminders per country", path: "/onboarding?view=steps" },
  { section: "Fleet", get label() { return tr("Driver bonuses"); }, what: "Ride and area bonuses", path: "/drivers?view=bonuses" },
  { section: "Money", get label() { return tr("Payment rules"); }, what: "Retries, refund limits, disputes", path: "/payments?tab=rules" },
  { section: "Money", get label() { return tr("Payout schedule"); }, what: "When drivers are paid, holds", path: "/payouts?tab=schedule" },
  { section: "People", get label() { return tr("Support settings"); }, what: "Topics, time limits, ready-made replies", path: "/support?view=settings" },
  { section: "People", get label() { return tr("Rider promotions"); }, what: "Automatic and picked promotions", path: "/riders?view=promotions" },
  { section: "Growth", get label() { return tr("Message limits"); }, what: "Messages a week, quiet hours", path: "/messages?tab=rules" },
  { section: "Growth", get label() { return tr("Review rules"); }, what: "Warnings, admin review, block, word list", path: "/reviews?tab=rules" },
  { section: "Growth", get label() { return tr("Voucher codes and invites"); }, what: "Codes and invite rewards", path: "/promotions?tab=vouchers" },
  { section: "Platform", get label() { return tr("Roles, limits and sign-in"); }, what: "Custom roles, money limits, 2-step and idle sign-out", path: "/team?tab=roles" },
];

/** Jump to a section of the settings page, or to a setting kept in another section. */
export function FindSetting({ onPick }: { onPick: (heading: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const [headings, setHeadings] = useState<string[]>([]);
  const collect = () => setHeadings([...document.querySelectorAll<HTMLHeadingElement>(".pl-settings-all article.panel > h3")].map((node) => node.textContent ?? ""));
  useEffect(() => {
    const timer = setTimeout(collect, 400);
    return () => clearTimeout(timer);
  }, []);
  const here = headings.filter((text) => text && (!q || text.toLowerCase().includes(q)));
  const other = q ? ELSEWHERE.filter((item) => `${item.label} ${item.what} ${item.section}`.toLowerCase().includes(q)) : [];
  return (
    <div className="pl-find">
      <label className="pl-search"><Search size={14} aria-hidden="true" /><input aria-label={tr("Find a setting")} placeholder={tr("Find a setting, for example wallet, stops or prices")} value={query} onFocus={collect} onChange={(e) => { setQuery(e.target.value); collect(); }} /></label>
      <div className="pl-jumps" aria-label={tr("Sections on this page")}>
        {here.map((text) => <a key={text} href={`#${encodeURIComponent(text)}`} className="pl-jump" onClick={(event) => { event.preventDefault(); onPick(text); }}>{text}</a>)}
        {other.map((item) => <Link key={item.path} className="pl-jump other" to={item.path}>{trx(item.label)} <small>{trn("in {0}", trx(item.section))}</small> <ArrowRight size={11} aria-hidden="true" /></Link>)}
        {q && !here.length && !other.length ? <span className="pl-help">{trn("Nothing found for “{0}”.", query)}</span> : null}
      </div>
    </div>
  );
}

export function SettingsElsewhere() {
  const sections = [...new Set(ELSEWHERE.map((item) => item.section))];
  return (
    <Card title={tr("Settings in other sections")} icon={<LayoutGrid size={15} />} tone="blue" help={tr("Each section keeps its own settings next to its work. Open them from here.")}>
      <div className="pl-elsewhere">
        {sections.map((section) => (
          <section key={section} aria-label={section}>
            <h4>{section}</h4>
            <ul>
              {ELSEWHERE.filter((item) => item.section === section).map((item) => (
                <li key={item.path}><Link to={item.path}><b>{trx(item.label)}</b><small>{trx(item.what)}</small><ArrowRight size={13} aria-hidden="true" /></Link></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

/** Any two saved versions side by side: what changed from one to the other. */
export function CompareVersions() {
  const store = useSlice<ConfigBook>("config", emptyConfig());
  const book = normalizeConfig(store.value);
  const versions = book.history.map((_, index) => ({ index, label: index === 0 ? tr("Version 1 · start") : tr("Version {0}{1}", [index + 1, book.publications[index - 1] ? ` · ${book.publications[index - 1].kind ?? "publish"} by ${book.publications[index - 1].actorId}` : ""]) }));
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | "draft" | null>(null);
  const a = from ?? Math.max(0, book.history.length - 2);
  const b = to ?? "draft";
  const before = book.history[a];
  const after = b === "draft" ? book.draft : book.history[b];
  const diff = before && after ? configDiff(before, after) : [];
  return (
    <Card title={tr("Compare versions")} icon={<GitCompare size={15} />} tone="purple" help={tr("Pick two versions. Roll back from the Review and publish part of All settings.")}>
      <div className="pl-compare-pick">
        <label className="pl-field"><span>{tr("From")}</span><select aria-label={tr("Compare from")} value={a} onChange={(e) => setFrom(Number(e.target.value))}>{versions.map((item) => <option key={item.index} value={item.index}>{trx(item.label)}</option>)}</select></label>
        <label className="pl-field"><span>{tr("To")}</span><select aria-label={tr("Compare to")} value={b} onChange={(e) => setTo(e.target.value === "draft" ? "draft" : Number(e.target.value))}><option value="draft">{tr("The draft now")}</option>{versions.map((item) => <option key={item.index} value={item.index}>{trx(item.label)}</option>)}</select></label>
      </div>
      {store.loading ? <p className="pl-help">{tr("Loading versions.")}</p> : diff.length ? (
        <ul className="pl-diff" aria-label={tr("Version changes")}>{diff.map((line) => <li key={line}>{line}</li>)}</ul>
      ) : <p className="dx-calm">{tr("No difference between these two versions.")}</p>}
      <p className="pl-help">{trn("Live now: version {0}. Status: {1}. {2}", book.rev, book.status === "in_review" ? tr("waiting for approval") : book.status, book.scheduled.length ? `${book.scheduled.length} scheduled.` : tr("Nothing scheduled."))}</p>
    </Card>
  );
}

/** The admin panel itself: developer pages stay out of the menu unless the Super admin turns them on. */
export function PanelSettings({ isSuper, onNotice }: { isSuper: boolean; onNotice: (text: string) => void }) {
  const slice = useSlice<PanelOps>(PANEL_OPS_KEY, emptyPanelOps());
  const ops = normalizePanelOps(slice.value);
  return (
    <Card title={tr("Admin panel")} icon={<Server size={15} />} tone="orange" help={tr("System, Release gates and Design are for developers. Only the Super admin sees them, and only when this is on.")}>
      <Row label={tr("Show developer pages in the menu")} help={isSuper ? tr("Off: the pages still open by their address, for the Super admin only.") : tr("Only the Super admin can change this.")}>
        <Switch label={tr("Show developer pages in the menu")} on={ops.devPages} disabled onChange={() => undefined} />
      </Row>
      <div className="actions">
        <CommandButton command="admin.panel.devPages" confirmTarget={false} className="dash-btn small" sliceKey={PANEL_OPS_KEY} value={{ ...ops, draftRev: ops.draftRev + 1, devPages: !ops.devPages }} expectedSliceRev={ops.draftRev} targetId="menu" disabled={!isSuper || slice.loading} onDone={() => onNotice(ops.devPages ? tr("Developer pages are hidden from the menu.") : tr("Developer pages now show in the menu."))}>{ops.devPages ? tr("Hide developer pages") : tr("Show developer pages")}</CommandButton>
      </div>
    </Card>
  );
}
