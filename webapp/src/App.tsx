import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { AssignPanelProvider } from "./dispatch/AssignPanel";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { can, canUseZone } from "./auth/permissions";
import { SessionProvider, useSession } from "./auth/SessionContext";
import { AppShell } from "./layout/AppShell";
import { isRedirectPath, menuItem, pageForPath, type MenuItem } from "./nav";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundRecord } from "./ui/NotFoundRecord";
import { I18nProvider } from "./i18n/I18nProvider";
import { tr, trx } from "./i18n";

// Pages load on first visit, so the sign-in screen and the shell do not wait for every page and map library.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy itself
function lazyPage<M extends Record<K, ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, name: K): LazyExoticComponent<M[K]> {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}
const AuditPage = lazyPage(() => import("./pages/AuditPage"), "AuditPage");
const ComingPage = lazyPage(() => import("./pages/ComingPage"), "ComingPage");
const ChatPage = lazyPage(() => import("./pages/ChatPage"), "ChatPage");
const ConfigPage = lazyPage(() => import("./pages/ConfigPage"), "ConfigPage");
const ConfirmPage = lazyPage(() => import("./pages/ConfirmPage"), "ConfirmPage");
const ContentPage = lazyPage(() => import("./pages/ContentPage"), "ContentPage");
const DashboardPage = lazyPage(() => import("./pages/DashboardPage"), "DashboardPage");
const DispatchPage = lazyPage(() => import("./pages/DispatchPage"), "DispatchPage");
const AlertsPage = lazyPage(() => import("./pages/AlertsPage"), "AlertsPage");
const DesignPage = lazyPage(() => import("./pages/DesignPage"), "DesignPage");
const DriverDetailPage = lazyPage(() => import("./pages/DriverDetailPage"), "DriverDetailPage");
const DriversPage = lazyPage(() => import("./pages/DriversPage"), "DriversPage");
const FleetPage = lazyPage(() => import("./pages/FleetPage"), "FleetPage");
const FleetOwnerDetailPage = lazyPage(() => import("./pages/FleetOwnerDetailPage"), "FleetOwnerDetailPage");
const FleetOwnersPage = lazyPage(() => import("./pages/FleetOwnersPage"), "FleetOwnersPage");
const GatesPage = lazyPage(() => import("./pages/GatesPage"), "GatesPage");
const PromotionsPage = lazyPage(() => import("./pages/PromotionsPage"), "PromotionsPage");
const ReviewsPage = lazyPage(() => import("./pages/ReviewsPage"), "ReviewsPage");
const HandoverPage = lazyPage(() => import("./pages/HandoverPage"), "HandoverPage");
const LivePage = lazyPage(() => import("./pages/LivePage"), "LivePage");
const MessagesPage = lazyPage(() => import("./pages/MessagesPage"), "MessagesPage");
const OnboardingPage = lazyPage(() => import("./pages/OnboardingPage"), "OnboardingPage");
const PaymentsPage = lazyPage(() => import("./pages/PaymentsPage"), "PaymentsPage");
const PaymentPage = lazyPage(() => import("./pages/PaymentPage"), "PaymentPage");
const PayoutsPage = lazyPage(() => import("./pages/PayoutsPage"), "PayoutsPage");
const PricingPage = lazyPage(() => import("./pages/PricingPage"), "PricingPage");
const RecordPage = lazyPage(() => import("./pages/RecordPage"), "RecordPage");
const ReportsPage = lazyPage(() => import("./pages/ReportsPage"), "ReportsPage");
const ReservationDetailPage = lazyPage(() => import("./pages/ReservationDetailPage"), "ReservationDetailPage");
const ReservationsPage = lazyPage(() => import("./pages/ReservationsPage"), "ReservationsPage");
const RiderDetailPage = lazyPage(() => import("./pages/RiderDetailPage"), "RiderDetailPage");
const RidersPage = lazyPage(() => import("./pages/RidersPage"), "RidersPage");
const RiskPage = lazyPage(() => import("./pages/RiskPage"), "RiskPage");
const SafetyPage = lazyPage(() => import("./pages/SafetyPage"), "SafetyPage");
const SupportPage = lazyPage(() => import("./pages/SupportPage"), "SupportPage");
const SystemPage = lazyPage(() => import("./pages/SystemPage"), "SystemPage");
const TeamPage = lazyPage(() => import("./pages/TeamPage"), "TeamPage");
const TripsPage = lazyPage(() => import("./pages/TripsPage"), "TripsPage");
const TripPage = lazyPage(() => import("./pages/TripPage"), "TripPage");
const AdminPage = lazyPage(() => import("./pages/AdminPage"), "AdminPage");
const VehicleDetailPage = lazyPage(() => import("./pages/VehicleDetailPage"), "VehicleDetailPage");
const ZoneDetailPage = lazyPage(() => import("./pages/ZoneDetailPage"), "ZoneDetailPage");
const ZonesPage = lazyPage(() => import("./pages/ZonesPage"), "ZonesPage");

