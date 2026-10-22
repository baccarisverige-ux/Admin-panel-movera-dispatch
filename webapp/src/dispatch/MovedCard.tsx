import { Link } from "react-router";
import { ArrowRight, Radar } from "lucide-react";
import { tr, trn, trx } from "../i18n";

export const OFFERS_PATH = "/offers";

/** A deep link into Radar · Exclusive · Reservations: a tab and, when known, the zone and the card to scroll to. */
export function offersLink(tab: "radar" | "exclusive" | "reservations", zoneId?: string, card?: string): string {
  const params = new URLSearchParams();
  if (tab !== "radar") params.set("tab", tab);
  if (zoneId) params.set("zone", zoneId);
  if (card) params.set("card", card);
  const search = params.toString();
  return `${OFFERS_PATH}${search ? `?${search}` : ""}`;
}

type Props = {
  /** What used to be here, for example "Radar and Exclusive rules". */
  what: string;
  /** Where each part went: a label and its link. */
  links: { label: string; to: string }[];
  /** A test id for the e2e tests. */
  testId?: string;
};

/**
 * Where a setting used to be: a small card that says it moved to Radar · Exclusive · Reservations and opens the right
 * tab. Every setting lives in one place only, so nothing here is editable.
 */
export function MovedCard({ what, links, testId }: Props) {
  return (
    <section className="dx-card moved" aria-label={tr("{0} moved", [what])} data-testid={testId}>
      <header className="dx-card-head">
        <span className="dx-card-icon" aria-hidden="true"><Radar size={18} /></span>
        <span className="dx-card-title">
          <b>{trn("{0} moved to Radar · Exclusive · Reservations", trx(what))}</b>
          <small>{tr("Every Radar, Exclusive and reservation rule is set there, in one place.")}</small>
        </span>
      </header>
      <div className="dx-card-body dx-moved-links">
        {links.map((link) => <Link key={link.to} className="dash-btn small ghost" to={link.to}>{trx(link.label)} <ArrowRight size={13} aria-hidden="true" /></Link>)}
      </div>
    </section>
  );
}
