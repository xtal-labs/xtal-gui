import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay } from "@/components/common/AmountDisplay";
import { HashDisplay } from "@/components/common/HashDisplay";
import { cn } from "@/lib/utils";
import { ownershipBorderClass, type IOFlow } from "@/lib/txOwnership";

/** Collapsible header + animated body, used for INPUTS/OUTPUTS/LOGS sections. */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2",
          "chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors",
          "text-sm font-heading tracking-wide text-foreground-secondary"
        )}
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {title}
        </span>
        <Badge variant="outline" className="font-mono text-xs">
          {count}
        </Badge>
      </button>

      <div
        className={cn(
          "transition-all duration-300 ease-out",
          isOpen
            ? "max-h-[400px] opacity-100 overflow-y-auto"
            : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className="space-y-1 pl-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * A single transaction input or output row. The left-border color signals wallet
 * ownership and direction via {@link ownershipBorderClass}. Optional `label`
 * renders a sparkle-prefixed pseudo-row (e.g. "Block Reward"), and `rewardType`
 * tags coinbase outputs.
 */
export function IORow({
  address,
  amount,
  index,
  isMine,
  flow,
  pending,
  label,
  rewardType,
  redeemScriptType,
}: {
  address?: string;
  amount?: number;
  index: number;
  isMine?: boolean;
  flow: IOFlow;
  pending: boolean;
  label?: string;
  rewardType?: "leaf" | "stem" | "fruit";
  redeemScriptType?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2 px-3 text-foreground",
        "chamfered-sm bg-background/50 border-l-2",
        ownershipBorderClass({ isMine, flow, pending })
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-foreground-muted w-5 shrink-0">
          #{index}
        </span>
        {label ? (
          <span className="text-sm font-heading text-warning flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {label}
          </span>
        ) : address ? (
          <div className="flex items-center gap-2 min-w-0">
            <HashDisplay
              hash={address}
              truncate
              showTooltip
              className="text-xs min-w-0"
            />
            {rewardType && (
              <Badge variant={rewardType} className="shrink-0 text-[10px] px-1.5 py-0">
                {rewardType === "leaf"
                  ? "Leaf"
                  : rewardType === "stem"
                    ? "Stem"
                    : "Fruit"}
              </Badge>
            )}
            {redeemScriptType && (
              <Badge
                variant="outline"
                className="shrink-0 text-[10px] px-1.5 py-0 text-violet-400 border-violet-400/40"
              >
                P2SH · {redeemScriptType}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-foreground-muted italic">Unknown</span>
        )}
      </div>
      {amount !== undefined && (
        <AmountDisplay amount={amount} size="sm" className="shrink-0" />
      )}
    </div>
  );
}
