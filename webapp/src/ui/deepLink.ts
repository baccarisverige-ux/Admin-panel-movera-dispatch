/**
 * G5 admin bug (2026-10-30 re-check): a link to a trip (…/live/trips/T123) opened the Dashboard. GitHub Pages answers
 * an unknown path with 404.html, whose script sent every /live/ path to the live start page and dropped the rest.
 * Now 404.html keeps the page in ?p= (pages.yml) and the app puts it back before the router mounts.
 */

/** The path to restore from a start URL's search ("?p=/trips/T123&x=1" under base "/live" → "/live/trips/T123?x=1"), or null. */
export function restoredPath(search: string, base: string): string | null {
  const params = new URLSearchParams(search);
  const wanted = params.get("p");
  if (!wanted || !wanted.startsWith("/") || wanted.startsWith("//") || wanted.includes("://")) return null;
  params.delete("p");
  const [pathAndQuery, hash = ""] = wanted.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const merged = new URLSearchParams(query);
  for (const [key, value] of params) if (!merged.has(key)) merged.set(key, value);
  const root = base.replace(/\/$/, "");
  const q = merged.toString();
  return `${root}${path}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}

/** Runs once at start-up: the browser URL becomes the page the admin opened, with no reload. */
export function restoreDeepLink(location: { search: string; pathname: string }, base: string, replace: (url: string) => void): boolean {
  const next = restoredPath(location.search, base);
  if (!next) return false;
  replace(next);
  return true;
}
