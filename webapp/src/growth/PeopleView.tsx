import { useState } from "react";
import { Link } from "react-router";
import { Star, Users } from "lucide-react";
import { Card } from "../dispatch/fields";
import type { Person } from "./reviews";
import { tr } from "../i18n";

const ACTION_LABEL = { warn: "Send a warning", review: "Admin review", block: "Block" } as const;

export function Stars({ value }: { value: number }) {
  return <span className="gr-stars" aria-label={tr("{0} of 5 stars", [value])}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} aria-hidden="true" className={n <= value ? "on" : undefined} />)}</span>;
}

/** Average rating per driver or rider, lowest first, with what the rules say to do. */
export function PeopleView({ persons }: { persons: readonly Person[] }) {
  const [who, setWho] = useState<"driver" | "rider">("driver");
  const list = persons.filter((row) => row.who === who);
  return (
    <Card title={tr("Ratings per person")} icon={<Users size={15} />} tone="blue" help={tr("Lowest first. The rules decide when someone gets a warning, an admin review or a block.")}>
      <div className="gr-chips" role="group" aria-label={tr("Person kind")}>
        {(["driver", "rider"] as const).map((id) => <button data-command="admin.review.view" key={id} type="button" aria-pressed={who === id} className={who === id ? "gr-chip on" : "gr-chip"} onClick={() => setWho(id)}>{id === "driver" ? tr("Drivers") : tr("Riders")}</button>)}
      </div>
      <table className="gr-table" aria-label={who === "driver" ? tr("Driver ratings") : tr("Rider ratings")}>
        <thead><tr><th>{tr("Name")}</th><th>{tr("Average")}</th><th>{tr("Reviews")}</th><th>{tr("1–2 stars")}</th><th>{tr("What happens")}</th></tr></thead>
        <tbody>
          {list.map((row) => (
            <tr key={row.key}>
              <td>{row.id && row.who === "driver" ? <Link to={`/drivers/${row.id}`}>{row.name}</Link> : row.name}</td>
              <td><Stars value={Math.round(row.average)} /> {row.average.toFixed(2)}</td>
              <td>{row.count}</td>
              <td>{row.low}</td>
              <td>{row.action ? <span className={`gr-state ${row.action === "block" ? "stopped" : row.action === "review" ? "paused" : "budget"}`}>{ACTION_LABEL[row.action]}</span> : <small>{tr("Nothing")}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
