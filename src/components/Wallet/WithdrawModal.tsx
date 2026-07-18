import { useState, useEffect } from "react";
import {
  ArrowDownToLine,
  X,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Wallet,
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
  truncateAddress,
  toShards,
  addShards,
  subShards,
  type ShardAmount,
} from "@/lib/utils";
import { parseAddressInput } from "@/lib/address";
import { tauriCommand } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";
import type { CageConfig } from "@/types/contract";
import type { SweepPlan, SweepSubmitResult, VmAccountBalance } from "@/types/wallet";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxBalance: ShardAmount;
  defaultRecipient?: string; // Base58Check UTXO address
}

type WithdrawStep = "form" | "confirm" | "sending" | "success" | "error";

// CAGE contract minimum per withdraw call — accounts whose spendable balance
// (balance minus per-leg gas reservation) falls below this can't fund a leg.
const MIN_WITHDRAW_LEG_SHARDS = 1000;

export function WithdrawModal({ isOpen, onClose, maxBalance, defaultRecipient }: WithdrawModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh } = useWalletStore();

  // Gas config from backend
  const [gasConfig, setGasConfig] = useState<GasConfig | null>(null);

  // CAGE bridge config from parent lib (address + current withdrawal fee bps)
  const [cageConfig, setCageConfig] = useState<CageConfig | null>(null);

  // Per-account VM balances — one withdraw call can only draw from a single
  // account, so validation must run against per-account spendable, not the sum.
  const [vmAccounts, setVmAccounts] = useState<VmAccountBalance | null>(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        tauriCommand<GasConfig>("get_gas_config").then(setGasConfig).catch(() => {}),
        tauriCommand<CageConfig>("get_cage_config").then(setCageConfig).catch(() => {}),
        tauriCommand<VmAccountBalance>("get_vm_account_balance").then(setVmAccounts).catch(() => {}),
      ]);
    }
  }, [isOpen]);

  // Form state
  const [step, setStep] = useState<WithdrawStep>("form");
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
  // re-plan would cover the full amount again and could double-withdraw.
  const [partialTxids, setPartialTxids] = useState<string[] | null>(null);

  // Pre-fill recipient with user's own address when modal opens
  useEffect(() => {
    if (isOpen && defaultRecipient) {
      setRecipient(defaultRecipient);
    }
  }, [isOpen, defaultRecipient]);

  // Reset form when modal closes
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
        setVmAccounts(null);
      }, 200);
    }
  }, [isOpen]);

  // Derived values — parseXtalToShards used for display only, not sent to backend
  const parsedAmountShards = parseXtalToShards(amount);
  const amountShards = toShards(parsedAmountShards ?? "0");
  const amountError = getXtalInputError(amount);
  const feeRateBps = cageConfig?.withdrawFeeBps;
  const cageConfigLoaded = cageConfig !== null && feeRateBps !== undefined;
  const cageFee =
    amountShards > 0n && feeRateBps !== undefined
      ? (amountShards * BigInt(feeRateBps) + 9999n) / 10000n
      : 0n;
  // A withdrawal is a CAGE contract call, so it must meet the contract-call gas
  // floor (minCallGas), not the lower intrinsic transfer floor (defaultGasLimit).
  const minCallGas = gasConfig?.minCallGas ?? 100_000;
  const effectiveGasLimit = parseInt(gasLimit) || minCallGas;
  const effectiveGasPrice = parseInt(gasPrice) || gasConfig?.defaultGasPrice || 1;
  const maxGasFee = effectiveGasLimit * effectiveGasPrice;

  // Each leg draws from a single account and reserves its own gas upfront, so
  // the withdrawable total is the sum of per-account spendable balances — NOT
  // the aggregate VM balance, and gas is never added on top of the amount here.
  const withdrawableNow =
    vmAccounts?.accounts.reduce((sum, account) => {
      const spendable = subShards(account.balance, maxGasFee);
      return spendable >= BigInt(MIN_WITHDRAW_LEG_SHARDS) ? sum + spendable : sum;
    }, 0n) ?? null;
  const hasInsufficientFunds =
    withdrawableNow !== null && amountShards > withdrawableNow && amountShards > 0n;

  // Plan-derived values (available on the confirm step)
  const maxGasFeePerLeg = plan ? Number(plan.maxGasFeePerLeg) : maxGasFee;
  const totalMaxGasFee = plan ? plan.legCount * Number(plan.maxGasFeePerLeg) : maxGasFee;
  const totalDeducted = addShards(amountShards, totalMaxGasFee);
  const uneconomicalLeg = plan?.legs.find((leg) => Number(leg.amount) <= maxGasFeePerLeg);
  const isPartialFailure = partialTxids !== null && partialTxids.length > 0;

  // Exact CAGE fee that will be charged: the sum of per-leg fees, each computed
  // like the contract's calculate_fee — floor(amount * bps / 10000) with a
  // 1-shard floor per non-zero leg. Because each leg rounds (and floors)
  // independently, this can exceed a single bps calc on the total by a few
  // shards; showing the real sum keeps the confirm step honest. BigInt avoids
  // precision loss on large balances (amount * bps overflows JS safe integers
  // above ~9000 XTAL). Null before a plan exists — the form step falls back to
  // the single-total estimate.
  const planFeeShards =
    plan && feeRateBps !== undefined
      ? plan.legs.reduce((sum, leg) => {
          const legAmount = BigInt(leg.amount);
          if (legAmount <= 0n) return sum;
          const fee = (legAmount * BigInt(feeRateBps)) / 10000n;
          return sum + (fee === 0n ? 1n : fee);
        }, 0n)
      : null;
  const cageFeeDisplay = planFeeShards !== null ? planFeeShards : cageFee;
  const netAmountRaw = amountShards - cageFeeDisplay;
  const netAmountDisplay = netAmountRaw > 0n ? netAmountRaw : 0n;

  // Withdrawals only support UTXO/Base58 recipients.
  const parsedAddress = parseAddressInput(recipient);
  const isBase58Recipient = parsedAddress?.format === "base58";
  const recipientDisplay = recipient.trim();

  const hasGasError =
    (gasLimit !== "" && gasConfig && parseInt(gasLimit) < minCallGas) ||
    (gasLimit !== "" && gasConfig && parseInt(gasLimit) > gasConfig.maxGasLimit) ||
    (gasPrice !== "" && gasConfig && parseInt(gasPrice) < gasConfig.minGasPrice);

  const canProceed =
    recipient.length > 0 &&
    isBase58Recipient &&
    amountShards > 0 &&
    !amountError &&
    !hasInsufficientFunds &&
    !hasGasError;

  const handleContinue = async () => {
    if (parsedAmountShards === null || toShards(parsedAmountShards) <= 0n) {
      setError(amountError || "Please enter a valid amount");
      return;
    }
    if (!isBase58Recipient) {
      setError("Please enter a valid Base58Check UTXO address");
      return;
    }
    if (!cageConfig?.address) {
      setError("CAGE contract not yet loaded. Please wait a moment and try again.");
      return;
    }

    setPlanLoading(true);
    setError(null);

    try {
      // Read-only planning — splits the withdrawal into one CAGE withdraw call
      // per funded account. Amount is passed as a shards string so the Rust
      // backend parses it without JS float precision loss.
      const result = await tauriCommand<SweepPlan>("plan_withdrawal", {
        recipient: recipient.trim(),
        amount: String(parsedAmountShards),
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
      });

      setPlan(result);
      setStep("confirm");
    } catch (err) {
      console.error("Withdrawal planning failed:", err);
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

  const handleWithdraw = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }
    if (parsedAmountShards === null || toShards(parsedAmountShards) <= 0n) {
      setError(amountError || "Please enter a valid amount");
      return;
    }
    if (!isBase58Recipient) {
      setError("Please enter a valid Base58Check UTXO address");
      return;
    }

    setStep("sending");
    setError(null);
    setPartialTxids(null);

    try {
      // Backend-driven sweep — plans and submits one CAGE withdraw call per
      // funded account. Amount is passed as a shards string so the Rust
      // backend parses it without JS float precision loss.
      const result = await tauriCommand<SweepSubmitResult>("withdraw_to_utxo", {
        recipient: recipient.trim(),
        amount: String(parsedAmountShards),
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
        password,
      });

      setSweepResult(result);
      setStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "Withdrawal Submitted",
        message:
          result.legs.length > 1
            ? `Withdrawal submitted in ${result.legs.length} transactions`
            : `Withdrawal ${result.legs[0]?.txid.slice(0, 8)}... submitted`,
        duration: 5000,
      });

      triggerRefresh();
    } catch (err) {
      console.error("Withdraw failed:", err);
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

  const handleUseMyAddress = () => {
    if (defaultRecipient) {
      setRecipient(defaultRecipient);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      className="bg-black/60 backdrop-blur-sm"
      cardClassName="max-w-lg relative"
      onClose={onClose}
      title="Withdraw"
    >
        {/* Decorative crystal facet overlay — accent (VM source) to primary (UTXO destination) */}
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
                className="icon-hex bg-primary/20"
                style={{ width: "2.5rem", height: "2.5rem" }}
              >
                <ArrowDownToLine className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {step === "success" ? "WITHDRAWAL SENT" : "WITHDRAW TO UTXO"}
                </CardTitle>
                <CardDescription>
                  {step === "form" && "Withdraw XTAL from VM to a UTXO address"}
                  {step === "confirm" && "Review withdrawal details"}
                  {step === "sending" && "Broadcasting withdrawal..."}
                  {step === "success" && "Your withdrawal is on its way"}
                  {step === "error" &&
                    (isPartialFailure ? "Withdrawal partially submitted" : "Withdrawal failed")}
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
                <div className="flex items-center justify-between">
                  <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                    RECIPIENT ADDRESS
                  </label>
                  {defaultRecipient && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:text-primary/80 font-heading flex items-center gap-1"
                      onClick={handleUseMyAddress}
                    >
                      <Wallet className="h-3 w-3" />
                      My address
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Enter UTXO address"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className={cn(
                    "font-mono text-sm",
                    recipient && !isBase58Recipient && "border-destructive"
                  )}
                  autoComplete="off"
                  spellCheck={false}
                />
                {recipient && !isBase58Recipient && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Enter a valid Base58Check UTXO address
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
                      // Per-account spendable already excludes the per-leg gas
                      // reservation; fall back to the aggregate while loading.
                      const fallback = subShards(maxBalance, maxGasFee);
                      const maxShards = withdrawableNow ?? (fallback > 0n ? fallback : 0n);
                      setAmount(formatDecimalInput(Number(maxShards) / SHARDS_PER_XTAL));
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
                  <span>{withdrawableNow !== null ? "Withdrawable now:" : "VM Balance:"}</span>
                  <AmountDisplay amount={withdrawableNow ?? maxBalance} size="sm" showSymbol />
                </div>
                {cageFee > 0 && cageConfigLoaded && (
                  <div className="flex items-center justify-between text-xs text-foreground-muted">
                    <span>{(feeRateBps! / 100).toFixed(1)}% CAGE fee:</span>
                    <AmountDisplay amount={cageFee} size="sm" showSymbol />
                  </div>
                )}
              </div>

              {/* Gas settings */}
              {gasConfig && (
                <GasSettings
                  gasLimit={gasLimit}
                  gasPrice={gasPrice}
                  onGasLimitChange={setGasLimit}
                  onGasPriceChange={setGasPrice}
                  config={gasConfig}
                  minGasLimit={minCallGas}
                />
              )}

              {/* Insufficient funds warning */}
              {hasInsufficientFunds && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 chamfered-sm bg-destructive/10">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Amount exceeds withdrawable VM balance
                    {maxGasFee > 0 &&
                      ` (${maxGasFee.toLocaleString()} shard gas is reserved per transaction)`}
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
                  <span className="text-sm text-foreground-muted font-heading">WITHDRAWAL</span>
                  <AmountDisplay amount={amountShards} size="sm" showSymbol />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">CAGE FEE ({cageConfigLoaded ? `${(feeRateBps! / 100).toFixed(1)}` : "—"}%)</span>
                  <AmountDisplay amount={cageFeeDisplay} size="sm" showSymbol negative />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">NET AMOUNT</span>
                  <AmountDisplay amount={netAmountDisplay} size="sm" showSymbol />
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
                      <AmountDisplay amount={Number(leg.amount)} size="sm" showSymbol />
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
                  <span className="text-sm font-heading font-medium">TOTAL DEDUCTED (MAX)</span>
                  <AmountDisplay
                    amount={totalDeducted}
                    size="sm"
                    showSymbol
                    className="font-medium"
                  />
                </div>
              </div>

              {/* Uneconomical leg warning — non-blocking, user's choice */}
              {uneconomicalLeg && (
                <div className="flex items-start gap-2 p-3 chamfered-sm bg-warning/10 text-warning">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    One of the {plan.legCount} transactions moves less value than its maximum gas
                    cost ({Number(uneconomicalLeg.amount).toLocaleString()} vs{" "}
                    {maxGasFeePerLeg.toLocaleString()} shards). You can proceed, but consider
                    leaving small balances unswept.
                  </p>
                </div>
              )}

              {plan.legCount > 1 && (
                <p className="text-xs text-foreground-muted">
                  Splitting across {plan.legCount} transactions does not materially change the CAGE
                  fee (charged proportionally per transaction), but each transaction reserves its
                  own gas.
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
                    placeholder="Enter password to sign withdrawal"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && password && handleWithdraw()}
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

              {cageConfigLoaded && (
                <div className="flex items-start gap-2 p-3 chamfered-sm bg-warning/10 text-warning">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    CAGE charges a {(feeRateBps! / 100).toFixed(1)}% bridging fee. The net amount will arrive as a spendable UTXO after maturation.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  variant="crystalline"
                  className="flex-1 text-foreground"
                  onClick={handleWithdraw}
                  disabled={!password}
                >
                  <ArrowDownToLine className="h-4 w-4 mr-2" />
                  Withdraw
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
              <p className="text-foreground-secondary font-heading">Broadcasting withdrawal...</p>
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
                    className="text-xs text-primary hover:text-primary/80 font-heading"
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
              re-plan the full amount and could double-withdraw. No Try Again. */}
          {step === "error" && isPartialFailure && partialTxids && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-warning/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <AlertCircle className="h-8 w-8 text-warning" />
              </div>
              <div>
                <p className="text-warning font-medium mb-2">Withdrawal Partially Submitted</p>
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
                    className="text-xs text-primary hover:text-primary/80 font-heading"
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
                  transaction history, then start a new withdrawal for the remainder.
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
                <p className="text-destructive font-medium mb-2">Withdrawal Failed</p>
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
