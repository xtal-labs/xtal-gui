import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import {
  LayoutDashboard,
  Pickaxe,
  Shield,
  Wallet,
  Waypoints,
  Globe,
  Blocks,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  WifiOff,
  RotateCcw,
  Menu,
  X,
} from "lucide-react";

import { ThemeProvider, LoadingScreen, NodeStartupError, BootstrapScreen } from "@/components/common";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, ToastContainer } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatXtalFull } from "@/lib/utils";

import { useUiStore, useBlockchainStore, useNetworkStore, useMiningStore, useWalletStore, useValidatorStore, type Tab, type NodeConnectionState } from "@/stores";
import { useNodeWebSocket, useTauriEvent, useMediaQuery, type WebSocketMessage } from "@/hooks";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useDiagnosticMonitor, useRenderTracker } from "@/hooks/useDiagnosticMonitor";
import type {
  BlockSummary,
  BootstrapPhase,
  FruitProductionStats,
  GuiEvent,
  MinedBlock,
  MiningStats,
  StartupErrorInfo,
  StartupStage,
  StartupStatus,
  SyncProgress,
  GuiConfig,
  WalletStatus,
} from "@/types";

// Panels
import Dashboard from "@/components/Dashboard/Dashboard";
const BlockExplorer = lazy(() => import("@/components/Explorer/BlockExplorer"));
const Mining = lazy(() => import("@/components/Mining/Mining"));
import Mempool from "@/components/Mempool/Mempool";
const ValidatorPanel = lazy(() => import("@/components/Validator/Validator"));
const WalletPanel = lazy(() => import("@/components/Wallet/Wallet"));
const Gateway = lazy(() => import("@/components/Gateway/Gateway"));
import Network from "@/components/Network/Network";
import RpcConsole from "@/components/RpcConsole/RpcConsole";
import SettingsPanel from "@/components/Settings/Settings";
import { SetupWizard } from "@/components/SetupWizard";

// Geometric Crystal Logo Component
function CrystalLogo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("crystal-logo", className)}
    >
      {/* Main crystal body - hexagonal prism */}
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        fill="url(#crystalGradient)"
        stroke="url(#crystalEdge)"
        strokeWidth="0.5"
      />
      {/* Left facet */}
      <path
        d="M4 9L16 16V30L4 23V9Z"
        fill="hsl(var(--crystal-facet-dark))"
        fillOpacity="0.4"
      />
      {/* Right facet */}
      <path
        d="M28 9L16 16V30L28 23V9Z"
        fill="hsl(var(--crystal-facet-light))"
        fillOpacity="0.3"
      />
      {/* Top facet highlight */}
      <path
        d="M16 2L28 9L16 16L4 9L16 2Z"
        fill="hsl(var(--crystal-facet-light))"
        fillOpacity="0.5"
      />
      {/* Inner refraction line */}
      <path
        d="M10 7L22 14"
        stroke="hsl(var(--primary-foreground))"
        strokeOpacity="0.3"
        strokeWidth="0.5"
      />
      {/* Center vertical axis */}
      <path
        d="M16 2V16"
        stroke="hsl(var(--primary-foreground))"
        strokeOpacity="0.15"
        strokeWidth="0.5"
      />
      <defs>
        <linearGradient id="crystalGradient" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="50%" stopColor="hsl(var(--accent))" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </linearGradient>
        <linearGradient id="crystalEdge" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(var(--crystal-facet-light))" />
          <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--crystal-facet-dark))" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface NavItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "mining", label: "Mining", icon: Pickaxe },
  { id: "mempool", label: "Mempool", icon: Layers },
  { id: "validator", label: "Validator", icon: Shield },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "gateway", label: "Gateway", icon: Waypoints },
  { id: "network", label: "Network", icon: Globe },
  { id: "explorer", label: "Explorer", icon: Blocks },
  { id: "console", label: "Console", icon: Terminal },
  { id: "settings", label: "Settings", icon: Settings },
];

const SYNC_PROGRESS_UPDATE_INTERVAL_MS = 250;
const BLOCK_REFRESH_INTERVAL_MS = 1_000;
const EXPENSIVE_REFRESH_INTERVAL_MS = 2_000;

function useThrottledCallback(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  const stateRef = useRef<{
    lastRun: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    lastRun: 0,
    timer: null,
  });

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (stateRef.current.timer) {
        clearTimeout(stateRef.current.timer);
      }
    };
  }, []);

  return useCallback(
    (force = false) => {
      const run = () => {
        stateRef.current.lastRun = Date.now();
        stateRef.current.timer = null;
        callbackRef.current();
      };

      const now = Date.now();
      const elapsed = now - stateRef.current.lastRun;

      if (force || elapsed >= intervalMs) {
        if (stateRef.current.timer) {
          clearTimeout(stateRef.current.timer);
        }
        run();
        return;
      }

      if (!stateRef.current.timer) {
        stateRef.current.timer = setTimeout(run, intervalMs - elapsed);
      }
    },
    [intervalMs]
  );
}

