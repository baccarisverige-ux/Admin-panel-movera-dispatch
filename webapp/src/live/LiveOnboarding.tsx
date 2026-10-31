import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, Car, CheckCircle2, Settings2 } from "lucide-react";
import { OnboardingSettingsEditor } from "../drivers/OnboardingSettingsEditor";
import { LiveCompanyReview } from "./LiveCompanyReview";
import { useRecords } from "../api/hooks";
import { tr, trn, trx } from "../i18n";
import { COUNTRY_LABEL } from "../i18n/countries";
import { useMarketScope } from "../markets/useMarketScope";
import { statusLabel } from "../domain/labels";
import { activationMissing, groupMissing, liveFunnel, type FunnelStep } from "./activation";
import { VehicleBlocked } from "./ActivationRefused";
import { LiveDriverDocuments } from "./LiveDriverDocuments";
import { LiveListBar } from "./LiveListBar";
import { DataTable } from "../ui/DataTable";
import type { DemoRecord, LiveAccountFacts } from "../api/seed";
import { documentCounts, documentTypeName, hasRenewalWaiting } from "./format";
import { Status } from "./ui";

type Account = { id: string; name: string; fleetId: string | null; facts: LiveAccountFacts };

/** The server's facts in the shape the activation helpers read. */
const asDriver = (facts: LiveAccountFacts) => facts;

const stepLabel = (id: FunnelStep["id"]) => (id === "signed_up" ? tr("Signed up") : id === "uploaded" ? tr("All documents uploaded") : id === "approved" ? tr("All documents approved") : tr("Active"));

/**
 * Live Onboarding (owner decisions #2 and #15): only the server's drivers, their documents and their cars. The queue
 * holds accounts not active yet; the funnel counts real rows and leaves out steps nobody reached. Approve / Reject go
 * to POST /admin/documents/{id}/review (the shared documents table); Activate is on the driver's page.
 */
