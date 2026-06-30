import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Cherry,
  ArrowRightLeft,
  FileCode,
  Rocket,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidePanelShell } from "@/components/ui/side-panel-shell";
import { AmountDisplay, HashDisplay, TransactionDetailPanel } from "@/components/common";
import { useTauriCommand } from "@/hooks";
import { getFruitColor } from "@/lib/fruitColors";
import { formatTimeAgo, cn } from "@/lib/utils";
import type { FruitDetail, FruitTransactionSummary, TransactionDetail } from "@/types";

interface FruitDetailPanelProps {
  detail: FruitDetail | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function getFruitTransactionMeta(tx: FruitTransactionSummary) {
  switch (tx.txType) {
    case "account_transfer":
      return {
        icon: ArrowRightLeft,
        iconClass: "text-primary",
        iconBg: "bg-primary/15",
        borderClass: "border-primary/30",
        label: "Transfer",
      };
    case "contract_deploy":
      return {
        icon: Rocket,
        iconClass: "text-warning",
        iconBg: "bg-warning/15",
        borderClass: "border-warning/30",
        label: "Deploy",
      };
    case "contract_call":
    default:
      return {
        icon: FileCode,
        iconClass: "text-cyan-400",
        iconBg: "bg-cyan-400/15",
        borderClass: "border-cyan-400/30",
        label: "Call",
      };
  }
}

function FruitTransactionRow({
  transaction,
  isSelected,
  onClick,
}: {
  transaction: FruitTransactionSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = getFruitTransactionMeta(transaction);
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-3 py-3 text-left",
        "chamfered-sm border transition-colors",
        isSelected
          ? "bg-primary/10 border-primary/30"
          : cn("bg-muted/25 hover:bg-muted/40", meta.borderClass)
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn("icon-hex icon-hex-sm shrink-0", meta.iconBg)}>
          <Icon className={cn("h-3.5 w-3.5", meta.iconClass)} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-heading text-foreground">{meta.label}</p>
            <Badge variant="fruit" shape="chamfered" className="text-[10px]">
              {transaction.vmType}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono">
              nonce {transaction.nonce}
            </Badge>
          </div>
          <HashDisplay
            hash={transaction.txid}
            chars={12}
            copyable={false}
            showTooltip={false}
            className="min-w-0 text-xs text-foreground-muted"
          />
          {(transaction.from || transaction.to) && (
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono text-foreground-muted">
              {transaction.from && <span>{transaction.from.slice(0, 10)}...</span>}
              {transaction.from && transaction.to && <span>&rarr;</span>}
              {transaction.to && <span>{transaction.to.slice(0, 10)}...</span>}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {transaction.amount != null ? (
          <AmountDisplay amount={transaction.amount} size="sm" />
        ) : (
          <span className="text-xs font-mono text-foreground-muted">No value</span>
        )}
        {transaction.fee != null && (
          <p className="mt-1 text-[10px] font-mono text-foreground-muted">
            max fee {transaction.fee.toLocaleString()}
          </p>
        )}
      </div>
    </button>
  );
}

export function FruitDetailPanel({
  detail,
  isOpen,
  onClose,
  isLoading = false,
}: FruitDetailPanelProps) {
  const [neighborsOpen, setNeighborsOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [isTxDetailOpen, setIsTxDetailOpen] = useState(false);
  const lastDetailRef = useRef<FruitDetail | null>(null);

  const {
    data: txDetail,
    execute: fetchTxDetail,
    reset: resetTxDetail,
    isLoading: isTxDetailLoading,
  } = useTauriCommand<TransactionDetail | null>("get_transaction_detail_explorer");

  useEffect(() => {
    if (detail) lastDetailRef.current = detail;
  }, [detail]);

  const visibleDetail = detail ?? (!isOpen ? lastDetailRef.current : null);
  const color = visibleDetail ? getFruitColor(visibleDetail.fruitType) : getFruitColor("");

  const handleCloseTxDetail = useCallback(() => {
    setIsTxDetailOpen(false);
    setSelectedTxId(null);
    resetTxDetail();
  }, [resetTxDetail]);

  const handleOpenTxDetail = useCallback(
    async (transaction: FruitTransactionSummary) => {
      if (!detail) return;

      setSelectedTxId(transaction.txid);
      setIsTxDetailOpen(true);

      // Resolve purely by txid — fruits carry only VM transactions, which the backend
      // locates by scanning active stems' fruits / the mempool (same path the wallet
      // uses). The fruit's anchor stem (`detail.stem`) is not the bundling stem, so
      // passing it as a block hash would fail the lookup.
      const result = await fetchTxDetail({ txid: transaction.txid });
      if (!result) {
        handleCloseTxDetail();
      }
    },
    [detail, fetchTxDetail, handleCloseTxDetail]
  );

  useEffect(() => {
    setNeighborsOpen(false);
    setTransactionsOpen(true);
    handleCloseTxDetail();
  }, [detail?.hash, handleCloseTxDetail]);

  return (
    <SidePanelShell open={isOpen} onClose={onClose} title="Fruit detail">
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-32 pointer-events-none",
            "bg-gradient-to-b",
            color.bg
          )}
        />

        <div className="relative flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("icon-hex bg-gradient-to-br", color.bg)}>
              <Cherry className={cn("h-5 w-5", color.icon)} />
            </div>
            <div>
              <h2 className={cn("font-heading text-lg tracking-wide", color.icon)}>
                {visibleDetail ? `${color.emoji} ${visibleDetail.fruitType} Fruit` : "Fruit Detail"}
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

        <div className="relative flex-1 overflow-y-auto p-4 pb-8 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground-muted font-heading">
                Loading fruit details...
              </p>
            </div>
          ) : visibleDetail ? (
            <>
              <Card variant="crystalline" className="overflow-visible">
                <CardContent className="p-4">
                  <div className="text-center space-y-2">
                    <Badge
                      variant="outline"
                      className={cn("text-sm px-3 py-1", color.icon, color.border)}
                    >
                      {color.emoji} {visibleDetail.fruitType}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Nonce
                      </p>
                      <span className="text-sm font-mono">{visibleDetail.nonce}</span>
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Gas Price
                      </p>
                      <span className="text-sm font-mono">
                        {visibleDetail.gasPrice.toLocaleString()} shards
                      </span>
                    </div>

                    {visibleDetail.txCount != null && (
                      <div className="text-center">
                        <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                          Transactions
                        </p>
                        <span className="text-sm font-mono">
                          {visibleDetail.txCount.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Time
                      </p>
                      <span className="text-sm font-mono">
                        {formatTimeAgo(visibleDetail.timestamp)}
                      </span>
                    </div>

                    <div className="text-center col-span-2">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Difficulty
                      </p>
                      <span className="text-sm font-mono">
                        0x{visibleDetail.difficultyTarget.toString(16).padStart(8, "0")}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <DetailRow label="Validator">
                  <HashDisplay hash={visibleDetail.validator} chars={16} className="text-xs" />
                </DetailRow>

                <DetailRow label="Stem Reference">
                  <HashDisplay hash={visibleDetail.stem} chars={16} className="text-xs" />
                </DetailRow>

                <DetailRow label="Merkle Root">
                  <HashDisplay hash={visibleDetail.merkleRoot} chars={16} className="text-xs" />
                </DetailRow>
              </div>

              {visibleDetail.transactions && (
                <div className="space-y-2">
                  <button
                    onClick={() => setTransactionsOpen((open) => !open)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2",
                      "chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors",
                      "text-sm font-heading tracking-wide text-foreground-secondary"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {transactionsOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      TRANSACTIONS
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {visibleDetail.transactions.length}
                    </Badge>
                  </button>

                  <div
                    className={cn(
                      "transition-all duration-300 ease-out",
                      transactionsOpen
                        ? "max-h-[480px] opacity-100 overflow-y-auto"
                        : "max-h-0 opacity-0 overflow-hidden"
                    )}
                  >
                    {visibleDetail.transactions.length === 0 ? (
                      <div className="px-3 py-4 chamfered-sm bg-muted/20 border border-border/30 text-center text-sm text-foreground-muted font-heading">
                        No transactions in this fruit
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleDetail.transactions.map((transaction) => (
                          <FruitTransactionRow
                            key={transaction.txid}
                            transaction={transaction}
                            isSelected={selectedTxId === transaction.txid}
                            onClick={() => handleOpenTxDetail(transaction)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {visibleDetail.neighbors.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setNeighborsOpen((open) => !open)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2",
                      "chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors",
                      "text-sm font-heading tracking-wide text-foreground-secondary"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {neighborsOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      NEIGHBORS
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {visibleDetail.neighbors.length}
                    </Badge>
                  </button>

                  <div
                    className={cn(
                      "transition-all duration-300 ease-out",
                      neighborsOpen
                        ? "max-h-[400px] opacity-100 overflow-y-auto"
                        : "max-h-0 opacity-0 overflow-hidden"
                    )}
                  >
                    <div className="space-y-1">
                      {visibleDetail.neighbors.map((neighbor, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 chamfered-sm bg-muted/20 border border-border/30"
                        >
                          <HashDisplay hash={neighbor} chars={16} className="text-xs" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Clock className="h-6 w-6 text-foreground-muted" />
              <p className="text-sm text-foreground-muted font-heading">
                No fruit selected
              </p>
            </div>
          )}
        </div>

      <TransactionDetailPanel
        detail={txDetail}
        isOpen={isTxDetailOpen}
        onClose={handleCloseTxDetail}
        isLoading={isTxDetailLoading}
      />
    </SidePanelShell>
  );
}

export default FruitDetailPanel;