// Viewport below which the docked sidebar becomes an overlay drawer.
const COMPACT_MEDIA_QUERY = "(max-width: 767px)";

interface SidebarNavProps {
  /** "docked" renders the persistent rail; "overlay" renders inside the drawer. */
  variant: "docked" | "overlay";
  collapsed: boolean;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onToggleCollapse: () => void;
  onClose: () => void;
  nodeConnectionState: NodeConnectionState;
  isSynced: boolean;
  peerCount: number;
  syncProgress: SyncProgress;
  isMining: boolean;
}

// Shared sidebar contents, rendered either in the docked rail or the compact
// overlay drawer. In overlay mode the rail is always expanded (collapse is a
// docked-only affordance).
function SidebarNav({
  variant,
  collapsed,
  activeTab,
  onSelectTab,
  onToggleCollapse,
  onClose,
  nodeConnectionState,
  isSynced,
  peerCount,
  syncProgress,
  isMining,
}: SidebarNavProps) {
  const isOverlay = variant === "overlay";
  const effCollapsed = isOverlay ? false : collapsed;

  return (
    <>
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center px-4",
          effCollapsed ? "justify-center" : "justify-between"
        )}
      >
        {!effCollapsed ? (
          <div className="flex items-center gap-3">
            <CrystalLogo size={28} />
            <span className="font-heading font-semibold text-lg tracking-wider gradient-text">
              CRYSTAL
            </span>
          </div>
        ) : (
          <CrystalLogo size={24} />
        )}
        {isOverlay ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close navigation"
            className="text-foreground-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          !effCollapsed && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapse}
              className="text-foreground-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )
        )}
      </div>

      {/* Angular Divider */}
      <div className="mx-3 shrink-0 divider-angular" />

      {/* Navigation */}
      <nav className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          const button = (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              data-active={isActive}
              className={cn(
                "sidebar-nav-item relative w-full flex items-center gap-3 px-3 py-2.5 chamfered-sm",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary/15 text-primary shadow-inner-glow"
                  : "text-foreground-secondary hover:text-foreground hover:bg-muted/50"
              )}
            >
              {/* Active indicator diamond */}
              {isActive && (
                <span className="status-diamond-sm bg-primary absolute -left-0.5" />
              )}
              <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
              {!effCollapsed && (
                <span className="font-heading font-medium tracking-wide">{item.label}</span>
              )}
            </button>
          );

          if (!isOverlay && effCollapsed) {
            return (
              <Tooltip key={item.id} delayDuration={0}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right" className="font-heading">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      {/* Collapse button when collapsed (docked only) */}
      {!isOverlay && effCollapsed && (
        <div className="shrink-0 p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapse}
            className="w-full text-foreground-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Angular Divider */}
      <div className="mx-3 shrink-0 divider-angular" />

      {/* Status Footer */}
      <div className="shrink-0 p-3 space-y-2">
        {/* Node Connection - only visible when disconnected */}
        {nodeConnectionState !== "connected" && (
          <div
            className={cn(
              "flex items-center gap-2",
              effCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!effCollapsed && (
              <span className="text-xs font-heading text-foreground-muted tracking-wide">NODE</span>
            )}
            <Badge
              variant={nodeConnectionState === "connecting" ? "syncing" : "offline"}
              diamond
              pulse={nodeConnectionState === "connecting"}
            >
              {effCollapsed
                ? null
                : nodeConnectionState === "connecting"
                ? "Reconnecting"
                : "Disconnected"}
            </Badge>
          </div>
        )}

        {/* Sync Status */}
        <div
          className={cn(
            "flex items-center gap-2",
            effCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!effCollapsed && (
            <span className="text-xs font-heading text-foreground-muted tracking-wide">STATUS</span>
          )}
          <Badge
            variant={
              isSynced ? "synced"
              : peerCount === 0 ? "no_peers"
              : syncProgress.phase === "Idle" ? "synced"
              : "syncing"
            }
            diamond
            pulse={!isSynced && peerCount > 0 && syncProgress.phase !== "Idle"}
          >
            {effCollapsed
              ? null
              : isSynced
              ? "Synced"
              : peerCount === 0
              ? "No Peers"
              : syncProgress.phase === "Idle"
              ? "Synced"
              : "Syncing"}
          </Badge>
        </div>

        {/* Mining Status */}
        {!effCollapsed && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading text-foreground-muted tracking-wide">MINING</span>
            <Badge variant={isMining ? "mining" : "secondary"} diamond pulse={isMining}>
              {isMining ? "Active" : "Stopped"}
            </Badge>
          </div>
        )}

        {/* Peer Count */}
        {!effCollapsed && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading text-foreground-muted tracking-wide">PEERS</span>
            <span className="text-xs font-heading font-semibold tabular-nums text-foreground">{peerCount}</span>
          </div>
        )}
      </div>
    </>
  );
}

function AppContent() {
  // ── Phase 1 Diagnostics ──
  useDiagnosticMonitor();
  const trackAppRender = useRenderTracker("AppContent");
  useEffect(() => trackAppRender(), []);

  const activeTab = useUiStore((state) => state.activeTab);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const needsSetup = useUiStore((state) => state.needsSetup);
  const setNeedsSetup = useUiStore((state) => state.setNeedsSetup);
  const isInitializing = useUiStore((state) => state.isInitializing);
  const setIsInitializing = useUiStore((state) => state.setIsInitializing);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const closeMobileNav = useUiStore((state) => state.closeMobileNav);
  const openModal = useUiStore((state) => state.openModal);
  const addToast = useUiStore((state) => state.addToast);
  const nodeConnectionState = useUiStore((state) => state.nodeConnectionState);
  const setNodeConnectionState = useUiStore((state) => state.setNodeConnectionState);
  const hydrateToastsEnabled = useUiStore((state) => state.hydrateToastsEnabled);

  const syncProgress = useBlockchainStore((state) => state.syncProgress);
  const isSynced = useBlockchainStore((state) => state.isSynced);
  const setSyncProgress = useBlockchainStore((state) => state.setSyncProgress);
  const handleWsBlockchainInfo = useBlockchainStore((state) => state.handleWsBlockchainInfo);
  const handleWsStemProviderInfo = useBlockchainStore((state) => state.handleWsStemProviderInfo);
  const triggerBlockchainRefresh = useBlockchainStore((state) => state.triggerRefresh);

  const setPeerCount = useNetworkStore((state) => state.setPeerCount);
  const setPeers = useNetworkStore((state) => state.setPeers);
  const peerCount = useNetworkStore((state) => state.peerCount);

  const setMiningStats = useMiningStore((state) => state.setStats);
  const isMining = useMiningStore((state) => state.isActive);
  const addMinedBlock = useMiningStore((state) => state.addMinedBlock);

  const walletIsLoaded = useWalletStore((state) => state.isLoaded);
  const setWalletLoaded = useWalletStore((state) => state.setLoaded);
  const setWalletBalance = useWalletStore((state) => state.setBalance);
  const setWalletAddresses = useWalletStore((state) => state.setAddresses);
  const setWalletTransactionPage = useWalletStore((state) => state.setTransactionPage);
  const setAvailableWallets = useWalletStore((state) => state.setAvailableWallets);
  const triggerWalletRefresh = useWalletStore((state) => state.triggerRefresh);

  const validatorIsLoaded = useValidatorStore((state) => state.isLoaded);
  const triggerValidatorRefresh = useValidatorStore((state) => state.triggerRefresh);
  const setValidatorNetworkStats = useValidatorStore((state) => state.setNetworkStats);
  const setValidatorProductionStats = useValidatorStore((state) => state.setProductionStats);
  const addValidatorProductionStatsSnapshot = useValidatorStore((state) => state.addProductionStatsSnapshot);
  const addProducedFruit = useValidatorStore((state) => state.addProducedFruit);

  // State for API port (needed for WebSocket connection)
  const [apiPort, setApiPort] = useState<number | null>(null);
  const [startupError, setStartupError] = useState<StartupErrorInfo | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const hasConnectedOnce = useRef(false);

  // Bootstrap loading state (shown while node starts in background)
  const [startupPhase, setStartupPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [bootstrapMessage, setBootstrapMessage] = useState("Starting node...");
  const [bootstrapPercent, setBootstrapPercent] = useState(0);
  const [startupStage, setStartupStage] = useState<StartupStage>("opening_database");
  const [bootstrapProgressPhase, setBootstrapProgressPhase] = useState<BootstrapPhase | null>(null);
  const syncProgressRef = useRef(syncProgress);
  const syncProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncProgressRef = useRef<SyncProgress | null>(null);
  const lastSyncProgressCommitRef = useRef(0);

  useEffect(() => {
    syncProgressRef.current = syncProgress;
  }, [syncProgress]);

  useEffect(() => {
    return () => {
      if (syncProgressTimerRef.current) {
        clearTimeout(syncProgressTimerRef.current);
      }
    };
  }, []);

  const commitSyncProgress = useCallback(
    (progress: SyncProgress) => {
      lastSyncProgressCommitRef.current = Date.now();
      pendingSyncProgressRef.current = null;
      syncProgressRef.current = progress;
      setSyncProgress(progress);
    },
    [setSyncProgress]
  );

  const scheduleSyncProgress = useCallback(
    (progress: SyncProgress) => {
      const current = syncProgressRef.current;
      const isPhaseChange = progress.phase !== current.phase;
      const isTerminal = progress.phase === "Synced" || progress.phase === "Failed";
      const now = Date.now();
      const elapsed = now - lastSyncProgressCommitRef.current;

      if (isPhaseChange || isTerminal || elapsed >= SYNC_PROGRESS_UPDATE_INTERVAL_MS) {
        if (syncProgressTimerRef.current) {
          clearTimeout(syncProgressTimerRef.current);
          syncProgressTimerRef.current = null;
        }
        commitSyncProgress(progress);
        return;
      }

      pendingSyncProgressRef.current = progress;

      if (!syncProgressTimerRef.current) {
        syncProgressTimerRef.current = setTimeout(() => {
          syncProgressTimerRef.current = null;
          const pending = pendingSyncProgressRef.current;
          if (pending) {
            commitSyncProgress(pending);
          }
        }, SYNC_PROGRESS_UPDATE_INTERVAL_MS - elapsed);
      }
    },
    [commitSyncProgress]
  );

  const requestBlockchainRefresh = useThrottledCallback(
    triggerBlockchainRefresh,
    BLOCK_REFRESH_INTERVAL_MS
  );
  const requestWalletRefresh = useThrottledCallback(
    triggerWalletRefresh,
    EXPENSIVE_REFRESH_INTERVAL_MS
  );
  const requestValidatorRefresh = useThrottledCallback(
    triggerValidatorRefresh,
    EXPENSIVE_REFRESH_INTERVAL_MS
  );

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (msg: WebSocketMessage) => {
      switch (msg.type) {
        case "blockchain_info":
          handleWsBlockchainInfo(msg.data as Parameters<typeof handleWsBlockchainInfo>[0]);
          break;
        case "stem_provider_info":
          handleWsStemProviderInfo(msg.data as Parameters<typeof handleWsStemProviderInfo>[0]);
          break;
        case "new_block": {
          const raw = msg.data as {
            hash: string;
            height: number;
            leafHeight: number;
            blockType: string;
            timestamp: number;
            txCount?: number;
            fruitCount?: number;
          };
          const minedByLocal = (msg as { mined_by_local_node?: boolean }).mined_by_local_node === true;

          const blockSummary: BlockSummary = raw.blockType === "Stem"
            ? {
                blockType: "Stem",
                hash: raw.hash,
                height: raw.height,
                leafHeight: raw.leafHeight,
                timestamp: raw.timestamp,
                fruitCount: raw.fruitCount ?? 0,
              }
            : {
                blockType: "Leaf",
                hash: raw.hash,
                height: raw.height,
                leafHeight: raw.leafHeight,
                timestamp: raw.timestamp,
                txCount: raw.txCount ?? 0,
              };

          // Handle locally mined blocks
          if (minedByLocal) {
            const isLeaf = blockSummary.blockType === "Leaf";
            const minedBlock: MinedBlock = {
              ...blockSummary,
              minedAt: Date.now(),
            };

            // Add to in-memory store
            addMinedBlock(minedBlock);

            // Show toast notification
            addToast({
              type: isLeaf ? "leaf" : "stem",
              title: isLeaf ? "Leaf Block Found!" : "Stem Block Found!",
              message: `Height: ${raw.height} | Hash: ${raw.hash.slice(0, 12)}...`,
              duration: isLeaf ? 8000 : 5000,
            });
          }

          // Trigger wallet refresh if wallet is loaded
          // This updates balance and transactions after each new block
          if (walletIsLoaded) {
            requestWalletRefresh();
          }

          // Trigger validator refresh if validator is loaded
          // This updates balance, production counts, and status after each new block
          if (validatorIsLoaded) {
            requestValidatorRefresh();
          }

          // Trigger blockchain refresh so explorer's paginated block list stays current
          requestBlockchainRefresh();
          break;
        }
        case "mining_stats": {
          const stats = msg.data as MiningStats;
          setMiningStats(stats);
          break;
        }
        case "sync_progress": {
          const progress = msg.data as {
            phase: string;
            progress_percent: number;
            started_at?: number;
            // Headers phase
            headers_received?: number;
            target_headers?: number;
            // Stem bodies phase
            stems_pending?: number;
            stems_complete?: number;
            // Leaves phase
            leaves_received?: number;
            total_leaves?: number;
            current_epoch?: number;
            // State sync
            pivot_height?: number;
            state_root?: string;
            downloaded_chunks?: number;
            total_chunks?: number;
            // Execution
            blocks_executed?: number;
            target_height?: number;
            // Speed/ETA
            items_per_second?: number;
            estimated_seconds_remaining?: number;
            bytes_downloaded?: number;
            bytes_total?: number;
            // Error
            failure_reason?: string;
            // Peer info
            sync_peer?: string;
            peer_count?: number;
          };
          scheduleSyncProgress({
            phase: progress.phase as SyncProgress["phase"],
            progressPercent: progress.progress_percent ?? 0,
            startedAt: progress.started_at,
            headersReceived: progress.headers_received,
            targetHeaders: progress.target_headers,
            stemsPending: progress.stems_pending,
            stemsComplete: progress.stems_complete,
            leavesReceived: progress.leaves_received,
            totalLeaves: progress.total_leaves,
            currentEpoch: progress.current_epoch,
            pivotHeight: progress.pivot_height,
            stateRoot: progress.state_root,
            downloadedChunks: progress.downloaded_chunks,
            totalChunks: progress.total_chunks,
            blocksExecuted: progress.blocks_executed,
            targetHeight: progress.target_height,
            itemsPerSecond: progress.items_per_second,
            estimatedSecondsRemaining: progress.estimated_seconds_remaining,
            bytesDownloaded: progress.bytes_downloaded,
            bytesTotal: progress.bytes_total,
            failureReason: progress.failure_reason,
            syncPeer: progress.sync_peer,
            peerCount: progress.peer_count,
          });
          break;
        }
        case "peer_update": {
          const peerData = msg.data as { peer_count: number };
          setPeerCount(peerData.peer_count, 0, 0);
          break;
        }
        case "peers_update": {
          const data = msg.data as {
            peerCount: number;
            inboundCount: number;
            outboundCount: number;
            peers: Array<{
              peer_id: string;
              addresses: string[];
              direction: string;
              state: string;
              connected_at?: number;
              last_seen: number;
              bytes_sent: number;
              bytes_received: number;
              latency: number;
              best_height: number;
              protocol_version?: number;
              user_agent?: string;
            }>;
          };
          // Transform backend PeerStats to frontend Peer format
          const peers = data.peers.map((p) => {
            // Parse first address to extract host and port
            let address = "unknown";
            let port = 0;
            if (p.addresses.length > 0) {
              // Multiaddr format: /ip4/192.168.1.1/tcp/8333 or /dns4/seed.example.com/tcp/8333
              const parts = p.addresses[0].split("/");
              const ipIdx = parts.findIndex((s) => s === "ip4" || s === "ip6" || s === "dns4");
              const tcpIdx = parts.findIndex((s) => s === "tcp");
              if (ipIdx >= 0 && ipIdx + 1 < parts.length) {
                address = parts[ipIdx + 1];
              }
              if (tcpIdx >= 0 && tcpIdx + 1 < parts.length) {
                port = parseInt(parts[tcpIdx + 1], 10) || 0;
              }
            }
            return {
              id: p.peer_id,
              address,
              port,
              direction: p.direction as "Inbound" | "Outbound",
              state: p.state as "Connected" | "Handshaking" | "Ready",
              version: p.protocol_version?.toString(),
              userAgent: p.user_agent,
              latency: p.latency,
              connectedAt: p.connected_at,
              lastSeen: p.last_seen,
              bytesReceived: p.bytes_received,
              bytesSent: p.bytes_sent,
              bestHeight: p.best_height,
            };
          });
          setPeers(peers);
          break;
        }
        case "fruit_produced": {
          const fruitData = msg.data as {
            fruitHash: string;
            fruitType: string;
            transactionCount: number;
            timestamp: number;
            stemHash: string;
          };

          addToast({
            type: "fruit",
            fruitType: fruitData.fruitType,
            title: `${fruitData.fruitType} Produced!`,
            message: `Hash: ${fruitData.fruitHash.slice(0, 12)}... | ${fruitData.transactionCount} tx${fruitData.transactionCount !== 1 ? "s" : ""}`,
            duration: 6000,
          });

          addProducedFruit({
            ...fruitData,
            producedAt: Date.now(),
          });

          // Trigger validator refresh to update production counts, balance, earnings
          if (validatorIsLoaded) {
            requestValidatorRefresh(true);
          }
          break;
        }
        case "validator_network_stats": {
          const data = msg.data as {
            currentEpoch: number;
            totalStaked: number;
            validatorCount: number;
            productionStats?: FruitProductionStats[];
          };
          setValidatorNetworkStats({
            currentEpoch: data.currentEpoch,
            totalStaked: data.totalStaked,
            validatorCount: data.validatorCount,
          });
          if (data.productionStats) {
            setValidatorProductionStats(data.productionStats);
            addValidatorProductionStatsSnapshot(data.currentEpoch, data.productionStats);
          }
          break;
        }
        case "connection":
          console.log("[WebSocket] Connection established");
          break;
        case "test":
          break;
        default:
          console.debug("[WebSocket] Unhandled message type:", msg.type);
      }
    },
    [handleWsBlockchainInfo, handleWsStemProviderInfo, setMiningStats, scheduleSyncProgress, setPeerCount, setPeers, addMinedBlock, addToast, walletIsLoaded, requestWalletRefresh, validatorIsLoaded, requestValidatorRefresh, setValidatorNetworkStats, setValidatorProductionStats, addValidatorProductionStatsSnapshot, requestBlockchainRefresh]
  );

  // Set up WebSocket connection
  useNodeWebSocket(apiPort, {
    onMessage: handleWebSocketMessage,
    onConnectionChange: (state) => {
      console.log("[WebSocket] Connection state:", state);
      setNodeConnectionState(state);
      if (state === "connected") {
        if (hasConnectedOnce.current) {
          addToast({
            type: "success",
            title: "Node Reconnected",
            message: "WebSocket connection restored",
            duration: 4000,
          });
          // Rehydrate stale data after reconnection
          requestBlockchainRefresh(true);
          if (walletIsLoaded) requestWalletRefresh(true);
          if (validatorIsLoaded) requestValidatorRefresh(true);
        }
        hasConnectedOnce.current = true;
      } else if (state === "disconnected" && hasConnectedOnce.current) {
        addToast({
          type: "warning",
          title: "Node Connection Lost",
          message: "Attempting to reconnect...",
          duration: 6000,
        });
      }
    },
  });

  // Listen for wallet load/unload events from Tauri
  useTauriEvent<GuiEvent>("gui-event", (event) => {
    if (event.type === "WalletLoaded") {
      const { name } = event.data;
      setWalletLoaded(true, name);
      addToast({
        type: "success",
        title: "Wallet Loaded",
        message: `"${name}" is now active`,
        duration: 3000,
      });
    } else if (event.type === "WalletUnloaded") {
      setWalletLoaded(false, null);
      setWalletBalance({ total: 0, confirmed: 0, pending: 0, immature: 0 });
      setWalletAddresses([]);
      setWalletTransactionPage(1, [], 0);
      addToast({
        type: "info",
        title: "Wallet Unloaded",
        message: "Your wallet has been closed",
        duration: 3000,
      });
    } else if (event.type === "IncomingTransaction") {
      const { amount } = event.data;
      addToast({
        type: "success",
        title: "Transaction Received!",
        message: `+${formatXtalFull(amount)} XTAL`,
        duration: 8000,
      });
      // Trigger wallet refresh to update balance/tx list
      if (walletIsLoaded) {
        requestWalletRefresh(true);
      }
    } else if (event.type === "OutgoingTransaction") {
      // Trigger wallet and validator refresh so outgoing tx appears immediately
      if (walletIsLoaded) {
        requestWalletRefresh(true);
      }
      if (validatorIsLoaded) {
        requestValidatorRefresh(true);
      }
    } else if (event.type === "ChainReorg") {
      const { depth, removedCount, addedCount } = event.data;
      addToast({
        type: "warning",
        title: "Chain Reorganization",
        message: `Depth: ${depth} blocks. Removed: ${removedCount}, Added: ${addedCount}`,
        duration: 10000,
      });
      // Trigger wallet refresh since balances may have changed
      if (walletIsLoaded) {
        requestWalletRefresh(true);
      }
      // Trigger blockchain refresh so explorer drops reorged blocks
      requestBlockchainRefresh(true);
    }
  }, [setWalletLoaded, setWalletBalance, setWalletAddresses, setWalletTransactionPage, addToast, walletIsLoaded, requestWalletRefresh, validatorIsLoaded, requestValidatorRefresh, requestBlockchainRefresh]);

  // Initialize app — polls get_startup_status while the node boots in the background
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        const guiConfig = await tauriCommand<GuiConfig>("get_gui_config");
        hydrateToastsEnabled(guiConfig.toastsEnabled);
      } catch (guiConfigErr) {
        console.error("Failed to initialize GUI preferences:", guiConfigErr);
      }

      // Phase 1: Check if this is a first-run / setup-mode launch.
      // In setup mode, SharedStartupStatus is NOT managed, so get_startup_status
      // will fail. We detect that and fall through to the setup wizard path.
      try {
        const needsSetupResult = await tauriCommand<boolean>("check_first_run");
        if (needsSetupResult) {
          console.log("[App] Setup needed - skipping node initialization");
          setNeedsSetup(true);
          setStartupPhase("ready"); // hide bootstrap screen
          setIsInitializing(false);
          return;
        }
      } catch {
        // check_first_run unavailable — shouldn't happen, but handle gracefully
      }

      // Phase 2: Poll get_startup_status until the node is ready or fails.
      const poll = async () => {
        if (cancelled) return;

        try {
          const status = await tauriCommand<StartupStatus>("get_startup_status");

          if (status.phase === "loading") {
            setBootstrapMessage(status.loadingMessage || "Starting node...");
            setBootstrapPercent(status.progressPercent ?? 0);
            setStartupStage(status.startupStage);
            setBootstrapProgressPhase(status.bootstrapPhase ?? null);
            // Continue polling
            pollTimer = setTimeout(poll, 500);
            return;
          }

          if (status.phase === "failed") {
            console.error("[App] Node startup failed:", status.error?.message);
            setStartupPhase("failed");
            if (status.error) {
              setStartupError(status.error);
            }
            setIsInitializing(false);
            return;
          }

          if (status.phase === "ready") {
            console.log("[App] Node is ready — completing initialization");
            setStartupPhase("ready");
            setBootstrapPercent(100);

            // Phase 3: Node-dependent initialization (API port, wallet state)
            await completeNodeInit();
            return;
          }
        } catch {
          // get_startup_status not available (e.g. setup mode) — stop polling
          setStartupPhase("ready");
          setIsInitializing(false);
        }
      };

      poll();
    };

    const completeNodeInit = async () => {
      try {
        // Get API port for WebSocket connection
        let port: number;
        try {
          port = await tauriCommand<number>("get_api_port");
          if (typeof port !== "number" || !isFinite(port) || port <= 0) {
            throw new Error(`Invalid API port returned: ${port}`);
          }
        } catch (portErr) {
          throw new Error(
            `Failed to get node API port: ${portErr instanceof Error ? portErr.message : String(portErr)}`
          );
        }
        console.log("[App] API port:", port);
        setApiPort(port);

        // Initialize wallet state and menu at startup
        try {
          const wallets = await tauriCommand<string[]>("list_wallets");
          setAvailableWallets(wallets);

          const walletStatus = await tauriCommand<WalletStatus>("get_wallet_status");
          if (walletStatus.is_loaded && walletStatus.wallet_name) {
            setWalletLoaded(true, walletStatus.wallet_name);
          }

          await tauriCommand("sync_wallet_menu", {
            walletLoaded: walletStatus.is_loaded,
            availableWallets: wallets,
          });
        } catch (walletErr) {
          console.error("Failed to initialize wallet:", walletErr);
        }
      } catch (err) {
        console.error("Failed to initialize:", err);
        setInitError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsInitializing(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [hydrateToastsEnabled, setNeedsSetup, setIsInitializing]);

  // NOTE: Live updates now handled via WebSocket in handleWebSocketMessage above
  // Tauri events are no longer used for: SyncProgress, NewBlock, MiningStats, PeerCountChanged

  // Register global functions that Rust can call via window.eval()
  // This is more reliable than Tauri events for menu → frontend communication
  useEffect(() => {
    // Open create wallet modal
    (window as any).openWalletCreate = () => {
      setActiveTab("wallet");
      openModal("wallet-create");
    };

    // Open load wallet modal with specific wallet name
    (window as any).openWalletLoad = (walletName: string) => {
      setActiveTab("wallet");
      openModal("wallet-load", walletName);
    };

    (window as any).openWalletChangePassword = () => {
      setActiveTab("wallet");
      openModal("wallet-change-password");
    };

    (window as any).openWalletMultisig = () => {
      setActiveTab("wallet");
      openModal("wallet-multisig");
    };

    // Import wallet from native menu
    (window as any).openWalletImportMnemonic = () => {
      setActiveTab("wallet");
      openModal("wallet-import", { mode: "mnemonic" });
    };
    (window as any).openWalletImportKey = () => {
      setActiveTab("wallet");
      openModal("wallet-import", { mode: "key" });
    };
    (window as any).openWalletImportFile = () => {
      setActiveTab("wallet");
      openModal("wallet-import-file");
    };

    // Unload wallet from menu
    (window as any).unloadWallet = async () => {
      if (walletIsLoaded) {
        try {
          await tauriCommand("unload_wallet");
          // State updates and toast now handled by WalletUnloaded event listener
        } catch (err) {
          console.error("Failed to unload wallet:", err);
          addToast({
            type: "error",
            title: "Failed to unload wallet",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    // Cleanup on unmount
    return () => {
      delete (window as any).openWalletCreate;
      delete (window as any).openWalletLoad;
      delete (window as any).openWalletChangePassword;
      delete (window as any).openWalletMultisig;
      delete (window as any).openWalletImportMnemonic;
      delete (window as any).openWalletImportKey;
      delete (window as any).openWalletImportFile;
      delete (window as any).unloadWallet;
    };
  }, [
    setActiveTab,
    openModal,
    walletIsLoaded,
    addToast,
  ]);

  // Compact viewport → sidebar becomes an overlay drawer instead of a docked rail.
  const isCompact = useMediaQuery(COMPACT_MEDIA_QUERY);

  // Ensure the drawer never lingers open when growing back to desktop width.
  useEffect(() => {
    if (!isCompact && mobileNavOpen) {
      closeMobileNav();
    }
  }, [isCompact, mobileNavOpen, closeMobileNav]);

  // Selecting a tab also dismisses the compact drawer (no-op when docked).
  const handleSelectTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      closeMobileNav();
    },
    [setActiveTab, closeMobileNav]
  );

  // Show startup error overlay if node failed to start
  if (startupError) {
    return <NodeStartupError error={startupError} />;
  }

  // Show bootstrap loading screen while node starts in the background
  if (startupPhase === "loading") {
    return (
      <BootstrapScreen
        loadingMessage={bootstrapMessage}
        progressPercent={bootstrapPercent}
        startupStage={startupStage}
        bootstrapPhase={bootstrapProgressPhase}
      />
    );
  }

  // Show init failure card if initialization failed or timed out
  if (initError) {
    return (
      <div className="min-h-dvh min-w-[var(--app-min-width)] bg-background hex-grid-bg flex items-center justify-center overflow-auto p-4">
        <div className="max-w-md w-full">
          <div
            className="chamfered-lg p-[2px]"
            style={{
              background: "linear-gradient(135deg, hsl(var(--warning) / 0.6), hsl(var(--accent) / 0.5))",
            }}
          >
            <div
              className="chamfered-lg p-[1px]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--accent) / 0.5), hsl(var(--primary) / 0.6))",
              }}
            >
              <div className="chamfered-lg crystalline p-6 flex flex-col gap-4 shadow-2xl">
                <div className="text-center space-y-1.5">
                  <WifiOff className="h-10 w-10 mx-auto text-warning mb-2" />
                  <h1 className="font-heading text-lg font-semibold tracking-wider text-warning">
                    Initialization Failed
                  </h1>
                  <p className="font-heading text-sm text-foreground-secondary tracking-wide">
                    Could not connect to the Crystal node
                  </p>
                </div>
                <div className="divider-angular" />
                <div className="chamfered-border-wrap">
                  <div className="chamfered bg-background-secondary p-4 overflow-y-auto max-h-40">
                    <p className="font-mono text-xs text-foreground-muted break-all leading-relaxed">
                      {initError}
                    </p>
                  </div>
                </div>
                <div className="divider-angular" />
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => {
                    setInitError(null);
                    setIsInitializing(true);
                    // Re-trigger init by remounting — simplest approach
                    window.location.reload();
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen during initialization
  if (isInitializing) {
    return <LoadingScreen message="Initializing Crystal Node..." />;
  }

  // Show setup wizard if needed
  // Note: SetupWizard handles its own completion by restarting the app
  if (needsSetup) {
    return <SetupWizard />;
  }

  return (
    <div className="flex h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] bg-background overflow-hidden">
      {/* Docked sidebar (desktop ≥ md) */}
      {!isCompact && (
        <aside
          className={cn(
            "flex h-full shrink-0 flex-col border-r border-border bg-background-secondary",
            "min-h-0 overflow-hidden transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "w-[var(--sidebar-collapsed)]" : "w-[var(--sidebar-width)]"
          )}
        >
          <SidebarNav
            variant="docked"
            collapsed={sidebarCollapsed}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onToggleCollapse={toggleSidebar}
            onClose={closeMobileNav}
            nodeConnectionState={nodeConnectionState}
            isSynced={isSynced}
            peerCount={peerCount}
            syncProgress={syncProgress}
            isMining={isMining}
          />
        </aside>
      )}

      {/* Compact overlay drawer (< md) */}
      {isCompact && (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
              mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-hidden={!mobileNavOpen}
            onClick={closeMobileNav}
          />
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] max-w-[80vw] flex-col",
              "border-r border-border bg-background-secondary text-foreground shadow-crystalline-lg",
              "transition-transform duration-300 ease-in-out",
              mobileNavOpen ? "translate-x-0" : "-translate-x-full"
            )}
            aria-hidden={!mobileNavOpen}
          >
            <SidebarNav
              variant="overlay"
              collapsed={false}
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              onToggleCollapse={toggleSidebar}
              onClose={closeMobileNav}
              nodeConnectionState={nodeConnectionState}
              isSynced={isSynced}
              peerCount={peerCount}
              syncProgress={syncProgress}
              isMining={isMining}
            />
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden hex-grid-bg text-foreground">
        {/* Compact top bar with drawer toggle */}
        {isCompact && (
          <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background-secondary/90 px-4 backdrop-blur">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="text-foreground-muted hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <CrystalLogo size={22} />
            <span className="font-heading font-semibold tracking-wider gradient-text">CRYSTAL</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="relative min-h-full p-4 sm:p-6">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "mining" && (
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <Mining />
            </Suspense>
          )}
          {activeTab === "mempool" && <Mempool />}
          {activeTab === "validator" && (
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <ValidatorPanel />
            </Suspense>
          )}
          {activeTab === "wallet" && (
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <WalletPanel />
            </Suspense>
          )}
          {activeTab === "gateway" && (
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <Gateway />
            </Suspense>
          )}
          {activeTab === "network" && <Network />}
          {activeTab === "explorer" && (
            <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
              <BlockExplorer />
            </Suspense>
          )}
          {activeTab === "console" && <RpcConsole />}
          {activeTab === "settings" && <SettingsPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <TooltipProvider delayDuration={300}>
        <AppContent />
        <ToastContainer />
      </TooltipProvider>
    </ThemeProvider>
  );
}
