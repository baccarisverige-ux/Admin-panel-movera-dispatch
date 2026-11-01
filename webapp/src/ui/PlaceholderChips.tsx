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

/** Page audit round 2: a text with its {name} values shown as chips in place (the Driver notifications list), not filled with sample words. */
export function TextWithChips({ text }: { text: string }) {
  const parts = (text ?? "").split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/g).filter(Boolean);
  return <>{parts.map((part, index) => (/^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(part) ? <code key={index} className="ph-chip">{part}</code> : part))}</>;
}
