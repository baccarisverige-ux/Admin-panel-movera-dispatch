import { useState } from "react";
import { tr } from "../i18n";
import { useLiveSession } from "./LiveSessionContext";

/** The live sign-in (contract §9): e-mail and password through the server; no code field, no demo agent picker. */
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
        <p className="crumb">Movera Admin</p>
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
      </form>
    </main>
  );
}
