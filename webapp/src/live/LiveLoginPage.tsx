import { useState } from "react";
import { tr } from "../i18n";
import { SignInLanguageGlobe } from "../i18n/SignInLanguageGlobe";
import { useLiveSession } from "./LiveSessionContext";

/**
 * The live sign-in (contract §9): e-mail and password through the server; no code field, no demo agent picker.
 * Owner G1-D2: in the computer's language (sv / fr / en, else English) with the globe to pick another; after an idle
 * sign-out or a session the server ended, the page says so.
 */
export function LiveLoginPage() {
  const live = useLiveSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="login-screen">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!email.trim() || !password) return;
          void live.signIn(email, password);
        }}
      >
        <div className="login-top">
          <p className="crumb">Movera Admin</p>
          <SignInLanguageGlobe />
        </div>
        {live.signedOut ? (
          <p className="login-signed-out" role="status" data-testid="signed-out-notice">
            {live.signedOut === "idle" ? tr("You were signed out because the panel was not used for a while. Sign in again.") : tr("Your session has ended. Sign in again.")}
          </p>
        ) : null}
        <h1>{tr("Sign in")}</h1>
        <p>{tr("Sign in with your Movera admin e-mail and password.")}</p>
        <label>
          {tr("Email")}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          {tr("Password")}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {live.error ? <p className="state-line" role="alert">{live.error}</p> : null}
        <button className="primary-btn" type="submit" data-command="admin.server.signIn" disabled={live.busy}>
          {live.busy ? tr("Signing in.") : tr("Sign in")}
        </button>
        {/* Audit Phase 4: the only way back in after a forgotten password (no e-mail provider yet). */}
        <details className="login-help">
          <summary>{tr("Forgot your password?")}</summary>
          <p>{tr("Ask a Super admin for a new password link. If you are the only Super admin, the server's operator makes one (deploy guide: “Forgot the admin password”).")}</p>
        </details>
      </form>
    </main>
  );
}
