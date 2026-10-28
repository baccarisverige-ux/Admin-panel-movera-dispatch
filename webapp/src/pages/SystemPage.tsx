import { DevBanner } from "../platform/DevBanner";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "../api/AdminApiContext";
import { useFreshness } from "../api/hooks";
import type { Fault } from "../api/demoStore";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn } from "../i18n";

const INTEGRATIONS = [
  ["Maps", "OpenStreetMap", "Configured tile provider; availability not probed"],
  ["Google Maps key", "empty", "Not connected"],
  ["SMS", "6-digit demo code", "Simulated"],
  ["Payouts", "Demo ledger", "Simulated"],
  ["Admin API", "Fixture adapter", "Demo data"],
] as const;

const FAULTS: Fault[] = ["none", "401", "403", "409", "422", "429", "503", "offline", "slow", "empty"];

/** Super admin only, demo data only. Removed with the demo adapter in the real version. */
function DemoTools() {
  const api = useAdminApi();
  const client = useQueryClient();
  const [fault, setFault] = useState<Fault>("none");
  useEffect(() => {
    let alive = true;
    void api.getFault().then((value) => { if (alive) setFault(value); });
    return () => { alive = false; };
  }, [api]);
  return (
    <article className="panel" aria-labelledby="demo-tools-title">
      <h3 id="demo-tools-title">{tr("Demo tools")}</h3>
      <p className="state-line">{tr("Only in the demo. Errors you pick here stay on until you set them back to none.")}</p>
      <label>{tr("Simulate errors")}<select value={fault} onChange={(event) => { const next = event.target.value as Fault; setFault(next); void api.setFault(next); }}>
          {FAULTS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <CommandButton command="admin.shell.reset" className="secondary-btn" type="button" onDone={() => void api.reset().then(() => client.invalidateQueries())}>{tr("Reset demo")}</CommandButton>
    </article>
  );
}

export function SystemPage() {
  const api = useAdminApi();
  const freshness = useFreshness();
  const { agent } = useSession();
  return (
    <>
      <DevBanner />
      <div className="page-heading">
        <div>
          <h2>{tr("System")}</h2>
          <p>{tr("Read-only. No secrets and no database console.")}</p>
        </div>
      </div>
      <ul className="pl-integrations" aria-label={tr("Integrations")}>
        {INTEGRATIONS.map(([name, value, state]) => (
          <li key={name}>{name}: {value} · {state}</li>
        ))}
      </ul>
      <p className="state-line">{trn("Transport: {0} · Simulation: {1} · Data updated {2}. External SMS, payout and mobile delivery are not verified.", api.kind, api.demo ? tr("yes") : tr("no"), freshness.data ?? tr("unavailable"))}</p>
      {api.demo && agent?.role === "super" ? <DemoTools /> : null}
    </>
  );
}
