import { Eye, EyeOff, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmountDisplay } from "@/components/common";
import { shardsToXtal } from "@/lib/utils";

interface StakeCardProps {
  totalStake: number;
  withdrawableStake: number;
  activeStake: number;
  pendingStake: number;
  availableBalance: number;
  pendingUnstake: number;
  immatureBalance: number;
  hideBalances: boolean;
  onToggleHide: () => void;
  onStake: () => void;
  onUnstake: () => void;
}

const MASKED_VALUE = "••••••";

function StakeCard({
  totalStake,
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
  const otherPending = pendingUnstake + immatureBalance;
  const inactiveStake = Math.max(totalStake - activeStake, 0);

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
            <p className="text-sm font-heading tracking-wide text-foreground-secondary mb-2">
              YOUR ACTIVE STAKE
            </p>
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
              {inactiveStake > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className={pendingStake > 0 ? "text-warning" : "text-foreground-muted"}>
                    {pendingStake > 0 ? "Pending activation" : "Inactive stake"}
                  </span>
                  <span className="text-foreground">
                    {hideBalances ? MASKED_VALUE : shardsToXtal(inactiveStake).toLocaleString()} XTAL
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