export function LiveOnboarding() {
  const scope = useMarketScope();
  const country = scope.market.id;
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const [selectedId, setSelectedId] = useState("");
  const [params, setParams] = useSearchParams();
  const steps = params.get("view") === "steps";
  const view = (next: string | null) => setParams(() => {
    const out = new URLSearchParams(globalThis.location.search);
    if (next) out.set("view", next);
    else out.delete("view");
    return out;
  }, { replace: true });

  const inCountry = useMemo<Account[]>(() => (drivers.data ?? []).flatMap((record: DemoRecord) => (record.liveAccount && (!record.liveAccount.country || record.liveAccount.country === country) ? [{ id: record.id, name: record.name || record.id, fleetId: record.fleetId ?? null, facts: record.liveAccount }] : [])), [drivers.data, country]);
  // v0.18.5 (owner G2-D1): an account with a renewal waiting (an active driver's new licence, new bank details…) is in
  // the queue too; its current documents stay valid meanwhile.
  const queue = useMemo(() => inCountry.filter((item) => item.facts.accountStatus === "pending" || item.facts.accountStatus === "on_hold" || hasRenewalWaiting(item.facts.documents))
    .sort((left, right) => Number(right.facts.accountType === "fleet") - Number(left.facts.accountType === "fleet") || left.id.localeCompare(right.id)), [inCountry]);

  const renewals = queue.filter((item) => hasRenewalWaiting(item.facts.documents)).length;
  const header = (
    <header className="dx-head">
      {steps ? <button data-command="admin.onboarding.view" type="button" className="dash-btn ghost dx-back" onClick={() => view(null)}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button> : null}
      <div className="dx-head-text">
        <h2>{steps ? tr("Onboarding steps for {0}", [trx(COUNTRY_LABEL[country])]) : tr("Onboarding queue")}</h2>
        <p>{steps ? tr("The steps new drivers go through, the papers they need, how long each step may take and the reminders they get.") : trn("{0} accounts not active yet in {1}. An account is activated when every required document is approved: a driver in a fleet needs his own documents, a fleet owner also the company's. No car is needed.", queue.filter((item) => item.facts.accountStatus !== "active").length, trx(COUNTRY_LABEL[country]))}</p>
        {!steps && renewals > 0 ? <p data-testid="queue-renewals">{tr("Renewals to review: {0}. The current documents stay valid until you decide.", [renewals])}</p> : null}
      </div>
      {!steps ? <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" onClick={() => view("steps")}><Settings2 size={14} aria-hidden="true" />{" "}{tr("Steps and papers")}</button> : null}
    </header>
  );
  if (steps) return <div className="dx-page vh-page">{header}<OnboardingSettingsEditor key={country} country={country} part="onboarding" /></div>;
  if (drivers.isLoading || vehicles.isLoading) return <p className="state-line">{tr("Loading onboarding queue.")}</p>;
  if (drivers.isError) return <div className="dx-page vh-page">{header}<LiveListBar list="drivers" /></div>;

  const funnelSteps = liveFunnel(inCountry.map((item) => asDriver(item.facts)));
  const top = funnelSteps[0]?.count ?? 0;
  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;
  const cars = selected ? (vehicles.data ?? []).filter((car) => (selected.facts.fleetRole === "owner" && selected.fleetId && car.fleetId === selected.fleetId) || car.driverId === selected.id || car.id === selected.facts.vehicleId) : [];
  const kindOf = (item: Account) => (item.facts.accountType === "fleet" ? tr("Fleet owner") : item.fleetId ? tr("Driver in a fleet") : tr("Driver"));

  return (
    <div className="dx-page vh-page" data-testid="live-onboarding">
      {header}
      <LiveListBar list="drivers" />

      {funnelSteps.length ? (
        <section className="ob-funnel" aria-label={tr("Where applicants drop off")}>
          {funnelSteps.map((step) => {
            const pct = top ? Math.round((step.count / top) * 100) : 0;
            return (
              <div key={step.id} className="ob-funnel-step" data-step={step.id}>
                <span className="ob-funnel-bar"><i style={{ width: `${Math.max(pct, 4)}%` }} /></span>
                <b>{stepLabel(step.id)}</b>
                <small>{trn("{0} reached · {1}%", step.count, pct)}</small>
              </div>
            );
          })}
        </section>
      ) : null}

      <div className="live-onboarding-grid">
        <section className="panel">
          <DataTable
            serverSearch="drivers"
            head={[tr("Name"), tr("Account"), tr("Status"), tr("Documents"), tr("Activation")]}
            rowIds={queue.map((item) => item.id)}
            onRow={(index) => setSelectedId(queue[index]?.id ?? "")}
            rows={queue.map((item) => {
              const counts = documentCounts({ ...item.facts, documents: item.facts.documents });
              const ready = activationMissing(asDriver(item.facts)).length === 0;
              const renewal = hasRenewalWaiting(item.facts.documents);
              const inactive = item.facts.accountStatus !== "active";
              return [
                <button key="name" data-command="admin.onboarding.view" type="button" className="link-button" data-driver-id={item.id} onClick={() => setSelectedId(item.id)}>{item.name}</button>,
                kindOf(item),
                <Status key="status" code={item.facts.accountStatus} />,
                trn("{0} of {1} approved", counts.approved, counts.required),
                <span key="activation" data-testid="queue-activation">{inactive ? (ready ? tr("Ready to activate") : tr("Documents missing")) : null}{inactive && renewal ? " · " : null}{renewal ? <span className="chip warn">{tr("Renewal waiting")}</span> : null}</span>,
              ];
            })}
          />
          {queue.length === 0 ? <p className="state-line">{tr("No accounts are waiting for activation.")}</p> : null}
        </section>
        {selected ? <Selected account={selected} kind={kindOf(selected)} cars={cars} /> : null}
      </div>
    </div>
  );
}

function Selected({ account, kind, cars }: { account: Account; kind: string; cars: readonly DemoRecord[] }) {
  const groups = groupMissing(activationMissing(asDriver(account.facts)));
  const active = account.facts.accountStatus === "active";
  const name = account.name;
  const driver = { driverId: account.id };
  return (
    <section className="panel" data-testid="onboarding-selected" aria-label={name}>
      <div className="panel-title-row">
        <h3>{name}</h3>
        <p>{kind} · <Link to={`/drivers/${encodeURIComponent(driver.driverId)}?tab=documents`}>{tr("Open the driver to activate")}</Link></p>
      </div>
      {active ? (
        <p className="fd-banner amber" data-testid="queue-renewal-banner">{tr("Active account with a renewal waiting. Use Compare and review below; the current document stays valid until you decide.")}</p>
      ) : groups.driver.length + groups.fleet.length === 0 ? (
        <p className="fd-banner green"><CheckCircle2 size={16} aria-hidden="true" /> {tr("Every required document is approved. The account can be activated.")}</p>
      ) : (
        <div className="fd-banner amber live-activation-refused">
          <p><strong>{tr("Still missing or not approved:")}</strong></p>
          {groups.driver.length ? <div data-missing-scope="driver"><strong>{tr("Driver")}</strong><ul>{groups.driver.map((type) => <li key={type}>{documentTypeName(type, undefined, account.facts.country)}</li>)}</ul></div> : null}
          {groups.fleet.length ? <div data-missing-scope="fleet"><strong>{tr("Company")}</strong><ul>{groups.fleet.map((type) => <li key={type}>{documentTypeName(type, undefined, account.facts.country)}</li>)}</ul></div> : null}
        </div>
      )}
      {account.facts.accountType === "fleet" && account.fleetId ? <LiveCompanyReview fleetId={account.fleetId} /> : null}
      <LiveDriverDocuments driverId={driver.driverId} />
      <h4>{tr("Cars")}</h4>
      {cars.length === 0 ? <p className="fd-sub">{tr("No car yet. A car is not needed to activate the account.")}</p> : (
        <ul className="fd-list">
          {cars.map((car) => (
            <li key={car.id} data-vehicle-id={car.id}>
              <Car size={16} aria-hidden="true" /> <Link to={`/vehicles/${encodeURIComponent(car.id)}`}><strong>{car.plate ?? car.id}</strong></Link> {[car.make, car.model].filter(Boolean).join(" ")} · {statusLabel(car.status)}
              <VehicleBlocked missing={car.liveVehicleMissing} country={car.liveVehicleDocs?.country} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
