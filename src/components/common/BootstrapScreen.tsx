import { useEffect, useRef, useState } from "react";

// ─── Crystal Shard SVG (shared pattern with NodeStartupError) ───

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

const SHARD_COLORS = ["text-primary", "text-accent", "text-primary"] as const;
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
        setVisible((v) => { const next = [...v]; next[i] = false; return next; });
        const t = setTimeout(() => {
          setConfigs((c) => { const next = [...c]; next[i] = randomShard(i); return next; });
          setVisible((v) => { const next = [...v]; next[i] = true; return next; });
        }, FADE_MS);
        timeouts.current.push(t);
      };

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

// ─── BootstrapScreen Component ───

interface BootstrapScreenProps {
  loadingMessage: string;
  progressPercent: number;
  startupStage?: string;
  bootstrapPhase?: string | null;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function BootstrapScreen({
  loadingMessage,
  progressPercent,
  startupStage,
  bootstrapPhase,
}: BootstrapScreenProps) {
  const { configs: shardConfigs, visible: shardVisible } = useShardField();

  return (
    <div className="relative h-screen w-screen bg-background hex-grid-bg overflow-hidden">
      {/* Layer 1: Dual radial gradients — primary/accent (healthy anticipation) */}
      <div
        className="absolute inset-0 animate-pulse [animation-duration:4s]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, hsl(var(--primary) / 0.14), transparent 50%), " +
            "radial-gradient(ellipse at 70% 80%, hsl(var(--accent) / 0.12), transparent 45%)",
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
      <div className="absolute top-0 left-0 w-24 h-24 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-24 h-24 border-t border-r border-accent/15 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 border-b border-l border-accent/15 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-24 h-24 border-b border-r border-primary/20 pointer-events-none" />

      {/* Crystal shard field */}
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

      {/* Card layer */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="relative max-w-sm w-full"
          style={{ animation: "fade-in-up 0.6s ease-out 0.3s backwards" }}
        >
          {/* Outer border — primary to accent gradient */}
          <div
            className="chamfered-lg p-[2px]"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--accent) / 0.4))",
            }}
          >
          {/* Inner border — accent to primary gradient */}
          <div
            className="chamfered-lg p-[1px]"
            style={{
              background: "linear-gradient(135deg, hsl(var(--accent) / 0.4), hsl(var(--primary) / 0.5))",
            }}
          >
          {/* Card body */}
          <div className="relative chamfered-lg crystalline p-6 flex flex-col gap-5 shadow-2xl overflow-hidden">
            {/* Inner glow */}
            <div className="absolute inset-0 bg-primary/[0.03] blur-xl -z-10 pointer-events-none" />

            {/* ═══ CRYSTAL ICON CENTERPIECE ═══ */}
            <div
              className="flex justify-center shrink-0"
              style={{ animation: "fade-in-up 0.5s ease-out 0.5s backwards" }}
            >
              <div className="relative">
                {/* Outer glow ring */}
                <div className="absolute inset-[-20px] bg-primary/[0.12] blur-2xl rounded-full animate-pulse [animation-duration:4s] [animation-delay:1s]" />
                {/* Inner glow */}
                <div className="absolute inset-0 bg-accent/[0.2] blur-3xl -z-10 animate-pulse [animation-duration:3s]" />

                {/* Outer rotating hexagon */}
                <svg
                  className="h-20 w-20 animate-spin text-primary relative"
                  style={{ animationDuration: "3s" }}
                  viewBox="0 0 80 80"
                  fill="none"
                >
                  <path
                    d="M40 5L72 22.5V57.5L40 75L8 57.5V22.5L40 5Z"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                    fill="none"
                  />
                  <path
                    d="M40 5L72 22.5V40"
                    stroke="url(#bootstrapGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <defs>
                    <linearGradient
                      id="bootstrapGradient"
                      x1="40" y1="5" x2="72" y2="40"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--accent))" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Inner crystal */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="h-10 w-10" viewBox="0 0 32 32" fill="none">
                    <path
                      d="M16 4L26 10V22L16 28L6 22V10L16 4Z"
                      fill="url(#crystalBootFill)"
                      stroke="hsl(var(--primary))"
                      strokeWidth="0.5"
                    />
                    <path
                      d="M6 10L16 16V28L6 22V10Z"
                      fill="hsl(var(--crystal-facet-dark))"
                      fillOpacity="0.4"
                    />
                    <path
                      d="M26 10L16 16V28L26 22V10Z"
                      fill="hsl(var(--crystal-facet-light))"
                      fillOpacity="0.3"
                    />
                    <path
                      d="M16 4L26 10L16 16L6 10L16 4Z"
                      fill="hsl(var(--crystal-facet-light))"
                      fillOpacity="0.5"
                    />
                    <defs>
                      <linearGradient
                        id="crystalBootFill"
                        x1="6" y1="4" x2="26" y2="28"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="50%" stopColor="hsl(var(--accent))" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* ═══ TITLE ═══ */}
            <div
              className="text-center space-y-1.5 shrink-0"
              style={{ animation: "fade-in-up 0.4s ease-out 0.7s backwards" }}
            >
              <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.24em] text-foreground-secondary">
                {startupStage ? <span>{formatLabel(startupStage)}</span> : null}
                {bootstrapPhase ? (
                  <>
                    <span className="text-primary/40">/</span>
                    <span className="text-primary">{formatLabel(bootstrapPhase)}</span>
                  </>
                ) : null}
              </div>
              <h1 className="font-heading text-lg font-semibold tracking-wider text-primary">
                Loading Crystal Node
              </h1>
              <p className="font-heading text-sm text-foreground-secondary tracking-wide">
                {loadingMessage}
              </p>
            </div>

            {/* ═══ DIVIDER ═══ */}
            <div
              className="divider-angular shrink-0"
              style={{ animation: "fade-in-up 0.4s ease-out 0.8s backwards" }}
            />

            {/* ═══ PROGRESS BAR ═══ */}
            <div
              className="space-y-2.5 shrink-0"
              style={{ animation: "fade-in-up 0.4s ease-out 0.9s backwards" }}
            >
              {/* Percentage display */}
              <div className="flex items-baseline justify-between">
                <span className="font-heading text-xs font-medium tracking-wider text-foreground-secondary uppercase">
                  Progress
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                  {progressPercent}%
                </span>
              </div>

              {/* Progress track */}
              <div className="chamfered-sm-border-wrap">
                <div className="chamfered-sm bg-background-secondary h-3 overflow-hidden relative">
                  {/* Fill bar */}
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                    style={{
                      width: `${progressPercent}%`,
                      background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                    }}
                  />
                  {/* Shimmer overlay */}
                  <div
                    className="absolute inset-y-0 left-0 shimmer"
                    style={{
                      width: `${progressPercent}%`,
                      opacity: 0.3,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ═══ ANIMATED DOTS ═══ */}
            <div
              className="flex justify-center gap-1.5 shrink-0"
              style={{ animation: "fade-in-up 0.4s ease-out 1.0s backwards" }}
            >
              <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
              <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
              <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
