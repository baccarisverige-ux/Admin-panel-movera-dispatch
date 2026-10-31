import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminProviders } from "./api/AdminApiContext";
import { App } from "./App";
import { restoreDeepLink } from "./ui/deepLink";
import "./styles/tokens.css";
import "./styles/dashboard.css";
import "./styles/fleet.css";
import "./styles/pricing.css";
import "./styles/zones.css";
import "./styles/bonus.css";
import "./styles/riders.css";
import "./styles/dispatch.css";
import "./styles/handle.css";
import "./styles/alerts.css";
import "./styles/reports.css";
import "./styles/ops.css";
import "./styles/fleetops.css";
import "./styles/finance.css";
import "./styles/support.css";
import "./styles/growth.css";
import "./styles/platform.css";
import "./styles/live.css";

// G5: a deep link that came through GitHub Pages' 404 page (?p=/trips/T123) opens that page, not the Dashboard.
restoreDeepLink(window.location, import.meta.env.BASE_URL, (url) => window.history.replaceState(null, "", url));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminProviders>
      <App />
    </AdminProviders>
  </StrictMode>,
);
