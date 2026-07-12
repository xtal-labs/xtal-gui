import { useCallback, useEffect, useState } from "react";
import { Coins, RefreshCw } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useTimeAgo } from "@/components/common/ContractValueDisplay";
import { Button } from "@/components/ui/button";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useValidatorStore } from "@/stores";
import { formatXtal, cn } from "@/lib/utils";
import type { ValidatorEarnings } from "@/types/validator";
import type { WidgetProps } from "./registry";

interface CachedEarnings {
  earnings: ValidatorEarnings;
  fetchedAt: number;
}

/**
 * get_validator_earnings scans the full chain (0..=height) — expensive.
 * Module-level cache keyed by validator address so tab switches and remounts
 * never re-scan; only the explicit refresh button does. Never wire this to
 * refreshTrigger.
 */
const earningsCache = new Map<string, CachedEarnings>();

export default function ValidatorEarningsWidget({ size, shellProps }: WidgetProps) {
  const address = useValidatorStore((s) => s.address);
  const setValidatorEarnings = useValidatorStore((s) => s.setValidatorEarnings);

  const [cached, setCached] = useState<CachedEarnings | null>(
    address ? earningsCache.get(address) ?? null : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeAgo = useTimeAgo(cached?.fetchedAt ?? null);

  const fetchEarnings = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);
    try {
      const earnings = await tauriCommand<ValidatorEarnings>(
        "get_validator_earnings",
        { address }
      );
      const entry = { earnings, fetchedAt: Date.now() };
      earningsCache.set(address, entry);
      setCached(entry);
      setValidatorEarnings(earnings.totalEarned);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [address, setValidatorEarnings]);

  // One-shot fetch on mount, only on a cache miss.
  useEffect(() => {
    if (!address) return;
    const hit = earningsCache.get(address) ?? null;
    setCached(hit);
    if (!hit) fetchEarnings();
  }, [address, fetchEarnings]);

  const earnings = cached?.earnings ?? null;

  return (
    <WidgetShell
      title="VALIDATOR EARNINGS"
      icon={<WidgetIcon icon={Coins} wrapClass="bg-warning/20" iconClass="text-warning" />}
      {...shellProps}
    >
      {!address ? (
        <>
          <div className={cn("font-heading font-bold tabular-nums text-foreground-muted", VALUE_SIZE_CLASSES[size])}>
            --
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            No validator loaded
          </p>
        </>
      ) : error ? (
        <p className="text-xs text-foreground-muted font-mono break-all">{error}</p>
      ) : !earnings ? (
        <>
          <div className="h-8 w-24 bg-muted/50 animate-pulse chamfered-sm" />
          <div className="h-3 w-32 bg-muted/30 animate-pulse chamfered-sm mt-2" />
        </>
      ) : (
        <>
          <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
            {formatXtal(earnings.totalEarned)}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {formatXtal(earnings.leafMining)} leaf &bull; {formatXtal(earnings.stemCredits)} stem &bull; {formatXtal(earnings.fruitRewards)} fruit
          </p>
          <p className="text-xs text-foreground-muted mt-0.5 font-mono">
            {earnings.coinbaseCount} coinbase{earnings.coinbaseCount !== 1 ? "s" : ""}
          </p>
        </>
      )}

      {address && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-foreground-muted font-mono">
            {cached ? `as of ${timeAgo}` : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchEarnings}
            disabled={isLoading}
            className="h-6 px-1.5 text-xs text-foreground-muted hover:text-foreground shrink-0"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isLoading && "animate-spin")} />
            Rescan
          </Button>
        </div>
      )}
    </WidgetShell>
  );
}
