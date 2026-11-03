import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr, trx } from "../i18n";
import { useSession } from "../auth/SessionContext";
import { ROLE_LABELS } from "../auth/permissions";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { adminLabel } from "./format";
import type { AdminMe } from "./types";

/**
 * v0.18.18 (owner 2026-11-03 "Real name from Team"): each admin's first name, shown everywhere instead of an e-mail
 * ("Admin" until set). Every admin sets their own; with team.edit, also the admins in their scope (server checks it).
 */
type Agent = { adminId: string; firstName?: string; role: string; zones: string[] };

export function LiveTeamNames() {
  const { client, admin, can } = useLiveSession();
  const session = useSession();
  const queryClient = useQueryClient();
  const [mine, setMine] = useState(admin?.firstName ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const others = useQuery({ queryKey: ["live", "agents"], queryFn: () => client.json<{ items: Agent[] }>("/admin/agents"), enabled: can("team.read") });
  const invalid = (value: string) => !value.trim() || value.trim().length > 40 || value.includes("@");

  async function saveMine() {
    if (invalid(mine)) return;
    setBusy("me");
    setError(null);
    try {
      const me = await client.json<AdminMe>("/admin/auth/me", { method: "PATCH", body: JSON.stringify({ firstName: mine.trim() }) });
      if (session.agent) session.setAgents([{ ...session.agent, name: adminLabel(me.firstName) }]);
      setNotice(tr("First name saved."));
      void queryClient.invalidateQueries({ queryKey: ["live", "agents"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy("");
    }
  }

  async function saveOther(adminId: string) {
    const value = drafts[adminId] ?? "";
    if (invalid(value)) return;
    setBusy(adminId);
    setError(null);
    try {
      await client.json(`/admin/agents/${encodeURIComponent(adminId)}`, { method: "PATCH", body: JSON.stringify({ firstName: value.trim() }) });
      setNotice(tr("First name saved."));
      void queryClient.invalidateQueries({ queryKey: ["live", "agents"] });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy("");
    }
  }

  return (
    <article className="panel" data-testid="live-team-names">
      <h3>{tr("First names")}</h3>
      <p className="op-help">{tr("The name other admins see on tickets and alerts. Until it is set they see \"Admin\". Never an e-mail.")}</p>
      <div className="op-inline wrap">
        <label className="field">{tr("My first name")}<input aria-label={tr("My first name")} value={mine} maxLength={40} onChange={(event) => setMine(event.target.value)} /></label>
        <button type="button" className="primary-btn" data-command="admin.team.view" disabled={busy === "me" || invalid(mine)} onClick={() => void saveMine()}>{tr("Save")}</button>
      </div>
      {mine.includes("@") ? <p className="error-line" role="alert">{tr("A first name, not an e-mail.")}</p> : null}
      {can("team.read") ? (
        others.isLoading ? <p className="state-line">{tr("Loading.")}</p> : others.error ? <ErrorLine error={others.error} onRetry={() => void others.refetch()} /> : (
          <ul className="pm-list" aria-label={tr("Admins")}>
            {(others.data?.items ?? []).filter((item) => item.adminId !== admin?.adminId).map((item) => (
              <li key={item.adminId} className="op-inline wrap">
                <span>{adminLabel(item.firstName)} · {trx(ROLE_LABELS[item.role as keyof typeof ROLE_LABELS] ?? item.role)}</span>
                {can("team.edit") ? (
                  <>
                    <input aria-label={tr("First name of {0}", [adminLabel(item.firstName)])} value={drafts[item.adminId] ?? item.firstName ?? ""} maxLength={40} onChange={(event) => setDrafts({ ...drafts, [item.adminId]: event.target.value })} />
                    <button type="button" className="secondary-btn" data-command="admin.team.view" disabled={busy === item.adminId || invalid(drafts[item.adminId] ?? "")} onClick={() => void saveOther(item.adminId)}>{tr("Save")}</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {notice ? <p className="dx-calm" role="status">{notice}</p> : null}
      {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
    </article>
  );
}
