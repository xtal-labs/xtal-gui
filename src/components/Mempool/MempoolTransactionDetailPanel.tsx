import { useState, useEffect } from "react";
import {
  X,
  FileCode,
  ArrowRightLeft,
  Send,
  Lock,
  Unlock,
  ArrowDown,
  Clock,
  Loader2,
  Zap,
  Fuel,
  Hash,
  Package,
  Rocket,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidePanelShell } from "@/components/ui/side-panel-shell";
import { AmountDisplay } from "@/components/common/AmountDisplay";
import { HashDisplay } from "@/components/common/HashDisplay";
import {
  CollapsibleSection,
  IORow,
} from "@/components/common/TransactionDetailPrimitives";
import { cn, formatBytes, formatGas } from "@/lib/utils";
import { tauriCommand } from "@/hooks/useTauriCommand";
import type { MempoolTransactionDetail } from "@/types/wallet";

interface MempoolTransactionDetailPanelProps {
  txid: string | null;
  onClose: () => void;
}

const TX_STYLES: Record<
  string,
  {
    icon: typeof FileCode;
    color: string;
    bg: string;
    label: string;
    gradient: string;
  }
> = {
  ContractCall: {
    icon: FileCode,
    color: "text-cyan-400",
    bg: "bg-cyan-400/20",
    label: "Contract Call",
    gradient: "from-cyan-400/10 via-transparent to-transparent",
  },
  ContractDeploy: {
    icon: Rocket,
    color: "text-cyan-400",
    bg: "bg-cyan-400/20",
    label: "Deploy Contract",
    gradient: "from-cyan-400/10 via-transparent to-transparent",
  },
  AccountTransfer: {
    icon: ArrowRightLeft,
    color: "text-primary",
    bg: "bg-primary/20",
    label: "VM Transfer",
    gradient: "from-primary/10 via-transparent to-transparent",
  },
  Standard: {
    icon: Send,
    color: "text-crystal-stem",
    bg: "bg-crystal-stem/20",
    label: "Standard",
    gradient: "from-crystal-stem/10 via-transparent to-transparent",
  },
  Stake: {
    icon: Lock,
    color: "text-violet-400",
    bg: "bg-violet-400/20",
    label: "Stake",
    gradient: "from-violet-400/10 via-transparent to-transparent",
  },
  Unstake: {
    icon: Unlock,
    color: "text-orange-400",
    bg: "bg-orange-400/20",
    label: "Unstake",
    gradient: "from-orange-400/10 via-transparent to-transparent",
  },
};

const DEFAULT_STYLE = {
  icon: Send,
  color: "text-foreground-secondary",
  bg: "bg-muted",
  label: "Transaction",
  gradient: "from-muted/10 via-transparent to-transparent",
};

function getStyle(txType: string) {
  return TX_STYLES[txType] ?? DEFAULT_STYLE;
}

function formatAge(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

/** Labeled detail row */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs font-heading text-foreground-muted tracking-wide uppercase shrink-0">
        {label}
      </span>
      <div className="text-sm font-mono text-foreground text-right min-w-0">
        {children}
      </div>
    </div>
  );
}

