import { useState, useEffect } from "react";
import {
  Send,
  X,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { AmountDisplay, GasSettings, type GasConfig } from "@/components/common";
import {
  cn,
  getXtalInputError,
  isValidXtalInput,
  parseXtalToShards,
  formatXtalInput,
  truncateAddress,
  toShards,
  type ShardAmount,
} from "@/lib/utils";
import { parseAddressInput, formatVmAddress } from "@/lib/address";
import { tauriCommand, tauriCommandSafe } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";
import type { SweepPlan, SweepSubmitResult } from "@/types/wallet";

interface VmSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxBalance: ShardAmount;
}

type SendStep = "form" | "confirm" | "sending" | "success" | "error";

export function VmSendModal({ isOpen, onClose, maxBalance }: VmSendModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh } = useWalletStore();

  // Gas config from backend
  const [gasConfig, setGasConfig] = useState<GasConfig | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    tauriCommandSafe<GasConfig>("get_gas_config").then(([config, error]) => {
      if (cancelled) return;
      if (config) {
        setGasConfig(config);
      } else {
        addToast({
          type: "error",
          title: "Failed to load gas config",
          message: error ?? "Could not fetch gas settings from the node",
          duration: 5000,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, addToast]);

  // Form state
  const [step, setStep] = useState<SendStep>("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasLimit, setGasLimit] = useState("");
  const [gasPrice, setGasPrice] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SweepPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [sweepResult, setSweepResult] = useState<SweepSubmitResult | null>(null);
  // Txids already submitted before a sweep error (parsed from the backend's
  // error message). Non-empty means a partial failure: retrying is unsafe
  // because the submitted legs aren't reflected in account balances yet, so a
  // re-plan would cover the full amount again and could double-send.
  const [partialTxids, setPartialTxids] = useState<string[] | null>(null);
  // Both quoted by the backend from the current gas policy, so the form can
  // show a max and a fee before a plan exists without deriving either.
  const [maxSendable, setMaxSendable] = useState<ShardAmount | null>(null);
  const [maxGasFeeQuote, setMaxGasFeeQuote] = useState<ShardAmount | null>(null);

  // Derived values
  const parsedAmountShards = parseXtalToShards(amount);
  const amountShards = toShards(parsedAmountShards ?? "0");
  const amountError = getXtalInputError(amount);
  const effectiveGasLimit = parseInt(gasLimit) || gasConfig?.defaultGasLimit || 21000;
  const effectiveGasPrice = parseInt(gasPrice) || gasConfig?.defaultGasPrice || 1;

  // Every figure below is quoted by the Rust wallet. This component must not
  // multiply gas limit by gas price, add a gas reservation to an amount, or
  // subtract one to derive a maximum — the sweep planner owns those rules and
  // reimplementing them here is how the two drifted apart before.
  const maxFee = toShards(maxGasFeeQuote ?? "0");
  const sendableNow = maxSendable !== null ? toShards(maxSendable) : null;
  const hasInsufficientFunds =
    sendableNow !== null ? amountShards > 0n && amountShards > sendableNow : false;

  // Plan-derived values (available on the confirm step)
  const maxGasFeePerLeg = toShards(plan?.maxGasFeePerLeg ?? maxGasFeeQuote ?? "0");
  const totalMaxGasFee = toShards(plan?.totalMaxGasFee ?? maxGasFeeQuote ?? "0");
  const totalDeducted = toShards(plan?.totalDeducted ?? "0");
  const isPartialFailure = partialTxids !== null && partialTxids.length > 0;

  // Quote the sendable maximum and the per-leg gas reservation from the
  // backend whenever the gas policy changes. Both used to be derived here;
  // the sweep planner is the only thing that knows the real rules.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const gasArgs = { gasLimit: effectiveGasLimit, gasPrice: effectiveGasPrice };

    tauriCommand<ShardAmount>("max_vm_sendable", gasArgs)
      .then((value) => {
        if (!cancelled) setMaxSendable(value);
      })
      .catch(() => {
        if (!cancelled) setMaxSendable(null);
      });

    tauriCommand<ShardAmount>("quote_max_gas_fee", gasArgs)
      .then((value) => {
        if (!cancelled) setMaxGasFeeQuote(value);
      })
      .catch(() => {
        if (!cancelled) setMaxGasFeeQuote(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, effectiveGasLimit, effectiveGasPrice]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("form");
        setRecipient("");
        setAmount("");
        setGasLimit("");
        setGasPrice("");
        setPassword("");
        setShowPassword(false);
        setError(null);
        setPlan(null);
        setPlanLoading(false);
        setSweepResult(null);
        setPartialTxids(null);
        setMaxSendable(null);
        setMaxGasFeeQuote(null);
      }, 200);
    }
  }, [isOpen]);

  // Parse recipient address (supports 0x-hex, raw hex, and Base58 formats)
  const parsedAddress = parseAddressInput(recipient);
  const recipientPkh = parsedAddress?.pkh ?? "";
  const recipientDisplay = parsedAddress
    ? formatVmAddress(parsedAddress.pkh)
    : recipient.trim();

  const hasGasError =
    (gasLimit !== "" && gasConfig && parseInt(gasLimit) < gasConfig.defaultGasLimit) ||
    (gasLimit !== "" && gasConfig && parseInt(gasLimit) > gasConfig.maxGasLimit) ||
    (gasPrice !== "" && gasConfig && parseInt(gasPrice) < gasConfig.minGasPrice);

  const canProceed =
    recipient.length > 0 &&
    parsedAddress !== null &&
    amountShards > 0n &&
    !amountError &&
    !hasInsufficientFunds &&
    !hasGasError;

  const handleContinue = async () => {
    if (parsedAmountShards === null || toShards(parsedAmountShards) <= 0n) {
      setError(amountError || "Please enter a valid amount");
      return;
    }
    if (parsedAddress === null) {
      setError("Please enter a valid recipient address");
      return;
    }

    setPlanLoading(true);
    setError(null);

    try {
      // Read-only planning — splits the transfer into one transaction per
      // funded account. Amount is passed as a shards string so the Rust
      // backend parses it without JS float precision loss.
      const result = await tauriCommand<SweepPlan>("plan_vm_transfer", {
        toAddress: recipientPkh,
        amount: String(parsedAmountShards),
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
      });

      setPlan(result);
      setStep("confirm");
    } catch (err) {
      console.error("VM transfer planning failed:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanLoading(false);
    }
  };

  const handleBack = () => {
    // Editing the form invalidates the plan — Continue recomputes it.
    setPlan(null);
    setError(null);
    setStep("form");
  };

  const handleSend = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }
    if (parsedAmountShards === null || toShards(parsedAmountShards) <= 0n) {
      setError(amountError || "Please enter a valid amount");
      return;
    }

    setStep("sending");
    setError(null);
    setPartialTxids(null);

    try {
      // Backend-driven sweep — plans and submits one account transfer per
      // funded account. Amount is passed as a shards string so the Rust
      // backend parses it without JS float precision loss.
      const result = await tauriCommand<SweepSubmitResult>("send_vm_transfer", {
        toAddress: recipientPkh,
        amount: String(parsedAmountShards),
        password: password,
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
      });

      setSweepResult(result);
      setStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "VM Transfer Sent",
        message:
          result.legs.length > 1
            ? `Transfer submitted in ${result.legs.length} transactions`
            : `Transfer ${result.legs[0]?.txid.slice(0, 8)}... submitted`,
        duration: 5000,
      });

      triggerRefresh();
    } catch (err) {
      console.error("VM send failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      // Partial-failure detection: the backend emits an explicit
      // `submitted_txids: <a>,<b>` marker ONLY when ≥1 leg reached the mempool.
      // Parse that marker exclusively — a total failure carries no marker (and
      // shortens any stray hash), so its absence reliably means "nothing sent,
      // safe to retry". Don't fall back to scanning loose 64-hex tokens: that
      // would misread an unrelated hash (state root, revert hash) as a submitted
      // leg and wrongly suppress the retry path.
      const markerMatch = message.match(/submitted_txids:\s*([0-9a-f,]+)/i);
      const submittedTxids = markerMatch
        ? [
            ...new Set(
              markerMatch[1].split(",").filter((token) => /^[0-9a-f]{64}$/i.test(token)),
            ),
          ]
        : [];
      setPartialTxids(submittedTxids.length > 0 ? submittedTxids : null);
      setError(message);
      setStep("error");
      setPassword("");
      if (submittedTxids.length > 0) {
        // Some legs went out — refresh so history/balances pick them up.
        triggerRefresh();
      }
    }
  };

  const handleClose = () => {
    if (step === "sending") return;
    onClose();
  };

  const handleCopyTxid = async (txid: string) => {
    try {
      await navigator.clipboard.writeText(txid);
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

  const handleCopyAllTxids = async (txids: string[]) => {
    try {
      await navigator.clipboard.writeText(txids.join("\n"));
      addToast({
        type: "success",
        title: "Copied",
        message: `${txids.length} transaction IDs copied to clipboard`,
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
      title="VM send"
    >
        {/* Decorative crystal facet overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent/50 to-transparent"
            style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
          />
          <div
            className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/50 to-transparent"
            style={{ clipPath: "polygon(0 100%, 100% 100%, 0 0)" }}
          />
        </div>

        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="icon-hex bg-accent/20"
                style={{ width: "2.5rem", height: "2.5rem" }}
              >
                <Send className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {step === "success" ? "TRANSFER SENT" : "SEND VM TRANSFER"}
                </CardTitle>
                <CardDescription>
                  {step === "form" && "Account-to-account XTAL transfer"}
                  {step === "confirm" && "Review transfer details"}
                  {step === "sending" && "Broadcasting transfer..."}
                  {step === "success" && "Your transfer is on its way"}
                  {step === "error" &&
                    (isPartialFailure ? "Transfer partially submitted" : "Transfer failed")}
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
                        ? "bg-accent text-primary-foreground"
                        : "bg-muted text-foreground-muted"
                    )}
                  >
                    {i + 1}
                  </div>
                  {i < 1 && (
                    <div className={cn("w-8 h-0.5", step === "confirm" ? "bg-accent" : "bg-muted")} />
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
                  placeholder="Enter VM address (0x...)"
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
                    className="text-xs text-accent hover:text-accent/80 font-heading"
                    onClick={() => {
                      // Backend-quoted: already net of every leg's gas
                      // reservation and the per-leg eligibility rule.
                      if (sendableNow === null) return;
                      setAmount(formatXtalInput(sendableNow));
                    }}
                    disabled={sendableNow === null}
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
                  <span>{sendableNow !== null ? "Sendable now:" : "VM Balance:"}</span>
                  <AmountDisplay amount={sendableNow ?? maxBalance} size="sm" showSymbol />
                </div>
              </div>

              {/* Gas settings */}
              {gasConfig && (
                <GasSettings
                  gasLimit={gasLimit}
                  gasPrice={gasPrice}
                  onGasLimitChange={setGasLimit}
                  onGasPriceChange={setGasPrice}
                  config={gasConfig}
                />
              )}

              {/* Insufficient funds warning */}
              {hasInsufficientFunds && amountShards > 0 && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 chamfered-sm bg-destructive/10">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Amount exceeds sendable VM balance
                    {maxFee > 0 &&
                      ` (${maxFee.toLocaleString()} shard gas is reserved per transaction)`}
                  </span>
                </div>
              )}

              {/* Planning error (e.g. amount can't be split across accounts) */}
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {/* Continue button */}
              <Button
                variant="crystalline"
                className="w-full text-foreground"
                disabled={!canProceed || planLoading}
                onClick={handleContinue}
              >
                {planLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Planning...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && plan && (
            <>
              <div className="space-y-3 p-4 chamfered bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">RECIPIENT</span>
                  <span className="text-sm font-mono break-all text-right max-w-[60%]">
                    {recipientDisplay}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">AMOUNT</span>
                  <AmountDisplay amount={amountShards} size="sm" showSymbol />
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">TRANSACTIONS</span>
                  <span className="text-sm font-mono tabular-nums">{plan.legCount}</span>
                </div>
                <div className="space-y-1">
                  {plan.legs.map((leg) => (
                    <div key={leg.fromAddress} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-foreground-muted">
                        {truncateAddress(leg.fromAddress)}
                      </span>
                      <AmountDisplay amount={leg.amount} size="sm" showSymbol />
                    </div>
                  ))}
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">MAX GAS PER TX</span>
                  <AmountDisplay amount={maxGasFeePerLeg} size="sm" showSymbol />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">
                    TOTAL MAX GAS ({plan.legCount} TX)
                  </span>
                  <AmountDisplay amount={totalMaxGasFee} size="sm" showSymbol />
                </div>
                <p className="text-xs text-foreground-muted text-right">
                  Maximum — unused gas is refunded
                </p>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-heading font-medium">TOTAL (MAX)</span>
                  <AmountDisplay
                    amount={totalDeducted}
                    size="sm"
                    showSymbol
                    className="font-medium"
                  />
                </div>
              </div>

              {plan.legCount > 1 && (
                <p className="text-xs text-foreground-muted">
                  This transfer draws from {plan.legCount} wallet accounts, so it is sent as{" "}
                  {plan.legCount} transactions to the same recipient; each reserves its own gas.
                </p>
              )}

              {/* Password input for signing */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  WALLET PASSWORD
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password to sign transfer"
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
                  Please verify the recipient address. VM transfers cannot be reversed.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
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
                className="icon-hex mx-auto mb-4 bg-accent/20 animate-pulse"
                style={{ width: "4rem", height: "4rem" }}
              >
                <Loader2 className="h-8 w-8 text-accent animate-spin" />
              </div>
              <p className="text-foreground-secondary font-heading">Broadcasting transfer...</p>
            </div>
          )}

          {/* Success state */}
          {step === "success" && sweepResult && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-success/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <div className="space-y-2">
                <p className="text-foreground-secondary text-sm">
                  {sweepResult.legs.length > 1
                    ? `Transaction IDs (${sweepResult.legs.length})`
                    : "Transaction ID"}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sweepResult.legs.map((leg) => (
                    <p
                      key={leg.txid}
                      className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all cursor-pointer hover:bg-muted/70 transition-colors"
                      onClick={() => handleCopyTxid(leg.txid)}
                      title="Click to copy"
                    >
                      {leg.txid}
                    </p>
                  ))}
                </div>
                {sweepResult.legs.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-accent hover:text-accent/80 font-heading"
                    onClick={() => handleCopyAllTxids(sweepResult.legs.map((leg) => leg.txid))}
                  >
                    Copy all transaction IDs
                  </button>
                )}
              </div>
              <Button variant="crystalline" className="w-full text-foreground" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}

          {/* Error state — partial failure: some legs already reached the
              mempool but aren't reflected in balances yet, so retrying would
              re-plan the full amount and could double-send. No Try Again. */}
          {step === "error" && isPartialFailure && partialTxids && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-warning/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <AlertCircle className="h-8 w-8 text-warning" />
              </div>
              <div>
                <p className="text-warning font-medium mb-2">Transfer Partially Submitted</p>
                <p className="text-sm text-foreground-muted">{error}</p>
              </div>
              <div className="space-y-2">
                <p className="text-foreground-secondary text-sm">
                  {partialTxids.length > 1
                    ? `Submitted transaction IDs (${partialTxids.length})`
                    : "Submitted transaction ID"}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {partialTxids.map((txid) => (
                    <p
                      key={txid}
                      className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all cursor-pointer hover:bg-muted/70 transition-colors"
                      onClick={() => handleCopyTxid(txid)}
                      title="Click to copy"
                    >
                      {txid}
                    </p>
                  ))}
                </div>
                {partialTxids.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-accent hover:text-accent/80 font-heading"
                    onClick={() => handleCopyAllTxids(partialTxids)}
                  >
                    Copy all transaction IDs
                  </button>
                )}
              </div>
              <div className="flex items-start gap-2 p-3 chamfered-sm bg-warning/10 text-warning text-left">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  Some transactions were already submitted. Wait for them to confirm, check your
                  transaction history, then start a new transfer for the remainder.
                </p>
              </div>
              <Button variant="crystalline" className="w-full text-foreground" onClick={handleClose}>
                Close
              </Button>
            </div>
          )}

          {/* Error state — total failure: nothing was submitted, safe to retry */}
          {step === "error" && !isPartialFailure && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-destructive/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="text-destructive font-medium mb-2">Transfer Failed</p>
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
