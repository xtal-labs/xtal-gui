import { useEffect, useRef, useState } from "react";

import { Check, Copy, FolderOpen, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { tauriCommand } from "@/hooks/useTauriCommand";
import type { StartupErrorInfo } from "@/types";

interface ErrorCategoryInfo {
  title: string;
  suggestions: string[];
}

const ERROR_CATEGORIES: Record<string, ErrorCategoryInfo> = {
  directory: {
    title: "Data Directory Inaccessible",
    suggestions: [
      "Check that the data directory exists and has correct permissions",
      "Ensure the disk has sufficient free space",
      "Try running Crystal with elevated permissions",
    ],
  },
  database: {
    title: "Database Error",
    suggestions: [
      "The blockchain database may be corrupted",
      "Try deleting the data directory and re-syncing from scratch",
      "Check disk health for hardware errors",
    ],
  },
  port: {
    title: "Port Already in Use",
    suggestions: [
      "Another Crystal instance may already be running",
      "Check for other applications using the same port",
      "Close any conflicting processes and retry",
    ],
  },
  wallet: {
    title: "Wallet Initialization Failed",
    suggestions: [
      "The wallet directory may have incorrect permissions",
      "Check that wallet files are not corrupted",
      "Try creating a new wallet after resolving the issue",
    ],
  },
  timeout: {
    title: "Startup Timed Out",
    suggestions: [
      "The node took too long to initialize",
      "This can happen with a very large blockchain database",
      "Check available system memory and disk I/O",
    ],
  },
  build: {
    title: "Node Build Failed",
    suggestions: [
      "An internal error occurred during node initialization",
      "Check the log file for detailed error information",
      "This may indicate a configuration issue",
    ],
  },
  unknown: {
    title: "Unexpected Error",
    suggestions: [
      "An unknown error prevented the node from starting",
      "Check the log file for detailed error information",
      "Consider reporting this issue on GitHub",
    ],
  },
};

function getCategoryInfo(category: string): ErrorCategoryInfo {
  return ERROR_CATEGORIES[category] ?? ERROR_CATEGORIES.unknown;
}

function CrystalShard({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 80 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40 0L65 60L55 130L40 200L25 130L15 60Z"
        fill="currentColor"
      />
      <path
        d="M40 0L65 60L40 50Z"
        fill="currentColor"
        opacity="0.5"
      />
      <path
        d="M40 50L65 60L55 130L40 120Z"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}

const SHARD_COLORS = ["text-destructive", "text-primary", "text-accent"] as const;
const SHARD_COUNT = 6;
const FADE_MS = 1500;

interface ShardConfig {
  top: number;
  left: number;
  rotation: number;
  height: number;
  color: string;
}

function randomShard(index: number): ShardConfig {
  // Generate random position, re-rolling if it lands behind the card (~center region)
  let top: number, left: number;
  do {
    top = Math.random() * 100 - 5;
    left = Math.random() * 100 - 5;
  } while (left > 20 && left < 80 && top > 15 && top < 85);
  return {
    top,
    left,
    rotation: Math.atan2(50 - top, 50 - left) * (180 / Math.PI) - 90,
    height: 5 + Math.random() * 5,
    color: SHARD_COLORS[index % SHARD_COLORS.length],
  };
}

function useShardField() {
  const [configs, setConfigs] = useState<ShardConfig[]>(() =>
    Array.from({ length: SHARD_COUNT }, (_, i) => randomShard(i)),
  );
  const [visible, setVisible] = useState<boolean[]>(() =>
    Array(SHARD_COUNT).fill(true),
  );
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];

    for (let i = 0; i < SHARD_COUNT; i++) {
      const cycle = () => {
        // Fade out
        setVisible((v) => { const next = [...v]; next[i] = false; return next; });

        // After fade-out completes, reposition and fade back in
        const t = setTimeout(() => {
          setConfigs((c) => { const next = [...c]; next[i] = randomShard(i); return next; });
          setVisible((v) => { const next = [...v]; next[i] = true; return next; });
        }, FADE_MS);
        timeouts.current.push(t);
      };

      // Staggered start + randomized interval per shard
      const delay = 2000 + i * 800 + Math.random() * 1500;
      const interval = 4000 + Math.random() * 3000;

      const startTimeout = setTimeout(() => {
        cycle();
        intervals.push(setInterval(cycle, interval + FADE_MS));
      }, delay);
      timeouts.current.push(startTimeout);
    }

    return () => {
      intervals.forEach(clearInterval);
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
    };
  }, []);

  return { configs, visible };
}

