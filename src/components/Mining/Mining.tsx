import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
  Activity,
  Zap,
  AlertTriangle,
  Wallet,
  ChevronDown,
  Clock,
  Layers,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/common";
import { useMiningStore, useUiStore, useWalletStore } from "@/stores";
import { tauriCommand, tauriCommandSafe } from "@/hooks";
import { formatHashRateMH, formatDuration, formatTimeAgo, cn } from "@/lib/utils";
import type { MinedBlock, MiningStatus, MiningStats } from "@/types";

// Time window options for hash rate chart
type TimeWindow = "5m" | "30m" | "1hr" | "4hr" | "24hr";

// `tickInterval` (ms between x-axis ticks) drives an explicit, data-independent tick
// set so the axis labels stay fixed while the line scrolls. Each value divides `ms`
// evenly, yielding ~4-6 clean ticks per window.
const TIME_WINDOWS: Record<TimeWindow, { label: string; ms: number; downsample: number; tickInterval: number }> = {
  "5m":   { label: "5m",   ms: 5 * 60 * 1000,      downsample: 1,   tickInterval: 60 * 1000 },
  "30m":  { label: "30m",  ms: 30 * 60 * 1000,     downsample: 3,   tickInterval: 10 * 60 * 1000 },
  "1hr":  { label: "1h",   ms: 60 * 60 * 1000,     downsample: 6,   tickInterval: 15 * 60 * 1000 },
  "4hr":  { label: "4h",   ms: 4 * 60 * 60 * 1000, downsample: 24,  tickInterval: 60 * 60 * 1000 },
  "24hr": { label: "24h",  ms: 24 * 60 * 60 * 1000, downsample: 144, tickInterval: 6 * 60 * 60 * 1000 },
};

