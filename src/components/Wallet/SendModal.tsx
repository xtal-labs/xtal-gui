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

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  description: string;
  rate: number; // shards per byte
  icon: typeof Zap;
}

const FEE_OPTIONS: FeeOption[] = [
  { id: "economy", label: "Economy", description: "~30 min", rate: 500, icon: Clock },
  { id: "standard", label: "Standard", description: "~10 min", rate: 1000, icon: Shield },
  { id: "priority", label: "Priority", description: "~2 min", rate: 2000, icon: Zap },
];

// Estimated transaction size for fee calculation
const ESTIMATED_TX_SIZE = 250; // bytes

interface SendResult {
  txid: string;
  fee: number;
}

export function SendModal({ isOpen, onClose, maxBalance }: SendModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh } = useWalletStore();

  // Form state
  const [step, setStep] = useState<SendStep>("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedFee, setSelectedFee] = useState<string>("standard");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<SendResult | null>(null);

  // Derived values
  const parsedAmountShards = parseXtalToShards(amount);
  const amountShards = parsedAmountShards ?? 0;
  const amountError = getXtalInputError(amount);
  const feeOption = FEE_OPTIONS.find((f) => f.id === selectedFee) || FEE_OPTIONS[1];
  const estimatedFee = feeOption.rate * ESTIMATED_TX_SIZE;
  const totalAmount = amountShards + estimatedFee;
  const hasInsufficientFunds = totalAmount > maxBalance;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("form");
        setRecipient("");
        setAmount("");
        setSelectedFee("standard");
        setPassword("");
        setShowPassword(false);
        setError(null);
        setTxResult(null);
      }, 200);
    }
  }, [isOpen]);

  // Parse recipient address (supports both Base58 and hex formats)
  const parsedAddress = parseAddressInput(recipient);
  const recipientPkh = parsedAddress?.pkh ?? "";
  const recipientDisplay = parsedAddress
    ? hexToBase58Address(parsedAddress.pkh) ?? recipient.trim()
    : recipient.trim();

  const canProceed =
    recipient.length > 0 &&
    parsedAddress !== null &&
    amountShards > 0 &&
    !amountError &&
    !hasInsufficientFunds;

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
        fee: estimatedFee,
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <Card variant="crystalline" className="w-full max-w-lg mx-4 relative overflow-hidden">
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
                    onClick={() => {
                      const maxSend = Math.max(0, maxBalance - estimatedFee) / SHARDS_PER_XTAL;
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
                  <span>Available:</span>
                  <AmountDisplay amount={maxBalance} size="sm" showSymbol />
                </div>
              </div>

              {/* Fee Selection */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  NETWORK FEE
                </label>
                <div className="grid grid-cols-3 gap-2">
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
                      <p className="text-xs text-foreground-muted">{option.description}</p>
                    </button>
                  ))}
                </div>
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
      </Card>
    </div>
  );
}
