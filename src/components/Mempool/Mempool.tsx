import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layers, Database, Activity, Cpu, ArrowUpDown, Copy, Check } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, SHARDS_PER_XTAL } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import { MempoolTransactionDetailPanel } from "./MempoolTransactionDetailPanel";

// Types
interface MempoolInfo {
  total_transactions: number;
  size_bytes: number;
  utxo_count: number;
  vm_count: number;
  oldest_age_secs: number | null;
  transaction_count_by_type: Record<string, number>;
}

interface MempoolTransaction {
  hash: string;
  tx_type: string;
  fee: number;
  size_bytes: number;
  age_secs: number;
  /** Only set for VM transactions (ContractDeploy has preferredFruitType) */
  preferredFruitType?: string;
}

type FilterType = "all" | "utxo" | "vm";
type SortField = "age" | "fee" | "size" | "type";
type SortDir = "asc" | "desc";

const UTXO_TYPES = ["Standard", "Stake", "Unstake"];
const VM_TYPES = ["ContractCall", "ContractDeploy", "AccountTransfer"];

// Utility functions
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatAge = (secs: number): string => {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
};

const formatFee = (fee: number): string => {
  const xtal = fee / SHARDS_PER_XTAL;
  if (xtal < 0.0001) return `${fee.toLocaleString()} shards`;
  return `${xtal.toFixed(6)} XTAL`;
};

// Map transaction type to badge variant (matching toast colors)
const getTxTypeVariant = (txType: string): "stem" | "stake" | "unstake" | "fruit" => {
  switch (txType) {
    case "Standard":
      return "stem"; // green, matches toast stem variant
    case "Stake":
      return "stake"; // purple, matches toast stake variant
    case "Unstake":
      return "unstake"; // blue/sky, matches toast unstake variant
    default:
      return "fruit"; // VM types (ContractCall, ContractDeploy, AccountTransfer)
  }
};


// Sort Header Component
const SortHeader = ({
  label,
  field,
  currentSort,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) => (
  <button
    onClick={() => onSort(field)}
    className={cn(
      "flex items-center gap-1.5 text-xs font-heading font-medium tracking-wide uppercase",
      "transition-colors",
      currentSort === field
        ? "text-primary"
        : "text-foreground-muted hover:text-foreground-secondary",
      className
    )}
  >
    {label}
    <ArrowUpDown
      className={cn(
        "h-3 w-3",
        currentSort === field ? "text-primary" : "text-foreground-muted/50"
      )}
    />
    {currentSort === field && (
      <span className="text-[10px] text-primary/70">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    )}
  </button>
);

// Transaction Row Component
const TransactionRow = ({
  tx,
  copied,
  onCopy,
  onClick,
}: {
  tx: MempoolTransaction;
  copied: string | null;
  onCopy: (hash: string) => void;
  onClick: () => void;
}) => {
  // For ContractDeploy with preferredFruitType, use fruit colors
  const isContractDeployWithFruit = tx.tx_type === "ContractDeploy" && tx.preferredFruitType;
  const fruitColors = isContractDeployWithFruit ? getFruitColor(tx.preferredFruitType!) : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group grid grid-cols-[140px_1fr_120px_100px_90px] gap-4 items-center",
        "px-4 py-3 border-b border-border/50",
        "hover:bg-card/50 transition-colors cursor-pointer"
      )}
    >
      {/* Type Badge */}
      {isContractDeployWithFruit && fruitColors ? (
        <Badge
          shape="chamfered"
          diamond
          className={cn(
            "bg-gradient-to-br",
            fruitColors.bg,
            fruitColors.border,
            fruitColors.icon
          )}
        >
          {tx.tx_type}
        </Badge>
      ) : (
        <Badge variant={getTxTypeVariant(tx.tx_type)} shape="chamfered" diamond>
          {tx.tx_type}
        </Badge>
      )}

      {/* Hash with copy button */}
      <div className="flex items-center gap-2 font-mono text-sm text-foreground-secondary">
        <span className="group-hover:text-foreground transition-colors">
          {tx.hash}
        </span>
        <button
          onClick={() => onCopy(tx.hash)}
          className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-primary transition-all"
          title="Copy full hash"
        >
          {copied === tx.hash ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Fee */}
      <div className="text-sm font-mono text-foreground tabular-nums text-right">
        {formatFee(tx.fee)}
      </div>

      {/* Size */}
      <div className="text-xs font-mono text-foreground-muted text-right">
        {formatBytes(tx.size_bytes)}
      </div>

      {/* Age with color coding */}
      <div
        className={cn(
          "text-xs font-mono text-right tabular-nums",
          tx.age_secs < 60
            ? "text-crystal-leaf"
            : tx.age_secs < 300
              ? "text-foreground-secondary"
              : "text-foreground-muted"
        )}
      >
        {formatAge(tx.age_secs)}
      </div>
    </div>
  );
};

