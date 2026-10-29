export const MENU_GROUPS = [
  "Overview",
  "Operations",
  "Fleet & Drivers",
  "Finance",
  "Places & pricing",
  "Support",
  "Growth & content",
  "Platform",
] as const;

export type MenuGroup = (typeof MENU_GROUPS)[number];

export const NAV_ICONS = [
  "LayoutDashboard",
  "BarChart3",
  "ClipboardList",
  "Route",
  "CalendarClock",
  "Map",
  "Users",
  "UserPlus",
  "UserRound",
  "Car",
  "Building2",
  "Wallet",
  "Banknote",
  "MapPinned",
  "Tags",
  "LifeBuoy",
  "MessagesSquare",
  "Siren",
  "ShieldAlert",
  "MessageSquare",
  "Images",
  "Ticket",
  "Star",
  "ScrollText",
  "Settings",
  "Server",
  "Shield",
  "Palette",
  "Radar",
  "Bell",
] as const;

export type NavIcon = (typeof NAV_ICONS)[number];

export type MenuItem = {
  id: string;
  path: string;
  label: string;
  group: MenuGroup;
  permission: string;
  icon: NavIcon;
  coming?: string;
};

export const MENU: MenuItem[] = [
  { id: "dashboard", path: "/", label: "Dashboard", group: "Overview", permission: "overview.read", icon: "LayoutDashboard" },
  { id: "reports", path: "/reports", label: "Reports", group: "Overview", permission: "overview.read", icon: "BarChart3" },
  { id: "handover", path: "/handover", label: "Handover", group: "Overview", permission: "overview.read", icon: "ClipboardList" },
  { id: "alerts", path: "/alerts", label: "Alerts", group: "Operations", permission: "overview.read", icon: "Bell" },
  { id: "trips", path: "/trips", label: "Trips", group: "Operations", permission: "trips.read", icon: "Route" },
  { id: "reservations", path: "/reservations", label: "Reservations", group: "Operations", permission: "trips.read", icon: "CalendarClock" },
  { id: "dispatch", path: "/dispatch/map", label: "Dispatch", group: "Operations", permission: "trips.read", icon: "Radar" },
  { id: "incidents", path: "/incidents", label: "Incidents", group: "Operations", permission: "incidents.read", icon: "Siren" },
  { id: "risk", path: "/risk", label: "Risk", group: "Operations", permission: "safety.edit", icon: "ShieldAlert" },
  { id: "riders", path: "/riders", label: "Riders", group: "Operations", permission: "riders.read", icon: "UserRound" },
  { id: "waitlist", path: "/waitlist", label: "Waiting list", group: "Operations", permission: "overview.read", icon: "ClipboardList" },
  { id: "drivers", path: "/drivers", label: "Drivers", group: "Fleet & Drivers", permission: "drivers.read", icon: "Users" },
  { id: "fleets", path: "/fleets", label: "Fleet owners", group: "Fleet & Drivers", permission: "drivers.read", icon: "Building2" },
  { id: "vehicles", path: "/vehicles", label: "Vehicles", group: "Fleet & Drivers", permission: "drivers.read", icon: "Car" },
  { id: "onboarding", path: "/onboarding", label: "Onboarding", group: "Fleet & Drivers", permission: "drivers.read", icon: "UserPlus" },
  { id: "payments", path: "/payments", label: "Payments", group: "Finance", permission: "finance.read", icon: "Wallet" },
  { id: "payouts", path: "/payouts", label: "Payouts", group: "Finance", permission: "finance.read", icon: "Banknote" },
  { id: "zones", path: "/zones", label: "Zones", group: "Places & pricing", permission: "zones.read", icon: "MapPinned" },
  { id: "pricing", path: "/pricing", label: "Pricing", group: "Places & pricing", permission: "settings.read", icon: "Tags" },
  { id: "support", path: "/support", label: "Support", group: "Support", permission: "support.reply", icon: "LifeBuoy" },
  { id: "chat", path: "/chat", label: "Chat", group: "Support", permission: "support.reply", icon: "MessagesSquare" },
  { id: "messages", path: "/messages", label: "Messages", group: "Growth & content", permission: "settings.read", icon: "MessageSquare" },
  { id: "content", path: "/content", label: "Content", group: "Growth & content", permission: "settings.read", icon: "Images" },
  { id: "promotions", path: "/promotions", label: "Promotions", group: "Growth & content", permission: "settings.read", icon: "Ticket" },
  { id: "reviews", path: "/reviews", label: "Reviews", group: "Growth & content", permission: "settings.read", icon: "Star" },
  { id: "team", path: "/team", label: "Team", group: "Platform", permission: "team.read", icon: "Users" },
  { id: "audit", path: "/audit", label: "Audit", group: "Platform", permission: "audit.read", icon: "ScrollText" },
  { id: "settings", path: "/settings", label: "Settings", group: "Platform", permission: "settings.read", icon: "Settings" },
  { id: "confirm", path: "/confirm", label: "To confirm", group: "Platform", permission: "settings.read", icon: "ClipboardList" },
  { id: "system", path: "/system", label: "System", group: "Platform", permission: "system.read", icon: "Server" },
  { id: "gates", path: "/gates", label: "Release gates", group: "Platform", permission: "system.read", icon: "Shield" },
  { id: "design", path: "/design", label: "Design", group: "Platform", permission: "system.read", icon: "Palette" },
];

const DETAILS: { pattern: RegExp; id: string }[] = [
  { pattern: /^\/drivers\/[^/]+$/, id: "drivers" },
  { pattern: /^\/fleets\/[^/]+$/, id: "fleets" },
  { pattern: /^\/riders\/[^/]+$/, id: "riders" },
  { pattern: /^\/trips\/[^/]+$/, id: "trips" },
  { pattern: /^\/reservations\/[^/]+$/, id: "reservations" },
  { pattern: /^\/tickets\/[^/]+$/, id: "support" },
  { pattern: /^\/incidents\/[^/]+$/, id: "incidents" },
  { pattern: /^\/zones\/[^/]+$/, id: "zones" },
  { pattern: /^\/vehicles\/[^/]+$/, id: "vehicles" },
  { pattern: /^\/payouts\/[^/]+$/, id: "payouts" },
  { pattern: /^\/payments\/[^/]+$/, id: "payments" },
  { pattern: /^\/team\/[^/]+$/, id: "team" },
  // The Dispatch section's tabs (Live map, Radar · Exclusive, Bookings, Rules): one menu item.
  { pattern: /^\/dispatch\/(map|radar|bookings|rules)$/, id: "dispatch" },
];

/** Routes that only redirect somewhere else; every other route must resolve to a page (and its permission). */
export const REDIRECT_PATHS: readonly string[] = ["/users", "/live", "/offers", "/dispatch"];

export function isRedirectPath(pathname: string): boolean {
  return REDIRECT_PATHS.includes(pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);
}

export function menuItem(id: string): MenuItem | undefined {
  return MENU.find((item) => item.id === id);
}

export function pageForPath(pathname: string): MenuItem | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const exact = MENU.find((item) => item.path === path);
  if (exact) return exact;
  const detail = DETAILS.find((item) => item.pattern.test(path));
  return detail ? menuItem(detail.id) : undefined;
}
