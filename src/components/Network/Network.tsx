import { useEffect } from "react";
import {
  Globe,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  WifiOff,
  RefreshCw,
  Ban,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/common";
import { SyncProgressPanel } from "./SyncProgressPanel";
import { useNetworkStore, useBlockchainStore } from "@/stores";
import { useTauriCommand } from "@/hooks";
import { formatBytes, cn } from "@/lib/utils";
import type { NetworkStatus, Peer } from "@/types";

export default function Network() {
  const {
    isConnected,
    peerCount,
    inboundCount,
    outboundCount,
    networkType,
    peers,
    bandwidth,
    setPeers,
    setNetworkStatus,
  } = useNetworkStore();

  const { syncProgress } = useBlockchainStore();

  const { execute: getNetworkStatus } = useTauriCommand<NetworkStatus>("get_network_status");
  const { execute: getPeers } = useTauriCommand<
    Array<{ peerId: string; addresses: string[]; direction: string; state: string }>
  >("get_peers");

  useEffect(() => {
    refreshNetworkData();
    const interval = setInterval(refreshNetworkData, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshNetworkData = async () => {
    const [statusResult, peersResult] = await Promise.all([
      getNetworkStatus(),
      getPeers(),
    ]);

    if (statusResult) setNetworkStatus(statusResult);
    if (peersResult) {
      const mapped: Peer[] = peersResult.map((p) => {
        let address = "unknown";
        let port = 0;
        if (p.addresses.length > 0) {
          const parts = p.addresses[0].split("/");
          const ipIdx = parts.findIndex((s) => s === "ip4" || s === "ip6" || s === "dns4");
          const tcpIdx = parts.findIndex((s) => s === "tcp");
          if (ipIdx >= 0 && ipIdx + 1 < parts.length) address = parts[ipIdx + 1];
          if (tcpIdx >= 0 && tcpIdx + 1 < parts.length) port = parseInt(parts[tcpIdx + 1], 10) || 0;
        }
        return {
          id: p.peerId,
          address,
          port,
          direction: p.direction as Peer["direction"],
          state: p.state as Peer["state"],
        };
      });
      setPeers(mapped);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            NETWORK
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Peer connections and network status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={refreshNetworkData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <StatusBadge status={isConnected ? "online" : "offline"} />
        </div>
      </div>

      {/* Sync Progress Panel */}
      <SyncProgressPanel progress={syncProgress} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              TOTAL PEERS
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

        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              INBOUND
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-success/20">
              <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums text-success">
              {inboundCount}
            </div>
          </CardContent>
        </Card>

        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              OUTBOUND
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-info/20">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-info" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums text-info">
              {outboundCount}
            </div>
          </CardContent>
        </Card>

        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              NETWORK
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-muted">
              <Globe className="h-3.5 w-3.5 text-foreground-muted" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold">{networkType ?? "Unknown"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bandwidth (if available) */}
      {(bandwidth.bytesReceived > 0 || bandwidth.bytesSent > 0) && (
        <Card variant="crystalline">
          <CardHeader>
            <CardTitle className="text-base font-heading tracking-wide">BANDWIDTH USAGE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-heading tracking-wide text-foreground-secondary">DOWNLOADED</span>
                  <span className="text-sm font-heading font-medium tabular-nums">
                    {formatBytes(bandwidth.bytesReceived)}
                  </span>
                </div>
                <Progress
                  value={50}
                  className="h-2"
                  variant="success"
                />
                <p className="text-xs text-foreground-muted mt-1 font-mono">
                  {formatBytes(bandwidth.receivedPerSecond)}/s
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-heading tracking-wide text-foreground-secondary">UPLOADED</span>
                  <span className="text-sm font-heading font-medium tabular-nums">
                    {formatBytes(bandwidth.bytesSent)}
                  </span>
                </div>
                <Progress
                  value={30}
                  className="h-2"
                  variant="info"
                />
                <p className="text-xs text-foreground-muted mt-1 font-mono">
                  {formatBytes(bandwidth.sentPerSecond)}/s
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Peer List */}
      <Card variant="crystalline">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading tracking-wide">CONNECTED PEERS</CardTitle>
            <Badge variant="outline" shape="chamfered" className="font-mono text-xs">
              {peers.length} peers
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {peers.length === 0 ? (
            <div className="text-center py-8 text-foreground-muted">
              <div className="icon-hex mx-auto mb-3 bg-muted">
                <WifiOff className="h-5 w-5 opacity-50" />
              </div>
              <p className="font-heading">No peers connected</p>
              <p className="text-xs mt-1">Waiting for connections...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {peers.map((peer) => (
                <div
                  key={peer.id}
                  className="flex items-center justify-between py-3 px-4 chamfered-sm bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "icon-hex icon-hex-sm",
                        peer.direction === "Inbound"
                          ? "bg-success/20"
                          : "bg-info/20"
                      )}
                    >
                      {peer.direction === "Inbound" ? (
                        <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <ArrowUpFromLine className="h-3.5 w-3.5 text-info" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono text-sm">
                        {peer.address}:{peer.port}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-foreground-muted font-mono">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">ID: ...{peer.id.slice(-8)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="font-mono text-xs break-all max-w-xs">{peer.id}</span>
                          </TooltipContent>
                        </Tooltip>
                        {peer.latency && <span>{peer.latency}ms</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={peer.state === "Connected" || peer.state === "Ready" ? "success" : "warning"}
                      shape="chamfered"
                      diamond
                    >
                      {peer.state}
                    </Badge>
                    <Button variant="ghost" size="icon-sm">
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
