import { tr } from "../i18n";

/** A control the live panel shows as in the demo but that has no server field yet (owner 2026-10-27). */
export function NotConnected() {
  return <small className="live-not-connected inline" role="note" data-testid="control-not-connected">{tr("Not connected yet")}</small>;
}
