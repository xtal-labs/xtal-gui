import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Moon, Sun, Monitor, Info, Globe, FlaskConical, Server, AlertTriangle, ChevronDown, Bell, Database } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/common/ThemeProvider";
import { useUiStore } from "@/stores";
import { cn } from "@/lib/utils";
import { FRUIT_COLORS } from "@/lib/fruitColors";
import { tauriCommand, useTauriCommand } from "@/hooks";

interface NodeInfo {
  network: string;
  version: string;
  data_dir?: string;
}

interface IpfsStatus {
  enabled: boolean;
  gatewayCount: number;
  gateways: string[];
  pinningConfigured: boolean;
}

interface NodeConfig {
  archival: boolean;
  txIndex: boolean;
  syncMode: string;
  stemRetentionEpochs: number;
  subscribedFruits: string[];
}

const networkOptions = [
  {
    id: "mainnet",
    label: "Mainnet",
    description: "Production network",
    icon: Globe,
    color: "emerald",
  },
  {
    id: "testnet",
    label: "Testnet",
    description: "Development network",
    icon: FlaskConical,
    color: "amber",
  },
  {
    id: "regtest",
    label: "Regtest",
    description: "Local testing",
    icon: Server,
    color: "slate",
  },
];

const TOTAL_FRUITS = Object.keys(FRUIT_COLORS).length;

function formatSyncMode(syncMode: string) {
  if (syncMode === "full") return "Full";
  if (syncMode === "fast") return "Fast";
  if (!syncMode) return "Unknown";
  return syncMode.charAt(0).toUpperCase() + syncMode.slice(1);
}

function formatRetention(config: NodeConfig | null) {
  if (!config) return "Unknown";
  if (config.archival) return "Unlimited";
  return `${config.stemRetentionEpochs} epochs`;
}

