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
  SHARDS_PER_XTAL,
  formatDecimalInput,
  getXtalInputError,
  isValidXtalInput,
  parseXtalToShards,
} from "@/lib/utils";
import { parseAddressInput, formatVmAddress } from "@/lib/address";
import { tauriCommand } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";

interface VmSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxBalance: number;
}

type SendStep = "form" | "confirm" | "sending" | "success" | "error";

interface SendResult {
  txid: string;
  fee: number;
}

export function VmSendModal({ isOpen, onClose, maxBalance }: VmSendModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh } = useWalletStore();

  // Gas config from backend
  const [gasConfig, setGasConfig] = useState<GasConfig | null>(null);

  useEffect(() => {
    tauriCommand<GasConfig>("get_gas_config").then(setGasConfig);
  }, []);

  // Form state
  const [step, setStep] = useState<SendStep>("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasLimit, setGasLimit] = useState("");
  const [gasPrice, setGasPrice] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<SendResult | null>(null);

  // Derived values
  const parsedAmountShards = parseXtalToShards(amount);
  const amountShards = parsedAmountShards ?? 0;
  const amountError = getXtalInputError(amount);
  const effectiveGasLimit = parseInt(gasLimit) || gasConfig?.defaultGasLimit || 21000;
  const effectiveGasPrice = parseInt(gasPrice) || gasConfig?.defaultGasPrice || 1;
  const maxFee = effectiveGasLimit * effectiveGasPrice;
  const hasInsufficientFunds = amountShards + maxFee > maxBalance;

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
        setTxResult(null);
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
    amountShards > 0 &&
    !amountError &&
    !hasInsufficientFunds &&
    !hasGasError;

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
      const result = await tauriCommand<SendResult>("send_vm_transfer", {
        toAddress: recipientPkh,
        amount: parsedAmountShards,
        password: password,
        ...(gasLimit ? { gasLimit: effectiveGasLimit } : {}),
        ...(gasPrice ? { gasPrice: effectiveGasPrice } : {}),
      });

      setTxResult(result);
      setStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "VM Transfer Sent",
        message: `Transfer ${result.txid.slice(0, 8)}... submitted`,
        duration: 5000,
      });

      triggerRefresh();
    } catch (err) {
      console.error("VM send failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
      setPassword("");
    }
  };

  const handleClose = () => {
    if (step === "sending") return;
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
                  {step === "error" && "Transfer failed"}
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
                      const maxSend = Math.max(0, maxBalance - maxFee) / SHARDS_PER_XTAL;
                      setAmount(formatDecimalInput(maxSend));
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
                  <span>VM Balance:</span>
                  <AmountDisplay amount={maxBalance} size="sm" showSymbol />
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
                    Insufficient VM balance
                    {maxFee > 0 && ` (includes ${maxFee.toLocaleString()} shard gas fee)`}
                  </span>
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
                  <span className="text-sm font-mono break-all text-right max-w-[60%]">
                    {recipientDisplay}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">AMOUNT</span>
                  <AmountDisplay amount={amountShards} size="sm" showSymbol />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">MAX GAS FEE</span>
                  <AmountDisplay amount={maxFee} size="sm" showSymbol />
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-heading font-medium">TOTAL (MAX)</span>
                  <AmountDisplay
                    amount={amountShards + maxFee}
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
                className="icon-hex mx-auto mb-4 bg-accent/20 animate-pulse"
                style={{ width: "4rem", height: "4rem" }}
              >
                <Loader2 className="h-8 w-8 text-accent animate-spin" />
              </div>
              <p className="text-foreground-secondary font-heading">Broadcasting transfer...</p>
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
