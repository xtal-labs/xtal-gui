import { useState, useEffect } from "react";
import {
  Send,
  X,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Zap,
  Shield,
  Clock,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { AmountDisplay } from "@/components/common";
import {
  cn,
  SHARDS_PER_XTAL,
  formatDecimalInput,
  getXtalInputError,
  isValidXtalInput,
  parseXtalToShards,
} from "@/lib/utils";
import { parseAddressInput, hexToBase58Address } from "@/lib/address";
import { tauriCommand } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxBalance: number;
}

type SendStep = "form" | "confirm" | "sending" | "success" | "error";

interface FeeOption {
  id: string;
  label: string;
  rate: number; // shards per byte
  icon: typeof Zap;
}

const FEE_OPTIONS: FeeOption[] = [
  { id: "economy", label: "Economy", rate: 500, icon: Clock },
  { id: "standard", label: "Standard", rate: 1000, icon: Shield },
  { id: "priority", label: "Priority", rate: 2000, icon: Zap },
];

const DEFAULT_CUSTOM_FEE_RATE_KB = "1000000";
const ESTIMATE_RECIPIENT_HEX = "0000000000000000000000000000000000000000";

interface SendResult {
  txid: string;
  fee: number;
}

interface SendFeeEstimate {
  fee: number;
  txSize: number;
  inputCount: number;
  outputCount: number;
  feeRate: number;
  maxSendable: number;
}

