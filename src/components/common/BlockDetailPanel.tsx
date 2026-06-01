import { useState, useEffect, useRef } from "react";
import {
  X,
  Blocks,
  Clock,
  Database,
  Fingerprint,
  Layers,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidePanelShell } from "@/components/ui/side-panel-shell";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { AmountDisplay } from "./AmountDisplay";
import { HashDisplay } from "./HashDisplay";
import {
  formatBlockHeight,
  formatBytes,
  formatTimeAgo,
  formatTimestamp,
  cn,
} from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import type { BlockDetail } from "@/types";

interface BlockDetailPanelProps {
  detail: BlockDetail | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  error?: string | null;
  onTransactionClick?: (txid: string, blockHash: string) => void;
  onFruitClick?: (fruitHash: string, blockHash: string) => void;
}

function getBlockStyle(blockType?: BlockDetail["blockType"]) {
  if (blockType === "Leaf") {
    return {
      label: "Leaf Block",
      color: "text-crystal-leaf",
      bg: "bg-crystal-leaf/20",
      gradient: "from-crystal-leaf/15 via-transparent to-transparent",
      badge: "leaf" as const,
    };
  }
  return {
    label: "Stem Block",
    color: "text-crystal-stem",
    bg: "bg-crystal-stem/20",
    gradient: "from-crystal-stem/15 via-transparent to-transparent",
    badge: "stem" as const,
  };
}

const txTypeColors: Record<string, string> = {
  coinbase: "text-warning",
  stake: "text-violet-400",
  unstake: "text-orange-400",
  contract_call: "text-cyan-400",
  contract_deploy: "text-cyan-400",
  account_transfer: "text-primary",
  vm_withdrawal: "text-rose-400",
  standard: "text-foreground",
};

