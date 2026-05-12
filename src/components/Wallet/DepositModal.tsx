import { useState, useEffect } from "react";
import {
  ArrowUpFromLine,
  X,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Lock,
  Coins,
  Inbox,
  RefreshCw,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountDisplay } from "@/components/common";
import { cn, formatXtal } from "@/lib/utils";
import { tauriCommand } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";
import type { WalletUtxo, DepositUtxoResult } from "@/types/contract";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DepositStep = "loading" | "select" | "confirm" | "sending" | "success" | "error";

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const { addToast } = useUiStore();
  const { isLoaded: walletLoaded, triggerRefresh } = useWalletStore();

  const [step, setStep] = useState<DepositStep>("loading");
  const [utxos, setUtxos] = useState<WalletUtxo[]>([]);
  const [selected, setSelected] = useState<WalletUtxo | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositUtxoResult | null>(null);

  // Fetch UTXOs when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUtxos();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("loading");
        setUtxos([]);
        setSelected(null);
        setPassword("");
        setShowPassword(false);
        setError(null);
        setResult(null);
      }, 200);
    }
  }, [isOpen]);

  async function fetchUtxos() {
    setStep("loading");
    setError(null);
    try {
      const list = await tauriCommand<WalletUtxo[]>("list_unspent_outputs");
      setUtxos(list);
      setStep("select");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  async function handleDeposit() {
    if (!selected || !password) return;

    setStep("sending");
    setError(null);

    try {
      const res = await tauriCommand<DepositUtxoResult>("deposit_utxo", {
        txid: selected.txid,
        vout: selected.vout,
        password,
      });

      setResult(res);
      setStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "Deposit Submitted",
        message: `${formatXtal(res.amount)} XTAL deposited to VM`,
        duration: 5000,
      });

      triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
      setPassword("");
    }
  }

  const handleClose = () => {
    if (step === "sending") return;
    onClose();
  };

  const handleCopyTxid = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.txid);
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

  const eligible = utxos.filter((u) => u.isEligible);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start min-[900px]:items-center justify-center z-50 overflow-y-auto p-3 sm:p-4">
      <Card variant="crystalline" className="w-full max-w-lg relative max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Decorative crystal facet overlay — primary (UTXO source) to accent (VM destination) */}
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
                className="icon-hex bg-accent/20"
                style={{ width: "2.5rem", height: "2.5rem" }}
              >
                <ArrowUpFromLine className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {step === "success" ? "DEPOSIT COMPLETE" : "DEPOSIT TO VM"}
                </CardTitle>
                <CardDescription>
                  {step === "loading" && "Loading available UTXOs..."}
                  {step === "select" && "Select a UTXO to deposit to your VM account"}
                  {step === "confirm" && "Review deposit details"}
                  {step === "sending" && "Signing and broadcasting..."}
                  {step === "success" && "Your deposit has been submitted"}
                  {step === "error" && "Deposit failed"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} disabled={step === "sending"}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Step indicator */}
          {(step === "select" || step === "confirm") && (
            <div className="flex items-center gap-2 mt-4">
              {["select", "confirm"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-6 h-6 flex items-center justify-center text-xs font-heading chamfered-sm",
                      step === s || (step === "confirm" && s === "select")
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
          {/* Loading */}
          {step === "loading" && (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 text-foreground-muted animate-spin mx-auto mb-3" />
              <p className="text-sm text-foreground-muted font-heading">Loading UTXOs...</p>
            </div>
          )}

          {/* Select UTXO */}
          {step === "select" && (
            <>
              {utxos.length === 0 ? (
                <div className="py-8 text-center">
                  <Inbox className="h-8 w-8 text-foreground-muted mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-foreground-secondary font-heading">No UTXOs found</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    Receive XTAL via a standard transaction first
                  </p>
                </div>
              ) : eligible.length === 0 ? (
                <div className="py-6 text-center">
                  <AlertCircle className="h-8 w-8 text-warning mx-auto mb-3 opacity-60" />
                  <p className="text-sm text-foreground-secondary font-heading">No eligible UTXOs</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    Coinbase, withdrawal, and staking UTXOs cannot be deposited
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                    SELECT UTXO
                  </label>
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                    {utxos.map((utxo) => {
                      const isSelected = selected?.txid === utxo.txid && selected?.vout === utxo.vout;
                      return (
                        <button
                          key={`${utxo.txid}:${utxo.vout}`}
                          onClick={() => utxo.isEligible && setSelected(utxo)}
                          disabled={!utxo.isEligible}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 chamfered-sm text-left transition-all",
                            utxo.isEligible
                              ? isSelected
                                ? "bg-accent/15 border border-accent/40"
                                : "bg-muted/20 hover:bg-muted/40 border border-transparent"
                              : "bg-muted/10 opacity-50 cursor-not-allowed border border-transparent"
                          )}
                        >
                          <Coins className={cn(
                            "h-4 w-4 shrink-0",
                            isSelected ? "text-accent" : "text-foreground-muted"
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-medium">
                                {formatXtal(utxo.amount)} XTAL
                              </span>
                              <span className="text-xs text-foreground-muted">
                                {utxo.confirmations} conf
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="font-mono text-xs text-foreground-muted truncate mr-2">
                                {utxo.txid.slice(0, 8)}...{utxo.txid.slice(-8)}:{utxo.vout}
                              </span>
                              {!utxo.isEligible && utxo.ineligibleReason && (
                                <span className="text-xs text-warning shrink-0">
                                  {utxo.ineligibleReason}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Refresh + Continue */}
              <div className="flex gap-3">
                <Button variant="outline" size="icon" onClick={fetchUtxos} title="Refresh UTXOs">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {eligible.length > 0 && (
                  <Button
                    variant="crystalline"
                    className="flex-1 text-foreground"
                    disabled={!selected || !walletLoaded}
                    onClick={() => setStep("confirm")}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Confirm */}
          {step === "confirm" && selected && (
            <>
              <div className="space-y-3 p-4 chamfered bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">AMOUNT</span>
                  <AmountDisplay amount={selected.amount} size="sm" showSymbol />
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">UTXO</span>
                  <span className="text-xs font-mono text-right break-all max-w-[60%]">
                    {selected.txid.slice(0, 16)}...:{selected.vout}
                  </span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">SOURCE</span>
                  <span className="text-xs font-mono text-right break-all max-w-[60%]">
                    {selected.address}
                  </span>
                </div>
              </div>

              {/* Sponsored info banner */}
              <div className="flex items-start gap-2 p-3 chamfered-sm bg-info/10 text-info">
                <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  CAGE deposits are gas-sponsored. No fee will be charged.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" />
                  WALLET PASSWORD
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password to sign deposit"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && password && handleDeposit()}
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

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setStep("select"); setPassword(""); setError(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  variant="crystalline"
                  className="flex-1 text-foreground"
                  onClick={handleDeposit}
                  disabled={!password}
                >
                  <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  Deposit
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
              <p className="text-foreground-secondary font-heading">Signing and broadcasting...</p>
            </div>
          )}

          {/* Success state */}
          {step === "success" && result && (
            <div className="py-4 text-center space-y-4">
              <div
                className="icon-hex mx-auto mb-4 bg-success/20"
                style={{ width: "4rem", height: "4rem" }}
              >
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-foreground-secondary text-sm mb-1">Deposited</p>
                <AmountDisplay amount={result.amount} size="lg" showSymbol />
              </div>
              <div>
                <p className="text-foreground-secondary text-sm mb-2">Transaction ID</p>
                <p
                  className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={handleCopyTxid}
                  title="Click to copy"
                >
                  {result.txid}
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
                <p className="text-destructive font-medium mb-2">Deposit Failed</p>
                <p className="text-sm text-foreground-muted">{error}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="crystalline"
                  className="flex-1 text-foreground"
                  onClick={() => { setError(null); fetchUtxos(); }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
