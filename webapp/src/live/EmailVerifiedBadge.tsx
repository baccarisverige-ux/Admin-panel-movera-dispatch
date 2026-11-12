import { emailBadge } from "./emailVerified";

/** G30 (contract v0.18.76): Verified (title: the date) / Not verified after a live e-mail; nothing without an e-mail. */
export function EmailVerifiedBadge({ email, verifiedAt }: { email?: string; verifiedAt?: string }) {
  const badge = emailBadge(email, verifiedAt);
  if (!badge) return null;
  return <span className={`email-badge ${badge.tone}`} data-testid="email-verified" data-verified={badge.tone === "ok" ? "yes" : "no"} title={badge.title}>{badge.label}</span>;
}
