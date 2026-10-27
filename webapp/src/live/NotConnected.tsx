import { tr } from "../i18n";

/** A value or block the server does not send yet (owner rule, part 3): never a fake number or a zero. */
export function NotConnected({ block = false }: { block?: boolean }) {
  return block ? <p className="dx-calm" data-testid="value-not-connected">{tr("Not connected yet")}</p> : <span className="dx-calm" data-testid="value-not-connected">{tr("Not connected yet")}</span>;
}
