import { useState } from "react";
import { Globe } from "lucide-react";
import { tr } from "./core";
import { useLanguage } from "./I18nProvider";
import { ADMIN_LANGUAGES, LANGUAGE_NATIVE_NAME } from "./languages";
import { chooseSignInLanguage } from "./signInLanguage";

/**
 * Owner G1-D2 ("Computer language + globe (Recommended)"): the globe on the pages shown before sign-in. It opens
 * Svenska / Français / English; the choice switches the page at once and is remembered on this computer.
 */
export function SignInLanguageGlobe() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className="login-globe" data-testid="sign-in-globe">
      <button
        type="button"
        className="login-globe-btn"
        data-command="admin.auth.signInLanguage"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={tr("Language: {0}", [LANGUAGE_NATIVE_NAME[language]])}
        title={tr("Language: {0}", [LANGUAGE_NATIVE_NAME[language]])}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={16} aria-hidden="true" /> {language.toUpperCase()}
      </button>
      {open ? (
        <ul className="login-globe-list" role="group" aria-label={tr("Language")}>
          {ADMIN_LANGUAGES.map((code) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                data-command="admin.auth.signInLanguage"
                aria-pressed={code === language}
                className={code === language ? "active" : undefined}
                onClick={() => {
                  setOpen(false);
                  chooseSignInLanguage(code);
                }}
              >
                {LANGUAGE_NATIVE_NAME[code]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
