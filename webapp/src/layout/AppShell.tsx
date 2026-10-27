import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Banknote,
  BarChart3,
  CalendarClock,
  Building2,
  Car,
  ClipboardList,
  Images,
  LayoutDashboard,
  LifeBuoy,
  Map,
  MapPinned,
  Menu,
  MoreHorizontal,
  X,
  MessageSquare,
  MessagesSquare,
  Palette,
  Radar,
  Route,
  Bell,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Siren,
  Star,
  Tags,
  Ticket,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { can, canUseZone } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { useInbox, useSearch, useSlice } from "../api/hooks";
import { useAdminApi } from "../api/AdminApiContext";
import { PANEL_OPS_KEY, emptyPanelOps, normalizePanelOps, showInMenu, type PanelOps } from "../platform/panel";
import { AlertsProvider, useAlertsData } from "../alerts/AlertsContext";
import { AlertBell } from "../alerts/AlertBell";
import { RideCheckBanner } from "../alerts/RideCheckBanner";
import { MENU, MENU_GROUPS, type MenuItem, type NavIcon } from "../nav";
import { CommandButton } from "../ui/CommandButton";
import { useMarketScope } from "../markets/useMarketScope";
import { MarketBar } from "./MarketBar";
import { tr, trn, trx, uiLocale } from "../i18n";
import { ProfileMenu } from "../i18n/ProfileMenu";
import { BackToFrom } from "../ui/BackToFrom";
import { COUNTRY_LABEL } from "../i18n/countries";

const ICONS: Record<NavIcon, typeof Menu> = {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Route,
  CalendarClock,
  Map,
  Users,
  UserPlus,
  UserRound,
  Car,
  Building2,
  Wallet,
  Banknote,
  MapPinned,
  Tags,
  LifeBuoy,
  MessagesSquare,
  Siren,
  ShieldAlert,
  MessageSquare,
  Images,
  Ticket,
  Star,
  ScrollText,
  Settings,
  Server,
  Shield,
  Palette,
  Radar,
  Bell,
};

type AppShellProps = {
  page: MenuItem;
  children: ReactNode;
};

function buildLabel(): string {
  const sha = import.meta.env.VITE_BUILD_SHA;
  if (!sha) return "local";
  return sha.slice(0, 7);
}

export function AppShell(props: AppShellProps) {
  return (
    <AlertsProvider>
      <ShellInner {...props} />
    </AlertsProvider>
  );
}