function summarizePendingChanges(changes: string[]) {
  if (changes.length === 0) return "";
  if (changes.length === 1) return changes[0];
  if (changes.length === 2) return `${changes[0]} and ${changes[1]}`;
  return `${changes.slice(0, -1).join(", ")}, and ${changes[changes.length - 1]}`;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { toastsEnabled, setToastsEnabled } = useUiStore();
  const { execute: getNodeInfo, data: nodeInfo } = useTauriCommand<NodeInfo>("get_node_info");
  const { execute: getNodeConfig, data: nodeConfig } = useTauriCommand<NodeConfig>("get_node_config");
  const { execute: getConfigPath, data: configPath } = useTauriCommand<string>("get_config_path");
  const { execute: getIpfsStatus, data: ipfsStatus } = useTauriCommand<IpfsStatus>("get_ipfs_status");
  const [pendingNetwork, setPendingNetwork] = useState<string | null>(null);
  const [pendingArchival, setPendingArchival] = useState<boolean | null>(null);
  const [pendingTxIndex, setPendingTxIndex] = useState<boolean | null>(null);
  const [isApplyingNodeChanges, setIsApplyingNodeChanges] = useState(false);

  useEffect(() => {
    getNodeInfo();
    getNodeConfig();
    getConfigPath();
    getIpfsStatus();
  }, [getNodeInfo, getNodeConfig, getConfigPath, getIpfsStatus]);

  const currentNetwork = nodeInfo?.network?.toLowerCase() ?? "";
  const currentArchival = nodeConfig?.archival ?? false;
  const currentTxIndex = nodeConfig?.txIndex ?? false;
  const syncMode = nodeConfig?.syncMode ?? "";
  const subscribedFruits = nodeConfig?.subscribedFruits ?? [];
  const archivalLocked = syncMode === "full";
  const needsArchivalCorrection = archivalLocked && !currentArchival;
  const displayNetwork = pendingNetwork ?? currentNetwork;
  const displayArchival = archivalLocked ? true : (pendingArchival ?? currentArchival);
  const displayTxIndex = pendingTxIndex ?? currentTxIndex;
  const hasPendingNetworkChange = !!pendingNetwork && pendingNetwork !== currentNetwork;
  const hasPendingArchivalChange =
    needsArchivalCorrection || (pendingArchival !== null && pendingArchival !== currentArchival);
  const hasPendingTxIndexChange =
    pendingTxIndex !== null && pendingTxIndex !== currentTxIndex;
  const hasPendingNodeChanges =
    hasPendingNetworkChange || hasPendingArchivalChange || hasPendingTxIndexChange;

  const pendingChangeSummary = summarizePendingChanges([
    ...(hasPendingNetworkChange ? ["network"] : []),
    ...(hasPendingTxIndexChange ? ["transaction index"] : []),
    ...(hasPendingArchivalChange ? ["archival mode"] : []),
  ]);

  const resetPendingNodeChanges = () => {
    setPendingNetwork(null);
    setPendingArchival(null);
    setPendingTxIndex(null);
  };

  const handleNodeChangesConfirm = async () => {
    if (!hasPendingNodeChanges) return;

    setIsApplyingNodeChanges(true);
    try {
      if (hasPendingNetworkChange && pendingNetwork) {
        await tauriCommand("switch_network", { network: pendingNetwork });
      }

      if (hasPendingArchivalChange || hasPendingTxIndexChange) {
        await tauriCommand("set_node_storage_flags", {
          archival: displayArchival,
          txIndex: displayTxIndex,
        });
      }

      await tauriCommand("restart_app");
    } catch (e) {
      console.error("Failed to apply node settings:", e);
      setIsApplyingNodeChanges(false);
    }
  };

  const themeOptions = [
    {
      id: "system" as const,
      label: "System",
      description: "Follow OS preference",
      icon: Monitor,
    },
    {
      id: "amethyst" as const,
      label: "Amethyst",
      description: "Dark crystalline theme",
      icon: Moon,
    },
    {
      id: "celestite" as const,
      label: "Celestite",
      description: "Light crystalline theme",
      icon: Sun,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
          SETTINGS
        </h1>
        <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
          Configure your Crystal node preferences
        </p>
      </div>

      {/* Appearance */}
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
            <div className="icon-hex icon-hex-sm bg-primary/20">
              <SettingsIcon className="h-3.5 w-3.5 text-primary" />
            </div>
            APPEARANCE
          </CardTitle>
          <CardDescription>
            Choose your preferred theme for the Facet interface
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.id;

              return (
                <div
                  key={option.id}
                  className="chamfered-border-wrap transition-all"
                  style={{ '--_cb-color': isSelected ? 'hsl(var(--primary))' : 'hsl(var(--border))' } as React.CSSProperties}
                >
                <button
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    "flex flex-col items-center gap-3 p-4 chamfered transition-all w-full",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "bg-primary/10 shadow-crystalline"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "icon-hex",
                      isSelected ? "bg-primary/20" : "bg-muted"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isSelected ? "text-primary" : "text-foreground-muted"
                      )}
                    />
                  </div>
                  <div className="text-center">
                    <p className={cn("font-heading font-medium", isSelected && "text-primary-foreground")}>
                      {option.label}
                    </p>
                    <p className="text-xs text-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
            <div className="icon-hex icon-hex-sm bg-primary/20">
              <Bell className="h-3.5 w-3.5 text-primary" />
            </div>
            NOTIFICATIONS
          </CardTitle>
          <CardDescription>
            Configure in-app notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
            <div>
              <span className="text-sm font-heading text-foreground-secondary">TOAST NOTIFICATIONS</span>
              <p className="text-xs text-foreground-muted mt-0.5">
                Show pop-up alerts for blocks, transactions, and events
              </p>
            </div>
            <Switch checked={toastsEnabled} onCheckedChange={setToastsEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Node Information */}
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
            <div className="icon-hex icon-hex-sm bg-info/20">
              <Info className="h-3.5 w-3.5 text-info" />
            </div>
            NODE INFORMATION
          </CardTitle>
          <CardDescription>
            Current node configuration and network selection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Network selector */}
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <span className="text-sm font-heading text-foreground-secondary">NETWORK</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={isApplyingNodeChanges}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "font-mono",
                      isApplyingNodeChanges && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {(() => {
                      const active = networkOptions.find(n => n.id === displayNetwork);
                      const Icon = active?.icon ?? Globe;
                      return (
                        <>
                          <Icon className="h-3.5 w-3.5 text-foreground-muted" />
                          <span>{active?.label ?? "Unknown"}</span>
                        </>
                      );
                    })()}
                    <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={displayNetwork}
                    onValueChange={(value) => {
                      if (value === currentNetwork) {
                        setPendingNetwork(null);
                      } else {
                        setPendingNetwork(value);
                      }
                    }}
                  >
                    {networkOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <DropdownMenuRadioItem key={option.id} value={option.id}>
                          <Icon className="h-3.5 w-3.5 mr-2 text-foreground-muted" />
                          <span className="font-heading">{option.label}</span>
                          <span className="ml-2 text-xs text-foreground-muted">{option.description}</span>
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50 gap-4">
              <div>
                <span className="text-sm font-heading text-foreground-secondary">
                  TRANSACTION INDEX
                </span>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Enables explorer transaction lookups.
                </p>
              </div>
              <Switch
                checked={displayTxIndex}
                onCheckedChange={(checked) =>
                  setPendingTxIndex(checked === currentTxIndex ? null : checked)
                }
                disabled={isApplyingNodeChanges || !nodeConfig}
              />
            </div>

            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50 gap-4">
              <div>
                <span className="text-sm font-heading text-foreground-secondary">
                  ARCHIVAL MODE
                </span>
                <p className="text-xs text-foreground-muted mt-0.5">
                  {archivalLocked
                    ? "Required by Full Sync — all historical data is retained."
                    : "Keeps historical fruit data indefinitely."}
                </p>
              </div>
              <Switch
                checked={displayArchival}
                onCheckedChange={(checked) =>
                  setPendingArchival(checked === currentArchival ? null : checked)
                }
                disabled={isApplyingNodeChanges || !nodeConfig || archivalLocked}
              />
            </div>

            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <span className="text-sm font-heading text-foreground-secondary">VERSION</span>
              <span className="text-sm font-mono">
                {nodeInfo?.version ?? "Unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <div>
                <span className="text-sm font-heading text-foreground-secondary">SYNC MODE</span>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Full sync always implies archival retention.
                </p>
              </div>
              <span className="text-sm font-mono">
                {formatSyncMode(syncMode)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <div>
                <span className="text-sm font-heading text-foreground-secondary">STEM RETENTION</span>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Used when <span className="font-mono">storage.archival</span> is disabled.
                </p>
              </div>
              <span className="text-sm font-mono">
                {formatRetention(nodeConfig)}
              </span>
            </div>
            <div className="py-3 px-3 chamfered-sm bg-muted/50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-heading text-foreground-secondary">SUBSCRIBED FRUITS</span>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    Persisted shard subscription from the node config.
                  </p>
                </div>
                <span className="text-sm font-mono text-foreground-secondary">
                  {subscribedFruits.length}/{TOTAL_FRUITS}
                </span>
              </div>
              {subscribedFruits.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {subscribedFruits.map((fruit) => (
                    <span
                      key={fruit}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground-secondary"
                    >
                      <span>{FRUIT_COLORS[fruit]?.emoji ?? "🍒"}</span>
                      <span>{fruit}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-foreground-muted mt-3">
                  No subscribed fruits are currently recorded.
                </p>
              )}
            </div>
            {configPath && (
              <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50 gap-4">
                <div>
                  <span className="text-sm font-heading text-foreground-secondary">NODE CONFIG</span>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    File opened by the menu bar.
                  </p>
                </div>
                <span className="text-sm font-mono text-foreground-muted truncate max-w-[260px]">
                  {configPath}
                </span>
              </div>
            )}
            {nodeInfo?.data_dir && (
              <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
                <span className="text-sm font-heading text-foreground-secondary">DATA DIR</span>
                <span className="text-sm font-mono text-foreground-muted truncate max-w-[200px]">
                  {nodeInfo.data_dir}
                </span>
              </div>
            )}
          </div>

          {hasPendingNodeChanges && (
            <div className="mt-4 p-3 chamfered-sm bg-warning/10 border border-warning/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                <span className="text-foreground-secondary">
                  Changes to{" "}
                  <span className="font-heading font-medium text-foreground">
                    {pendingChangeSummary}
                  </span>{" "}
                  require a restart.
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetPendingNodeChanges}
                  disabled={isApplyingNodeChanges}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleNodeChangesConfirm}
                  disabled={isApplyingNodeChanges}
                  className="bg-warning text-warning-foreground hover:bg-warning/90"
                >
                  {isApplyingNodeChanges ? "Restarting..." : "Confirm & Restart"}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-foreground-muted mt-4">
            Full sync requires archival storage, but archival remains an explicit config setting.
          </p>
        </CardContent>
      </Card>

      {/* IPFS Settings */}
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
            <div className="icon-hex icon-hex-sm bg-accent/20">
              <Database className="h-3.5 w-3.5 text-accent" />
            </div>
            IPFS ABI DISTRIBUTION
          </CardTitle>
          <CardDescription>
            Distribute and resolve contract ABIs via IPFS gateways
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <span className="text-sm font-heading text-foreground-secondary">STATUS</span>
              <span className={cn("text-sm font-mono", ipfsStatus?.enabled ? "text-success" : "text-foreground-muted")}>
                {ipfsStatus?.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <span className="text-sm font-heading text-foreground-secondary">GATEWAYS</span>
              <span className="text-sm font-mono">
                {ipfsStatus?.gatewayCount ?? 0} configured
              </span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 chamfered-sm bg-muted/50">
              <span className="text-sm font-heading text-foreground-secondary">PINNING SERVICE</span>
              <span className={cn("text-sm font-mono", ipfsStatus?.pinningConfigured ? "text-success" : "text-foreground-muted")}>
                {ipfsStatus?.pinningConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
          </div>
          <p className="text-xs text-foreground-muted mt-4">
            Configure IPFS gateways and pinning in <span className="font-mono">~/.crystal/config.toml</span> under the <span className="font-mono">[ipfs]</span> section.
          </p>
        </CardContent>
      </Card>

      {/* About */}
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide">ABOUT CRYSTAL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="icon-hex bg-primary/20" style={{ width: '3rem', height: '3rem' }}>
              <span className="text-primary font-heading font-bold text-xl">C</span>
            </div>
            <div>
              <p className="font-heading font-semibold">Crystal Node</p>
              <p className="text-sm text-foreground-secondary">
                Hybrid PoW/PoS blockchain with parallel transaction sharding
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-foreground-muted font-heading">
              Facet Design System - Geometric precision for blockchain interfaces
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
