import { Cherry } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { useValidatorStore } from "@/stores";
import type { WidgetProps } from "./registry";

export default function FruitProductionWidget({ size, shellProps }: WidgetProps) {
  const productionStats = useValidatorStore((s) => s.productionStats);
  const totalFruitsProduced = useValidatorStore((s) => s.totalFruitsProduced);

  const maxRows = size === "s" || size === "m" ? 4 : 9;
  const rows = productionStats.slice(0, maxRows);

  return (
    <WidgetShell
      title="FRUIT PRODUCTION"
      icon={<WidgetIcon icon={Cherry} wrapClass="bg-accent/20" iconClass="text-accent" />}
      {...shellProps}
    >
      {rows.length === 0 ? (
        <>
          <div className="text-2xl font-heading font-bold tabular-nums text-foreground-muted">
            --
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            No production stats yet
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-foreground-muted font-mono mb-2">
            {totalFruitsProduced} fruit{totalFruitsProduced !== 1 ? "s" : ""} produced this session
          </p>
          <div className="space-y-1.5">
            {rows.map((stat) => (
              <div
                key={stat.fruitType}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="font-heading tracking-wide">
                  {stat.emoji} {stat.fruitType}
                </span>
                <span className="font-mono text-xs text-foreground-muted tabular-nums">
                  ~{stat.expectedTimeLabel} &bull; {stat.expectedFruitsPerHour}/h
                </span>
              </div>
            ))}
          </div>
          {productionStats.length > maxRows && (
            <p className="text-xs text-foreground-muted mt-2 font-mono">
              +{productionStats.length - maxRows} more — enlarge widget to view
            </p>
          )}
        </>
      )}
    </WidgetShell>
  );
}
