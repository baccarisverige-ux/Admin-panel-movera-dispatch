/** Scope ids as names: "Standard Sweden", "Norrmalm". Small on purpose: the dialog shell (ui/CommandButton.tsx) loads it at once. */
import { trx, tr } from "../i18n/core.ts";
import { COUNTRY_LABEL } from "../i18n/countries.ts";
import { zoneById } from "../markets/markets.ts";

export const scopeName = (id: string): string => (/^standard-/.test(id) ? tr("Standard {0}", [trx(COUNTRY_LABEL[id.slice(9) as keyof typeof COUNTRY_LABEL] ?? id.slice(9))]) : zoneById(id)?.name ?? id);

/** The scopes as names, for the "!" of a dialog without a zone pick. */
export const scopeNames = (scope: string | undefined): string => (scope ?? "").split(",").filter((id) => /^standard-[A-Z]{2}$/.test(id) || zoneById(id)).map(scopeName).join(", ");
