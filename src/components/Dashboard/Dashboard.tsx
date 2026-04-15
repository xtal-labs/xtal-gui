import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Blocks,
  Users,
  TrendingUp,
  Layers,
  Shield,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { HashDisplay, StatusBadge } from "@/components/common";
import { useBlockchainStore, useMiningStore, useNetworkStore, useValidatorStore } from "@/stores";
import {
  formatBlockHeight,
  formatHashRateMH,
  formatDuration,
  formatBytes,
  formatXtal,
  cn,
} from "@/lib/utils";
import type { SyncProgress } from "@/types";

interface MempoolInfo {
  total_transactions: number;
  size_bytes: number;
  utxo_count: number;
  vm_count: number;
  oldest_age_secs: number | null;
  transaction_count_by_type: Record<string, number>;
}

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

export default function Dashboard() {
  // Blockchain data comes from WebSocket (handled in App.tsx)
  const {
    leafHeight,
    stemsSinceLastLeaf,
    bestBlockHash,
    isSynced,
    syncProgress,
  } = useBlockchainStore();

  const { stats: miningStats, isActive: isMining } = useMiningStore();
  const { peerCount, inboundCount, outboundCount } = useNetworkStore();
  const {
    isRunning: isValidating,
    matureStake,
    pendingStake,
    totalFruitsProduced,
    address: validatorAddress,
  } = useValidatorStore();
  const totalStake = matureStake + pendingStake;

  // Mempool polling (no dedicated store — fetch on-demand)
  const [mempoolInfo, setMempoolInfo] = useState<MempoolInfo | null>(null);

  useEffect(() => {
    const fetchMempool = async () => {
      try {
        const info = await invoke<MempoolInfo>("get_mempool_info");
        setMempoolInfo(info);
      } catch (err) {
        console.error("Failed to fetch mempool info:", err);
      }
    };

    fetchMempool();
    const interval = setInterval(fetchMempool, 5000);
    return () => clearInterval(interval);
  }, []);

  // Calculate sync percentage
  const syncPercent = syncProgress.progressPercent ?? (isSynced ? 100 : 0);
  const blocksFound = miningStats.stemsFound + miningStats.leavesFound;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            DASHBOARD
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Crystal Node Overview
          </p>
        </div>
        <StatusBadge status={
          isSynced ? "synced"
          : peerCount === 0 ? "no_peers"
          : syncProgress.phase === "Idle" ? "synced"
          : "syncing"
        } />
      </div>

      {/* Top Row — 3 compact stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
        {/* Leaf Height */}
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              LEAF HEIGHT
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-crystal-leaf/20">
              <Blocks className="h-3.5 w-3.5 text-crystal-leaf" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {formatBlockHeight(leafHeight)}
            </div>
            <p className="text-xs text-foreground-muted mt-1 font-mono">
              + {stemsSinceLastLeaf} stems
            </p>
          </CardContent>
        </Card>

        {/* Peers */}
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              CONNECTED PEERS
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-primary/20">
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">{peerCount}</div>
            <p className="text-xs text-foreground-muted mt-1 font-mono">
              {inboundCount} in / {outboundCount} out
            </p>
          </CardContent>
        </Card>

        {/* Mempool */}
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              MEMPOOL
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-primary/20">
              <Layers className="h-3.5 w-3.5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {mempoolInfo?.total_transactions ?? 0}
            </div>
            <p className="text-xs text-foreground-muted mt-1 font-mono">
              {formatBytes(mempoolInfo?.size_bytes ?? 0)}
              {" "}&bull;{" "}
              {mempoolInfo?.utxo_count ?? 0} utxo / {mempoolInfo?.vm_count ?? 0} vm
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row — 2 wider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
        {/* Mining (consolidated) */}
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              MINING
            </CardTitle>
            <div className={cn("icon-hex icon-hex-sm", isMining ? "bg-success/20" : "bg-muted")}>
              <Zap className={cn("h-3.5 w-3.5", isMining ? "text-success" : "text-foreground-muted")} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {isMining ? formatHashRateMH(miningStats.hashRateMH) : "--"}
            </div>
            <p className="text-xs text-foreground-muted mt-1 font-mono">
              {isMining
                ? `${formatDuration(miningStats.uptime)} uptime \u2022 ${blocksFound} block${blocksFound !== 1 ? "s" : ""} found`
                : "Mining stopped"
              }
            </p>
          </CardContent>
        </Card>

        {/* Validator */}
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              VALIDATOR
            </CardTitle>
            <div className={cn("icon-hex icon-hex-sm", isValidating ? "bg-success/20" : "bg-muted")}>
              <Shield className={cn("h-3.5 w-3.5", isValidating ? "text-success" : "text-foreground-muted")} />
            </div>
          </CardHeader>
          <CardContent>
            {validatorAddress ? (
              <>
                <div className="text-2xl font-heading font-bold tabular-nums">
                  {totalStake > 0 ? formatXtal(totalStake) : "No stake"}
                </div>
                <p className="text-xs text-foreground-muted mt-1 font-mono">
                  {isValidating ? "Active" : "Inactive"}
                  {" "}&bull;{" "}
                  {totalFruitsProduced} fruit{totalFruitsProduced !== 1 ? "s" : ""} produced
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-heading font-bold tabular-nums text-foreground-muted">
                  --
                </div>
                <p className="text-xs text-foreground-muted mt-1 font-mono">
                  No validator loaded
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync Progress (shown when syncing) */}
      {!isSynced && syncProgress.phase !== "Idle" && syncProgress.phase !== "Synced" && (
        <Card variant="crystalline">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading tracking-wide">SYNC PROGRESS</CardTitle>
              <Badge variant="syncing" diamond pulse>
                {syncProgress.phase}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={syncPercent} variant="info" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground-secondary font-mono">
                {getSyncDetail(syncProgress)}
              </span>
              <span className="font-heading font-medium tabular-nums">{syncPercent.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Best Block */}
      {bestBlockHash && (
        <Card variant="crystalline">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
              <div className="icon-hex icon-hex-sm bg-primary/20">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              </div>
              BEST BLOCK
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="font-mono">
                <HashDisplay hash={bestBlockHash} chars={16} />
              </div>
              <Badge variant="success" diamond>Active Tip</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
