import { Download, Send, Pickaxe, Lock, Unlock, FileCode, ArrowRightLeft, LogOut, Upload, Clock } from "lucide-react";
import { AmountDisplay } from "./AmountDisplay";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo, cn, toShards, absShards, type ShardAmount } from "@/lib/utils";
import { getMaturityDisplay } from "@/lib/maturity";
import type { Transaction } from "@/types";

interface TransactionRowProps {
  transaction: Transaction;
  onClick?: () => void;
  isSelected?: boolean;
  walletType?: "normal" | "validator";
  surface?: "utxo" | "vm" | "validator";
}

/**
 * Get icon and color for transaction type
 */
function getTransactionIcon(type: string, amount: ShardAmount) {
  switch (type) {
    case "coinbase":
      return { icon: Pickaxe, color: "text-warning", bg: "bg-warning/20" };
    case "stake":
      return { icon: Lock, color: "text-violet-400", bg: "bg-violet-400/20" };
    case "unstake":
      return { icon: Unlock, color: "text-orange-400", bg: "bg-orange-400/20" };
    case "contract_call":
    case "contract_deploy":
    case "contract":
      return { icon: FileCode, color: "text-cyan-400", bg: "bg-cyan-400/20" };
    case "account_transfer":
      return { icon: ArrowRightLeft, color: "text-primary", bg: "bg-primary/20" };
    case "cage_withdrawal":
    case "vm_withdrawal":
      return { icon: LogOut, color: "text-rose-400", bg: "bg-rose-400/20" };
    case "vm_deposit":
      return { icon: Upload, color: "text-emerald-400", bg: "bg-emerald-400/20" };
    default:
      // Standard send/receive based on amount
      if (toShards(amount) > 0n) {
        return { icon: Download, color: "text-success", bg: "bg-success/20" };
      }
      return { icon: Send, color: "text-primary", bg: "bg-primary/20" };
  }
}

/**
 * Get display label for transaction type
 */
function getTransactionLabel(type: string, amount: ShardAmount, walletType?: "normal" | "validator"): string {
  switch (type) {
    case "coinbase":
      // Use "Staking Rewards" for validator wallets, "Mining Reward" for normal wallets
      return walletType === "validator" ? "Staking Rewards" : "Mining Reward";
    case "stake":
      return "Stake";
    case "unstake":
      return "Unstake";
    case "contract_call":
      return "Contract Call";
    case "contract_deploy":
      return "Deploy Contract";
    case "account_transfer":
      return "Transfer";
    case "cage_withdrawal":
      return "Withdrawal Request";
    case "vm_withdrawal":
      return "Withdrawal";
    case "vm_deposit":
      return "Deposit";
    case "standard":
      return toShards(amount) > 0n ? "Receive" : "Send";
    default:
      return toShards(amount) > 0n ? "Receive" : "Send";
  }
}

function getExecutionStatusBadge(status: Transaction["executionStatus"]) {
  switch (status) {
    case "unknown":
      return { label: "Submitted", variant: "warning" as const };
    case "pending_execution":
      return { label: "Pending Receipt", variant: "info" as const };
    case "failed":
      return { label: "Failed", variant: "destructive" as const };
    case "success":
      return { label: "Success", variant: "success" as const };
    default:
      return null;
  }
}

/**
 * Reusable transaction row component for displaying transactions in a list
 */
export function TransactionRow({ transaction, onClick, isSelected, walletType, surface }: TransactionRowProps) {
  const { icon: Icon, color, bg } = getTransactionIcon(transaction.txType, transaction.amount);
  const label = getTransactionLabel(transaction.txType, transaction.amount, walletType);
  const executionBadge = getExecutionStatusBadge(transaction.executionStatus);
  const maturityDisplay = getMaturityDisplay(transaction.maturityStatus);

  // Suppress VM execution status badge on UTXO surface — UTXO records
  // lack VM receipt data, so "pending_execution" gets stuck indefinitely.
  const showExecutionBadge = surface !== "utxo" && executionBadge;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center justify-between py-2 px-3 chamfered-sm transition-colors",
        onClick && "cursor-pointer hover:bg-muted/80",
        isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("icon-hex icon-hex-sm", bg)}>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
        <div>
          <p className="text-sm font-heading font-medium">{label}</p>
          <p className="text-xs text-foreground-muted">
            {formatTimeAgo(transaction.timestamp)}
          </p>
        </div>
      </div>
      <div className="text-right">
        {showExecutionBadge && (
          <div className="mb-1 flex justify-end">
            <Badge
              variant={executionBadge.variant}
              shape="chamfered"
              diamond={transaction.executionStatus !== "success"}
              className="text-[10px]"
            >
              {executionBadge.label}
            </Badge>
          </div>
        )}
        <AmountDisplay
          amount={absShards(transaction.amount)}
          size="sm"
          positive={toShards(transaction.amount) > 0n}
          negative={toShards(transaction.amount) < 0n}
        />
        <p className="text-xs text-foreground-muted font-mono">
          {transaction.confirmations === 0 ? (
            <span className="text-warning">Pending</span>
          ) : maturityDisplay ? (
            <span className="text-warning flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {maturityDisplay.label}
            </span>
          ) : (
            `${transaction.confirmations} conf`
          )}
        </p>
      </div>
    </div>
  );
}
