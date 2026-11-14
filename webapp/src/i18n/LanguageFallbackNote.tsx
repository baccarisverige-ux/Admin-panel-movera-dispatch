import { tr } from "./core";
import { useLanguage } from "./I18nProvider";
import { LANGUAGE_NATIVE_NAME } from "./languages";

/**
 * BQ-A27: shown next to the language pickers when the admin's language file could not load after every try, so the
 * panel is in English: "Could not load Svenska, showing English." and a button to try again.
 */
export function LanguageFallbackNote() {
  const { fallbackFrom, retry } = useLanguage();
  if (!fallbackFrom) return null;
  return (
    <p className="lang-fallback-note" role="status" data-testid="language-fallback-note">
      {tr("Could not load {0}, showing English.", [LANGUAGE_NATIVE_NAME[fallbackFrom]])}{" "}
      <button type="button" className="link-btn" data-command="admin.shell.languageRetry" onClick={retry}>{tr("Try again")}</button>
    </p>
  );
}
