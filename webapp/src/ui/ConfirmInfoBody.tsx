import { tr } from "../i18n";
import type { ConfirmInfoProps } from "./ConfirmInfo";
import { confirmParts } from "./confirmDetails";
import type { ReactNode } from "react";

/**
 * What the "!" of a confirm dialog explains (ui/ConfirmInfo.tsx loads this file when it opens). Owner 2026-11-16
 * "Add info details in i and !": five parts always shown: the values before → after, where (every zone or country),
 * who sees it and when, the money effect, and the exact undo. Round 2 (supervisor MF-1, MF-5): this file has no default
 * of its own. Every part comes from confirmParts (ui/confirmDetails.ts): the dialog's own words, else the command's,
 * else "See the details above". A dialog without a command claims nothing about money, zones or time.
 */
export default function ConfirmInfoBody({ what, where, change, changeOf, who, when, money, undo, command = "" }: ConfirmInfoProps) {
  // cfgundo SF-R4-3: the From → to words in the admin's language, one line per value that changes.
  const parts = confirmParts<ReactNode>({ change, changeOf, where, who, when, money, undo, command });
  const block = (line: ReactNode, index: number) => <span key={index} className="confirm-info-line" style={{ display: "block" }}>{line}</span>;
  return (
    <dl className="confirm-info-body" data-testid="confirm-info">
      <dt>{tr("What happens")}</dt><dd>{what}</dd>
      <dt>{tr("From → to")}</dt><dd data-testid="confirm-info-from-to">{parts.fromTo.length > 1 || (!change && changeOf) ? parts.fromTo.map(block) : parts.fromTo[0]}</dd>
      <dt>{tr("Where")}</dt><dd data-testid="confirm-info-where">{parts.where}</dd>
      <dt>{tr("Who sees it, and when")}</dt><dd data-testid="confirm-info-who">{parts.who} {parts.when}</dd>
      <dt>{tr("Money")}</dt><dd data-testid="confirm-info-money">{parts.money}</dd>
      <dt>{tr("How to undo")}</dt><dd data-testid="confirm-info-undo">{parts.undo}</dd>
    </dl>
  );
}
