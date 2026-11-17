import { tr } from "../i18n";
import type { ConfirmInfoProps } from "./ConfirmInfo";
import { undoFor, whoFor } from "./confirmInfo";
import { fromToFallbackFor, moneyFor, whenFor, whereFallbackFor } from "./confirmDetails";
import { fromToLines } from "./fromTo";

/**
 * What the "!" of a confirm dialog explains (ui/ConfirmInfo.tsx loads this file when it opens). Supervisor SF-R2-2:
 * without words of its own a dialog says nothing it cannot know ("See the details above"), never "no other zone".
 * Owner 2026-11-16 "Add info details in i and !": five parts always shown (ui/confirmDetails.ts): the values
 * before → after, where (every zone or country), who sees it and when, the money effect, and the exact undo.
 */
export default function ConfirmInfoBody({ what, where, change, changeOf, who, undo, command = "" }: ConfirmInfoProps) {
  // cfgundo SF-R4-3: the From → to words in the admin's language, one line per value that changes.
  const lines = change ? [] : changeOf ? fromToLines(changeOf) : [];
  const block = (line: string, index: number) => <span key={index} className="confirm-info-line" style={{ display: "block" }}>{line}</span>;
  const fromTo = change ?? (lines.length ? lines.map(block) : tr(fromToFallbackFor(command)));
  return (
    <dl className="confirm-info-body" data-testid="confirm-info">
      <dt>{tr("What happens")}</dt><dd>{what}</dd>
      <dt>{tr("From → to")}</dt><dd data-testid="confirm-info-from-to">{fromTo}</dd>
      <dt>{tr("Where")}</dt><dd data-testid="confirm-info-where">{where ?? tr(whereFallbackFor(command))}</dd>
      <dt>{tr("Who sees it, and when")}</dt><dd data-testid="confirm-info-who">{who ?? (command ? tr(whoFor(command)) : tr("See the details above for who this reaches."))} {tr(whenFor(command))}</dd>
      <dt>{tr("Money")}</dt><dd data-testid="confirm-info-money">{tr(moneyFor(command))}</dd>
      <dt>{tr("How to undo")}</dt><dd data-testid="confirm-info-undo">{undo ?? tr(undoFor(command))}</dd>
    </dl>
  );
}
