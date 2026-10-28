import { DevBanner } from "../platform/DevBanner";
import { GateAAcceptance } from "../ui/GateAAcceptance";
import { APPS } from "../gates/apps";
import { frontendGateC, gateC } from "../gates/frontendC";
import { chapter16, gateB } from "../gates/scenarios";
import { DataTable } from "../ui/DataTable";
import { tr, trn } from "../i18n";

export function GatesPage() {
  const rows = chapter16();
  const gate = gateB(undefined, rows);
  const passed = rows.filter((row) => row.pass).length;
  const frontend = frontendGateC();
  const frontendPassed = frontend.filter((row) => row.pass).length;
  const gateCResult = gateC();

  return (
    <>
      <DevBanner />
      <GateAAcceptance />
      <div className="page-heading">
        <div>
          <h2>{tr("Chapter 16")}</h2>
          <p>{trn("{0} of {1} pass in the simulation. {2}", passed, rows.length, gate.reason)}</p>
        </div>
      </div>
      <article className="panel">
        <h3>{tr("Frontends")}</h3>
        <ul>
          {APPS.map((app) => (
            <li key={app.id}>
              {app.name} {app.sha.slice(0, 7)} · <a href={app.url}>{app.url}</a>
            </li>
          ))}
        </ul>
      </article>
      <DataTable
        head={["Id", "Simulation", "Staging", "Note"]}
        rows={rows.map((row) => [row.id, row.pass ? "pass" : "not passed", row.staging ? "yes" : "no", row.note])}
      />
      <div className="page-heading">
        <div>
          <h2>{tr("Gate C, frontend only")}</h2>
          <p>{trn("{0} of {1} pass on one shared record inside this admin. {2}", frontendPassed, frontend.length, gateCResult.reason)}</p>
        </div>
      </div>
      <DataTable
        head={["Id", "Frontend", "Note"]}
        rows={frontend.map((row) => [row.id, row.pass ? "pass" : "not passed", row.note])}
      />
    </>
  );
}
