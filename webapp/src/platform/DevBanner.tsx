import { Link, useNavigate } from "react-router";
import { ArrowLeft, Wrench } from "lucide-react";
import { normalizePanelOps, emptyPanelOps, PANEL_OPS_KEY, type PanelOps } from "./panel";
import { useSlice } from "../api/hooks";
import { tr, trn } from "../i18n";

/** Top of a developer page: Back, who can see it, and whether it shows in the menu. */
export function DevBanner() {
  const navigate = useNavigate();
  const ops = normalizePanelOps(useSlice<PanelOps>(PANEL_OPS_KEY, emptyPanelOps()).value);
  return (
    <div className="pl-dev">
      <button data-command="admin.panel.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
      <p><Wrench size={14} aria-hidden="true" />{" "}{trn("Developer page · Super admin only · {0}. {1}", ops.devPages ? tr("shown in the menu") : tr("hidden from the menu"), <Link to="/settings?tab=panel">{tr("Change in Settings")}</Link>)}</p>
    </div>
  );
}
