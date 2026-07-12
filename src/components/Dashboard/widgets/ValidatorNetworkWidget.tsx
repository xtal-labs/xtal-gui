import { useEffect } from "react";
import { Globe } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useValidatorStore } from "@/stores";
import { formatXtal } from "@/lib/utils";
import type { NetworkValidatorStats } from "@/types/validator";
import type { WidgetProps } from "./registry";

export default function ValidatorNetworkWidget({ shellProps }: WidgetProps) {
  const networkStats = useValidatorStore((s) => s.networkStats);
  const setNetworkStats = useValidatorStore((s) => s.setNetworkStats);

  // Normally fed by the validator_network_stats WebSocket stream; fetch once
  // on mount if nothing has arrived yet.
  useEffect(() => {
    if (networkStats) return;
    let cancelled = false;
    tauriCommand<NetworkValidatorStats>("get_network_validator_stats")
      .then((stats) => {
        if (!cancelled) setNetworkStats(stats);
      })
      .catch((err) => console.error("Failed to fetch network validator stats:", err));
    return () => {
      cancelled = true;
    };
    // Fetch-once fallback; networkStats arriving later shouldn't re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <WidgetShell
      title="VALIDATOR NETWORK"
      icon={<WidgetIcon icon={Globe} wrapClass="bg-info/20" iconClass="text-info" />}
      {...shellProps}
    >
      {networkStats ? (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-xl font-heading font-bold tabular-nums">
              {networkStats.currentEpoch}
            </div>
            <p className="text-xs text-foreground-muted font-mono">epoch</p>
          </div>
          <div>
            <div className="text-xl font-heading font-bold tabular-nums">
              {formatXtal(networkStats.totalStaked)}
            </div>
            <p className="text-xs text-foreground-muted font-mono">total staked</p>
          </div>
          <div>
            <div className="text-xl font-heading font-bold tabular-nums">
              {networkStats.validatorCount}
            </div>
            <p className="text-xs text-foreground-muted font-mono">
              validator{networkStats.validatorCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="h-8 w-24 bg-muted/50 animate-pulse chamfered-sm" />
          <div className="h-3 w-32 bg-muted/30 animate-pulse chamfered-sm mt-2" />
        </>
      )}
    </WidgetShell>
  );
}
