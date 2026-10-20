import { useState } from "react";
import { DEMO_CODE, DEMO_PASSWORD } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { SIGN_IN_LOG_KEY, readSignInLog, withSignIn } from "../auth/signInLog";
import { CommandButton } from "../ui/CommandButton";

export function LoginPage() {
  const session = useSession();
  const [email, setEmail] = useState("nora@movera.se");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [code, setCode] = useState(DEMO_CODE);

  return (
    <main className="login-screen">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          const agent = session.signInWith(email, password, code);
          if (!agent) return;
          const log = readSignInLog(localStorage.getItem(SIGN_IN_LOG_KEY));
          localStorage.setItem(
            SIGN_IN_LOG_KEY,
            JSON.stringify(withSignIn(log, agent.id, agent.email, new Date().toISOString())),
          );
        }}
      >
        <p className="crumb">Movera Admin · Demo</p>
        <h1>Sign in</h1>
        <p>Demo password <strong>{DEMO_PASSWORD}</strong> and code <strong>{DEMO_CODE}</strong>. This is not a production login.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <label>
          6-digit code
          <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        {session.error ? <p className="state-line">{session.error}</p> : null}
        <button className="primary-btn" type="submit" data-command="admin.auth.signIn">
          Sign in
        </button>
        <ul className="demo-agents">
          {session.agents.filter((agent) => agent.active).map((agent) => (
            <li key={agent.id}>
              <CommandButton command="admin.auth.pickAgent" type="button"
                className="link-action" onDone={() => {
                  setEmail(agent.email);
                  setPassword(DEMO_PASSWORD);
                  setCode(DEMO_CODE);
                }}>
                {agent.name} · {agent.role}
              </CommandButton>
            </li>
          ))}
        </ul>
      </form>
    </main>
  );
}
