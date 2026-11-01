import { tr } from "../i18n";

/** The {name} values inside a text, in order, once each. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...(text ?? "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!))];
}

/**
 * Page audit 2026-11-01: the {time}, {companyName}… inside a text are values the app or server fills in, not typos.
 * They are shown as chips with a short hint so the admin keeps them.
 */
export function PlaceholderChips({ text }: { text: string }) {
  const names = placeholdersIn(text);
  if (!names.length) return null;
  return (
    <span className="ph-chips" data-testid="placeholder-chips">
      <small>{tr("Filled in by the app:")}</small>
      {names.map((name) => <code key={name} className="ph-chip">{`{${name}}`}</code>)}
    </span>
  );
}
