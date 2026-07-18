import { Shield } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useValidatorStore } from "@/stores";
import { formatXtal, cn, toShards, addShards } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function ValidatorWidget({ size, shellProps }: WidgetProps) {
  const isValidating = useValidatorStore((s) => s.isRunning);
  const activeStake = useValidatorStore((s) => s.effectiveStake);
  const withdrawableStake = useValidatorStore((s) => s.withdrawableStake);
  const pendingStake = useValidatorStore((s) => s.pendingStake);
  const totalFruitsProduced = useValidatorStore((s) => s.totalFruitsProduced);
  const validatorAddress = useValidatorStore((s) => s.address);
  const totalStake = addShards(withdrawableStake, pendingStake);

  return (
    <WidgetShell
      title="VALIDATOR"
      icon={
        <WidgetIcon
          icon={Shield}
          wrapClass={isValidating ? "bg-success/20" : "bg-muted"}
          iconClass={isValidating ? "text-success" : "text-foreground-muted"}
        />
      }
      {...shellProps}
    >
      {validatorAddress ? (
        <>
          <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
            {toShards(activeStake) > 0n ? formatXtal(activeStake) : "No active stake"}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            Active stake
            {totalStake !== toShards(activeStake) && <> &bull; {formatXtal(totalStake)} total</>}
          </p>
          <p className="text-xs text-foreground-muted mt-0.5 font-mono">
            {isValidating ? "Active" : "Inactive"}
            {" "}&bull;{" "}
            {totalFruitsProduced} fruit{totalFruitsProduced !== 1 ? "s" : ""} produced
          </p>
        </>
      ) : (
        <>
          <div className={cn("font-heading font-bold tabular-nums text-foreground-muted", VALUE_SIZE_CLASSES[size])}>
            --
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            No validator loaded
          </p>
        </>
      )}
    </WidgetShell>
  );
}
