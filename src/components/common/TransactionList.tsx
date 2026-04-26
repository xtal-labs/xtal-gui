import { useState, useCallback } from "react";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionRow } from "./TransactionRow";
import { TransactionDetailPanel } from "./TransactionDetailPanel";
import { Pagination } from "./Pagination";
import type { Transaction, TransactionDetail } from "@/types";

interface TransactionListProps {
  /** List of transactions to display */
  transactions: Transaction[];
  /** Which transaction surface this list is presenting */
  surface: "utxo" | "vm" | "validator";
  /** Section title (default: "TRANSACTIONS") */
  title?: string;
  /** Optional address to include for isMine annotation (e.g. validator address) */
  address?: string;
  /** Cache for transaction details to avoid refetching */
  detailCache?: Record<string, TransactionDetail>;
  /** Callback to cache a fetched detail */
  onCacheDetail?: (txid: string, detail: TransactionDetail) => void;
  /** Current page number (1-indexed) */
  currentPage?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Whether pagination is loading */
  isLoading?: boolean;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
}

/**
 * Filter transactions based on presentation surface.
 */
function filterTransactionsBySurface(
  transactions: Transaction[],
  surface: "utxo" | "vm" | "validator"
): Transaction[] {
  const utxoTypes = new Set([
    "send",
    "receive",
    "standard",
    "coinbase",
    "vm_withdrawal",
  ]);
  const vmTypes = new Set([
    "contract_call",
    "contract_deploy",
    "account_transfer",
    "vm_deposit",
  ]);

  const validatorTypes = new Set(["stake", "unstake", "coinbase", "standard", "send", "receive"]);

  return transactions.filter((tx) => {
    const types =
      surface === "validator" ? validatorTypes : surface === "vm" ? vmTypes : utxoTypes;
    return types.has(tx.txType);
  });
}

/**
 * TransactionList - Reusable transaction list with detail panel
 *
 * Used by both Wallet and Validator panels to display transaction history
 * with clickable rows that open a detailed view.
 */
export function TransactionList({
  transactions,
  surface,
  title = "TRANSACTIONS",
  address,
  detailCache = {},
  onCacheDetail,
  currentPage = 1,
  totalPages = 1,
  isLoading: isPaginationLoading = false,
  onPageChange,
}: TransactionListProps) {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Filter transactions based on display surface
  const filteredTransactions = filterTransactionsBySurface(transactions, surface);

  // Fetch transaction detail
  const fetchDetail = useCallback(
    async (txid: string) => {
      // Check cache first
      if (detailCache[txid]) {
        setDetail(detailCache[txid]);
        return;
      }

      setIsDetailLoading(true);
      try {
        const result = await tauriCommand<TransactionDetail>("get_transaction_detail", {
          txid,
          address: address ?? null,
        });
        setDetail(result);

        // Cache the result
        if (onCacheDetail) {
          onCacheDetail(txid, result);
        }
      } catch (error) {
        console.error("Failed to fetch transaction detail:", error);
        setDetail(null);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [detailCache, onCacheDetail, address]
  );

  // Handle transaction row click
  const handleTransactionClick = useCallback(
    (tx: Transaction) => {
      setSelectedTx(tx);
      setIsPanelOpen(true);
      fetchDetail(tx.txid);
    },
    [fetchDetail]
  );

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    setIsPanelOpen(false);
    // Delay clearing to allow animation
    setTimeout(() => {
      setSelectedTx(null);
      setDetail(null);
    }, 400);
  }, []);

  return (
    <>
      <Card variant="crystalline">
        <CardHeader>
          <CardTitle className="text-base font-heading tracking-wide">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <p className="text-center text-foreground-muted py-8 font-heading">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map((tx) => (
                <TransactionRow
                  key={tx.txid}
                  transaction={tx}
                  onClick={() => handleTransactionClick(tx)}
                  isSelected={selectedTx?.txid === tx.txid}
                  walletType={surface === "validator" ? "validator" : "normal"}
                  surface={surface}
                />
              ))}

              {/* Pagination */}
              {onPageChange && totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={onPageChange}
                  isLoading={isPaginationLoading}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Panel */}
      <TransactionDetailPanel
        detail={detail}
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        isLoading={isDetailLoading}
      />
    </>
  );
}

export default TransactionList;