function ShellInner({ page, children }: AppShellProps) {
  const alerts = useAlertsData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { agent, signOut } = useSession();
  const panel = normalizePanelOps(useSlice<PanelOps>(PANEL_OPS_KEY, emptyPanelOps(), { enabled: Boolean(agent) }).value);
  const api = useAdminApi();
  // A live build lists only the pages that read the server; the demo pages stay reachable by address, marked "not live".
  const visible = MENU.filter((item) => (!agent || can(agent.role, item.permission)) && showInMenu(item.id, agent?.role, panel));
  const groups = MENU_GROUPS.filter((group) => visible.some((item) => item.group === group));
  const env = api.kind === "http" ? "live" : import.meta.env.VITE_DATA || "demo";
  const scope = params.get("scope") ?? "";
  const scopeDenied = Boolean(agent && scope && !canUseZone(agent, scope));
  const found = useSearch(searchOpen ? query : "");
  const inbox = useInbox();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const marketScope = useMarketScope();
  const localTime = new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: marketScope.market.timeZone }).format(clock);
  const keep = new URLSearchParams();
  if (params.get("country") || params.get("scope")) keep.set("country", marketScope.country);
  if (params.get("scope")) keep.set("scope", params.get("scope")!);
  const keepSearch = keep.size ? `?${keep.toString()}` : "";

  // Phone menu (UI-08): Escape, a tap outside or the close button closes it; focus goes into it and back to the toggle.
  const menuButton = useRef<HTMLButtonElement>(null);
  // The topbar sticks on phones too (UI-07); its height feeds scroll-padding-top so anything scrolled into
  // view (links to #sections, focus, "scroll to") lands below it instead of under it.
  const topbar = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = topbar.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--topbar-h", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);
  const menuClose = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    setMenuOpen(false);
    menuButton.current?.focus();
  }
  useEffect(() => {
    if (!menuOpen) return;
    menuClose.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // The "⋯" menu closes with Escape or a click outside, and gives focus back to its button.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRoot = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const inboxOn = alerts.book.settings.legacy.inbox;
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(event: MouseEvent) {
      if (moreRoot.current && !moreRoot.current.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setMoreOpen(false);
      moreButton.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">{tr("Skip to content")}</a>
      {menuOpen ? <div className="sidebar-backdrop" aria-hidden="true" onClick={closeMenu} /> : null}
      <aside id="main-menu" className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <span>{tr("Movera Admin")}</span>
          <button ref={menuClose} data-command="admin.shell.menu" type="button" className="icon-btn sidebar-close" aria-label={tr("Close menu")} onClick={closeMenu}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="nav" aria-label={tr("Main")}>
          {groups.map((group) => (
            <div key={group} className="nav-group">
              <p className="nav-group-label">{trx(group)}</p>
              {visible
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <Link
                      key={item.id}
                      to={{ pathname: item.path, search: keepSearch }}
                      className={item.id === page.id ? "active" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon className="nav-icon" size={16} aria-hidden="true" />
                      <span>{trx(item.label)}</span>
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header ref={topbar} className="topbar">
          <button ref={menuButton} data-command="admin.shell.menu" className="icon-btn mobile-menu" type="button" aria-label={tr("Open menu")} aria-expanded={menuOpen} aria-controls="main-menu" onClick={() => setMenuOpen((open) => !open)}>
            <Menu size={18} aria-hidden="true" />
          </button>
          <div>
            <h1>{trx(page.label)}</h1>
            <p className="crumb">{trx(page.group)}</p>
          </div>
          <div className="topbar-actions">
            <MarketBar />
            <CommandButton command="admin.shell.search" className="secondary-btn" type="button" onDone={() => setSearchOpen(true)}>{tr("Search")}</CommandButton>
            <AlertBell />
            {inboxOn ? <span className="topbar-inbox"><CommandButton command="admin.shell.inbox" className="secondary-btn" type="button" aria-label={tr("Inbox")} onDone={() => setInboxOpen((open) => !open)}>{tr("Inbox")}</CommandButton></span> : null}
            {/* Q24 / UI-17: at 1280 px and on phones the bar keeps Search, the bell and the profile; the rest is in "⋯". */}
            <div ref={moreRoot} className="topbar-more-wrap">
              <button ref={moreButton} data-command="admin.shell.menu" type="button" className="icon-btn topbar-more" aria-label={tr("More options")} aria-haspopup="true" aria-expanded={moreOpen} aria-controls="topbar-more" onClick={() => setMoreOpen((open) => !open)}>
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
              {moreOpen ? (
                <div id="topbar-more" className="topbar-more-menu" role="group" aria-label={tr("More options")}>
                  <MarketBar />
                  {inboxOn ? <CommandButton command="admin.shell.inbox" className="secondary-btn" type="button" aria-label={tr("Inbox")} onDone={() => { setInboxOpen((open) => !open); setMoreOpen(false); }}>{tr("Inbox")}</CommandButton> : null}
                  <p className="topbar-more-meta">{agent?.name ?? tr("Signed out")} · {trx(COUNTRY_LABEL[marketScope.market.id])} · {localTime} · {env} · {agent?.role ?? tr("signed out")}</p>
                  <CommandButton command="admin.shell.signOut" className="link-action" type="button" onDone={signOut}>{tr("Sign out")}</CommandButton>
                </div>
              ) : null}
            </div>
            <div className="admin-profile">
              <ProfileMenu initials={agent ? agent.name.slice(0, 2).toUpperCase() : "AD"} />
              <div>
                <strong>{agent?.name ?? tr("Signed out")}</strong>
                <span className="profile-meta">{trx(COUNTRY_LABEL[marketScope.market.id])} · {localTime} · {env} · {agent?.role ?? tr("signed out")}</span>
              </div>
              <span className="profile-signout"><CommandButton command="admin.shell.signOut" className="link-action" type="button" onDone={signOut}>{tr("Sign out")}</CommandButton></span>
            </div>
          </div>
        </header>
        <RideCheckBanner />
        {scopeDenied ? <p className="state-line">{trn("No access to scope {0}. Choose an allowed zone.", scope)}</p> : null}
        {searchOpen ? (
          <div className="panel">
            <label>{trn("Search{0}", <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Plate, trip or phone")} />)}</label>
            <ul>
              {(found.data ?? []).map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <CommandButton command="admin.shell.openHit" className="link-action" type="button" onDone={() => { setSearchOpen(false); navigate(hit.path); }}>{hit.kind}: {trx(hit.label)}</CommandButton>
                </li>
              ))}
            </ul>
            <CommandButton command="admin.shell.closeSearch" className="secondary-btn" type="button" onDone={() => setSearchOpen(false)}>{tr("Close")}</CommandButton>
          </div>
        ) : null}
        {inboxOpen && inboxOn ? (
          <div className="panel">
            <h3>{tr("Inbox")}</h3>
            <ul>
              {(inbox.data ?? []).map((item) => (
                <li key={item.id}><Link to={item.path} onClick={() => setInboxOpen(false)}>{trx(item.title)}</Link></li>
              ))}
            </ul>
          </div>
        ) : null}
        <main id="content" tabIndex={-1} className="content"><BackToFrom />{children}</main>
        <footer className="build-footer">{api.kind === "http" ? trn("Live data · {0}", buildLabel()) : trn("Demo data · {0} · {1}", env, buildLabel())}</footer>
      </section>
    </div>
  );
}
