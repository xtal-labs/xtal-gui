import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Coins, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatXtal } from "@/lib/utils";
import type { NetworkValidatorStats } from "@/types";

interface DashboardStatsProps {
  networkStats: NetworkValidatorStats | null;
  validatorEarnings: number | null;
  isValidatorLoaded: boolean;
  hideBalances: boolean;
}

function ValidatorDashboardStats({ networkStats, validatorEarnings, isValidatorLoaded, hideBalances }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
      {/* EPOCH */}
      <Card variant="crystalline">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
            EPOCH
          </CardTitle>
          <div className="icon-hex icon-hex-sm bg-primary/20">
            <Clock className="h-3.5 w-3.5 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-heading font-bold tabular-nums">
            {networkStats?.currentEpoch ?? "--"}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            Current period
          </p>
        </CardContent>
      </Card>

      {/* NETWORK STAKE */}
      <Card variant="crystalline">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
            NETWORK STAKE
          </CardTitle>
          <div className="icon-hex icon-hex-sm bg-accent/20">
            <Coins className="h-3.5 w-3.5 text-accent" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-heading font-bold tabular-nums">
            {networkStats ? formatXtal(networkStats.totalStaked) : "--"}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            XTAL network-wide
          </p>
        </CardContent>
      </Card>

      {/* VALIDATORS */}
      <Card variant="crystalline">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
            VALIDATORS
          </CardTitle>
          <div className="icon-hex icon-hex-sm bg-success/20">
            <Users className="h-3.5 w-3.5 text-success" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-heading font-bold tabular-nums">
            {networkStats?.validatorCount ?? "--"}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            Staked addresses
          </p>
        </CardContent>
      </Card>

      {/* XTAL EARNED */}
      <Card variant="crystalline" className={cn(
        "transition-opacity duration-300",
        isValidatorLoaded ? "opacity-100" : "opacity-50"
      )}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
            XTAL EARNED
          </CardTitle>
          <div className={cn(
            "icon-hex icon-hex-sm",
            isValidatorLoaded ? "bg-warning/20" : "bg-muted"
          )}>
            <TrendingUp className={cn(
              "h-3.5 w-3.5",
              isValidatorLoaded ? "text-warning" : "text-foreground-muted"
            )} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-heading font-bold tabular-nums">
            {hideBalances && isValidatorLoaded
              ? "••••••"
              : validatorEarnings !== null
                ? formatXtal(validatorEarnings)
                : "--"}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {isValidatorLoaded ? "Lifetime earnings" : "Load validator to view"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export { ValidatorDashboardStats };