// Filter Button Component
const FilterButton = ({
  active,
  onClick,
  children,
  count,
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  variant?: "default" | "stem" | "fruit";
}) => {
  const diamondColor = active
    ? variant === "stem"
      ? "bg-crystal-stem"
      : variant === "fruit"
        ? "bg-crystal-fruit"
        : "bg-primary"
    : "bg-muted";

  return (
    <button
      onClick={onClick}
      className={cn(
        "chamfered-sm flex items-center gap-2 px-4 py-2",
        "font-heading text-xs tracking-wide uppercase",
        "transition-all duration-200",
        "border",
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-card border-border text-foreground-muted hover:text-foreground-secondary hover:border-border-hover"
      )}
    >
      <span className={cn("status-diamond-sm", diamondColor)} />
      <span>{children}</span>
      {count !== undefined && (
        <Badge
          variant={active ? (variant === "default" ? "default" : variant) : "secondary"}
          shape="rounded"
          className="ml-1 text-[10px] px-1.5 py-0"
        >
          {count}
        </Badge>
      )}
    </button>
  );
};

// Empty State Component
const EmptyState = ({ filter }: { filter: FilterType }) => (
  <div className="flex-1 flex items-center justify-center p-8">
    <Card variant="faceted" className="max-w-md w-full">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        {/* Diamond decoration */}
        <div className="diamond w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 mb-6 flex items-center justify-center">
          <div className="diamond w-8 h-8 bg-primary/30" />
        </div>

        <h3 className="text-lg font-heading font-semibold text-foreground mb-2">
          {filter === "all"
            ? "Mempool Empty"
            : filter === "utxo"
              ? "No UTXO Transactions"
              : "No VM Transactions"}
        </h3>
        <p className="text-foreground-muted text-sm">
          Pending transactions will appear here
        </p>
      </CardContent>
    </Card>
  </div>
);

