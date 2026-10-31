import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from "react";
import { AssignPanelContext, type AssignExtras } from "./assignContext";

/**
 * One assign panel for the whole admin: any screen opens it with useAssignPanel().open(tripId). The panel itself
 * (Exclusive, Radar, the driver money, the offers) loads when it is first opened, so it is not part of the first
 * load (audit Phase 7 budget, scripts/check-bundle.mjs); the pages that render its buttons import it on their own.
 */
const AssignPanel = lazy(() => import("./AssignPanel").then((module) => ({ default: module.AssignPanel })));

export function AssignPanelProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<{ tripId: string; extras: AssignExtras } | null>(null);
  const open = useCallback((id: string, extras: AssignExtras = {}) => setOpened({ tripId: id, extras }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <AssignPanelContext.Provider value={value}>
      {children}
      {opened ? <Suspense fallback={null}><AssignPanel key={opened.tripId} tripId={opened.tripId} candidates={opened.extras.candidates ?? []} onClose={() => setOpened(null)} /></Suspense> : null}
    </AssignPanelContext.Provider>
  );
}
