import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { tr } from "../i18n";
import { isLiveData } from "../live/realData";
import { LiveDriverIncome } from "../live/LiveDriverIncome";

/**
 * v0.18.153 P29 (contract.json#driverIncomeYear; owner 2026-11-21 "Execute! Add section in admin all what need", DAC7):
 * Admin › Finance › Driver income (year). Live data only: the demo build has no income per payee, so it says so (no
 * fake numbers, architecture rule "no new demo code in live builds").
 */
export function DriverIncomePage() {
  const navigate = useNavigate();
  return (
    <div className="dx-page fn-page di-page">
      <header className="dx-head">
        <button data-command="admin.server.driverIncome" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> {tr("Back")}</button>
        <div className="dx-head-text">
          <h2>{tr("Driver income (year)")}</h2>
          <p>{tr("For your accountant: DAC7 platform report to Skatteverket, due 31 January.")}</p>
        </div>
      </header>
      {isLiveData() ? <LiveDriverIncome /> : <p className="dx-calm" role="note" data-testid="driver-income-demo">{tr("Live data only: sign in to the Movera server to see what each driver and company earned in a year.")}</p>}
    </div>
  );
}
