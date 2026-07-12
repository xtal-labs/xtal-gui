import { Activity } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBlockchainStore } from "@/stores";
import type { SyncProgress } from "@/types";
import type { WidgetProps } from "./registry";

function getSyncDetail(progress: SyncProgress): string {
  switch (progress.phase) {
    case "SyncingHeaders":
      return `${(progress.headersReceived ?? 0).toLocaleString()} / ${(progress.targetHeaders ?? 0).toLocaleString()} headers`;
    case "SyncingStemBodies":
      return `${(progress.stemsComplete ?? 0).toLocaleString()} / ${((progress.stemsComplete ?? 0) + (progress.stemsPending ?? 0)).toLocaleString()} stems`;
    case "SyncingFruitHeaders":
      return `${(progress.stemsComplete ?? 0).toLocaleString()} / ${((progress.stemsComplete ?? 0) + (progress.stemsPending ?? 0)).toLocaleString()} validated`;
    case "SyncingLeaves":
      return `${(progress.leavesReceived ?? 0).toLocaleString()} / ${(progress.totalLeaves ?? 0).toLocaleString()} leaves`;
    case "DownloadingState":
      return `${(progress.downloadedChunks ?? 0).toLocaleString()} chunks`;
    case "ExecutingFromCheckpoint":
      return `${(progress.blocksExecuted ?? 0).toLocaleString()} / ${((progress.targetHeight ?? 0) - (progress.pivotHeight ?? 0)).toLocaleString()} blocks`;
    default:
      return "";
  }
}

export default function SyncProgressWidget({ shellProps }: WidgetProps) {
  const isSynced = useBlockchainStore((s) => s.isSynced);
  const syncProgress = useBlockchainStore((s) => s.syncProgress);
  const leafHeight = useBlockchainStore((s) => s.leafHeight);

  const syncing =
    !isSynced && syncProgress.phase !== "Idle" && syncProgress.phase !== "Synced";
  const syncPercent = syncProgress.progressPercent ?? (isSynced ? 100 : 0);

  return (
    <WidgetShell
      title="SYNC PROGRESS"
      icon={<WidgetIcon icon={Activity} />}
      headerRight={
        syncing ? (
          <Badge variant="syncing" diamond pulse>
            {syncProgress.phase}
          </Badge>
        ) : (
          <Badge variant="success" diamond>
            SYNCED
          </Badge>
        )
      }
      {...shellProps}
    >
      {syncing ? (
        <div className="space-y-3">
          <Progress value={syncPercent} variant="info" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-secondary font-mono">
              {getSyncDetail(syncProgress)}
            </span>
            <span className="font-heading font-medium tabular-nums">
              {syncPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground-muted font-mono">
          Chain is up to date at leaf height {leafHeight.toLocaleString()}
        </p>
      )}
    </WidgetShell>
  );
}
