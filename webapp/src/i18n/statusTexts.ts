/**
 * Sentences of the command status line ("Done. Saved in demo.", "Failed. Your role cannot do that.", "Checking…").
 * The line is translated sentence by sentence where it is shown (trSentences); sentences not listed stay in English.
 */
export const STATUS_LINE_TEXTS = [
  "Done.",
  "Failed.",
  "Saved in demo.",
  "Pending approval.",
  "A second authorised agent must decide this action.",
  "Checking…",
  "The server is taking longer than usual; this updates to Done or Failed.",
  "Please wait: another action is still running.",
  "The server could not be reached to confirm it.",
  "Retry uses the same operation key, so it is never done twice.",
  "Retry uses the same operation key.",
  "The server has no record of it, so nothing changed.",
  "Sign in again.",
  "A reason is required.",
  "Your role cannot do that.",
  "That record is outside your active scope.",
  "Someone else changed this.",
  "Reload and review the newest version.",
  "Someone else changed this configuration draft.",
  "Reload and review the newest draft.",
  "Choose an admin cancel reason.",
  "A request for this is already waiting for a second admin.",
  "Trip not found.",
  "Nothing changed.",
  "Rejected",
] as const;