const NETWORKS = ["Mainnet", "Testnet", "Regtest"] as const;

export function NodeStartupError({ error }: { error: StartupErrorInfo }) {
  const info = getCategoryInfo(error.category);
  const [copied, setCopied] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState(error.network);
  const [networkChanged, setNetworkChanged] = useState(false);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const { configs: shardConfigs, visible: shardVisible } = useShardField();

  useEffect(() => {
    tauriCommand<string>("get_config_path").then(setConfigPath).catch(() => {});
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy error message:", e);
    }
  };

  const handleOpenDirectory = async (path: string) => {
    try {
      await tauriCommand("open_directory", { path });
    } catch (e) {
      console.error("Failed to open directory:", e);
    }
  };

  const handleRetry = async () => {
    try {
      await tauriCommand("restart_app");
    } catch (e) {
      console.error("Failed to restart:", e);
    }
  };

  const handleNetworkChange = async (network: string) => {
    try {
      await tauriCommand("switch_network", { network: network.toLowerCase() });
      setSelectedNetwork(network);
      setNetworkChanged(true);
    } catch (e) {
      console.error("Failed to switch network:", e);
    }
  };

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="relative min-h-dvh min-w-[var(--app-min-width)] bg-background hex-grid-bg overflow-auto">
      {/* Layer 1: Dual radial gradients with slow pulse */}
      <div
        className="absolute inset-0 animate-pulse [animation-duration:4s]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, hsl(var(--destructive) / 0.18), transparent 50%), " +
            "radial-gradient(ellipse at 30% 20%, hsl(var(--primary) / 0.15), transparent 45%)",
        }}
      />

      {/* Layer 2: Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 40%, hsl(var(--background)) 100%)",
        }}
      />

      {/* Layer 3: Corner facet frames */}
      <div className="absolute top-0 left-0 w-24 h-24 border-t border-l border-destructive/20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-24 h-24 border-t border-r border-destructive/20 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 border-b border-l border-primary/20 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-24 h-24 border-b border-r border-primary/20 pointer-events-none" />

      {/* Crystal debris field — shards that fade in/out at random positions */}
      {shardConfigs.map((shard, i) => (
        <CrystalShard
          key={i}
          className={`absolute pointer-events-none ${shard.color}`}
          style={{
            top: `${shard.top}%`,
            left: `${shard.left}%`,
            height: `${shard.height}rem`,
            width: `${shard.height * 0.22}rem`,
            transform: `rotate(${shard.rotation}deg)`,
            opacity: shardVisible[i] ? 0.11 : 0,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          }}
        />
      ))}

      {/* Card layer — no scroll, flex-fit */}
      <div className="absolute inset-0 flex items-start min-[900px]:items-center justify-center overflow-auto p-4">
        <div
          className="relative max-w-md w-full max-h-full flex flex-col"
          style={{ animation: "fade-in-up 0.6s ease-out 0.3s backwards" }}
        >
        {/* Outer border — red (destructive) to purple gradient */}
        <div
          className="chamfered-lg p-[2px] max-h-full flex flex-col"
          style={{
            background: "linear-gradient(135deg, hsl(var(--destructive) / 0.6), hsl(var(--accent) / 0.5))",
          }}
        >
        {/* Inner border — purple to blue (primary) gradient */}
        <div
          className="chamfered-lg p-[1px] max-h-full flex flex-col"
          style={{
            background: "linear-gradient(135deg, hsl(var(--accent) / 0.5), hsl(var(--primary) / 0.6))",
          }}
        >
        {/* Card body */}
        <div
          className="relative chamfered-lg crystalline p-5 flex flex-col gap-3.5 shadow-2xl overflow-hidden max-h-full"
        >
          {/* Inner glow behind card content */}
          <div className="absolute inset-0 bg-destructive/[0.03] blur-xl -z-10 pointer-events-none" />

          {/* Crystal icon with gradient — dramatic centerpiece */}
          <div
            className="flex justify-center shrink-0"
            style={{ animation: "fade-in-up 0.5s ease-out 0.5s backwards" }}
          >
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-[-20px] bg-primary/[0.15] blur-2xl rounded-full animate-pulse [animation-duration:4s] [animation-delay:1s]" />
              {/* Inner glow */}
              <div className="absolute inset-0 bg-destructive/[0.35] blur-3xl -z-10 animate-pulse [animation-duration:3s]" />
              <svg
                className="h-20 w-20 relative"
                viewBox="0 0 80 80"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="errorGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" />
                  </linearGradient>
                  <linearGradient id="shardGradient" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
                {/* Outer hexagon - broken/fractured */}
                <path
                  d="M40 8L70 25V55L40 72L10 55V25L40 8Z"
                  stroke="url(#errorGradient)"
                  strokeWidth="2"
                  strokeOpacity="0.5"
                  fill="none"
                />
                {/* Crack lines */}
                <path
                  d="M40 8L45 30L70 25"
                  stroke="url(#errorGradient)"
                  strokeWidth="1.5"
                  strokeOpacity="0.65"
                  fill="none"
                />
                <path
                  d="M45 30L40 48L55 55"
                  stroke="url(#shardGradient)"
                  strokeWidth="1.5"
                  strokeOpacity="0.55"
                  fill="none"
                />
                <path
                  d="M40 48L25 42L10 55"
                  stroke="url(#errorGradient)"
                  strokeWidth="1.5"
                  strokeOpacity="0.55"
                  fill="none"
                />
                <path
                  d="M25 42L18 28L10 25"
                  stroke="url(#shardGradient)"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                  fill="none"
                />
                {/* Crystal shard fills */}
                <path
                  d="M40 8L45 30L25 25Z"
                  fill="url(#errorGradient)"
                  fillOpacity="0.22"
                />
                <path
                  d="M45 30L70 25L55 48Z"
                  fill="url(#shardGradient)"
                  fillOpacity="0.17"
                />
                <path
                  d="M45 30L55 48L40 48Z"
                  fill="url(#errorGradient)"
                  fillOpacity="0.15"
                />
                <path
                  d="M25 25L45 30L40 48L25 42Z"
                  fill="url(#shardGradient)"
                  fillOpacity="0.19"
                />
                <path
                  d="M10 25L25 25L25 42L18 28Z"
                  fill="url(#errorGradient)"
                  fillOpacity="0.13"
                />
                {/* Shimmer accent lines */}
                <path
                  d="M20 18L58 62"
                  stroke="hsl(var(--accent))"
                  strokeWidth="0.5"
                  strokeOpacity="0.3"
                  className="animate-pulse [animation-duration:3s]"
                />
                <path
                  d="M60 18L22 60"
                  stroke="hsl(var(--accent))"
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                  className="animate-pulse [animation-duration:3.5s] [animation-delay:0.7s]"
                />
                {/* X mark in center */}
                <path
                  d="M34 34L46 46M46 34L34 46"
                  stroke="url(#errorGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeOpacity="0.9"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div
            className="text-center space-y-1.5 shrink-0"
            style={{ animation: "fade-in-up 0.4s ease-out 0.7s backwards" }}
          >
            <h1 className="font-heading text-lg font-semibold tracking-wider text-destructive">
              Node Failed to Start
            </h1>
            <p className="font-heading text-sm text-foreground-secondary tracking-wide">
              {info.title}
            </p>
          </div>

          {/* Divider */}
          <div
            className="divider-angular shrink-0"
            style={{ animation: "fade-in-up 0.4s ease-out 0.8s backwards" }}
          />

          {/* Error message */}
          <div
            className="chamfered-border-wrap min-h-0 shrink"
            style={{ animation: "fade-in-up 0.4s ease-out 0.9s backwards" }}
          >
          <div
            className="relative chamfered bg-background-secondary p-4 pr-10 min-h-0 overflow-y-auto"
          >
            <p className="font-mono text-xs text-foreground-muted break-all leading-relaxed">
              {error.message}
            </p>
            <button
              className="absolute top-3 right-3 text-foreground-muted hover:text-foreground-secondary transition-colors"
              onClick={handleCopy}
              title="Copy error message"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-2.5 min-h-0 shrink overflow-y-auto">
            <p
              className="font-heading text-xs font-medium tracking-wider text-foreground-secondary uppercase"
              style={{ animation: "fade-in-up 0.4s ease-out 1.0s backwards" }}
            >
              Suggested Actions
            </p>
            <ul className="space-y-2">
              {info.suggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-foreground-secondary"
                  style={{ animation: `fade-in-up 0.4s ease-out ${1.1 + i * 0.1}s backwards` }}
                >
                  <span className="status-diamond-sm bg-destructive/40 mt-1.5 shrink-0" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Path info */}
          <div
            className="chamfered-sm-border-wrap shrink-0"
            style={{ animation: "fade-in-up 0.4s ease-out 1.4s backwards" }}
          >
          <div
            className="chamfered-sm bg-background-secondary p-3 space-y-1.5"
          >
            <div className="flex items-center gap-2 text-xs text-foreground-muted">
              <span className="font-heading font-medium text-foreground-secondary shrink-0 w-12">Network</span>
              <select
                className="font-mono text-xs bg-background border border-border rounded px-1.5 py-0.5 text-foreground-secondary cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
                value={selectedNetwork}
                onChange={(e) => handleNetworkChange(e.target.value)}
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {networkChanged && (
                <span className="text-[10px] text-primary/70 italic">restart to apply</span>
              )}
            </div>
            <div className="flex items-baseline gap-2 text-xs text-foreground-muted">
              <span className="font-heading font-medium text-foreground-secondary shrink-0 w-12">Data</span>
              <span
                className="font-mono truncate cursor-pointer hover:text-foreground-secondary transition-colors"
                onClick={() => handleOpenDirectory(error.dataDir)}
                title="Click to open data directory"
              >
                {error.dataDir}
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-xs text-foreground-muted">
              <span className="font-heading font-medium text-foreground-secondary shrink-0 w-12">Log</span>
              <span
                className="font-mono truncate cursor-pointer hover:text-foreground-secondary transition-colors"
                onClick={() => handleOpenDirectory(error.logPath)}
                title="Click to open log directory"
              >
                {error.logPath}
              </span>
            </div>
            {configPath && (
              <div className="flex items-baseline gap-2 text-xs text-foreground-muted">
                <span className="font-heading font-medium text-foreground-secondary shrink-0 w-12">Config</span>
                <span
                  className="font-mono truncate cursor-pointer hover:text-foreground-secondary transition-colors"
                  onClick={() => handleOpenDirectory(configPath)}
                  title="Click to open config file"
                >
                  {configPath}
                </span>
              </div>
            )}
          </div>
          </div>

          {/* Divider */}
          <div
            className="divider-angular shrink-0"
            style={{ animation: "fade-in-up 0.4s ease-out 1.5s backwards" }}
          />

          {/* Action buttons */}
          <div
            className="flex gap-3 shrink-0"
            style={{ animation: "fade-in-up 0.4s ease-out 1.6s backwards" }}
          >
            <Button
              variant="outline"
              className="flex-1 text-foreground"
              onClick={() => handleOpenDirectory(error.logPath)}
            >
              <FolderOpen className="h-4 w-4" />
              Open Logs
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={handleRetry}
            >
              <RotateCcw className="h-4 w-4" />
              {networkChanged ? "Restart" : "Retry"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
