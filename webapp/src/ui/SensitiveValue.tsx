import { useState } from "react";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { CommandButton } from "./CommandButton";
import { tr, trn, trx } from "../i18n";

type SensitiveValueProps = {
  value: string;
  permission: "drivers.viewSensitive" | "riders.viewSensitive";
  command: "admin.driver.revealSensitive" | "admin.rider.revealSensitive";
  targetId: string;
  label?: string;
};

function masked(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return `•••• ${compact.slice(-4)}`;
}

export function SensitiveValue({ value, permission, command, targetId, label = "Sensitive" }: SensitiveValueProps) {
  const { agent } = useSession();
  const [revealed, setRevealed] = useState(false);
  const permitted = Boolean(agent && can(agent.role, permission));

  if (!permitted) return <span title={tr("Your role cannot reveal this value.")}>{trn("{0}: restricted", label)}</span>;
  if (revealed) return <span>{trx(label)}: {value}</span>;

  return (
    <span>
      {trx(label)}: {masked(value)}{" "}
      <CommandButton
        command={command}
        className="link-action"
        type="button"
        targetId={targetId}
        before="masked"
        after="revealed"
        onDone={() => setRevealed(true)}
      >{tr("Reveal")}</CommandButton>
    </span>
  );
}
