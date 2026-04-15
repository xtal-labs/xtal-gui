import React from "react";
import {
  FileStack,
  GitBranch,
  Cherry,
  Leaf,
  Database,
  Play,
  Check,
  AlertCircle,
  Clock,
  Zap,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { SyncProgress, SyncPhase, SyncPhaseInfo } from "@/types";

interface SyncProgressPanelProps {
  progress: SyncProgress;
}

// Phase-specific colors: Headers=gray, Stems=yellow, Fruits=green, Leaves=blue
const PHASE_COLORS: Record<string, { bg: string; text: string; completedBg: string; completedText: string }> = {
  SyncingHeaders: {
    bg: "bg-foreground-muted/20",
    text: "text-foreground-muted",
    completedBg: "bg-foreground-muted/30",
    completedText: "text-foreground-secondary",
  },
  SyncingStemBodies: {
    bg: "bg-warning/20",
    text: "text-warning",
    completedBg: "bg-warning/30",
    completedText: "text-warning",
  },
  SyncingFruitHeaders: {
    bg: "bg-success/20",
    text: "text-success",
    completedBg: "bg-success/30",
    completedText: "text-success",
  },
  SyncingLeaves: {
    bg: "bg-info/20",
    text: "text-info",
    completedBg: "bg-info/30",
    completedText: "text-info",
  },
  DownloadingState: {
    bg: "bg-purple-500/20",
    text: "text-purple-500",
    completedBg: "bg-purple-500/30",
    completedText: "text-purple-500",
  },
  ExecutingFromCheckpoint: {
    bg: "bg-primary/20",
    text: "text-primary",
    completedBg: "bg-primary/30",
    completedText: "text-primary",
  },
};

// Phase configuration for full sync path
const FULL_SYNC_PHASES: SyncPhaseInfo[] = [
  {
    id: "SyncingHeaders",
    label: "HEADERS",
    shortLabel: "HEADERS",
    description: "Downloading block headers",
    order: 1,
  },
  {
    id: "SyncingStemBodies",
    label: "STEMS",
    shortLabel: "STEMS",
    description: "Downloading stem blocks",
    order: 2,
  },
  {
    id: "SyncingFruitHeaders",
    label: "FRUITS",
    shortLabel: "FRUITS",
    description: "Validating fruit headers",
    order: 3,
  },
  {
    id: "SyncingLeaves",
    label: "LEAVES",
    shortLabel: "LEAVES",
    description: "Processing leaf blocks",
    order: 4,
  },
];

// Phase configuration for state sync path
const STATE_SYNC_PHASES: SyncPhaseInfo[] = [
  {
    id: "SyncingHeaders",
    label: "HEADERS",
    shortLabel: "HEADERS",
    description: "Downloading block headers",
    order: 1,
  },
  {
    id: "SyncingStemBodies",
    label: "STEMS",
    shortLabel: "STEMS",
    description: "Downloading stem blocks",
    order: 2,
  },
  {
    id: "SyncingFruitHeaders",
    label: "FRUITS",
    shortLabel: "FRUITS",
    description: "Validating fruit headers",
    order: 3,
  },
  {
    id: "DownloadingState",
    label: "STATE",
    shortLabel: "STATE",
    description: "Downloading state snapshot",
    order: 4,
  },
  {
    id: "ExecutingFromCheckpoint",
    label: "EXECUTE",
    shortLabel: "EXECUTE",
    description: "Executing from checkpoint",
    order: 5,
  },
];

// Map phases to icons
const PHASE_ICONS: Record<string, React.ElementType> = {
  SyncingHeaders: FileStack,
  SyncingStemBodies: GitBranch,
  SyncingFruitHeaders: Cherry,
  SyncingLeaves: Leaf,
  DownloadingState: Database,
  ExecutingFromCheckpoint: Play,
};

// Helper functions
function formatSpeed(phase: SyncPhase, itemsPerSecond?: number): string {
  if (!itemsPerSecond) return "--";
  const units: Record<string, string> = {
    SyncingHeaders: "hdrs/s",
    SyncingStemBodies: "stems/s",
    SyncingFruitHeaders: "fruits/s",
    SyncingLeaves: "leaves/s",
    DownloadingState: "chunks/s",
    ExecutingFromCheckpoint: "blks/s",
  };
  return `${itemsPerSecond.toFixed(1)} ${units[phase] || "items/s"}`;
}

function formatEta(seconds?: number): string {
  if (!seconds || seconds <= 0) return "--";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `~${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `~${hours}h ${mins}m`;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return "--";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
}

function getPhaseStatus(
  currentPhase: SyncPhase,
  targetPhase: SyncPhase,
  phases: SyncPhaseInfo[]
): "completed" | "active" | "pending" | "failed" {
  if (currentPhase === "Failed") return "failed";
  if (currentPhase === "Synced") return "completed";
  if (currentPhase === "Idle") return "pending";

  const currentOrder = phases.find((p) => p.id === currentPhase)?.order ?? 0;
  const targetOrder = phases.find((p) => p.id === targetPhase)?.order ?? 0;

  if (targetOrder < currentOrder) return "completed";
  if (targetOrder === currentOrder) return "active";
  return "pending";
}

function getPhaseProgress(phase: SyncPhase, progress: SyncProgress): number {
  switch (phase) {
    case "SyncingHeaders":
      if (progress.targetHeaders !== undefined && progress.headersReceived !== undefined) {
        return progress.targetHeaders > 0
          ? (progress.headersReceived / progress.targetHeaders) * 100
          : 0;
      }
      return 0;
    case "SyncingStemBodies":
    case "SyncingFruitHeaders":
      if (progress.stemsComplete !== undefined && progress.stemsPending !== undefined) {
        const total = progress.stemsComplete + progress.stemsPending;
        return total > 0 ? (progress.stemsComplete / total) * 100 : 0;
      }
      return 0;
    case "SyncingLeaves":
      if (progress.totalLeaves !== undefined && progress.leavesReceived !== undefined) {
        return progress.totalLeaves > 0
          ? (progress.leavesReceived / progress.totalLeaves) * 100
          : 0;
      }
      return 0;
    case "DownloadingState":
      if (progress.totalChunks !== undefined && progress.downloadedChunks !== undefined) {
        return progress.totalChunks > 0
          ? (progress.downloadedChunks / progress.totalChunks) * 100
          : 0;
      }
      return 0;
    case "ExecutingFromCheckpoint":
      if (progress.targetHeight !== undefined && progress.blocksExecuted !== undefined && progress.pivotHeight !== undefined) {
        const total = progress.targetHeight - progress.pivotHeight;
        return total > 0 ? (progress.blocksExecuted / total) * 100 : 0;
      }
      return 0;
    default:
      return 0;
  }
}

function getPhaseLabel(phase: SyncPhase): string {
  const labels: Record<string, string> = {
    Idle: "Idle",
    SyncingHeaders: "Downloading Headers",
    SyncingStemBodies: "Downloading Stems",
    SyncingFruitHeaders: "Validating Fruits",
    SyncingLeaves: "Processing Leaves",
    DownloadingState: "Downloading State",
    ExecutingFromCheckpoint: "Executing Blocks",
    Synced: "Synced",
    Failed: "Failed",
  };
  return labels[phase] || phase;
}

function getPhaseDetails(phase: SyncPhase, progress: SyncProgress): string {
  switch (phase) {
    case "SyncingHeaders":
      return `${(progress.headersReceived ?? 0).toLocaleString()} / ${(progress.targetHeaders ?? 0).toLocaleString()} headers`;
    case "SyncingStemBodies":
      return `${(progress.stemsComplete ?? 0).toLocaleString()} / ${((progress.stemsComplete ?? 0) + (progress.stemsPending ?? 0)).toLocaleString()} stems`;
    case "SyncingFruitHeaders":
      return `${(progress.stemsComplete ?? 0).toLocaleString()} / ${((progress.stemsComplete ?? 0) + (progress.stemsPending ?? 0)).toLocaleString()} validated`;
    case "SyncingLeaves":
      return `${(progress.leavesReceived ?? 0).toLocaleString()} / ${(progress.totalLeaves ?? 0).toLocaleString()} leaves`;
    case "DownloadingState":
      return `${(progress.downloadedChunks ?? 0).toLocaleString()} / ${(progress.totalChunks ?? 0).toLocaleString()} chunks`;
    case "ExecutingFromCheckpoint":
      return `${(progress.blocksExecuted ?? 0).toLocaleString()} / ${((progress.targetHeight ?? 0) - (progress.pivotHeight ?? 0)).toLocaleString()} blocks`;
    default:
      return "";
  }
}

// Phase Step Component
const PhaseStep = React.memo(function PhaseStep({
  phase,
  status,
  isLast,
  nextPhaseCompleted,
}: {
  phase: SyncPhaseInfo;
  status: "completed" | "active" | "pending" | "failed";
  isLast: boolean;
  nextPhaseCompleted: boolean;
}) {
  const Icon = PHASE_ICONS[phase.id] ?? FileStack;
  const colors = PHASE_COLORS[phase.id] ?? PHASE_COLORS.SyncingHeaders;
  const isCompleted = status === "completed";

  return (
    <div className="flex-1 flex flex-col items-center relative">
      {/* Connector line - always show, color based on completion */}
      {!isLast && (
        <div
          className={cn(
            "absolute top-4 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-0.5",
            isCompleted && nextPhaseCompleted ? "bg-border" : "bg-border"
          )}
        />
      )}

      {/* Icon container - use phase-specific colors */}
      <div
        className={cn(
          "relative z-10 w-8 h-8 flex items-center justify-center chamfered-sm transition-all",
          status === "failed" && "bg-destructive/20 text-destructive",
          status === "active" && cn(colors.bg, colors.text, "animate-pulse"),
          status === "pending" && "bg-muted text-foreground-muted",
          status === "completed" && cn(colors.completedBg, colors.completedText)
        )}
      >
        {status === "completed" ? (
          <Check className="h-4 w-4" />
        ) : status === "failed" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>

      {/* Label - use phase-specific colors */}
      <span
        className={cn(
          "mt-1.5 text-[10px] font-heading font-medium tracking-wider",
          status === "failed" && "text-destructive",
          status === "active" && colors.text,
          status === "pending" && "text-foreground-muted",
          status === "completed" && colors.completedText
        )}
      >
        {phase.label}
      </span>
    </div>
  );
});

export function SyncProgressPanel({ progress }: SyncProgressPanelProps) {
  // Determine which sync path we're on
  const isStateSyncPath =
    progress.phase === "DownloadingState" ||
    progress.phase === "ExecutingFromCheckpoint" ||
    progress.downloadedChunks !== undefined;

  const phases = isStateSyncPath ? STATE_SYNC_PHASES : FULL_SYNC_PHASES;
  const isSynced = progress.phase === "Synced" || progress.phase === "Idle";
  const isFailed = progress.phase === "Failed";
  const isActive = !isSynced && !isFailed;

  const currentPhaseProgress = getPhaseProgress(progress.phase, progress);

  return (
    <Card variant="crystalline">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-heading tracking-wide">
            SYNC STATUS
          </CardTitle>
          <Badge
            variant={
              isSynced
                ? "synced"
                : isFailed
                ? "destructive"
                : "syncing"
            }
            diamond
            pulse={isActive}
          >
            {isSynced ? "SYNCED" : isFailed ? "FAILED" : "SYNCING"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Phase Timeline */}
        <div className="flex px-2">
          {phases.map((phase, index) => {
            const status = isSynced
              ? "completed"
              : getPhaseStatus(progress.phase, phase.id, phases);
            const nextPhase = phases[index + 1];
            const nextStatus = nextPhase
              ? isSynced
                ? "completed"
                : getPhaseStatus(progress.phase, nextPhase.id, phases)
              : "pending";
            return (
              <PhaseStep
                key={phase.id}
                phase={phase}
                status={status}
                isLast={index === phases.length - 1}
                nextPhaseCompleted={nextStatus === "completed"}
              />
            );
          })}
        </div>

        {/* Active Phase Detail */}
        {isActive && (
          <div className="mt-4 p-3 chamfered-sm bg-muted/50 space-y-3">
            {/* Phase label */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-heading font-medium text-foreground">
                {getPhaseLabel(progress.phase)}
              </span>
              <span className="text-sm font-mono tabular-nums text-foreground-secondary">
                {currentPhaseProgress.toFixed(1)}%
              </span>
            </div>

            {/* Progress bar */}
            <Progress value={currentPhaseProgress} variant="info" />

            {/* Stats row */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-foreground-secondary">
                {getPhaseDetails(progress.phase, progress)}
              </span>
              <div className="flex items-center gap-3">
                {progress.itemsPerSecond !== undefined && (
                  <span className="flex items-center gap-1 text-foreground-secondary">
                    <Zap className="h-3 w-3" />
                    <span className="font-mono">
                      {formatSpeed(progress.phase, progress.itemsPerSecond)}
                    </span>
                  </span>
                )}
                {progress.estimatedSecondsRemaining !== undefined && (
                  <span className="flex items-center gap-1 text-foreground-secondary">
                    <Clock className="h-3 w-3" />
                    <span className="font-mono">
                      {formatEta(progress.estimatedSecondsRemaining)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Synced state */}
        {isSynced && (
          <div className="mt-2 p-3 chamfered-sm bg-success/10 flex items-center justify-center">
            <Check className="h-4 w-4 text-success mr-2" />
            <span className="text-sm font-heading text-success">
              Blockchain fully synchronized
            </span>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="mt-2 p-3 chamfered-sm bg-destructive/10 space-y-2">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-destructive mr-2" />
              <span className="text-sm font-heading text-destructive">
                Sync failed
              </span>
            </div>
            {progress.failureReason && (
              <p className="text-xs text-destructive/80 font-mono">
                {progress.failureReason}
              </p>
            )}
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-foreground-muted">
          {progress.syncPeer && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="font-mono">
                {progress.syncPeer.slice(0, 12)}...
              </span>
            </span>
          )}
          {progress.startedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className="font-mono">
                Started {formatTimeAgo(progress.startedAt)}
              </span>
            </span>
          )}
          {!progress.syncPeer && !progress.startedAt && (
            <span className="font-mono">
              Overall: {isSynced ? "100" : progress.progressPercent.toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SyncProgressPanel;