// Main Mempool Component
export const Mempool = () => {
  const [info, setInfo] = useState<MempoolInfo | null>(null);
  const [transactions, setTransactions] = useState<MempoolTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("age");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);

  // Copy hash to clipboard
  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(hash);
    setTimeout(() => setCopied(null), 2000);
  };

  // Fetch mempool data
  const fetchMempoolData = async () => {
    try {
      const [mempoolInfo, mempoolTxs] = await Promise.all([
        invoke<MempoolInfo>("get_mempool_info"),
        invoke<MempoolTransaction[]>("get_mempool_transactions"),
      ]);
      setInfo(mempoolInfo);
      setTransactions(mempoolTxs);
    } catch (err) {
      console.error("Failed to fetch mempool data:", err);
      setInfo({
        total_transactions: 0,
        size_bytes: 0,
        utxo_count: 0,
        vm_count: 0,
        oldest_age_secs: null,
        transaction_count_by_type: {},
      });
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMempoolData();
    const interval = setInterval(fetchMempoolData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filter === "utxo") {
      filtered = transactions.filter((tx) => UTXO_TYPES.includes(tx.tx_type));
    } else if (filter === "vm") {
      filtered = transactions.filter((tx) => VM_TYPES.includes(tx.tx_type));
    }

    // Sort
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "age":
          cmp = a.age_secs - b.age_secs;
          break;
        case "fee":
          cmp = a.fee - b.fee;
          break;
        case "size":
          cmp = a.size_bytes - b.size_bytes;
          break;
        case "type":
          cmp = a.tx_type.localeCompare(b.tx_type);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, filter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const utxoCount = info?.utxo_count ?? 0;
  const vmCount = info?.vm_count ?? 0;

  return (
    <div className="h-full flex flex-col animate-fade-in-up">
      {/* Header */}
      <div className="flex-none p-6 pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
              MEMPOOL
            </h1>
            <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
              Pending Transactions
            </p>
          </div>
          <Badge variant="info" diamond pulse>
            LIVE
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex-none p-6 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {/* Total Pending */}
          <Card variant="crystalline">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
                TOTAL PENDING
              </CardTitle>
              <div className="icon-hex icon-hex-sm bg-primary/20">
                <Layers className="h-3.5 w-3.5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-heading font-bold tabular-nums">
                {info?.total_transactions ?? 0}
              </div>
              <p className="text-xs text-foreground-muted mt-1 font-mono">
                {info?.oldest_age_secs
                  ? `oldest: ${formatAge(info.oldest_age_secs)}`
                  : "—"}
              </p>
            </CardContent>
          </Card>

          {/* Pool Size */}
          <Card variant="crystalline">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
                POOL SIZE
              </CardTitle>
              <div className="icon-hex icon-hex-sm bg-crystal-leaf/20">
                <Database className="h-3.5 w-3.5 text-crystal-leaf" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-heading font-bold tabular-nums">
                {formatBytes(info?.size_bytes ?? 0)}
              </div>
              <p className="text-xs text-foreground-muted mt-1 font-mono">
                serialized data
              </p>
            </CardContent>
          </Card>

          {/* UTXO Txs */}
          <Card variant="crystalline">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
                UTXO TXS
              </CardTitle>
              <div className="icon-hex icon-hex-sm bg-crystal-stem/20">
                <Activity className="h-3.5 w-3.5 text-crystal-stem" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-heading font-bold tabular-nums">
                {utxoCount}
              </div>
              <p className="text-xs text-foreground-muted mt-1 font-mono">
                Standard / Stake / Unstake
              </p>
            </CardContent>
          </Card>

          {/* VM Txs */}
          <Card variant="crystalline">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
                VM TXS
              </CardTitle>
              <div className="icon-hex icon-hex-sm bg-crystal-fruit/20">
                <Cpu className="h-3.5 w-3.5 text-crystal-fruit" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-heading font-bold tabular-nums">
                {vmCount}
              </div>
              <p className="text-xs text-foreground-muted mt-1 font-mono">
                Calls / Deploy / Transfer
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-none px-6 py-3 flex items-center justify-between border-y border-border">
        <div className="flex items-center gap-2">
          <FilterButton
            active={filter === "all"}
            onClick={() => setFilter("all")}
            count={info?.total_transactions}
            variant="default"
          >
            All
          </FilterButton>
          <FilterButton
            active={filter === "utxo"}
            onClick={() => setFilter("utxo")}
            count={utxoCount}
            variant="stem"
          >
            UTXO
          </FilterButton>
          <FilterButton
            active={filter === "vm"}
            onClick={() => setFilter("vm")}
            count={vmCount}
            variant="fruit"
          >
            VM
          </FilterButton>
        </div>

        <div className="text-xs font-mono text-foreground-muted">
          {filteredTransactions.length} transactions
        </div>
      </div>

      {/* Table Header */}
      <div className="flex-none grid grid-cols-[140px_1fr_120px_100px_90px] gap-4 px-4 py-3 bg-background-secondary border-b border-border">
        <SortHeader
          label="Type"
          field="type"
          currentSort={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <div className="text-xs font-heading font-medium tracking-wide text-foreground-muted uppercase">
          Hash
        </div>
        <SortHeader
          label="Fee"
          field="fee"
          currentSort={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="justify-end"
        />
        <SortHeader
          label="Size"
          field="size"
          currentSort={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="justify-end"
        />
        <SortHeader
          label="Age"
          field="age"
          currentSort={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          className="justify-end"
        />
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="shimmer h-8 w-32 rounded" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div>
            {filteredTransactions.map((tx) => (
              <TransactionRow
                key={tx.hash}
                tx={tx}
                copied={copied}
                onCopy={copyHash}
                onClick={() => setSelectedTxHash(tx.hash)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-background-secondary border-t border-border text-xs font-mono text-foreground-muted">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="status-diamond-sm bg-crystal-stem" />
            UTXO: {info?.transaction_count_by_type?.["Standard"] ?? 0} std /{" "}
            {info?.transaction_count_by_type?.["Stake"] ?? 0} stake /{" "}
            {info?.transaction_count_by_type?.["Unstake"] ?? 0} unstake
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <span className="status-diamond-sm bg-crystal-fruit" />
            VM: {info?.transaction_count_by_type?.["ContractCall"] ?? 0} call /{" "}
            {info?.transaction_count_by_type?.["ContractDeploy"] ?? 0} deploy /{" "}
            {info?.transaction_count_by_type?.["AccountTransfer"] ?? 0} xfer
          </span>
        </div>
        <span className="text-foreground-muted/50">Crystal Network</span>
      </div>

      {/* Transaction Detail Panel */}
      <MempoolTransactionDetailPanel
        hash={selectedTxHash}
        onClose={() => setSelectedTxHash(null)}
      />
    </div>
  );
};

export default Mempool;
