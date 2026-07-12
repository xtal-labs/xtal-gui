import { Zap } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useMiningStore } from "@/stores";
import { formatHashRateMH, formatDuration, cn } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function MiningWidget({ size, shellProps }: WidgetProps) {
  const miningStats = useMiningStore((s) => s.stats);
  const isMining = useMiningStore((s) => s.isActive);
  const blocksFound = miningStats.stemsFound + miningStats.leavesFound;

  return (
    <WidgetShell
      title="MINING"
      icon={
        <WidgetIcon
          icon={Zap}
          wrapClass={isMining ? "bg-success/20" : "bg-muted"}
          iconClass={isMining ? "text-success" : "text-foreground-muted"}
        />
      }
      {...shellProps}
    >
      <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
        {isMining ? formatHashRateMH(miningStats.hashRateMH) : "--"}
      </div>
      <p className="text-xs text-foreground-muted mt-1 font-mono">
        {isMining
          ? `${formatDuration(miningStats.uptime)} uptime • ${blocksFound} block${blocksFound !== 1 ? "s" : ""} found`
          : "Mining stopped"
        }
      </p>
    </WidgetShell>
  );
}
