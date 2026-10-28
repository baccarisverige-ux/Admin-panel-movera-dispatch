import { tr } from "../i18n";

/**
 * Something the server does not send yet: never a fake number or a zero.
 * Default: a value or block (owner rule, part 3). `control`: a control the live panel shows as in
 * the demo but that has no server field yet (owner 2026-10-27).
 */
export function NotConnected({ block = false, control = false }: { block?: boolean; control?: boolean }) {
  if (control) return <small className="live-not-connected inline" role="note" data-testid="control-not-connected">{tr("Not connected yet")}</small>;
  return block ? <p className="dx-calm" data-testid="value-not-connected">{tr("Not connected yet")}</p> : <span className="dx-calm" data-testid="value-not-connected">{tr("Not connected yet")}</span>;
}
