import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { tr } from "../i18n";
import { errorText } from "./format";
import { useLiveSession } from "./LiveSessionContext";

/** The token from the setup link's fragment (#token=…): a fragment never reaches a web server's logs. */
export function setupTokenFrom(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && token.length >= 16 ? token : null;
}

/**
 * The first password (contract §9): the link `npm run admin -- create` prints opens this page; the server answers
 * the chosen password with a session, so the admin lands in the panel signed in.
 */
export function LiveSetupPasswordPage() {
  const live = useLiveSession();
  const navigate = useNavigate();
  const [token] = useState(() => setupTokenFrom(window.location.hash));
  const [who, setWho] = useState<{ email: string; name: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(token ? null : tr("This link is not valid any more. Ask for a new one."));
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let gone = false;
    live.client.checkSetupLink(token).then(
      (link) => { if (!gone) setWho({ email: link.email, name: link.name }); },
      () => { if (!gone) setLinkError(tr("This link is not valid any more. Ask for a new one.")); },
    );
    return () => { gone = true; };
  }, [live.client, token]);

  return (
    <main className="login-screen">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token || busy) return;
          if (password !== repeat) {
            setError(tr("The two passwords differ."));
            return;
          }
          setBusy(true);
          setError(null);
          live.client.setupPassword(token, password).then(
            () => {
              window.history.replaceState(null, "", window.location.pathname);
              navigate("/", { replace: true });
            },
            (caught: unknown) => {
              setError(errorText(caught));
              setBusy(false);
            },
          );
        }}
      >
        <p className="crumb">Movera Admin</p>
        <h1>{tr("Choose your password")}</h1>
        {linkError ? (
          <p className="state-line" role="alert">{linkError}</p>
        ) : who === null ? (
          <p className="state-line">{tr("Checking the link.")}</p>
        ) : (
          <>
            <p>{tr("For {0} ({1}). At least 10 characters.", [who.name, who.email])}</p>
            <label>
              {tr("Password")}
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
            </label>
            <label>
              {tr("Repeat the password")}
              <input type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" minLength={10} required />
            </label>
            {error ? <p className="state-line" role="alert">{error}</p> : null}
            <button className="primary-btn" type="submit" data-command="admin.server.setupPassword" disabled={busy}>
              {busy ? tr("Saving.") : tr("Save password")}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