export function SendModal({ isOpen, onClose, maxBalance }: SendModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh } = useWalletStore();

  // Form state
  const [step, setStep] = useState<SendStep>("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isMaxSend, setIsMaxSend] = useState(false);
  const [selectedFee, setSelectedFee] = useState<string>("standard");
  const [customFeeRateKb, setCustomFeeRateKb] = useState(DEFAULT_CUSTOM_FEE_RATE_KB);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<SendResult | null>(null);
  const [feeEstimate, setFeeEstimate] = useState<SendFeeEstimate | null>(null);
  const [isFeeEstimating, setIsFeeEstimating] = useState(false);
  const [feeEstimateError, setFeeEstimateError] = useState<string | null>(null);

  // Derived values
  const parsedAmountShards = parseXtalToShards(amount);
  const amountShards = parsedAmountShards ?? 0;
  const amountError = getXtalInputError(amount);
  const feeOption = FEE_OPTIONS.find((f) => f.id === selectedFee) || FEE_OPTIONS[1];
  const customFeeRateKbNum = Number(customFeeRateKb);
  const customFeeRateError =
    selectedFee === "custom" && (!Number.isFinite(customFeeRateKbNum) || customFeeRateKbNum <= 0)
      ? "Enter a fee rate greater than 0"
      : null;
  const feeRate =
    selectedFee === "custom" && !customFeeRateError
      ? Math.max(1, Math.ceil(customFeeRateKbNum / 1000))
      : feeOption.rate;
  const estimatedFee = feeEstimate?.fee ?? 0;
  const totalAmount = amountShards + estimatedFee;
  const hasInsufficientFunds = feeEstimate !== null && totalAmount > maxBalance;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("form");
        setRecipient("");
        setAmount("");
        setIsMaxSend(false);
        setSelectedFee("standard");
        setCustomFeeRateKb(DEFAULT_CUSTOM_FEE_RATE_KB);
        setPassword("");
        setShowPassword(false);
        setError(null);
        setTxResult(null);
        setFeeEstimate(null);
        setIsFeeEstimating(false);
        setFeeEstimateError(null);
      }, 200);
    }
  }, [isOpen]);

  // Parse recipient address (supports both Base58 and hex formats)
  const parsedAddress = parseAddressInput(recipient);
  const recipientPkh = parsedAddress?.pkh ?? "";
  const recipientDisplay = parsedAddress
    ? hexToBase58Address(parsedAddress.pkh) ?? recipient.trim()
    : recipient.trim();

  useEffect(() => {
    if (
      !isOpen ||
      amountShards <= 0 ||
      amountError ||
      customFeeRateError ||
      feeRate <= 0
    ) {
      setFeeEstimate(null);
      setIsFeeEstimating(false);
      setFeeEstimateError(null);
      return;
    }

    let isCurrent = true;
    const estimateRecipient = recipientPkh || ESTIMATE_RECIPIENT_HEX;

    setIsFeeEstimating(true);
    setFeeEstimateError(null);

    const timer = window.setTimeout(async () => {
      try {
        const result = await tauriCommand<SendFeeEstimate>("estimate_send_transaction_fee", {
          toAddress: estimateRecipient,
          amount: amountShards,
          feeRate,
        });
        if (isCurrent) {
          setFeeEstimate(result);
          setFeeEstimateError(null);
        }
      } catch (err) {
        if (isCurrent) {
          setFeeEstimate(null);
          setFeeEstimateError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isCurrent) {
          setIsFeeEstimating(false);
        }
      }
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, amountShards, amountError, customFeeRateError, feeRate, recipientPkh]);

  // Keep the amount pinned to the latest max while in max-send mode. The fee effect
  // re-runs on feeRate changes, so switching tier re-solves the max automatically.
  // maxSendable is amount-independent, so this settles after one no-op sync.
  useEffect(() => {
    if (!isMaxSend || !feeEstimate) return;
    const formatted = formatDecimalInput(Math.max(0, feeEstimate.maxSendable) / SHARDS_PER_XTAL);
    setAmount((prev) => (prev === formatted ? prev : formatted));
  }, [isMaxSend, feeEstimate]);

  const canProceed =
    recipient.length > 0 &&
    parsedAddress !== null &&
    amountShards > 0 &&
    !amountError &&
    feeEstimate !== null &&
    !isFeeEstimating &&
    !feeEstimateError &&
    !hasInsufficientFunds &&
    !customFeeRateError;

  const handleSend = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }
    if (parsedAmountShards === null || parsedAmountShards <= 0) {
      setError(amountError || "Please enter a valid amount");
      return;
    }

    setStep("sending");
    setError(null);

    try {
      const result = await tauriCommand<SendResult>("send_transaction", {
        toAddress: recipientPkh, // Always send hex PKH to backend
        amount: parsedAmountShards,
        feeRate: feeRate,
        password: password,
      });

      setTxResult(result);
      setStep("success");
      setPassword(""); // Clear password on success

      addToast({
        type: "success",
        title: "Transaction Sent",
        message: `Transaction ${result.txid.slice(0, 8)}... submitted`,
        duration: 5000,
      });

      // Trigger immediate wallet data refresh so the pending tx appears
      triggerRefresh();
    } catch (err) {
      console.error("Send failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
      setPassword(""); // Clear password on error too
    }
  };

  const handleClose = () => {
    if (step === "sending") return; // Don't close while sending
    onClose();
  };

  const handleCopyTxid = async () => {
    if (!txResult) return;
    try {
      await navigator.clipboard.writeText(txResult.txid);
      addToast({
        type: "success",
        title: "Copied",
        message: "Transaction ID copied to clipboard",
        duration: 2000,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      className="bg-black/60 backdrop-blur-sm"
      cardClassName="max-w-lg relative"
      onClose={onClose}
      title="Send"
    >
        {/* Decorative crystal facet overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/50 to-transparent"
            style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
          />
          <div
            className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-accent/50 to-transparent"
            style={{ clipPath: "polygon(0 100%, 100% 100%, 0 0)" }}
          />
        </div>

        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="icon-hex bg-primary/20"
                style={{ width: "2.5rem", height: "2.5rem" }}
              >
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {step === "success" ? "TRANSACTION SENT" : "SEND XTAL"}
                </CardTitle>
                <CardDescription>
                  {step === "form" && "Enter recipient and amount"}
                  {step === "confirm" && "Review transaction details"}
                  {step === "sending" && "Broadcasting transaction..."}
                  {step === "success" && "Your transaction is on its way"}
                  {step === "error" && "Transaction failed"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} disabled={step === "sending"}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Step indicator */}
          {(step === "form" || step === "confirm") && (
            <div className="flex items-center gap-2 mt-4">
              {["form", "confirm"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-6 h-6 flex items-center justify-center text-xs font-heading chamfered-sm",
                      step === s || (step === "confirm" && s === "form")
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground-muted"
                    )}
                  >
                    {i + 1}
                  </div>
                  {i < 1 && (
                    <div className={cn("w-8 h-0.5", step === "confirm" ? "bg-primary" : "bg-muted")} />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 relative">
          {/* Step 1: Form */}
          {step === "form" && (
            <>
              {/* Recipient Address */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  RECIPIENT ADDRESS
                </label>
                <Input
                  placeholder="Enter XTAL address"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className={cn(
                    "font-mono text-sm",
                    recipient && parsedAddress === null && "border-destructive"
                  )}
                  autoComplete="off"
                  spellCheck={false}
                />
                {recipient && parsedAddress === null && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Invalid address format
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                    AMOUNT
                  </label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-primary/80 font-heading"
                    onClick={async () => {
                      setIsMaxSend(true);
                      try {
                        // maxSendable is amount-independent; pass the current amount or a
                        // 1-shard placeholder just to satisfy the command's amount > 0 guard.
                        const est = await tauriCommand<SendFeeEstimate>(
                          "estimate_send_transaction_fee",
                          {
                            toAddress: recipientPkh || ESTIMATE_RECIPIENT_HEX,
                            amount: amountShards > 0 ? amountShards : 1,
                            feeRate,
                          }
                        );
                        const maxXtal = Math.max(0, est.maxSendable) / SHARDS_PER_XTAL;
                        if (maxXtal <= 0) {
                          addToast({
                            type: "warning",
                            title: "Balance too low",
                            message: "Not enough to cover the network fee",
                            duration: 4000,
                          });
                        }
                        setAmount(formatDecimalInput(maxXtal));
                      } catch (err) {
                        setIsMaxSend(false);
                        addToast({
                          type: "error",
                          title: "Couldn't compute max",
                          message: err instanceof Error ? err.message : String(err),
                          duration: 4000,
                        });
                      }
                    }}
                  >
                    MAX
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      if (isValidXtalInput(e.target.value)) {
                        setIsMaxSend(false);
                        setAmount(e.target.value);
                      }
                    }}
                    className="pr-16 text-lg"
                    inputMode="decimal"
                    error={!!amountError}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-heading text-foreground-muted">
                    XTAL
                  </div>
                </div>
                {amountError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {amountError}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-foreground-muted">
                  <span>Available:</span>
                  <AmountDisplay amount={maxBalance} size="sm" showSymbol />
                </div>
              </div>

              {/* Fee Selection */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  NETWORK FEE
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FEE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedFee(option.id)}
                      className={cn(
                        "p-3 chamfered-sm border transition-all text-left",
                        selectedFee === option.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <option.icon
                          className={cn(
                            "h-3.5 w-3.5",
                            selectedFee === option.id ? "text-primary" : "text-foreground-muted"
                          )}
                        />
                        <span className="text-xs font-heading tracking-wide">
                          {option.label.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground-muted font-mono mt-1">
                        {(option.rate * 1000).toLocaleString()} shards/kB
                      </p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedFee("custom")}
                    className={cn(
                      "p-3 chamfered-sm border transition-all text-left",
                      selectedFee === "custom"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Zap
                        className={cn(
                          "h-3.5 w-3.5",
                          selectedFee === "custom" ? "text-primary" : "text-foreground-muted"
                        )}
                      />
                      <span className="text-xs font-heading tracking-wide">CUSTOM</span>
                    </div>
                    <p className="text-xs text-foreground-muted">Manual rate</p>
                    <p className="text-[11px] text-foreground-muted font-mono mt-1">
                      shards/kB
                    </p>
                  </button>
                </div>
                {selectedFee === "custom" && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={1}
                      step={1000}
                      placeholder={DEFAULT_CUSTOM_FEE_RATE_KB}
                      value={customFeeRateKb}
                      onChange={(e) => setCustomFeeRateKb(e.target.value)}
                      className="font-mono text-sm"
                      error={!!customFeeRateError}
                    />
                    {customFeeRateError ? (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {customFeeRateError}
                      </p>
                    ) : (
                      <p className="text-xs text-foreground-muted">
                        Effective rate: {feeRate.toLocaleString()} shards/byte
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-foreground-muted">
                  <span>Estimated fee:</span>
                  {isFeeEstimating ? (
                    <span>Estimating...</span>
                  ) : feeEstimate ? (
                    <AmountDisplay amount={estimatedFee} size="sm" showSymbol />
                  ) : (
                    <span>-</span>
                  )}
                </div>
                {feeEstimate && (
                  <div className="flex items-center justify-between text-xs text-foreground-muted">
                    <span>Estimated size:</span>
                    <span className="font-mono">{feeEstimate.txSize.toLocaleString()} bytes</span>
                  </div>
                )}
                {feeEstimateError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {feeEstimateError}
                  </p>
                )}
              </div>

              {/* Insufficient funds warning */}
              {hasInsufficientFunds && amountShards > 0 && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 chamfered-sm bg-destructive/10">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Insufficient funds (including network fee)</span>
                </div>
              )}

              {/* Continue button */}
              <Button
                variant="crystalline"
                className="w-full text-foreground"
                disabled={!canProceed}
                onClick={() => setStep("confirm")}
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && (
            <>
              <div className="space-y-3 p-4 chamfered bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">RECIPIENT</span>
                  <span className="text-sm font-mono break-all">
                    {recipientDisplay}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">AMOUNT</span>
                  <AmountDisplay amount={amountShards} size="sm" showSymbol />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">NETWORK FEE</span>
                  <AmountDisplay amount={estimatedFee} size="sm" showSymbol />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">FEE RATE</span>
                  <span className="text-sm font-mono">
                    {(feeRate * 1000).toLocaleString()} shards/kB
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-heading font-medium">TOTAL</span>
                  <AmountDisplay
                    amount={totalAmount}
                    size="sm"
                    showSymbol
                    className="font-medium"
                  />
                </div>
              </div>

              {/* Password input for signing */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  WALLET PASSWORD
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password to sign transaction"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && password && handleSend()}
                    autoComplete="current-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex items-start gap-2 p-3 chamfered-sm bg-warning/10 text-warning">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  Please verify the recipient address. Transactions cannot be reversed.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  variant="crystalline"
                  className="flex-1 text-foreground"
                  onClick={handleSend}
                  disabled={!password}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Now
                </Button>
              </div>
            </>
          )}

          {/* Sending state */}
          {step === "sending" && (
            <div className="py-8 text-center">
              <div
                className="icon-hex mx-auto mb-4 bg-primary/20 animate-pulse"
                style={{ width: "4rem", height: "4rem" }}
              >
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <p className="text-foreground-secondary font-heading">Broadcasting transaction...</p>
            </div>
          )}

          {/* Success state */}
          {step === "success" && txResult && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-success/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-foreground-secondary text-sm mb-2">Transaction ID</p>
                <p
                  className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={handleCopyTxid}
                  title="Click to copy"
                >
                  {txResult.txid}
                </p>
              </div>
              <Button variant="crystalline" className="w-full text-foreground" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}

          {/* Error state */}
          {step === "error" && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-destructive/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="text-destructive font-medium mb-2">Transaction Failed</p>
                <p className="text-sm text-foreground-muted">{error}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="crystalline"
                  className="flex-1 text-foreground"
                  onClick={() => setStep("confirm")}
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
    </ModalShell>
  );
}