function Screen({ id }: { id: string }) {
  const item = menuItem(id);
  if (!item) return <NotFound />;
  if (item.coming) return <ComingPage title={trx(item.label)} order={item.coming} />;
  if (id === "audit") return <AuditPage />;
  if (id === "settings") return <ConfigPage />;
  if (id === "confirm") return <ConfirmPage />;
  if (id === "drivers") return <DriversPage />;
  if (id === "onboarding") return <OnboardingPage />;
  if (id === "dashboard") return <DashboardPage />;
  if (id === "zones") return <ZonesPage />;
  if (id === "payments") return <PaymentsPage />;
  if (id === "payouts") return <PayoutsPage />;
  if (id === "pricing") return <PricingPage />;
  if (id === "reservations") return <ReservationsPage />;
  if (id === "reports") return <ReportsPage />;
  if (id === "promotions") return <PromotionsPage />;
  if (id === "reviews") return <ReviewsPage />;
  if (id === "content") return <ContentPage />;
  if (id === "messages") return <MessagesPage />;
  if (id === "handover") return <HandoverPage />;
  if (id === "gates") return <GatesPage />;
  if (id === "design") return <DesignPage />;
  if (id === "vehicles") return <FleetPage />;
  if (id === "fleets") return <FleetOwnersPage />;
  if (id === "support") return <SupportPage />;
  if (id === "chat") return <ChatPage />;
  if (id === "incidents") return <SafetyPage />;
  if (id === "risk") return <RiskPage />;
  if (id === "riders") return <RidersPage />;
  if (id === "trips") return <TripsPage />;
  if (id === "live") return <LivePage />;
  if (id === "dispatch") return <DispatchPage />;
  if (id === "offers") return <DispatchPage section="offers" />;
  if (id === "alerts") return <AlertsPage />;
  if (id === "team") return <TeamPage />;
  if (id === "system") return <SystemPage />;
  return <ComingPage title={trx(item.label)} order="a later work order" />;
}

export function routerBasename(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base === "" ? "/" : base;
}

function NotFound() {
  return <NotFoundRecord kind="Page" list="/" listLabel="the dashboard" />;
}

function NoAccess() {
  return (
    <div className="page-heading">
      <div>
        <h2>{tr("No access")}</h2>
        <p>{tr("Your role cannot open this page. The attempt is refused here, not hidden as an empty screen.")}</p>
      </div>
    </div>
  );
}

function Shell({ page, children, forceNoAccess = false, redirect = false }: { page: MenuItem | undefined; children: ReactNode; forceNoAccess?: boolean; redirect?: boolean }) {
  const { agent } = useSession();
  // Default deny: a route with no page entry (and so no permission) never renders its screen.
  const denied = forceNoAccess || (page && agent && !can(agent.role, page.permission));
  const shown: MenuItem = page ?? {
    id: "not-found",
    path: "/404",
    label: tr("Page not found"),
    group: "Overview",
    permission: "overview.read",
    icon: "LayoutDashboard",
  };
  return (
    <AppShell page={shown}>
      <AssignPanelProvider>
        <section className="page active" data-page={shown.id}>
          {denied ? <NoAccess /> : page || redirect ? <Suspense fallback={<p className="state-line">{tr("Loading.")}</p>}>{children}</Suspense> : <NotFound />}
        </section>
      </AssignPanelProvider>
    </AppShell>
  );
}

