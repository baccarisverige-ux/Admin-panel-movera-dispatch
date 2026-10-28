import { DevBanner } from "../platform/DevBanner";
import { useState } from "react";
import { ACTION_REASONS } from "../domain/labels";
import { useSession } from "../auth/SessionContext";
import { DataTable } from "../ui/DataTable";
import { Can, ConfirmDialog, DateTime, DetailLayout, DiffView, DocumentViewer, Drawer, Duration, EmptyState, ErrorState, Money, PhonePreview, StatusDot, Timeline, Toast, useDirty } from "../ui/kit";
import { CommandButton } from "../ui/CommandButton";
import { tr } from "../i18n";

export function DesignPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [tableState, setTableState] = useState<"ready" | "loading" | "error">("ready");
  const form = useDirty("Norrmalm");
  const role = session.agent?.role ?? "support";

  return (
    <>
      <DevBanner />
      <div className="page-heading">
        <div>
          <h2>{tr("Design")}</h2>
          <p>{tr("Every shared component. Super admin only.")}</p>
        </div>
      </div>
      <article className="panel">
        <StatusDot tone="green">{tr("Active")}</StatusDot>
        <StatusDot tone="amber">{tr("In review")}</StatusDot>
        <StatusDot tone="red">{tr("Rejected")}</StatusDot>
        <StatusDot tone="muted">{tr("Offline")}</StatusDot>
        <p><Money ore={25900} /> · <DateTime iso="2026-10-05T12:32:00Z" /> · <Duration seconds={95} /></p>
        <EmptyState title={tr("Empty state")} />
        <ErrorState onRetry={() => setTableState("ready")} />
        <Can role={role} permission="system.read"><p>{tr("You can open design.")}</p></Can>
        <Timeline items={[{ at: "2026-10-05T12:00:00Z", text: "Published" }]} />
        <PhonePreview app="rider">{tr("Book a ride in Stockholm.")}</PhonePreview>
        <PhonePreview app="driver">{tr("Offer in Östermalm.")}</PhonePreview>
        <DiffView before="12 kr" after="14 kr" />
        <Toast text="Saved in demo." />
        <DocumentViewer />
        <label>{tr("Zone")}<input value={form.value} onChange={(event) => form.setValue(event.target.value)} />
        </label>
        <p>{form.dirty ? tr("Unsaved change.") : tr("No unsaved change.")}</p>
        <CommandButton command="admin.design.drawer" className="secondary-btn" type="button" onDone={() => setDrawer(true)}>{tr("Open drawer")}</CommandButton>
        <CommandButton command="admin.design.confirm" className="primary-btn" type="button" onDone={() => setOpen(true)}>{tr("Open confirm")}</CommandButton>
        <Drawer open={drawer} title={tr("Quick view")} onClose={() => setDrawer(false)}><p>{tr("Drawer content.")}</p></Drawer>
        <ConfirmDialog open={open} record="Erik Lind (D0001)" typed="D0001" reasons={[...ACTION_REASONS]} onConfirm={() => setOpen(false)} onClose={() => setOpen(false)} />
      </article>
      <DetailLayout title={tr("Sample record")} status={<StatusDot tone="green">{tr("Active")}</StatusDot>} actions={<CommandButton command="admin.design.action" className="secondary-btn" type="button">{tr("Action")}</CommandButton>} tabs={<p>{tr("Tab")}</p>}>
        <DataTable head={["Name", "Status"]} rows={[["Erik Lind", "Active"]]} state={tableState} onRetry={() => setTableState("ready")} />
        <CommandButton command="admin.design.loading" className="link-action" type="button" onDone={() => setTableState("loading")}>{tr("Show loading")}</CommandButton>
        <CommandButton command="admin.design.error" className="link-action" type="button" onDone={() => setTableState("error")}>{tr("Show error")}</CommandButton>
        <DataTable head={["Name"]} rows={[]} />
      </DetailLayout>
    </>
  );
}
