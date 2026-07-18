import { Eye, EyeOff, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AmountDisplay } from "@/components/common";
import { shardsToXtal, addShards, toShards, type ShardAmount } from "@/lib/utils";

interface StakeCardProps {
  withdrawableStake: ShardAmount;
  activeStake: ShardAmount;
  pendingStake: ShardAmount;
  availableBalance: ShardAmount;
  pendingUnstake: ShardAmount;
  immatureBalance: ShardAmount;
  hideBalances: boolean;
  onToggleHide: () => void;
  onStake: () => void;
  onUnstake: () => void;
}

const MASKED_VALUE = "••••••";

const ACTIVE_STAKE_HINT =
  "Active stake is what consensus counts for fruit production right now. " +
  "It refreshes at each epoch boundary, so newly-matured stake activates on the next epoch.";

function StakeCard({
  withdrawableStake,
  activeStake,
  pendingStake,
  availableBalance,
  pendingUnstake,
  immatureBalance,
  hideBalances,
  onToggleHide,
  onStake,
  onUnstake,
}: StakeCardProps) {
  const otherPending = addShards(pendingUnstake, immatureBalance);

  return (
    <Card variant="crystalline" className="bg-gradient-to-br from-primary/10 via-transparent to-accent/10 border-primary/20 relative">
      <CardContent className="pt-6">
        {/* Hide/Reveal toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleHide}
          className="absolute top-3 right-3 h-8 w-8 text-foreground-muted hover:text-foreground"
          title={hideBalances ? "Show balances" : "Hide balances"}
        >
          {hideBalances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>

        <div className="text-center space-y-4">
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm font-heading tracking-wide text-foreground-secondary mb-2 cursor-help decoration-dotted underline-offset-4 [text-decoration-line:underline]">
                  YOUR ACTIVE STAKE
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-[16rem] text-center">
                {ACTIVE_STAKE_HINT}
              </TooltipContent>
            </Tooltip>
            {hideBalances ? (
              <span className="text-2xl font-heading font-bold text-foreground">{MASKED_VALUE}</span>
            ) : (
              <AmountDisplay amount={activeStake} size="xl" showSymbol />
            )}
            <div className="mt-3 space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between gap-3 text-foreground-muted">
                <span>Available</span>
                <span className="text-foreground">
                  {hideBalances ? MASKED_VALUE : shardsToXtal(availableBalance).toLocaleString()} XTAL
                </span>
              </div>
              {toShards(withdrawableStake) > 0n && (
                <div className="flex items-center justify-between gap-3 text-foreground-muted">
                  <span>Mature stake</span>
                  <span className="text-foreground">
                    {hideBalances ? MASKED_VALUE : shardsToXtal(withdrawableStake).toLocaleString()} XTAL
                  </span>
                </div>
              )}
              {toShards(pendingStake) > 0n && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-warning">Pending stake</span>
                  <span className="text-foreground">
                    {hideBalances ? MASKED_VALUE : shardsToXtal(pendingStake).toLocaleString()} XTAL
                  </span>
                </div>
              )}
              {otherPending > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-warning">Other pending</span>
                  <span className="text-foreground">
                    {hideBalances ? MASKED_VALUE : shardsToXtal(otherPending).toLocaleString()} XTAL
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="crystalline"
              size="sm"
              onClick={onStake}
              disabled={availableBalance === 0}
              className="text-foreground"
            >
              <Plus className="h-4 w-4 mr-1" />
              Stake
            </Button>
            <Button
              variant="outline-crystalline"
              size="sm"
              onClick={onUnstake}
              disabled={withdrawableStake === 0}
              className="text-foreground"
            >
              <Minus className="h-4 w-4 mr-1" />
              Unstake
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { StakeCard };