function CollapsibleSection({
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
            ? "max-h-[600px] opacity-100 overflow-y-auto"
            : "max-h-0 opacity-0 overflow-hidden"
        )}
      >
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function BlockDetailPanel({
  detail,
  isOpen,
  onClose,
  isLoading = false,
  error = null,
  onTransactionClick,
  onFruitClick,
}: BlockDetailPanelProps) {
  const lastDetailRef = useRef<BlockDetail | null>(null);

  useEffect(() => {
    if (detail) lastDetailRef.current = detail;
  }, [detail]);

  const visibleDetail = detail ?? (!isOpen ? lastDetailRef.current : null);
  const style = getBlockStyle(visibleDetail?.blockType);

  return (
    <SidePanelShell
      open={isOpen}
      onClose={onClose}
      title="Block detail"
      className="lg:w-[480px]"
    >
        <TooltipProvider>
        {/* Gradient accent */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-32 pointer-events-none",
            "bg-gradient-to-b",
            style.gradient
          )}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("icon-hex", style.bg)}>
              <Blocks className={cn("h-5 w-5", style.color)} />
            </div>
            <div>
              <h2 className={cn("font-heading text-lg tracking-wide", style.color)}>
                {style.label}
              </h2>
              {visibleDetail && (
                <HashDisplay
                  hash={visibleDetail.hash}
                  chars={12}
                  className="text-xs text-foreground-muted"
                />
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "p-2 chamfered-sm bg-muted/50 hover:bg-muted transition-colors",
              "text-foreground-muted hover:text-foreground"
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto p-4 pb-8 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground-muted font-heading">
                Loading block details...
              </p>
            </div>
          ) : error ? (
            <Card variant="crystalline" className="border-destructive/30">
              <CardContent className="p-4 text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          ) : visibleDetail ? (
            <>
              {/* Height + time */}
              <Card variant="crystalline" className="overflow-visible">
                <CardContent className="p-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-heading text-foreground-muted tracking-wider uppercase">
                      Block Height
                    </p>
                    <div className="text-3xl font-heading font-bold tabular-nums">
                      {formatBlockHeight(visibleDetail.height)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Leaf Height
                      </p>
                      <span className="text-sm font-mono">
                        {formatBlockHeight(visibleDetail.leafHeight)}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        {visibleDetail.blockType === "Stem" ? "Fruits" : "Transactions"}
                      </p>
                      <span className="text-sm font-mono">
                        {visibleDetail.blockType === "Stem"
                          ? visibleDetail.fruitCount.toLocaleString()
                          : visibleDetail.txCount.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Size
                      </p>
                      <span className="text-sm font-mono">
                        {visibleDetail.size ? formatBytes(visibleDetail.size) : "\u2014"}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Time
                      </p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm font-mono cursor-help">
                            {formatTimeAgo(visibleDetail.timestamp)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatTimestamp(visibleDetail.timestamp)}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Header fields */}
              <Card variant="crystalline">
                <CardContent className="p-0">
                  <div className="px-3 py-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <Fingerprint className={cn("h-3.5 w-3.5", style.color)} />
                      <span className="text-[10px] font-heading tracking-wider uppercase text-foreground-secondary">
                        Block Header
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30">
                    <div className="grid grid-cols-3 divide-x divide-border/30">
                      <div className="text-center py-2.5 px-2">
                        <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                          Version
                        </p>
                        <span className="text-xs font-mono">{visibleDetail.version}</span>
                      </div>
                      <div className="text-center py-2.5 px-2">
                        <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                          Difficulty
                        </p>
                        <span className="text-xs font-mono">
                          0x{visibleDetail.difficulty.toString(16).padStart(8, "0")}
                        </span>
                      </div>
                      <div className="text-center py-2.5 px-2">
                        <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                          Nonce
                        </p>
                        <span className="text-xs font-mono">
                          {visibleDetail.nonce}
                        </span>
                      </div>
                    </div>

                    {/* Hash fields */}
                    <div className="px-3 py-2 space-y-0.5">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Froot Accumulator
                      </p>
                      <HashDisplay hash={visibleDetail.froot} chars={10} className="text-xs" />
                    </div>
                    <div className="px-3 py-2 space-y-0.5">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        {visibleDetail.blockType === "Stem" ? "Fruit Merkle Root" : "Tx Merkle Root"}
                      </p>
                      <HashDisplay hash={visibleDetail.merkleRoot} chars={10} className="text-xs" />
                    </div>
                    {visibleDetail.previousHash && (
                      <div className="px-3 py-2 space-y-0.5">
                        <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                          Previous Block
                        </p>
                        <HashDisplay hash={visibleDetail.previousHash} chars={10} className="text-xs" />
                      </div>
                    )}
                    <div className="px-3 py-2 space-y-0.5">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Miner
                      </p>
                      <HashDisplay hash={visibleDetail.miner} chars={10} className="text-xs" />
                    </div>
                    <div className="px-3 py-2 space-y-0.5">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Timestamp
                      </p>
                      <span className="text-xs font-mono text-foreground">
                        {formatTimestamp(visibleDetail.timestamp)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {visibleDetail.blockType === "Stem" ? (
                <CollapsibleSection title="FRUITS" count={visibleDetail.fruitCount}>
                  {!visibleDetail.fruits || visibleDetail.fruits.length === 0 ? (
                    <div className="chamfered-sm bg-muted/30 px-4 py-6 text-center text-sm text-foreground-muted">
                      No fruits in this stem
                    </div>
                  ) : (
                    visibleDetail.fruits.map((fruit) => {
                      const color = getFruitColor(fruit.fruitType);
                      const canOpen = Boolean(onFruitClick);
                      return (
                        <button
                          type="button"
                          key={fruit.hash}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 px-3 py-2",
                            "chamfered-sm bg-muted/30 border border-border/40",
                            canOpen
                              ? "hover:bg-muted/50 transition-colors cursor-pointer"
                              : "cursor-default"
                          )}
                          onClick={() => {
                            if (onFruitClick) {
                              onFruitClick(fruit.hash, visibleDetail.hash);
                            }
                          }}
                        >
                          <div className="flex flex-col items-start gap-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px]", color.icon)}
                              >
                                {color.emoji} {fruit.fruitType}
                              </Badge>
                              <HashDisplay
                                hash={fruit.hash}
                                chars={8}
                                copyable={false}
                                showTooltip={false}
                                className="text-xs min-w-0"
                              />
                            </div>
                            <div className="flex items-center gap-1 pl-1">
                              <span className="text-[10px] text-foreground-muted">by</span>
                              <HashDisplay
                                hash={fruit.validator}
                                chars={6}
                                copyable={false}
                                showTooltip={false}
                                className="text-[10px] text-foreground-muted min-w-0"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-foreground-muted shrink-0">
                            {fruit.txCount != null && (
                              <span className="font-mono">{fruit.txCount} tx</span>
                            )}
                            <span className="font-mono">{formatTimeAgo(fruit.timestamp)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </CollapsibleSection>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("icon-hex icon-hex-sm", style.bg)}>
                        <Layers className={cn("h-4 w-4", style.color)} />
                      </div>
                      <h3 className="text-sm font-heading tracking-wide text-foreground">TRANSACTIONS</h3>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs" shape="chamfered">
                      {visibleDetail.transactions.length.toLocaleString()}
                    </Badge>
                  </div>

                  {visibleDetail.transactions.length === 0 ? (
                    <div className="chamfered-sm bg-muted/30 px-4 py-6 text-center text-sm text-foreground-muted">
                      No transactions in this block
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleDetail.transactions.map((tx) => (
                        <button
                          type="button"
                          key={tx.txid}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 px-3 py-2",
                            "chamfered-sm bg-muted/30 border border-border/40",
                            onTransactionClick
                              ? "hover:bg-muted/50 transition-colors cursor-pointer"
                              : "cursor-default"
                          )}
                          onClick={() => {
                            if (onTransactionClick) {
                              onTransactionClick(tx.txid, visibleDetail.hash);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] uppercase",
                                txTypeColors[tx.txType] || "text-foreground"
                              )}
                            >
                              {tx.txType.replace(/_/g, " ")}
                            </Badge>
                            <HashDisplay
                              hash={tx.txid}
                              chars={10}
                              className="text-xs min-w-0"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Database className="h-3.5 w-3.5 text-foreground-muted" />
                            <AmountDisplay amount={tx.totalOutput} size="sm" showSymbol />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Clock className="h-6 w-6 text-foreground-muted" />
              <p className="text-sm text-foreground-muted font-heading">
                No block selected
              </p>
            </div>
          )}
        </div>
        </TooltipProvider>
    </SidePanelShell>
  );
}

export default BlockDetailPanel;
