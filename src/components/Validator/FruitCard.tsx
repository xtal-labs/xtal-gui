import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Lock, AlertCircle, Timer, TrendingUp, TrendingDown, Info } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Switch } from "@/components/ui/switch";
import { cn, shardsToXtal, formatDuration, formatNumber } from "@/lib/utils";
import { FRUIT_COLORS } from "@/lib/fruitColors";
import type { FruitDifficultyHistoryPoint } from "@/types";

interface FruitCardProps {
  fruitType: string;
  emoji: string;
  minStake: number;
  isEligible: boolean;
  isActive: boolean;
  shortfall: number;
  fruitsProduced: number;
  onToggle: (active: boolean) => void;
  isLoading?: boolean;
  // Production stats integration
  expectedTimeSecs?: number;
  personalExpectedTimeSecs?: number;
  difficultyChanged?: boolean;
  difficultyUp?: boolean;  // true = harder, false = easier
  // Info tooltip data
  targetIntervalSecs?: number;
  difficultyHistory?: FruitDifficultyHistoryPoint[];
  maxSizeBytes?: number;
  maxFuel?: number;
}

function FruitCard({
  fruitType,
  emoji,
  minStake,
  isEligible,
  isActive,
  shortfall,
  fruitsProduced,
  onToggle,
  isLoading,
  expectedTimeSecs,
  personalExpectedTimeSecs,
  difficultyChanged,
  difficultyUp,
  targetIntervalSecs,
  difficultyHistory = [],
  maxSizeBytes,
  maxFuel,
}: FruitCardProps) {
  const colors = FRUIT_COLORS[fruitType] || FRUIT_COLORS.Apple;
  const [showTooltip, setShowTooltip] = useState(false);
  const infoBtnRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState({
    top: 0,
    left: 0,
    width: 288,
    maxHeight: 360,
  });

  const updateTooltipPos = useCallback(() => {
    if (infoBtnRef.current && typeof window !== "undefined") {
      const rect = infoBtnRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const tooltipGap = 8;
      const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
      const availableHeight = Math.max(160, window.innerHeight - viewportPadding * 2);
      const width = Math.min(288, availableWidth);
      const measuredHeight = tooltipRef.current?.offsetHeight ?? 320;
      const maxLeft = window.innerWidth - width - viewportPadding;
      const spaceBelow = window.innerHeight - rect.bottom - tooltipGap - viewportPadding;
      const spaceAbove = rect.top - tooltipGap - viewportPadding;
      const openAbove = spaceBelow < measuredHeight && spaceAbove > spaceBelow;
      const availableVerticalSpace = Math.max(160, Math.min(availableHeight, openAbove ? spaceAbove : spaceBelow));
      const height = Math.min(measuredHeight, availableVerticalSpace);

      let left = rect.left;
      let top = openAbove ? rect.top - height - tooltipGap : rect.bottom + tooltipGap;

      setTooltipPos({
        top: Math.max(viewportPadding, top),
        left: Math.max(viewportPadding, Math.min(left, maxLeft)),
        width,
        maxHeight: availableVerticalSpace,
      });
    }
  }, []);

  // Use personal time when available, fall back to network time
  const displayTimeSecs = personalExpectedTimeSecs ?? expectedTimeSecs;
  const difficultyChartId = `${fruitType.replace(/[^a-z0-9]/gi, "") || "fruit"}DifficultyGradient`;
  const difficultyChartData = useMemo(
    () =>
      difficultyHistory.map((point) => ({
        epoch: point.epoch,
        difficultyBits: point.difficultyBits,
        expectedTimeSecs: point.expectedTimeSecs,
      })),
    [difficultyHistory]
  );
  const latestDifficulty = difficultyHistory[difficultyHistory.length - 1];
  const hasDifficultyTrend = difficultyChartData.length > 1;

  useLayoutEffect(() => {
    if (!showTooltip) return;

    updateTooltipPos();
    const frame = window.requestAnimationFrame(updateTooltipPos);

    return () => window.cancelAnimationFrame(frame);
  }, [showTooltip, updateTooltipPos, difficultyChartData.length]);

  useEffect(() => {
    if (!showTooltip) return;

    window.addEventListener("resize", updateTooltipPos);
    window.addEventListener("scroll", updateTooltipPos, true);

    return () => {
      window.removeEventListener("resize", updateTooltipPos);
      window.removeEventListener("scroll", updateTooltipPos, true);
    };
  }, [showTooltip, updateTooltipPos]);

  return (
    <>
    <div
      className={cn(
        "relative group chamfered-sm transition-all duration-300",
        "bg-gradient-to-br border",
        // Always apply fruit colors
        colors.bg,
        colors.border,
        // When active: add glow effect
        isActive && `shadow-lg ${colors.glow}`,
        // When not eligible: reduce opacity to 50%
        !isEligible && "opacity-50"
      )}
    >
      {/* Active indicator pulse */}
      {isActive && (
        <div className="absolute inset-0 animate-pulse-live opacity-30 bg-gradient-to-br from-transparent to-white/5" />
      )}

      <div className="relative p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={fruitType}>
              {emoji}
            </span>
            <span className="font-heading font-semibold tracking-wide text-foreground">
              {fruitType}
            </span>
            {/* Info tooltip trigger */}
            <button
              ref={infoBtnRef}
              className="text-foreground-muted hover:text-foreground transition-colors"
              onMouseEnter={() => { updateTooltipPos(); setShowTooltip(true); }}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => { updateTooltipPos(); setShowTooltip(true); }}
              onBlur={() => setShowTooltip(false)}
              onClick={() => { updateTooltipPos(); setShowTooltip(!showTooltip); }}
              aria-label={`${fruitType} specifications`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Toggle switch */}
          <div className="flex items-center gap-2">
            {!isEligible && <Lock className="h-4 w-4 text-foreground-muted" />}
            <Switch
              checked={isActive}
              onCheckedChange={onToggle}
              disabled={!isEligible || isLoading}
              className={cn(
                "data-[state=checked]:bg-primary",
                isLoading && "opacity-50"
              )}
            />
          </div>
        </div>

        {/* Production count or shortfall */}
        {isEligible ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-muted font-heading">Produced</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {fruitsProduced}
            </span>
          </div>
        ) : (
          <div className="text-xs text-warning font-heading flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Need {shardsToXtal(shortfall).toLocaleString()} more XTAL
          </div>
        )}

        {/* Production Stats Section */}
        {isEligible && displayTimeSecs !== undefined && (
          <div className="pt-2 mt-2 border-t border-border/30">
            <div className="flex items-center justify-between">
              {/* Expected Time */}
              <div
                className="flex items-center gap-1.5"
                title={personalExpectedTimeSecs !== undefined
                  ? "Your expected time to produce one fruit"
                  : "Network expected time (load validator for personal estimate)"
                }
              >
                <Timer className="h-3.5 w-3.5 text-foreground-muted" />
                <span className="font-mono text-xs tabular-nums text-foreground">
                  ~{formatDuration(displayTimeSecs)}
                </span>
                {personalExpectedTimeSecs === undefined && (
                  <span className="text-[10px] text-foreground-muted">(net)</span>
                )}
              </div>

              {/* Difficulty Indicator */}
              {difficultyChanged && (
                <div
                  className={cn(
                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-xs font-mono",
                    difficultyUp
                      ? "bg-success/20 text-success"
                      : "bg-destructive/20 text-destructive"
                  )}
                  title={difficultyUp ? "Difficulty increased" : "Difficulty decreased"}
                >
                  {difficultyUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active indicator bar */}
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary animate-shimmer" />
        )}
      </div>
    </div>

    {/* Info tooltip — rendered outside the chamfered card so clip-path doesn't clip it */}
    {showTooltip && (
      <div
        ref={tooltipRef}
        className="fixed z-50 animate-[fadeInDown_150ms_ease-out] overflow-y-auto overscroll-contain rounded-md bg-black/70 backdrop-blur-xl border border-white/[0.08] shadow-xl shadow-black/40"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: tooltipPos.width,
          maxHeight: tooltipPos.maxHeight,
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Fruit-colored accent bar */}
        <div className={cn("h-0.5 bg-gradient-to-r", colors.bg.replace(/\/\d+/g, ""))} />

        <div className="p-3 space-y-2.5">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{emoji}</span>
            <span className="font-heading font-semibold text-sm text-white/90 tracking-wide">{fruitType}</span>
          </div>

          {/* Stats */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className={cn("inline-block h-1 w-1 rounded-full", colors.icon.replace("text-", "bg-"))} />
                <span className="text-[11px] text-white/50 uppercase tracking-wider">Stake</span>
              </div>
              <span className="font-mono text-xs text-white/80">{shardsToXtal(minStake).toLocaleString()} XTAL</span>
            </div>
            {targetIntervalSecs !== undefined && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-1 w-1 rounded-full", colors.icon.replace("text-", "bg-"))} />
                  <span className="text-[11px] text-white/50 uppercase tracking-wider">Target</span>
                </div>
                <span className="font-mono text-xs text-white/80">1 / {formatDuration(targetIntervalSecs)}</span>
              </div>
            )}
            {latestDifficulty && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-1 w-1 rounded-full", colors.icon.replace("text-", "bg-"))} />
                  <span className="text-[11px] text-white/50 uppercase tracking-wider">Difficulty</span>
                </div>
                <span className="font-mono text-xs text-white/80">
                  0x{latestDifficulty.difficultyBits.toString(16)}
                </span>
              </div>
            )}
            {maxSizeBytes !== undefined && maxSizeBytes > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-1 w-1 rounded-full", colors.icon.replace("text-", "bg-"))} />
                  <span className="text-[11px] text-white/50 uppercase tracking-wider">Size</span>
                </div>
                <span className="font-mono text-xs text-white/80">{(maxSizeBytes / 1024).toFixed(0)} KB</span>
              </div>
            )}
            {maxFuel !== undefined && maxFuel > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("inline-block h-1 w-1 rounded-full", colors.icon.replace("text-", "bg-"))} />
                  <span className="text-[11px] text-white/50 uppercase tracking-wider">Fuel</span>
                </div>
                <span className="font-mono text-xs text-white/80">{formatNumber(maxFuel)}</span>
              </div>
            )}
          </div>

          {latestDifficulty && (
            <div className="pt-2 border-t border-white/[0.08]">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] text-white/50 uppercase tracking-wider">Epoch Difficulty</span>
                <span className="font-mono text-[11px] text-white/45">
                  {difficultyChartData.length} epoch{difficultyChartData.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-24 w-full">
                {hasDifficultyTrend ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={difficultyChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={difficultyChartId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="epoch"
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        width={48}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
                        tickLine={false}
                        axisLine={false}
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(value) => `0x${Number(value).toString(16)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(0,0,0,0.88)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "6px",
                          color: "rgba(255,255,255,0.86)",
                          fontSize: "11px",
                        }}
                        labelStyle={{ color: "rgba(255,255,255,0.72)" }}
                        labelFormatter={(label) => `Epoch ${label}`}
                        formatter={(value) => [`0x${Number(value).toString(16)}`, "Difficulty"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="difficultyBits"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.8}
                        fill={`url(#${difficultyChartId})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-sm border border-white/[0.08] bg-white/[0.03]">
                    <span className="font-mono text-[11px] text-white/45">
                      Epoch {latestDifficulty.epoch}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

export { FruitCard };
