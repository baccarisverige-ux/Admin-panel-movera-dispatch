import { tr } from "../i18n";
import type { ConfirmInfoProps } from "./ConfirmInfo";
import { undoFor, whoFor } from "./confirmInfo";

/**
 * What the "!" of a confirm dialog explains (ui/ConfirmInfo.tsx loads this file when it opens). Supervisor SF-R2-2:
 * without words of its own a dialog says nothing it cannot know ("See the details above"), never "no other zone".
 */
export default function ConfirmInfoBody({ what, where, change, who, undo, command }: ConfirmInfoProps) {
  return (
    <dl className="confirm-info-body" data-testid="confirm-info">
      <dt>{tr("What happens")}</dt><dd>{what}</dd>
      <dt>{tr("Where")}</dt><dd>{where ?? tr("See the details above for what this changes.")}</dd>
      {change ? <><dt>{tr("From → to")}</dt><dd>{change}</dd></> : null}
      <dt>{tr("Who it affects")}</dt><dd>{who ?? (command ? tr(whoFor(command)) : tr("See the details above for who this reaches."))}</dd>
      <dt>{tr("How to undo")}</dt><dd>{undo ?? tr(undoFor(command ?? ""))}</dd>
    </dl>
  );
}
