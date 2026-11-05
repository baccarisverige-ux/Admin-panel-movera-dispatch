import type { MarketId } from "./markets.ts";
import { resolveScope, type ResolvedScope, type ScopeAccess } from "./scope.ts";

/**
 * The country the admin opens on (Rules A9, owner 2026-11-05: the LAST COUNTRY USED). Remembered per admin in browser storage; an empty or broken storage
 * falls back to the default (the first country the admin may open). Kept apart from the hook so it is tested alone.
 */
const REMEMBER_KEY = "movera-admin-country";

export function rememberedCountry(agentId: string | undefined): string | null {
  if (!agentId) return null;
  try {
    return localStorage.getItem(`${REMEMBER_KEY}:${agentId}`);
  } catch {
    return null;
  }
}

export function rememberCountry(agentId: string | undefined, id: MarketId): void {
  if (!agentId) return;
  try {
    localStorage.setItem(`${REMEMBER_KEY}:${agentId}`, id);
  } catch {
    // Remembering is a convenience; the URL still carries the choice.
  }
}

/** What every screen reads: the URL (`country`, `scope`), else the remembered country, else the default. */
/** Owner A9 (2026-11-05): a country the URL names (a page picker, a link, zones) is the last one used: remember it. */
export function scopeFor(access: ScopeAccess, agentId: string | undefined, url: { country?: string | null; scope?: string | null }): ResolvedScope {
  const remembered = rememberedCountry(agentId);
  const resolved = resolveScope(access, { ...url, remembered });
  if ((url.country || url.scope) && !resolved.denied && resolved.country !== remembered) rememberCountry(agentId, resolved.country);
  return resolved;
}
