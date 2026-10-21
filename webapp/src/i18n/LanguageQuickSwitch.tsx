import { Languages } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "../ui/CommandButton";
import { tr } from "./core";
import { useLanguage } from "./I18nProvider";
import { languageSetting } from "./ProfileMenu";
import { ADMIN_LANGUAGES, LANGUAGE_NATIVE_NAME, languageOptionLabel, type AppLanguage } from "./languages";

/**
 * EN · FR · SV in one tap. The same per-admin setting as My profile › Panel language: the choice is saved for this
 * admin only, logged in My activity, and wins over the country default. The language in use is marked and disabled.
 */
export function LanguageQuickSwitch({ compact = false }: { compact?: boolean }) {
  const { agent, agents, setAgents } = useSession();
  const language = useLanguage();
  if (!agent) return null;
  const choose = (next: AppLanguage) => setAgents(agents.map((item) => (item.id === agent.id ? { ...item, language: next } : item)));
  return (
    <div className={compact ? "lang-switch compact" : "lang-switch"} role="group" aria-label={tr("Panel language")} data-testid="language-quick-switch">
      <Languages size={14} aria-hidden="true" />
      {ADMIN_LANGUAGES.map((code) => {
        const active = language.language === code;
        return (
          <CommandButton
            key={code}
            command="admin.profile.language"
            className={active ? "lang-switch-btn active" : "lang-switch-btn"}
            targetId={agent.id}
            confirmTarget={false}
            before={languageSetting(language.chosen, language.defaultLanguage)}
            after={languageSetting(code, language.defaultLanguage)}
            disabled={active}
            title={active ? tr("The panel is in {0}.", [LANGUAGE_NATIVE_NAME[code]]) : tr("Switch the panel to {0}", [LANGUAGE_NATIVE_NAME[code]])}
            aria-label={languageOptionLabel(code)}
            onDone={() => choose(code)}
          >
            {code.toUpperCase()}
          </CommandButton>
        );
      })}
    </div>
  );
}