export default function Mining() {
  const {
    isActive,
    threads,
    maxThreads,
    stats,
    hashRateHistory,
    minedBlocks,
    miningWalletName,
    setThreads,
    setStatus,
    setStats,
    setActive,
    beginToggle,
    setMiningWalletName,
    setMinedBlocks,
  } = useMiningStore();
  const { addToast, setActiveTab } = useUiStore();
  const { isLoaded: walletLoaded, walletName, availableWallets, setLoaded } = useWalletStore();
  const canStartMining = walletLoaded && Boolean(walletName);

  const [isStarting, setIsStarting] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("5m");

  // Fetch mining status and stats on mount to get maxThreads and initial statistics from the backend
  useEffect(() => {
    let cancelled = false;

    tauriCommandSafe<MiningStatus>("get_mining_status").then(([status, error]) => {
      if (cancelled) return;
      if (status) setStatus(status);
      else console.warn("[Mining] Failed to load mining status:", error);
    });

    tauriCommandSafe<MiningStats | null>("get_mining_stats").then(([stats, error]) => {
      if (cancelled) return;
      if (stats) setStats(stats);
      else if (error) console.warn("[Mining] Failed to load mining stats:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [setStatus, setStats]);

  // Load historical mined blocks from wallet database
  useEffect(() => {
    const loadMinedBlocks = async () => {
      if (!walletLoaded) return;
      try {
        const records = await tauriCommand<Array<{
          id: number;
          hash: string;
          height: number;
          leafHeight: number;
          blockType: string;
          timestamp: number;
          txCount?: number;
          fruitCount?: number;
          minedAt: number;
        }>>("get_mined_blocks", { limit: 50 });

        if (records && records.length > 0) {
          const blocks: MinedBlock[] = records.map((r) => {
            const base = {
              hash: r.hash,
              height: r.height,
              leafHeight: r.leafHeight,
              timestamp: r.timestamp,
              minedAt: r.minedAt * 1000, // Convert to ms
            };
            if (r.blockType === "Stem") {
              return { ...base, blockType: "Stem" as const, fruitCount: r.fruitCount ?? 0 };
            }
            return { ...base, blockType: "Leaf" as const, txCount: r.txCount ?? 0 };
          });
          setMinedBlocks(blocks);
        }
      } catch (err) {
        console.warn("Failed to load mined blocks history:", err);
      }
    };

    loadMinedBlocks();
  }, [walletLoaded, setMinedBlocks]);

  const handleToggleMining = async () => {
    if (!isActive && !canStartMining) {
      addToast({
        type: "warning",
        title: "Wallet required",
        message: "Select or load a wallet before starting mining.",
        duration: 5000,
      });
      return;
    }

    setIsStarting(true);
    // Optimistically flip the button to the requested state and arm the guard so the
    // lagging live `stats.isRunning` can't flicker it back before the backend confirms.
    beginToggle(!isActive);
    try {
      if (isActive) {
        await tauriCommand("stop_mining");
        setMiningWalletName(null);
      } else {
        // Snapshot the wallet name at mining start
        setMiningWalletName(walletName);
        await tauriCommand("start_mining", { threads });
      }
      // Immediately fetch status and stats for responsive UI (don't rely solely on events).
      // These refresh the numbers; the guard keeps a stale snapshot from flipping the button.
      const [status, stats] = await Promise.all([
        tauriCommand<MiningStatus>("get_mining_status"),
        tauriCommand<MiningStats | null>("get_mining_stats"),
      ]);

      if (status) setStatus(status);
      if (stats) setStats(stats);
    } catch (err) {
      // Revert the optimistic flip back to the pre-click state and drop the guard.
      setActive(isActive);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Failed to toggle mining:", err);
      addToast({
        type: "error",
        title: isActive ? "Failed to stop mining" : "Failed to start mining",
        message: errorMessage,
        duration: 8000,
      });
    } finally {
      setIsStarting(false);
    }
  };

  // Hold-to-repeat for thread +/- buttons
  const repeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const clearRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearTimeout(repeatRef.current);
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);
  useEffect(() => clearRepeat, [clearRepeat]);

  const startRepeat = useCallback((delta: 1 | -1) => {
    const step = () => {
      const cur = threadsRef.current;
      const next = delta === 1 ? Math.min(maxThreads, cur + 1) : Math.max(1, cur - 1);
      if (next !== cur) setThreads(next);
    };
    step();
    const delay = setTimeout(() => {
      repeatRef.current = setInterval(step, 80);
    }, 400);
    repeatRef.current = delay;
  }, [maxThreads, setThreads]);

  const handleSwitchWallet = async (name: string) => {
    try {
      await tauriCommand("load_wallet", { walletName: name });
      setLoaded(true, name);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to switch wallet",
        message: errorMessage,
        duration: 5000,
      });
    }
  };

  // Fixed domain + explicit ticks for a stable axis. Both depend only on the selected
  // window, so they keep a stable reference as the line scrolls. Explicit ticks make
  // the axis data-independent: paired with `allowDataOverflow` on the XAxis (which pins
  // the domain to exactly [0, ms] and clips the live point's sub-second overflow), the
  // labels stay put while the line scrolls underneath.
  const { domain, ticks } = useMemo(() => {
    const { ms, tickInterval } = TIME_WINDOWS[timeWindow];
    const count = Math.floor(ms / tickInterval);
    return {
      domain: [0, ms] as [number, number],
      ticks: Array.from({ length: count + 1 }, (_, i) => i * tickInterval),
    };
  }, [timeWindow]);

  // Anchor the visible window to the newest data point (quantized to the second)
  // rather than a live wall-clock timer. This means the chart only re-renders when
  // `hashRateHistory` actually changes — once per new sample while mining, and not at
  // all while stopped — so the line advances on a single data-driven cadence instead of
  // an independent 1s beat. Quantizing keeps x-positions stable across renders within a
  // sample interval (jitter-free); rounding *up* keeps the newest point at/just inside
  // the right edge, where `allowDataOverflow` clips any sub-second overflow.
  const windowStart = useMemo(() => {
    const { ms } = TIME_WINDOWS[timeWindow];
    const last = hashRateHistory[hashRateHistory.length - 1]?.timestamp ?? Date.now();
    const anchor = Math.ceil(last / 1000) * 1000;
    return anchor - ms;
  }, [hashRateHistory, timeWindow]);

  // Prepare chart data - filter to selected time window and downsample
  const chartData = useMemo(() => {
    const { downsample } = TIME_WINDOWS[timeWindow];

    // Filter to time window
    const filtered = hashRateHistory.filter((p) => p.timestamp >= windowStart);

    // Downsample for longer windows (keeps ~600 points max)
    const downsampled = filtered.filter((_, i) => i % downsample === 0);

    // Use relative time for stable x-axis
    return downsampled.map((point) => ({
      relativeTime: point.timestamp - windowStart,
      timestamp: point.timestamp,
      hashRate: point.hashRate / 1_000_000,
    }));
  }, [hashRateHistory, timeWindow, windowStart]);

  // Format relative time for x-axis ticks based on window size
  const formatXAxisTick = (relativeMs: number): string => {
    const { ms } = TIME_WINDOWS[timeWindow];
    const timeFromNow = ms - relativeMs; // How far back from "now"

    if (timeFromNow === 0) return "now";

    if (ms <= 5 * 60 * 1000) {
      // 5m window: show seconds "-5:00", "-4:00", etc.
      const mins = Math.floor(timeFromNow / 60000);
      const secs = Math.floor((timeFromNow % 60000) / 1000);
      return `-${mins}:${secs.toString().padStart(2, "0")}`;
    } else if (ms <= 60 * 60 * 1000) {
      // 30m-1h window: show minutes "-30m", "-20m", etc.
      const mins = Math.floor(timeFromNow / 60000);
      return mins === 0 ? "now" : `-${mins}m`;
    } else {
      // 4h-24h window: show hours "-4h", "-2h", etc.
      const hours = timeFromNow / 3600000;
      if (hours < 0.1) return "now";
      return hours >= 1 ? `-${hours.toFixed(0)}h` : `-${Math.round(hours * 60)}m`;
    }
  };

  // Custom tooltip formatter to show actual time
  const formatTooltipLabel = (label: React.ReactNode): string => {
    const relativeMs = Number(label);
    // Use the same data-anchored window start as the axis so the reconstructed time
    // matches the point's real timestamp (windowStart + relativeMs === point.timestamp).
    const actualTime = windowStart + relativeMs;
    return new Date(actualTime).toLocaleTimeString();
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            MINING
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Control your mining operations
          </p>
        </div>
        <StatusBadge status={isActive ? "mining" : "idle"} />
      </div>

      {/* Main Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Control Card */}
        <Card variant="crystalline" className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-heading tracking-wide">MINING CONTROL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Start/Stop Button */}
            <Button
              size="xl"
              variant={isActive ? "destructive" : "success"}
              className="w-full"
              onClick={handleToggleMining}
              isLoading={isStarting}
              disabled={!isActive && !canStartMining}
              aria-describedby={!isActive && !canStartMining ? "mining-wallet-required" : undefined}
            >
              {isActive ? (
                <>
                  <Square className="h-5 w-5" />
                  Stop Mining
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Start Mining
                </>
              )}
            </Button>
            {!isActive && !canStartMining && (
              <p id="mining-wallet-required" className="text-xs text-warning">
                Select or load a wallet before starting mining.
              </p>
            )}

            {/* Thread Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Mining Threads</label>
                <span className="text-sm font-bold tabular-nums text-primary">
                  {threads} / {maxThreads}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onPointerDown={() => startRepeat(-1)}
                  onPointerUp={clearRepeat}
                  onPointerLeave={clearRepeat}
                  disabled={threads <= 1 || isActive}
                >
                  -
                </Button>
                <Progress
                  value={(threads / maxThreads) * 100}
                  className={cn("flex-1", isActive && "opacity-50")}
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  onPointerDown={() => startRepeat(1)}
                  onPointerUp={clearRepeat}
                  onPointerLeave={clearRepeat}
                  disabled={threads >= maxThreads || isActive}
                >
                  +
                </Button>
              </div>
              <p className="text-xs text-foreground-muted">
                {isActive ? "Stop mining to change threads" : `Available CPU cores: ${maxThreads}`}
              </p>
            </div>

            {/* Wallet Selection */}
            <div className="space-y-2 pt-4 border-t border-border">
              <label className="text-sm font-medium">Mining Wallet</label>
              {isActive && miningWalletName ? (
                // When mining is active, show the locked-in wallet (read-only)
                <div className="chamfered-sm-border-wrap">
                  <div className="chamfered-sm flex items-center gap-2 px-3 py-2 bg-muted/30">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="font-heading">{miningWalletName}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">Locked</Badge>
                  </div>
                </div>
              ) : walletLoaded && walletName ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isActive}>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      disabled={isActive}
                    >
                      <span className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        {walletName}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
                    {availableWallets.filter((w) => w !== walletName).length > 0 ? (
                      availableWallets
                        .filter((w) => w !== walletName)
                        .map((name) => (
                          <DropdownMenuItem key={name} onClick={() => handleSwitchWallet(name)}>
                            <Wallet className="h-4 w-4 mr-2" />
                            {name}
                          </DropdownMenuItem>
                        ))
                    ) : (
                      <DropdownMenuItem disabled>No other wallets available</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : availableWallets.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isActive}>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      disabled={isActive}
                    >
                      <span className="flex items-center gap-2 text-foreground-muted">
                        <Wallet className="h-4 w-4" />
                        Select a wallet...
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
                    {availableWallets.map((name) => (
                      <DropdownMenuItem key={name} onClick={() => handleSwitchWallet(name)}>
                        <Wallet className="h-4 w-4 mr-2" />
                        {name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-foreground-muted hover:text-foreground"
                  onClick={() => setActiveTab("wallet")}
                >
                  <Wallet className="h-4 w-4" />
                  Load Wallet
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Hash Rate Chart */}
        <Card variant="crystalline" className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-heading tracking-wide">HASH RATE</CardTitle>
            <div className="flex items-center gap-2">
              {/* Time window toggles */}
              <div className="flex gap-0.5 bg-muted/50 rounded-md p-0.5">
                {(Object.keys(TIME_WINDOWS) as TimeWindow[]).map((w) => (
                  <Button
                    key={w}
                    variant={timeWindow === w ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setTimeWindow(w)}
                  >
                    {TIME_WINDOWS[w].label}
                  </Button>
                ))}
              </div>
              {/* Current hash rate display */}
              <div className="flex items-center gap-3 ml-2 pl-2 border-l border-border">
                <div className={cn("icon-hex icon-hex-sm", isActive ? "bg-success/20" : "bg-muted")}>
                  <Activity className={cn("h-3.5 w-3.5", isActive ? "text-success" : "text-foreground-muted")} />
                </div>
                <span className="text-xl font-heading font-bold tabular-nums">
                  {formatHashRateMH(isActive ? stats.hashRateMH : 0)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="hashRateGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="relativeTime"
                      type="number"
                      domain={domain}
                      allowDataOverflow
                      ticks={ticks}
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground-muted))" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatXAxisTick}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--foreground-muted))" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value.toFixed(1)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      labelFormatter={formatTooltipLabel}
                      formatter={(value) => [`${Number(value).toFixed(2)} MH/s`, "Hash Rate"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="hashRate"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#hashRateGradient)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-foreground-muted">
                  <div className="text-center">
                    <div className="icon-hex mx-auto mb-3 bg-muted">
                      <Activity className="h-5 w-5 opacity-50" />
                    </div>
                    <p className="font-heading">Start mining to see hash rate data</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              STEMS FOUND
            </CardTitle>
            <Badge variant="stem" shape="hexagon" faceted>{stats.stemsFound}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {stats.stemsFound}
            </div>
          </CardContent>
        </Card>

        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              LEAVES FOUND
            </CardTitle>
            <Badge variant="leaf" shape="hexagon" faceted>{stats.leavesFound}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums">
              {stats.leavesFound}
            </div>
          </CardContent>
        </Card>

        <Card variant="crystalline">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
              STALE BLOCKS
            </CardTitle>
            <div className="icon-hex icon-hex-sm bg-warning/20">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-heading font-bold tabular-nums text-warning">
              {stats.staleBlocks}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mining Session Info */}
      {isActive && (
        <Card variant="crystalline">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
              <div className="icon-hex icon-hex-sm bg-primary/20">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              CURRENT SESSION
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-foreground-muted font-heading tracking-wide text-xs">UPTIME</p>
                <p className="font-heading font-medium">{formatDuration(stats.uptime)}</p>
              </div>
              <div>
                <p className="text-foreground-muted font-heading tracking-wide text-xs">ACTIVE THREADS</p>
                <p className="font-heading font-medium">{threads}</p>
              </div>
              <div>
                <p className="text-foreground-muted font-heading tracking-wide text-xs">TOTAL BLOCKS</p>
                <p className="font-heading font-medium">{stats.stemsFound + stats.leavesFound}</p>
              </div>
              <div>
                <p className="text-foreground-muted font-heading tracking-wide text-xs">EFFICIENCY</p>
                <p className="font-heading font-medium">
                  {stats.staleBlocks > 0
                    ? `${(((stats.stemsFound + stats.leavesFound) / (stats.stemsFound + stats.leavesFound + stats.staleBlocks)) * 100).toFixed(1)}%`
                    : "100%"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mined Blocks History */}
      <Card variant="crystalline">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
            <div className="icon-hex icon-hex-sm bg-success/20">
              <Layers className="h-3.5 w-3.5 text-success" />
            </div>
            MINED BLOCKS
            {minedBlocks.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {minedBlocks.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {minedBlocks.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {minedBlocks.map((block, index) => (
                <div
                  key={`${block.hash}-${index}`}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    block.blockType === "Leaf"
                      ? "bg-success/5 border-success/20"
                      : "bg-info/5 border-info/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={block.blockType === "Leaf" ? "leaf" : "stem"}
                      shape="hexagon"
                    >
                      {block.blockType}
                    </Badge>
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {block.hash.slice(0, 16)}...
                      </p>
                      <p className="text-xs text-foreground-muted flex items-center gap-2">
                        <span>Height: {block.height}</span>
                        <span className="opacity-50">|</span>
                        <span>
                          {block.blockType === "Stem"
                            ? `${block.fruitCount} fruit${block.fruitCount !== 1 ? "s" : ""}`
                            : `${block.txCount} tx${block.txCount !== 1 ? "s" : ""}`
                          }
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-foreground-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(block.minedAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-foreground-muted">
              <div className="icon-hex mx-auto mb-3 bg-muted">
                <Layers className="h-5 w-5 opacity-50" />
              </div>
              <p className="font-heading">No blocks mined yet</p>
              <p className="text-xs mt-1">
                {walletLoaded
                  ? "Start mining to find blocks"
                  : "Load a wallet to start mining"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
