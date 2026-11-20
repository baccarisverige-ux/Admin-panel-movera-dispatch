import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { ApiError } from "../api/httpClient";
import { CommandButton } from "../ui/CommandButton";
import { tr, uiLocale } from "../i18n/core";
import { shortDateTime } from "./format";
import { useLiveSession } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { deviceLine, SESSION_PERMISSIONS, sessionsPath, signOutDetails, type AdminSession } from "./sessions.ts";

/**
 * Contract v0.18.149 (owner Rules decisions/driver-g12.md Q6 "Real, riders + drivers (Recommended)",
 * contract.json#adminSessions): the Sessions card on the rider and the driver page. The signed-in phones (device,
 * platform, app version, last seen, signed in; never the address or a place), each with Sign out, and Sign out all.
 * Every sign-out asks for the reason in the confirm step (kept in the audit). The person's app returns to Sign in at its
 * next call with "You were signed out by Movera". A driver on a trip is refused until the trip ends (sign_out_on_trip).
 * GET /admin/{riders|drivers}/{id}/sessions (riders.read / drivers.read); the sign-out is admin.rider.signOut /
 * admin.driver.signOut (riders.block / drivers.activate).
 */
export function LiveSessions({ kind, id }: { kind: "rider" | "driver"; id: string }) {
  const { client, can } = useLiveSession();
  const rights = SESSION_PERMISSIONS[kind];
  const [notice, setNotice] = useState("");
  const q = useQuery({ queryKey: ["live", "sessions", kind, id], queryFn: () => client.json<{ items: AdminSession[] }>(sessionsPath(kind, id)), enabled: can(rights.read) });
  const canSignOut = can(rights.signOut);
  const items = q.data?.items ?? [];
  const locale = uiLocale();
  const signedOut = (text: string) => { setNotice(text); void q.refetch(); };
  return (
    <section className="fd-box" data-testid={`${kind}-sessions`}>
      <h3><Smartphone size={15} aria-hidden="true" /> {tr("Sessions")}</h3>
      <p className="fine">{tr("Phones where this account is signed in. Signing out sends the person back to Sign in with \"You were signed out by Movera\".")}</p>
      {!can(rights.read) ? <p className="op-help">{tr("Your role cannot see this.")}</p>
        : q.isLoading ? <p className="state-line">{tr("Loading.")}</p>
        : q.error ? (q.error instanceof ApiError && q.error.status === 403 ? <p className="op-help">{tr("Your role cannot see this.")}</p> : <ErrorLine error={q.error} onRetry={() => void q.refetch()} />)
        : items.length === 0 ? <p className="op-help" data-testid="sessions-none">{tr("Not signed in on any phone.")}</p>
        : (
          <ul className="rd-ledger" aria-label={kind === "rider" ? tr("Rider sessions") : tr("Driver sessions")}>
            {items.map((session) => (
              <li key={session.sessionId} data-testid="session-row">
                <b>{deviceLine(session)}</b>
                <span>{tr("Last seen {0}", [shortDateTime(session.lastSeenAt, locale)])} · {tr("Signed in {0}", [shortDateTime(session.createdAt, locale)])}</span>
                <CommandButton
                  command={rights.command}
                  className="dash-btn small ghost"
                  targetId={id}
                  confirmTarget={false}
                  before={tr("Signed in")}
                  after={tr("Signed out")}
                  value={{ sessionId: session.sessionId }}
                  summary={tr("Sign out {0}", [deviceLine(session)])}
                  details={signOutDetails(kind)}
                  disabled={!canSignOut}
                  title={canSignOut ? undefined : tr("Your role cannot do that.")}
                  onDone={() => signedOut(tr("Signed out of {0}.", [deviceLine(session)]))}
                >
                  {tr("Sign out")}
                </CommandButton>
              </li>
            ))}
          </ul>
        )}
      {items.length > 0 ? (
        <CommandButton
          command={rights.command}
          className="dash-btn small danger"
          targetId={id}
          confirmTarget={false}
          before={tr("{0} signed in", [String(items.length)])}
          after={tr("Signed out")}
          value={{ all: true }}
          summary={tr("Sign out of every phone ({0})", [String(items.length)])}
          details={signOutDetails(kind)}
          sure
          disabled={!canSignOut}
          title={canSignOut ? undefined : tr("Your role cannot do that.")}
          onDone={() => signedOut(tr("Signed out of every phone."))}
        >
          {tr("Sign out all")}
        </CommandButton>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
