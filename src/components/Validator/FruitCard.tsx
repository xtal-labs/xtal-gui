import { useState, useCallback, useRef } from "react";
import { Lock, AlertCircle, Timer, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn, shardsToXtal, formatDuration, formatNumber } from "@/lib/utils";
import { FRUIT_COLORS } from "@/lib/fruitColors";

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
  maxSizeBytes,
  maxFuel,
}: FruitCardProps) {
  const colors = FRUIT_COLORS[fruitType] || FRUIT_COLORS.Apple;
  const [showTooltip, setShowTooltip] = useState(false);
  const infoBtnRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const updateTooltipPos = useCallback(() => {
    if (infoBtnRef.current) {
      const rect = infoBtnRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.bottom + 8, left: rect.left });
    }
  }, []);

  // Use personal time when available, fall back to network time
  const displayTimeSecs = personalExpectedTimeSecs ?? expectedTimeSecs;

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
        className="fixed z-50 w-52 animate-[fadeInDown_150ms_ease-out] overflow-hidden rounded-md bg-black/70 backdrop-blur-xl border border-white/[0.08] shadow-xl shadow-black/40"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
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
        </div>
      </div>
    )}
    </>
  );
}

export { FruitCard };
