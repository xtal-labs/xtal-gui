import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  Clock,
  Download,
  FileCode,
  Fuel,
  Hash,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Package,
  Pickaxe,
  Send,
  Unlock,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidePanelShell } from "@/components/ui/side-panel-shell";
import { AmountDisplay } from "./AmountDisplay";
import { HashDisplay } from "./HashDisplay";
import {
  CollapsibleSection,
  IORow,
} from "@/components/common/TransactionDetailPrimitives";
import { cn, formatTimeAgo, formatBytes, formatGas } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import { getMaturityDisplay } from "@/lib/maturity";
import type { TransactionDetail, UTXODetail, VMDetail } from "@/types";

interface TransactionDetailPanelProps {
  detail: TransactionDetail | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

function getTransactionStyle(
  txType: string,
  netAmount: number,
  preferredFruitType?: string,
) {
  switch (txType) {
    case "coinbase":
      return {
        icon: Pickaxe,
        color: "text-warning",
        bg: "bg-warning/20",
        borderColor: "border-warning/30",
        label: "Mining Reward",
        gradient: "from-warning/10 via-transparent to-transparent",
      };
    case "stake":
      return {
        icon: Lock,
        color: "text-violet-400",
        bg: "bg-violet-400/20",
        borderColor: "border-violet-400/30",
        label: "Stake",
        gradient: "from-violet-400/10 via-transparent to-transparent",
      };
    case "unstake":
      return {
        icon: Unlock,
        color: "text-orange-400",
        bg: "bg-orange-400/20",
        borderColor: "border-orange-400/30",
        label: "Unstake",
        gradient: "from-orange-400/10 via-transparent to-transparent",
      };
    case "contract_call":
    case "contract_deploy": {
      const label = txType === "contract_deploy" ? "Deploy Contract" : "Contract Call";
      if (preferredFruitType) {
        const fruit = getFruitColor(preferredFruitType);
        return {
          icon: FileCode,
          color: fruit.icon,
          bg: fruit.bg,
          borderColor: fruit.border,
          label,
          gradient: fruit.bg,
        };
      }
      return {
        icon: FileCode,
        color: "text-cyan-400",
        bg: "bg-cyan-400/20",
        borderColor: "border-cyan-400/30",
        label,
        gradient: "from-cyan-400/10 via-transparent to-transparent",
      };
    }
    case "account_transfer":
      return {
        icon: ArrowRightLeft,
        color: "text-primary",
        bg: "bg-primary/20",
        borderColor: "border-primary/30",
        label: "Transfer",
        gradient: "from-primary/10 via-transparent to-transparent",
      };
    case "cage_withdrawal":
      return {
        icon: LogOut,
        color: "text-rose-400",
        bg: "bg-rose-400/20",
        borderColor: "border-rose-400/30",
        label: "Withdrawal Request",
        gradient: "from-rose-400/10 via-transparent to-transparent",
      };
    case "vm_withdrawal":
      return {
        icon: LogOut,
        color: "text-rose-400",
        bg: "bg-rose-400/20",
        borderColor: "border-rose-400/30",
        label: "Withdrawal",
        gradient: "from-rose-400/10 via-transparent to-transparent",
      };
    case "vm_deposit":
      return {
        icon: Upload,
        color: "text-emerald-400",
        bg: "bg-emerald-400/20",
        borderColor: "border-emerald-400/30",
        label: "Deposit",
        gradient: "from-emerald-400/10 via-transparent to-transparent",
      };
    default:
      if (netAmount > 0) {
        return {
          icon: Download,
          color: "text-success",
          bg: "bg-success/20",
          borderColor: "border-success/30",
          label: "Receive",
          gradient: "from-success/10 via-transparent to-transparent",
        };
      }
      return {
        icon: Send,
        color: "text-primary",
        bg: "bg-primary/20",
        borderColor: "border-primary/30",
        label: "Send",
        gradient: "from-primary/10 via-transparent to-transparent",
      };
  }
}

function getExecutionStatusBadge(status: TransactionDetail["executionStatus"]) {
  switch (status) {
    case "unknown":
      return {
        label: "submitted",
        variant: "warning" as const,
        description: "Seen by the wallet, but not confirmed yet.",
      };
    case "pending_execution":
      return {
        label: "pending_execution",
        variant: "info" as const,
        description: "Confirmed on-chain, but the final receipt is not cached yet.",
      };
    case "failed":
      return {
        label: "failed",
        variant: "destructive" as const,
        description: "Execution completed with an error receipt.",
      };
    case "success":
      return {
        label: "success",
        variant: "success" as const,
        description: "Execution completed successfully.",
      };
    default:
      return null;
  }
}

function getBridgeHint(detail: TransactionDetail) {
  if (detail.detail.kind === "vm" && detail.detail.bridge?.kind === "cage_withdrawal") {
    return "Debits the source VM account and creates a spendable UTXO after execution.";
  }

  switch (detail.txType) {
    case "vm_deposit":
      return "Consumes a UTXO and credits the matching VM account.";
    case "vm_withdrawal":
      return "Creates a spendable UTXO from VM account funds.";
    default:
      return null;
  }
}

function getAmountPresentation(detail: TransactionDetail) {
  const payload = detail.detail;

  if (payload.kind === "utxo") {
    if (detail.txType === "vm_withdrawal") {
      return {
        label: "Withdrawal Value",
        amount: payload.bridge?.withdrawalValue ?? payload.totalOutput,
        positive: true,
        negative: false,
      };
    }

    return {
      label: "Net Amount",
      amount: Math.abs(payload.netAmount),
      positive: payload.netAmount > 0,
      negative: payload.netAmount < 0,
    };
  }

  if (payload.bridge?.kind === "cage_withdrawal") {
    return {
      label: "Withdrawal Amount",
      amount: payload.bridge.netWithdrawalAmount ?? payload.bridge.requestedAmount,
      positive: false,
      negative: true,
    };
  }

  switch (detail.txType) {
    case "vm_deposit":
      return {
        label: "Deposited",
        amount: payload.bridge?.depositedAmount ?? 0,
        positive: true,
        negative: false,
      };
    case "account_transfer":
      return {
        label: "Transfer Amount",
        amount: payload.transferAmount ?? 0,
        positive: true,
        negative: false,
      };
    case "contract_call":
      if ((payload.value ?? 0) > 0) {
        return {
          label: "Call Value",
          amount: payload.value ?? 0,
          positive: true,
          negative: false,
        };
      }
      return {
        label: "Max Fee",
        amount: detail.fee ?? 0,
        positive: false,
        negative: false,
      };
    default:
      return {
        label: "Max Fee",
        amount: detail.fee ?? 0,
        positive: false,
        negative: false,
      };
  }
}

function getFlowSectionConfig(txType: string) {
  if (txType === "vm_withdrawal") {
    return {
      showInputs: false,
      inputsTitle: "INPUTS",
      inputEmptyLabel: "No Inputs",
      showOutputs: true,
      outputsTitle: "WITHDRAWAL OUTPUT",
      outputEmptyLabel: "Withdrawal output unavailable",
      showArrow: false,
    };
  }

  return {
    showInputs: true,
    inputsTitle: "INPUTS",
    inputEmptyLabel: txType === "coinbase" ? "Block Reward" : "No Inputs",
    showOutputs: true,
    outputsTitle: "OUTPUTS",
    outputEmptyLabel: "No Outputs",
    showArrow: true,
  };
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted shrink-0">
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function UtxoDetailBody({
  detail,
  utxoDetail,
  style,
}: {
  detail: TransactionDetail;
  utxoDetail: UTXODetail;
  style: ReturnType<typeof getTransactionStyle>;
}) {
  const flowConfig = getFlowSectionConfig(detail.txType);
  const maturityDisplay = getMaturityDisplay(utxoDetail.maturityStatus);
  const pending = detail.confirmations === 0;

  return (
    <>
      <div className="space-y-2">
        {flowConfig.showInputs && (
          <CollapsibleSection
            title={flowConfig.inputsTitle}
            count={utxoDetail.inputs.length}
            defaultOpen={utxoDetail.inputs.length <= 5}
          >
            {utxoDetail.inputs.length === 0 ? (
              <IORow
                index={0}
                label={flowConfig.inputEmptyLabel}
                isMine={false}
                flow="input"
                pending={pending}
              />
            ) : (
              utxoDetail.inputs.map((input, idx) => (
                <IORow
                  key={`${input.txid}-${input.outputIndex}`}
                  index={idx}
                  address={input.address}
                  amount={input.amount}
                  isMine={input.isMine ?? false}
                  flow="input"
                  pending={pending}
                  redeemScriptType={input.redeemScriptType}
                />
              ))
            )}
          </CollapsibleSection>
        )}

        {flowConfig.showArrow && flowConfig.showInputs && flowConfig.showOutputs && (
          <div className="flex justify-center py-1">
            <div className={cn("icon-hex icon-hex-sm", style.bg)}>
              <ArrowDown className={cn("h-3.5 w-3.5", style.color)} />
            </div>
          </div>
        )}

        {flowConfig.showOutputs && (
          <CollapsibleSection
            title={flowConfig.outputsTitle}
            count={utxoDetail.outputs.length}
            defaultOpen={utxoDetail.outputs.length <= 5}
          >
            {utxoDetail.outputs.length === 0 ? (
              <IORow
                index={0}
                label={flowConfig.outputEmptyLabel}
                isMine={false}
                flow="output"
                pending={pending}
              />
            ) : (
              utxoDetail.outputs.map((output) => {
                let rewardType: "leaf" | "stem" | "fruit" | undefined;
                if (detail.txType === "coinbase") {
                  if (output.scriptType === "stake") {
                    rewardType = "fruit";
                  } else if (output.index === 0) {
                    rewardType = "leaf";
                  } else {
                    rewardType = "stem";
                  }
                }

                return (
                  <IORow
                    key={`out-${output.index}`}
                    index={output.index}
                    address={output.address}
                    amount={output.amount}
                    isMine={output.isMine ?? false}
                    flow="output"
                    pending={pending}
                    rewardType={rewardType}
                  />
                );
              })
            )}
          </CollapsibleSection>
        )}
      </div>

      {detail.txType === "vm_withdrawal" ? (
        <div className="chamfered-sm bg-muted/30 px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-foreground-muted font-heading">Created UTXO</span>
            <AmountDisplay
              amount={utxoDetail.bridge?.withdrawalValue ?? utxoDetail.totalOutput}
              size="sm"
              positive
            />
          </div>
        </div>
      ) : (
        <div className="chamfered-sm bg-muted/30 px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-foreground-muted font-heading">Total Input</span>
            <AmountDisplay amount={utxoDetail.totalInput} size="sm" />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-muted font-heading">Total Output</span>
            <AmountDisplay amount={utxoDetail.totalOutput} size="sm" />
          </div>
          {detail.fee !== undefined && detail.fee > 0 && (
            <>
              <div className="h-px bg-border/50" />
              <div className="flex justify-between text-sm">
                <span className="text-foreground-muted font-heading">Fee (Input - Output)</span>
                <AmountDisplay amount={detail.fee} size="sm" negative />
              </div>
            </>
          )}
        </div>
      )}

      {maturityDisplay && (
        <div className="chamfered-sm border border-warning/30 bg-warning/10 px-4 py-3">
          <p className="text-xs text-warning">
            {maturityDisplay.detail}
          </p>
        </div>
      )}
    </>
  );
}

function VmDetailBody({
  detail,
  vmDetail,
}: {
  detail: TransactionDetail;
  vmDetail: VMDetail;
}) {
  const isSponsored = (detail.fee ?? 0) === 0 && vmDetail.gasPrice == null;
  const callerLabel = vmDetail.bridge?.kind === "cage_withdrawal" ? "Source Account" : "Caller";
  const withdrawalRecipient =
    vmDetail.bridge?.kind === "cage_withdrawal"
      ? vmDetail.bridge.producedOutputRecipient ?? vmDetail.bridge.requestedRecipient
      : null;

  return (
    <>
      {vmDetail.bridge?.kind === "vm_deposit" && (
        <CollapsibleSection
          title="DEPOSIT SOURCE"
          count={vmDetail.bridge.sourceInput ? 1 : 0}
          defaultOpen
        >
          {vmDetail.bridge.sourceInput ? (
            <IORow
              index={0}
              address={vmDetail.bridge.sourceInput.address}
              amount={vmDetail.bridge.sourceInput.amount}
              isMine={vmDetail.bridge.sourceInput.isMine ?? false}
              flow="input"
              pending={detail.confirmations === 0}
            />
          ) : (
            <IORow
              index={0}
              label="Deposit source unavailable"
              isMine={false}
              flow="input"
              pending={detail.confirmations === 0}
            />
          )}
        </CollapsibleSection>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="icon-hex icon-hex-sm bg-cyan-400/20">
            <FileCode className="h-3 w-3 text-cyan-400" />
          </div>
          <span className="text-xs font-heading text-foreground-secondary tracking-wider uppercase">
            VM Details
          </span>
        </div>

        <div className="chamfered-sm bg-muted/20 px-4 py-3 space-y-0 divide-y divide-border/30">
          {vmDetail.caller && (
            <DetailRow label={callerLabel}>
              <HashDisplay hash={vmDetail.caller} chars={12} className="text-xs" />
            </DetailRow>
          )}

          {vmDetail.contractAddress && (
            <DetailRow label="Contract">
              <HashDisplay hash={vmDetail.contractAddress} chars={12} className="text-xs" />
            </DetailRow>
          )}

          {vmDetail.method && (
            <DetailRow label="Method">
              <span className="text-sm font-mono text-cyan-400">{vmDetail.method}()</span>
            </DetailRow>
          )}

          {vmDetail.bridge?.kind === "cage_withdrawal" && (
            <DetailRow label="Requested Amount">
              <AmountDisplay amount={vmDetail.bridge.requestedAmount} size="sm" />
            </DetailRow>
          )}

          {vmDetail.bridge?.kind === "cage_withdrawal" &&
            vmDetail.bridge.netWithdrawalAmount != null && (
              <DetailRow label="Net Withdrawal">
                <AmountDisplay amount={vmDetail.bridge.netWithdrawalAmount} size="sm" />
              </DetailRow>
            )}

          {withdrawalRecipient && (
            <DetailRow label="Recipient">
              <span className="text-xs font-mono break-all text-right">{withdrawalRecipient}</span>
            </DetailRow>
          )}

          {vmDetail.recipient && (
            <DetailRow label="Recipient">
              <HashDisplay hash={vmDetail.recipient} chars={12} className="text-xs" />
            </DetailRow>
          )}

          {vmDetail.transferAmount != null && vmDetail.transferAmount > 0 && (
            <DetailRow label="Amount">
              <AmountDisplay amount={vmDetail.transferAmount} size="sm" />
            </DetailRow>
          )}

          {vmDetail.currency && (
            <DetailRow label="Currency">
              <Badge variant="outline" className="text-[10px]">
                {vmDetail.currency}
              </Badge>
            </DetailRow>
          )}

          {vmDetail.preferredFruitType && (
            <DetailRow label="Fruit Type">
              <span className={cn("text-xs font-heading", getFruitColor(vmDetail.preferredFruitType).icon)}>
                {getFruitColor(vmDetail.preferredFruitType).emoji} {vmDetail.preferredFruitType}
              </span>
            </DetailRow>
          )}
        </div>
      </div>

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
                {vmDetail.gasLimit != null ? formatGas(vmDetail.gasLimit) : "—"}
              </span>
            </CardContent>
          </Card>

          <Card variant="crystalline">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase mb-1">
                Gas Price
              </p>
              <span className="text-sm font-mono font-semibold tabular-nums">
                {vmDetail.gasPrice != null
                  ? vmDetail.gasPrice.toLocaleString()
                  : isSponsored
                    ? "Sponsored"
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
                {(detail.fee ?? 0) > 0 ? formatGas(detail.fee ?? 0) : "0"}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

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
          {vmDetail.nonce != null && (
            <DetailRow label="Nonce">
              <span className="text-sm font-mono tabular-nums">{vmDetail.nonce}</span>
            </DetailRow>
          )}

          {vmDetail.value != null && vmDetail.value > 0 && (
            <DetailRow label="Value">
              <AmountDisplay amount={vmDetail.value} size="sm" />
            </DetailRow>
          )}

          {vmDetail.dataSize != null && (
            <DetailRow label="Data Size">
              <span className="text-sm font-mono tabular-nums flex items-center gap-1.5 justify-end">
                <Package className="h-3 w-3 text-foreground-muted" />
                {formatBytes(vmDetail.dataSize)}
              </span>
            </DetailRow>
          )}
        </div>
      </div>
    </>
  );
}

export function TransactionDetailPanel({
  detail,
  isOpen,
  onClose,
  isLoading = false,
}: TransactionDetailPanelProps) {
  const lastDetailRef = useRef<TransactionDetail | null>(null);

  useEffect(() => {
    if (detail) lastDetailRef.current = detail;
  }, [detail]);

  const visibleDetail = detail ?? (!isOpen ? lastDetailRef.current : null);
  const payload = visibleDetail?.detail;
  const netAmount = payload?.kind === "utxo" ? payload.netAmount : 0;
  const preferredFruitType =
    payload?.kind === "vm" ? payload.preferredFruitType : undefined;
  const style = visibleDetail
    ? getTransactionStyle(visibleDetail.txType, netAmount, preferredFruitType)
    : getTransactionStyle("standard", 0);
  const Icon = style.icon;
  // Only VM-kind transactions carry a receipt/execution status. A VmWithdrawal is a
  // UTXO-kind settlement tx (its own txid) with no receipt of its own — the originating
  // CAGE call is the separate VM tx that does. Show only what this tx actually carries.
  const executionBadge =
    payload?.kind === "vm"
      ? getExecutionStatusBadge(visibleDetail?.executionStatus)
      : null;
  const amountPresentation = visibleDetail
    ? getAmountPresentation(visibleDetail)
    : { label: "Net Amount", amount: 0, positive: false, negative: false };
  const bridgeHint = visibleDetail ? getBridgeHint(visibleDetail) : null;

  return (
    <SidePanelShell open={isOpen} onClose={onClose} title="Transaction detail">
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-32 pointer-events-none",
            "bg-gradient-to-b",
            style.gradient
          )}
        />

        <div className="relative flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn("icon-hex", style.bg)}>
              <Icon className={cn("h-5 w-5", style.color)} />
            </div>
            <div>
              <h2 className={cn("font-heading text-lg tracking-wide", style.color)}>{style.label}</h2>
              {visibleDetail && (
                <div className="space-y-1">
                  <HashDisplay hash={visibleDetail.txid} chars={12} className="text-xs text-foreground-muted" />
                  {executionBadge && (
                    <Badge
                      variant={executionBadge.variant}
                      shape="chamfered"
                      diamond={visibleDetail.executionStatus !== "success"}
                      className="text-[10px]"
                    >
                      {executionBadge.label}
                    </Badge>
                  )}
                </div>
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
              <p className="text-sm text-foreground-muted font-heading">Loading transaction...</p>
            </div>
          ) : visibleDetail && payload ? (
            <>
              {payload.kind === "vm" &&
                visibleDetail.executionStatus === "failed" &&
                visibleDetail.receipt?.error && (
                <div className="chamfered-sm border border-destructive/40 bg-destructive/10 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-[10px] font-heading tracking-wider uppercase">
                      Execution Error
                    </span>
                  </div>
                  <p className="text-sm font-medium text-destructive break-words">
                    {visibleDetail.receipt.error}
                  </p>
                </div>
              )}

              <Card variant="crystalline" className="overflow-visible">
                <CardContent className="p-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-heading text-foreground-muted tracking-wider uppercase">
                      {amountPresentation.label}
                    </p>
                    <AmountDisplay
                      amount={amountPresentation.amount}
                      size="xl"
                      positive={amountPresentation.positive}
                      negative={amountPresentation.negative}
                      showFull
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border/50">
                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Fee
                      </p>
                      <AmountDisplay amount={visibleDetail.fee ?? 0} size="sm" />
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Confirmations
                      </p>
                      {visibleDetail.confirmations === 0 ? (
                        <span className="text-sm font-mono text-warning flex items-center justify-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      ) : (
                        <span className="text-sm font-mono text-success">
                          {visibleDetail.confirmations.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Block
                      </p>
                      {visibleDetail.blockHeight ? (
                        <span className="text-sm font-mono flex items-center justify-center gap-1">
                          <Layers className="h-3 w-3 text-foreground-muted" />
                          {visibleDetail.blockHeight.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-sm font-mono text-foreground-muted">—</span>
                      )}
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Time
                      </p>
                      <span className="text-sm font-mono">{formatTimeAgo(visibleDetail.timestamp)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {(payload.kind === "vm" || executionBadge || visibleDetail.receipt) && (
                <div className="space-y-3">
                  <div className="chamfered-sm bg-muted/20 px-4 py-3">
                    <div className="space-y-0 divide-y divide-border/30">
                      {executionBadge && (
                        <DetailRow label="Status">
                          <div className="space-y-1">
                            <div className="flex justify-end">
                              <Badge
                                variant={executionBadge.variant}
                                shape="chamfered"
                                diamond={visibleDetail.executionStatus !== "success"}
                              >
                                {executionBadge.label}
                              </Badge>
                            </div>
                            <p className="max-w-[18rem] text-xs text-foreground-muted">
                              {executionBadge.description}
                            </p>
                          </div>
                        </DetailRow>
                      )}

                      {visibleDetail.receipt && (
                        <>
                          <DetailRow label="Gas Used">
                            <span className="text-sm font-mono tabular-nums">
                              {visibleDetail.receipt.gasUsed.toLocaleString()}
                            </span>
                          </DetailRow>
                          <DetailRow label="Fee Paid">
                            <AmountDisplay amount={visibleDetail.receipt.feePaid} size="sm" negative />
                          </DetailRow>
                          {visibleDetail.receipt.contractAddress && (
                            <DetailRow label="Contract">
                              <HashDisplay
                                hash={visibleDetail.receipt.contractAddress}
                                chars={12}
                                className="text-xs"
                              />
                            </DetailRow>
                          )}
                          <DetailRow label="Block Height">
                            <span className="text-sm font-mono tabular-nums">
                              {visibleDetail.receipt.blockHeight.toLocaleString()}
                            </span>
                          </DetailRow>
                          <DetailRow label="Tx Index">
                            <span className="text-sm font-mono tabular-nums">
                              {visibleDetail.receipt.transactionIndex.toLocaleString()}
                            </span>
                          </DetailRow>
                        </>
                      )}
                    </div>
                  </div>

                  {visibleDetail.receipt && (
                    <CollapsibleSection
                      title="LOGS"
                      count={visibleDetail.receipt.logs.length}
                      defaultOpen={visibleDetail.receipt.logs.length <= 3}
                    >
                      {visibleDetail.receipt.logs.length === 0 ? (
                        <div className="chamfered-sm bg-background/50 border-l-2 border-l-border px-3 py-2">
                          <p className="text-xs text-foreground-muted italic">No logs emitted</p>
                        </div>
                      ) : (
                        visibleDetail.receipt.logs.map((log, index) => (
                          <div
                            key={`${visibleDetail.txid}-log-${index}`}
                            className="chamfered-sm bg-background/50 border-l-2 border-l-border px-3 py-2"
                          >
                            <p className="mb-1 text-[10px] font-heading tracking-wider uppercase text-foreground-muted">
                              Log {index + 1}
                            </p>
                            <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
                              {log}
                            </pre>
                          </div>
                        ))
                      )}
                    </CollapsibleSection>
                  )}

                  {visibleDetail.receipt && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                        Return Data
                      </p>
                      <div className="chamfered-sm bg-muted/20 px-4 py-3">
                        <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
                          {visibleDetail.receipt.returnData}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bridgeHint && (
                <div className="chamfered-sm border border-border/50 bg-muted/20 px-4 py-3">
                  <p className="text-xs text-foreground-secondary">{bridgeHint}</p>
                </div>
              )}

              {payload.kind === "utxo" ? (
                <UtxoDetailBody detail={visibleDetail} utxoDetail={payload} style={style} />
              ) : (
                <VmDetailBody detail={visibleDetail} vmDetail={payload} />
              )}

              {visibleDetail.blockHash && (
                <div className="space-y-1">
                  <p className="text-[10px] font-heading text-foreground-muted tracking-wider uppercase">
                    Block Hash
                  </p>
                  <HashDisplay hash={visibleDetail.blockHash} chars={16} className="text-xs" />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <p className="text-sm text-foreground-muted font-heading">No transaction selected</p>
            </div>
          )}
        </div>
    </SidePanelShell>
  );
}

export default TransactionDetailPanel;
