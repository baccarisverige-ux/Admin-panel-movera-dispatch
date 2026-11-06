import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { currentLanguage, tr } from "../i18n";
import { zoneName } from "../zones/live";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { useLiveZoneList } from "../live/LiveZones";
import "../styles/appPreview.css";
import { CommandButton } from "./CommandButton";
import { PREVIEW_RENEW_MS, PREVIEW_SESSIONS_PATH, appWebUrl, parsePreviewSession, previewUrl, type PreviewRole } from "../live/appPreview";

const ENV = { VITE_RIDER_APP_URL: import.meta.env.VITE_RIDER_APP_URL, VITE_DRIVER_APP_URL: import.meta.env.VITE_DRIVER_APP_URL };

/**
 * Contract v0.18.25 §47 (BASE B7; owner P1 a, P2 b, P3 a): on every page that showed a drawn sample phone, the REAL
 * rider / driver web app in a phone frame, reading the live server with a read-only preview token (every real action
 * shows "Preview – not sent"). B7b (owner OK 2026-11-05): the drawn "Sample" tab is gone; it is archived in the Rules repo
 * (archive/admin-sample-phones, rule 24). Without a live session the panel says so instead of drawing a sample.
 */
export function RealAppPreview({ app }: { app: PreviewRole }) {
  const live = useLiveSessionMaybe();
  const zones = useLiveZoneList();
  const [zoneId, setZoneId] = useState<string>("");
  const [draft, setDraft] = useState(false);
  const [reloads, setReloads] = useState(0);
  const allowed = Boolean(live) && (live?.can("settings.read") ?? false);
  const zone = zoneId || zones?.[0]?.zoneId || "";
  const session = useQuery({
    queryKey: ["live", "app-preview", app, zone, draft, reloads],
    queryFn: async () => {
      const answer = parsePreviewSession(await live!.client.post<unknown>(PREVIEW_SESSIONS_PATH, { role: app, zoneId: zone, useDraft: draft }));
      if (!answer) throw new Error("preview session unreadable");
      return answer;
    },
    enabled: allowed && zone.length > 0,
    refetchInterval: PREVIEW_RENEW_MS,
    staleTime: PREVIEW_RENEW_MS,
    retry: false,
  });
  const title = app === "rider" ? tr("Rider app preview") : tr("Driver app preview");
  if (!allowed) return <p className="muted real-app-preview-note" aria-label={title}>{tr("Sign in to the live server to see the real app.")}</p>;
  return (
    <div className="real-app-preview" data-app={app} aria-label={title}>
      <div className="real-app-preview-bar">
        <label>
          {tr("Zone")}{" "}
          <select value={zone} onChange={(event) => setZoneId(event.target.value)}>
            {(zones ?? []).map((item) => <option key={item.zoneId} value={item.zoneId}>{zoneName(item.names, currentLanguage())}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} /> {tr("Show draft settings")}</label>
        <CommandButton command="admin.ui.retry" type="button" className="link-action" onDone={() => setReloads((value) => value + 1)}>{tr("Reload")}</CommandButton>
      </div>
      <p className="muted real-app-preview-note">{tr("The real app on the live server. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.")}</p>
      {session.isError ? (
        <p role="alert" className="muted">{tr("The real app could not open. Press Reload to try again.")}</p>
      ) : session.data ? (
        <div className="real-app-phone">
          <iframe
            key={`${session.data.token}-${reloads}`}
            title={title}
            src={previewUrl(appWebUrl(app, ENV), session.data)}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </div>
      ) : (
        <p className="muted" aria-busy="true">{tr("Opening the app…")}</p>
      )}
</div>
  );
}