export function MempoolTransactionDetailPanel({
  txid,
  onClose,
}: MempoolTransactionDetailPanelProps) {
  const [detail, setDetail] = useState<MempoolTransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = txid !== null;

  // Fetch detail when txid changes
  useEffect(() => {
    if (!txid) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    tauriCommand<MempoolTransactionDetail | null>(
      "get_mempool_transaction_detail",
      { txid }
    )
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [txid]);

  const style = detail ? getStyle(detail.txType) : DEFAULT_STYLE;
  const Icon = style.icon;

  const isUtxo = detail?.inputs != null;
  const isVm = detail?.caller != null;

  return (
    <SidePanelShell open={isOpen} onClose={onClose} title="Mempool transaction detail">
        {/* Decorative gradient */}
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
              <Icon className={cn("h-5 w-5", style.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={cn(
                    "font-heading text-lg tracking-wide",
                    style.color
                  )}
                >
                  {style.label}
                </h2>
                {detail?.isSponsored && (
                  <Badge variant="warning" shape="rounded" className="text-[10px] px-1.5 py-0">
                    Sponsored
                  </Badge>
                )}
              </div>
              {detail && (
                <HashDisplay
                  hash={detail.txid}
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
                Loading transaction...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <p className="text-sm text-destructive font-heading">{error}</p>
            </div>
          ) : detail ? (
            <>
              {/* Summary Card */}
              <Card variant="crystalline" className="overflow-visible">
                <CardContent className="p-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-heading text-foreground-muted tracking-wider uppercase">
                      {detail.isSponsored ? "Sponsored Fee" : "Transaction Fee"}
                    </p>
                    <AmountDisplay
                      amount={detail.fee}
                      size="xl"
                      showFull
                    />
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Status
                      </p>
                      <span className="text-sm font-mono text-warning flex items-center justify-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Age
                      </p>
                      <span className="text-sm font-mono tabular-nums">
                        {formatAge(detail.ageSecs)}
                      </span>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Size
                      </p>
                      <span className="text-sm font-mono tabular-nums">
                        {formatBytes(detail.sizeBytes)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* UTXO Detail: Inputs -> Outputs */}
              {isUtxo && detail.inputs && detail.outputs && (
                <>
                  <div className="space-y-2">
                    <CollapsibleSection
                      title="INPUTS"
                      count={detail.inputs.length}
                      defaultOpen={detail.inputs.length <= 5}
                    >
                      {detail.inputs.length === 0 ? (
                        <IORow index={0} flow="input" pending />
                      ) : (
                        detail.inputs.map((input, idx) => (
                          <IORow
                            key={`${input.txid}-${input.outputIndex}`}
                            index={idx}
                            address={input.address}
                            amount={input.amount}
                            isMine={input.isMine ?? false}
                            flow="input"
                            pending
                            redeemScriptType={input.redeemScriptType}
                          />
                        ))
                      )}
                    </CollapsibleSection>

                    <div className="flex justify-center py-1">
                      <div className={cn("icon-hex icon-hex-sm", style.bg)}>
                        <ArrowDown
                          className={cn("h-3.5 w-3.5", style.color)}
                        />
                      </div>
                    </div>

                    <CollapsibleSection
                      title="OUTPUTS"
                      count={detail.outputs.length}
                      defaultOpen={detail.outputs.length <= 5}
                    >
                      {detail.outputs.length === 0 ? (
                        <IORow index={0} flow="output" pending />
                      ) : (
                        detail.outputs.map((output) => (
                          <IORow
                            key={`out-${output.index}`}
                            index={output.index}
                            address={output.address}
                            amount={output.amount}
                            isMine={output.isMine ?? false}
                            flow="output"
                            pending
                          />
                        ))
                      )}
                    </CollapsibleSection>
                  </div>

                  {/* Totals */}
                  <div className="chamfered-sm bg-muted/30 px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-muted font-heading">
                        Total Input
                      </span>
                      <AmountDisplay
                        amount={detail.totalInput ?? 0}
                        size="sm"
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-muted font-heading">
                        Total Output
                      </span>
                      <AmountDisplay
                        amount={detail.totalOutput ?? 0}
                        size="sm"
                      />
                    </div>
                    {detail.fee > 0 && (
                      <>
                        <div className="h-px bg-border/50" />
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground-muted font-heading">
                            Fee
                          </span>
                          <AmountDisplay
                            amount={detail.fee}
                            size="sm"
                            negative
                          />
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* VM Detail */}
              {isVm && (
                <>
                  {/* Contract Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="icon-hex icon-hex-sm bg-cyan-400/20">
                        <FileCode className="h-3 w-3 text-cyan-400" />
                      </div>
                      <span className="text-xs font-heading text-foreground-secondary tracking-wider uppercase">
                        Contract Details
                      </span>
                    </div>

                    <div className="chamfered-sm bg-muted/20 px-4 py-3 space-y-0 divide-y divide-border/30">
                      <DetailRow label="Caller">
                        <HashDisplay
                          hash={detail.caller!}
                          chars={10}
                          className="text-xs"
                        />
                      </DetailRow>

                      {detail.contractAddress && (
                        <DetailRow label="Contract">
                          <HashDisplay
                            hash={detail.contractAddress}
                            chars={10}
                            className="text-xs"
                          />
                        </DetailRow>
                      )}

                      {detail.method && (
                        <DetailRow label="Method">
                          <span className="text-cyan-400 font-mono">
                            {detail.method}()
                          </span>
                        </DetailRow>
                      )}

                      {detail.recipient && (
                        <DetailRow label="Recipient">
                          <HashDisplay
                            hash={detail.recipient}
                            chars={10}
                            className="text-xs"
                          />
                        </DetailRow>
                      )}

                      {detail.transferAmount != null &&
                        detail.transferAmount > 0 && (
                          <DetailRow label="Amount">
                            <AmountDisplay
                              amount={detail.transferAmount}
                              size="sm"
                            />
                          </DetailRow>
                        )}

                      {detail.currency && (
                        <DetailRow label="Currency">
                          <Badge variant="outline" className="text-[10px]">
                            {detail.currency}
                          </Badge>
                        </DetailRow>
                      )}

                      {detail.preferredFruitType && (
                        <DetailRow label="Fruit Type">
                          <Badge variant="fruit" shape="chamfered" diamond>
                            {detail.preferredFruitType}
                          </Badge>
                        </DetailRow>
                      )}
                    </div>
                  </div>

                  {/* Gas Parameters */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="icon-hex icon-hex-sm bg-warning/20">
                        <Fuel className="h-3 w-3 text-warning" />
                      </div>
                      <span className="text-xs font-heading text-foreground-secondary tracking-wider uppercase">
                        Gas Parameters
                      </span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <Card variant="crystalline">
                        <CardContent className="p-3 text-center">
                          <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase mb-1">
                            Gas Limit
                          </p>
                          <span className="text-sm font-mono font-semibold tabular-nums flex items-center justify-center gap-1">
                            <Zap className="h-3 w-3 text-warning" />
                            {detail.gasLimit != null
                              ? formatGas(detail.gasLimit)
                              : "—"}
                          </span>
                        </CardContent>
                      </Card>
                      <Card variant="crystalline">
                        <CardContent className="p-3 text-center">
                          <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase mb-1">
                            Gas Price
                          </p>
                          <span className="text-sm font-mono font-semibold tabular-nums">
                            {detail.isSponsored
                              ? "Free"
                              : detail.gasPrice != null
                                ? detail.gasPrice.toLocaleString()
                                : "—"}
                          </span>
                        </CardContent>
                      </Card>
                      <Card variant="crystalline">
                        <CardContent className="p-3 text-center">
                          <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase mb-1">
                            Max Fee
                          </p>
                          <span className="text-sm font-mono font-semibold tabular-nums">
                            {detail.gasLimit != null && detail.gasPrice != null
                              ? formatGas(detail.gasLimit * detail.gasPrice)
                              : detail.isSponsored
                                ? "0"
                                : "—"}
                          </span>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Transaction Meta */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="icon-hex icon-hex-sm bg-primary/20">
                        <Hash className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs font-heading text-foreground-secondary tracking-wider uppercase">
                        Transaction Meta
                      </span>
                    </div>

                    <div className="chamfered-sm bg-muted/20 px-4 py-3 space-y-0 divide-y divide-border/30">
                      {detail.nonce != null && (
                        <DetailRow label="Nonce">
                          <span className="tabular-nums">{detail.nonce}</span>
                        </DetailRow>
                      )}

                      {detail.value != null && detail.value > 0 && (
                        <DetailRow label="Value">
                          <AmountDisplay amount={detail.value} size="sm" />
                        </DetailRow>
                      )}

                      {detail.dataSize != null && (
                        <DetailRow label="Data Size">
                          <span className="flex items-center gap-1.5 tabular-nums">
                            <Package className="h-3 w-3 text-foreground-muted" />
                            {formatBytes(detail.dataSize)}
                          </span>
                        </DetailRow>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <p className="text-sm text-foreground-muted font-heading">
                Transaction not found in mempool
              </p>
            </div>
          )}
        </div>
    </SidePanelShell>
  );
}

export default MempoolTransactionDetailPanel;
