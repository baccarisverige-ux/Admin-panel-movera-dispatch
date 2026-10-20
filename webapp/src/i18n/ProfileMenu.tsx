import { useEffect, useRef, useState } from "react";
import { useSession } from "../auth/SessionContext";
import { ROLE_LABELS } from "../auth/permissions";
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "./core";
import { trn } from "./nodes";
import { useLanguage } from "./I18nProvider";
import { ADMIN_LANGUAGES, isAppLanguage, languageOptionLabel, type AppLanguage } from "./languages";
import { COUNTRY_LABEL } from "./countries";

/** What the admin's language setting says, for My activity's before and after. */
export function languageSetting(chosen: AppLanguage | undefined, defaultLanguage: AppLanguage): string {
  return chosen ? chosen : `${defaultLanguage} (country default)`;
}

/**
 * The admin's own profile, opened from the avatar in the top bar: who is signed in and the panel language.
 * The choice is saved for this admin only, logged in My activity, and wins over the country default.
 */
export function ProfileMenu({ initials }: { initials: string }) {
  const { agent, agents, setAgents } = useSession();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppLanguage | "">(language.chosen ?? "");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!agent) return <div className="avatar">{initials}</div>;
  const me = agents.find((item) => item.id === agent.id) ?? agent;
  const next = draft === "" ? undefined : draft;
  const unchanged = next === language.chosen;

  function save() {
    setAgents(agents.map((item) => (item.id === agent!.id ? { ...item, language: next } : item)));
  }

  return (
    <div ref={root} className="profile-wrap">
      <button
        ref={button}
        type="button"
        className="avatar profile-btn"
        aria-label={tr("My profile")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="profile-menu"
        data-command="admin.shell.menu"
        data-testid="profile-button"
        onClick={() => {
          setDraft(language.chosen ?? "");
          setOpen((value) => !value);
        }}
      >
        {initials}
      </button>
      {open ? (
        <section id="profile-menu" className="profile-menu" role="dialog" aria-label={tr("My profile")}>
          <h3>{tr("My profile")}</h3>
          <p className="profile-menu-who"><b>{me.name}</b><br />{me.email} · {trx(ROLE_LABELS[me.role])}</p>
          <label className="profile-menu-field">
            {tr("Panel language")}
            <select aria-label={tr("Panel language")} value={draft} onChange={(event) => setDraft(isAppLanguage(event.target.value) ? event.target.value : "")}>
              <option value="">{tr("Country default ({0})", [languageOptionLabel(language.defaultLanguage)])}</option>
              {ADMIN_LANGUAGES.map((code) => <option key={code} value={code}>{languageOptionLabel(code)}</option>)}
            </select>
          </label>
          <p className="profile-menu-help">
            {language.source === "build"
              ? tr("This build starts every admin in {0}.", [languageOptionLabel(language.defaultLanguage)])
              : trn("The default for {0} is {1}, set in Settings › Payment methods and languages per country. Your choice is saved for you only.", trx(COUNTRY_LABEL[language.country]), <b>{languageOptionLabel(language.defaultLanguage)}</b>)}
          </p>
          <CommandButton
            command="admin.profile.language"
            className="primary-btn"
            targetId={agent.id}
            confirmTarget={false}
            before={languageSetting(language.chosen, language.defaultLanguage)}
            after={languageSetting(next, language.defaultLanguage)}
            disabled={unchanged}
            onDone={save}
          >
            {tr("Save language")}
          </CommandButton>
        </section>
      ) : null}
    </div>
  );
}
