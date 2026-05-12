import { useState } from "react";
import {
  ArrowLeft,
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
import { AmountDisplay, HashDisplay } from "@/components/common";
import {
  formatBlockHeight,
  formatBytes,
  formatTimeAgo,
  formatTimestamp,
  cn,
} from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import type { BlockDetail } from "@/types";

interface BlockDetailPageProps {
  detail: BlockDetail | null;
  isLoading?: boolean;
  error?: string | null;
  onBack: () => void;
  onTransactionClick?: (txid: string, blockHash: string) => void;
  onFruitClick?: (fruitHash: string, blockHash: string) => void;
  onNavigateBlock?: (hash: string) => void;
}

function getBlockStyle(blockType?: BlockDetail["blockType"]) {
  if (blockType === "Leaf") {
    return {
      label: "Leaf Block",
      color: "text-crystal-leaf",
      bg: "bg-crystal-leaf/20",
      gradient: "from-crystal-leaf/10 via-transparent to-transparent",
      badge: "leaf" as const,
    };
  }
  return {
    label: "Stem Block",
    color: "text-crystal-stem",
    bg: "bg-crystal-stem/20",
    gradient: "from-crystal-stem/10 via-transparent to-transparent",
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
  icon,
  count,
  defaultOpen = true,
  accentColor,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  defaultOpen?: boolean;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors",
          "text-sm font-heading tracking-wide text-foreground"
        )}
      >
        <span className="flex items-center gap-2.5">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-foreground-muted" />
          )}
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
        </span>
        <Badge
          variant="outline"
          className={cn("font-mono text-xs", accentColor)}
        >
          {count}
        </Badge>
      </button>

      <div
        className={cn(
          "transition-all duration-300 ease-out overflow-hidden",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pt-2 space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  mono = true,
  accent,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 px-2">
      <span className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted">
        {label}
      </span>
      <span
        className={cn(
          "text-sm tabular-nums",
          mono && "font-mono",
          accent || "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function HashRow({
  label,
  hash,
  clickable,
  onClick,
}: {
  label: string;
  hash: string;
  clickable?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 py-2.5 px-4 border-b border-border/30 last:border-b-0">
      <span className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted w-40 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <HashDisplay hash={hash} truncate={false} className="text-xs break-all" />
        {clickable && onClick && (
          <button
            onClick={onClick}
            className={cn(
              "text-[10px] font-heading tracking-wider uppercase shrink-0",
              "px-2 py-0.5 chamfered-sm",
              "bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            )}
          >
            View
          </button>
        )}
      </div>
    </div>
  );
}

export function BlockDetailPage({
  detail,
  isLoading = false,
  error = null,
  onBack,
  onTransactionClick,
  onFruitClick,
  onNavigateBlock,
}: BlockDetailPageProps) {
  const style = getBlockStyle(detail?.blockType);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-foreground-muted font-heading">
          Loading block details...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors font-heading tracking-wide"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blocks
        </button>
        <Card variant="crystalline" className="border-destructive/30">
          <CardContent className="p-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Blocks className="h-6 w-6 text-foreground-muted" />
        <p className="text-sm text-foreground-muted font-heading">
          No block selected
        </p>
      </div>
    );
  }

  const difficultyHex = `0x${detail.difficulty.toString(16).padStart(8, "0")}`;

  return (
    <div className="space-y-5 stagger-children">
      {/* Top gradient band */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-40 pointer-events-none",
          "bg-gradient-to-b",
          style.gradient
        )}
      />

      {/* Header bar */}
      <div className="relative flex items-center justify-between gap-4 pr-4 sm:pr-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className={cn(
              "p-2 chamfered-sm",
              "bg-muted/50 hover:bg-muted transition-colors",
              "text-foreground-muted hover:text-foreground"
            )}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <Badge
              variant={style.badge}
              shape="hexagon"
              size="block-type"
              faceted
            >
              {detail.blockType}
            </Badge>

            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-heading tracking-wider uppercase text-foreground-muted">
                  {style.label}
                </span>
                <h1 className={cn("text-2xl font-heading font-bold tabular-nums", style.color)}>
                  {formatBlockHeight(detail.height)}
                </h1>
              </div>
              <HashDisplay
                hash={detail.hash}
                chars={16}
                className="text-xs text-foreground-muted"
              />
            </div>
          </div>
        </div>

        <div className="text-right shrink-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm text-foreground-muted justify-end">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono text-xs">
              {formatTimeAgo(detail.timestamp)}
            </span>
          </div>
          <p className="text-[10px] font-mono text-foreground-muted">
            {formatTimestamp(detail.timestamp)}
          </p>
        </div>
      </div>

      {/* Stats ribbon */}
      <Card variant="crystalline">
        <CardContent className="p-0">
          <div className="grid grid-cols-3 lg:grid-cols-6 divide-x divide-border/40">
            <StatCell label="Version" value={detail.version} />
            <StatCell label="Difficulty" value={difficultyHex} />
            <StatCell label="Nonce" value={detail.nonce} />
            <StatCell
              label="Leaf Height"
              value={formatBlockHeight(detail.leafHeight)}
            />
            <StatCell
              label="Size"
              value={detail.size ? formatBytes(detail.size) : "\u2014"}
            />
            <StatCell
              label={detail.blockType === "Stem" ? "Fruits" : "Transactions"}
              value={
                detail.blockType === "Stem"
                  ? detail.fruitCount.toLocaleString()
                  : detail.txCount.toLocaleString()
              }
              accent={style.color}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cryptographic hashes */}
      <Card variant="crystalline">
        <CardContent className="p-0">
          <div className="px-4 py-2.5 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Fingerprint className={cn("h-4 w-4", style.color)} />
              <h3 className="text-xs font-heading tracking-wider uppercase text-foreground-secondary">
                Cryptographic Links
              </h3>
            </div>
          </div>
          <div>
            <HashRow label="Froot Accumulator" hash={detail.froot} />
            <HashRow
              label={detail.blockType === "Stem" ? "Fruit Merkle Root" : "Tx Merkle Root"}
              hash={detail.merkleRoot}
            />
            {detail.previousHash && (
              <HashRow
                label="Previous Block"
                hash={detail.previousHash}
                clickable={Boolean(onNavigateBlock)}
                onClick={() =>
                  onNavigateBlock && detail.previousHash && onNavigateBlock(detail.previousHash)
                }
              />
            )}
            <HashRow label="Miner" hash={detail.miner} />
          </div>
        </CardContent>
      </Card>

      {detail.blockType === "Stem" ? (
        <CollapsibleSection
          title="FRUITS"
          icon={
            <div className={cn("icon-hex icon-hex-sm bg-crystal-fruit/20")}>
              <Database className="h-3.5 w-3.5 text-crystal-fruit" />
            </div>
          }
          count={detail.fruitCount}
          accentColor="text-crystal-fruit"
        >
          {!detail.fruits || detail.fruits.length === 0 ? (
            <div className="chamfered-sm bg-muted/30 px-4 py-6 text-center text-sm text-foreground-muted">
              No fruits in this stem
            </div>
          ) : (
            detail.fruits.map((fruit) => {
              const color = getFruitColor(fruit.fruitType);
              const canOpen = Boolean(onFruitClick);
              return (
                <button
                  type="button"
                  key={fruit.hash}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-4 py-2.5",
                    "chamfered-sm bg-muted/30 border border-border/40",
                    canOpen
                      ? "hover:bg-muted/50 transition-colors cursor-pointer"
                      : "cursor-default"
                  )}
                  onClick={() => {
                    if (onFruitClick) {
                      onFruitClick(fruit.hash, detail.hash);
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
                        chars={12}
                        copyable={false}
                        showTooltip={false}
                        className="text-xs min-w-0"
                      />
                    </div>
                    <div className="flex items-center gap-1 pl-1">
                      <span className="text-[10px] text-foreground-muted">by</span>
                      <HashDisplay
                        hash={fruit.validator}
                        chars={8}
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
                    <span className="font-mono">
                      {formatTimeAgo(fruit.timestamp)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </CollapsibleSection>
      ) : (
        <CollapsibleSection
          title="TRANSACTIONS"
          icon={
            <div className={cn("icon-hex icon-hex-sm", style.bg)}>
              <Layers className={cn("h-3.5 w-3.5", style.color)} />
            </div>
          }
          count={detail.transactions.length}
          accentColor={style.color}
        >
          {detail.transactions.length === 0 ? (
            <div className="chamfered-sm bg-muted/30 px-4 py-6 text-center text-sm text-foreground-muted">
              No transactions in this block
            </div>
          ) : (
            detail.transactions.map((tx) => (
              <button
                type="button"
                key={tx.txid}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-2.5",
                  "chamfered-sm bg-muted/30 border border-border/40",
                  onTransactionClick
                    ? "hover:bg-muted/50 transition-colors cursor-pointer"
                    : "cursor-default"
                )}
                onClick={() => {
                  if (onTransactionClick) {
                    onTransactionClick(tx.txid, detail.hash);
                  }
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] uppercase shrink-0",
                      txTypeColors[tx.txType] || "text-foreground"
                    )}
                  >
                    {tx.txType.replace(/_/g, " ")}
                  </Badge>
                  <HashDisplay
                    hash={tx.txid}
                    chars={14}
                    className="text-xs min-w-0"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AmountDisplay amount={tx.totalOutput} size="sm" showSymbol />
                </div>
              </button>
            ))
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

export default BlockDetailPage;
