import { tr } from "../i18n";
import { missedText, yesNoOrDash } from "../live/dispatchFacts";
import { orDash } from "../live/driverFacts";
import { useLiveDriverFacts } from "../live/useLiveDriverFacts";

type Props = { zoneIds: readonly string[]; nameOf: (driverId: string) => string };

/**
 * Owner 2026-11-04 (contract v0.18.21 §45): Dispatch › Live on the live server lists the real facts of each online
 * driver. A fact the server does not track yet shows "—"; nothing is made up.
 */
export function DriverFactsPanel({ zoneIds, nameOf }: Props) {
  const facts = useLiveDriverFacts(zoneIds);
  if (!facts) return null;
  const yes = tr("Yes");
  const no = tr("No");
  return (
    <section className="panel" aria-label={tr("Driver facts")}>
      <h2>{tr("Driver facts")}</h2>
      <p className="state-line">{tr("What the server knows about each online driver. — = not tracked yet.")}</p>
      {facts.failed ? <p className="state-line" role="alert">{tr("Could not load driver facts.")}</p> : null}
      {facts.partial ? <p className="state-line" role="status">{tr("Some zones could not be loaded.")}</p> : null}
      {facts.loading ? <p className="state-line">{tr("Loading…")}</p> : null}
      {!facts.loading && !facts.failed && facts.rows.length === 0 ? <p className="state-line">{tr("No driver online in these zones.")}</p> : null}
      {facts.rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("Driver")}</th><th>{tr("State")}</th><th>{tr("Rating")}</th><th>{tr("Acceptance")}</th><th>{tr("Cancels")}</th>
                <th>{tr("Idle (min)")}</th><th>{tr("Categories")}</th><th>{tr("Missed in a row")}</th><th>{tr("Rides this hour")}</th>
                <th>{tr("Needs rest")}</th><th>{tr("Finishing in (min)")}</th><th>{tr("Skips in a row")}</th><th>{tr("Airport queue")}</th>
              </tr>
            </thead>
            <tbody>
              {facts.rows.map((row) => (
                <tr key={`${row.zoneId}:${row.driverId}`}>
                  <td>{nameOf(row.driverId)}</td>
                  <td>{row.state === "trip" ? tr("On a trip") : tr("Free")}</td>
                  <td>{orDash(row.rating, (value) => value.toFixed(2))}</td>
                  <td>{orDash(row.acceptancePct, (value) => `${value} %`)}</td>
                  <td>{orDash(row.cancelPct, (value) => `${value} %`)}</td>
                  <td>{orDash(row.idleMin)}</td>
                  <td>{row.categoryIds.length ? row.categoryIds.join(", ") : "—"}</td>
                  <td>{missedText(row.missedInRow)}</td>
                  <td>{orDash(row.ridesThisHour)}</td>
                  <td>{yesNoOrDash(row.restNeeded, yes, no)}</td>
                  <td>{orDash(row.finishingInMin)}</td>
                  <td>{orDash(row.skipsInRow)}</td>
                  <td>{orDash(row.queuePos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