function Authed() {
  const { agent } = useSession();
  const location = useLocation();
  if (!agent) return <LoginPage />;
  const page = pageForPath(location.pathname);
  const scope = new URLSearchParams(location.search).get("scope");
  const scopeDenied = Boolean(agent && scope && !canUseZone(agent, scope));
  return (
    <Shell page={page} forceNoAccess={scopeDenied} redirect={isRedirectPath(location.pathname)}>
      <Routes>
        <Route index element={<Screen id="dashboard" />} />
        <Route path="reports" element={<Screen id="reports" />} />
        <Route path="handover" element={<Screen id="handover" />} />
        <Route path="trips" element={<Screen id="trips" />} />
        <Route path="trips/:tripId" element={<TripPage />} />
        <Route path="reservations" element={<Screen id="reservations" />} />
        <Route path="reservations/:id" element={<ReservationDetailPage />} />
        <Route path="live" element={<Screen id="live" />} />
        <Route path="dispatch" element={<Screen id="dispatch" />} />
        <Route path="offers" element={<Screen id="offers" />} />
        <Route path="alerts" element={<Screen id="alerts" />} />
        <Route path="drivers" element={<Screen id="drivers" />} />
        <Route path="drivers/:driverId" element={<DriverDetailPage />} />
        <Route path="onboarding" element={<Screen id="onboarding" />} />
        <Route path="riders" element={<Screen id="riders" />} />
        <Route path="riders/:riderId" element={<RiderDetailPage />} />
        <Route path="fleets" element={<Screen id="fleets" />} />
        <Route path="fleets/:ownerId" element={<FleetOwnerDetailPage />} />
        <Route path="vehicles" element={<Screen id="vehicles" />} />
        <Route path="vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="payments" element={<Screen id="payments" />} />
        <Route path="payments/:id" element={<PaymentPage />} />
        <Route path="payouts" element={<Screen id="payouts" />} />
        <Route path="payouts/:id" element={<RecordPage kind="payouts" label={tr("Payout")} list="/payouts" />} />
        <Route path="zones" element={<Screen id="zones" />} />
        <Route path="zones/:zoneId" element={<ZoneDetailPage />} />
        <Route path="pricing" element={<Screen id="pricing" />} />
        <Route path="support" element={<Screen id="support" />} />
        <Route path="tickets/:id" element={<SupportPage />} />
        <Route path="chat" element={<Screen id="chat" />} />
        <Route path="incidents" element={<Screen id="incidents" />} />
        <Route path="incidents/:id" element={<RecordPage kind="incidents" label={tr("Incident")} list="/incidents" />} />
        <Route path="risk" element={<Screen id="risk" />} />
        <Route path="messages" element={<Screen id="messages" />} />
        <Route path="content" element={<Screen id="content" />} />
        <Route path="promotions" element={<Screen id="promotions" />} />
        <Route path="reviews" element={<Screen id="reviews" />} />
        <Route path="team" element={<Screen id="team" />} />
        <Route path="team/:adminId" element={<AdminPage />} />
        <Route path="audit" element={<Screen id="audit" />} />
        <Route path="settings" element={<Screen id="settings" />} />
        <Route path="confirm" element={<Screen id="confirm" />} />
        <Route path="system" element={<Screen id="system" />} />
        <Route path="gates" element={<Screen id="gates" />} />
        <Route path="design" element={<Screen id="design" />} />
        <Route path="users" element={<Navigate to="/drivers" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <SessionProvider>
        <I18nProvider>
          <Authed />
        </I18nProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
