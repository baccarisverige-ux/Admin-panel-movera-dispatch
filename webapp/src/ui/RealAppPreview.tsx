import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { currentLanguage } from "../i18n";
import { previewText } from "../i18n/previewTexts";
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
 * shows "Preview – not sent"). The drawn sample stays one tap away (and is all the demo build shows) until the real
 * preview is accepted; then the samples are archived (rule 24), never deleted.
 */
export function RealAppPreview({ app, children }: { app: PreviewRole; children: ReactNode }) {
  const live = useLiveSessionMaybe();
  const zones = useLiveZoneList();
  const [mode, setMode] = useState<"real" | "sample">("real");
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
    enabled: allowed && mode === "real" && zone.length > 0,
    refetchInterval: PREVIEW_RENEW_MS,
    staleTime: PREVIEW_RENEW_MS,
    retry: false,
  });
  if (!allowed) return <>{children}</>;
  return (
    <div className="real-app-preview" data-app={app}>
      <div className="real-app-preview-bar" role="group">
        <CommandButton command="admin.tabs.select" type="button" className={mode === "real" ? "chip active" : "chip"} aria-pressed={mode === "real"} onDone={() => setMode("real")}>{previewText("realApp")}</CommandButton>
        <CommandButton command="admin.tabs.select" type="button" className={mode === "sample" ? "chip active" : "chip"} aria-pressed={mode === "sample"} onDone={() => setMode("sample")}>{previewText("sample")}</CommandButton>
      </div>
      {mode === "sample" ? children : (
        <>
          <div className="real-app-preview-bar">
            <label>
              {previewText("zone")}{" "}
              <select value={zone} onChange={(event) => setZoneId(event.target.value)}>
                {(zones ?? []).map((item) => <option key={item.zoneId} value={item.zoneId}>{zoneName(item.names, currentLanguage())}</option>)}
              </select>
            </label>
            <label><input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} /> {previewText("draft")}</label>
            <CommandButton command="admin.ui.retry" type="button" className="link-action" onDone={() => setReloads((value) => value + 1)}>{previewText("reload")}</CommandButton>
          </div>
          <p className="muted real-app-preview-note">{previewText("note")}</p>
          {session.isError ? (
            <>
              <p role="alert" className="muted">{previewText("failed")}</p>
              {children}
            </>
          ) : session.data ? (
            <div className="real-app-phone">
              <iframe
                key={`${session.data.token}-${reloads}`}
                title={previewText(app === "rider" ? "riderTitle" : "driverTitle")}
                src={previewUrl(appWebUrl(app, ENV), session.data)}
                sandbox="allow-scripts allow-same-origin allow-forms"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>
          ) : (
            <p className="muted" aria-busy="true">{previewText("opening")}</p>
          )}
        </>
      )}
    </div>
  );
}
