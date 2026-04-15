import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle,
  RefreshCw,
  Inbox,
  Coins,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatXtal } from "@/lib/utils";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useUiStore, useWalletStore, useBlockchainStore } from "@/stores";
import type { AbiMethod, WalletUtxo, DepositUtxoResult } from "@/types/contract";

interface UtxoDepositFormProps {
  method: AbiMethod;
  contractAddress: string; // CAGE address — deposit_utxo targets it server-side
}

type Step = "loading" | "select" | "confirm" | "sending" | "success" | "error";

export function UtxoDepositForm({ method, contractAddress: _contractAddress }: UtxoDepositFormProps) {
  const { addToast } = useUiStore();
  const { isLoaded: walletLoaded } = useWalletStore();
  const { latestStemHash } = useBlockchainStore();

  const [step, setStep] = useState<Step>("loading");
  const [utxos, setUtxos] = useState<WalletUtxo[]>([]);
  const [selected, setSelected] = useState<WalletUtxo | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositUtxoResult | null>(null);

  // Fetch UTXOs on mount
  useEffect(() => {
    fetchUtxos();
  }, []);

  async function fetchUtxos() {
    setStep("loading");
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
      // CAGE deposits are sponsored — gas is paid by the validator, not the user
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
        message: `${formatXtal(res.amount)} XTAL deposited — ${res.txid.slice(0, 12)}...`,
        duration: 5000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
      setPassword("");
    }
  }

  const eligible = utxos.filter((u) => u.isEligible);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h3 className="font-heading font-semibold tracking-wide text-base">
          {method.displayName || method.name}
        </h3>
        <p className="text-sm text-foreground-secondary">
          Consume a UTXO and credit its value to your VM account
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-heading tracking-wide px-2 py-0.5 chamfered-sm bg-info/15 text-info">
            WRITE
          </span>
          {latestStemHash && (
            <span className="text-xs font-mono text-foreground-muted" title="Anchor stem hash">
              stem {latestStemHash.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      <div className="divider-angular" />

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
              <label className="text-xs font-heading tracking-wide text-foreground-muted">
                SELECT UTXO TO DEPOSIT
              </label>
              <div className="space-y-1 max-h-64 overflow-y-auto">
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
                            ? "bg-primary/15 border border-primary/40"
                            : "bg-muted/20 hover:bg-muted/40 border border-transparent"
                          : "bg-muted/10 opacity-50 cursor-not-allowed border border-transparent"
                      )}
                    >
                      <Coins className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "text-primary" : "text-foreground-muted"
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
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchUtxos} title="Refresh UTXOs">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {eligible.length > 0 && (
              <Button
                variant="default"
                className="flex-1"
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
              <span className="text-sm font-mono">{formatXtal(selected.amount)} XTAL</span>
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
              <span className="text-sm text-foreground-muted font-heading">ADDRESS</span>
              <span className="text-xs font-mono text-right break-all max-w-[60%]">
                {selected.address}
              </span>
            </div>
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
                placeholder="Enter password to sign"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && handleDeposit()}
                autoComplete="current-password"
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
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setStep("select"); setPassword(""); setError(null); }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={handleDeposit}
              disabled={!password}
            >
              Deposit
            </Button>
          </div>
        </>
      )}

      {/* Sending */}
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

      {/* Success */}
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
            <p className="font-mono text-lg font-semibold">{formatXtal(result.amount)} XTAL</p>
          </div>
          <div>
            <p className="text-foreground-secondary text-sm mb-2">Transaction ID</p>
            <p
              className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all cursor-pointer hover:bg-muted/70 transition-colors"
              onClick={async () => {
                await navigator.clipboard.writeText(result.txid);
                addToast({ type: "success", title: "Copied", duration: 2000 });
              }}
              title="Click to copy"
            >
              {result.txid}
            </p>
          </div>
          <Button variant="default" className="w-full" onClick={() => {
            setSelected(null);
            setResult(null);
            fetchUtxos();
          }}>
            Done
          </Button>
        </div>
      )}

      {/* Error */}
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
            <Button variant="outline" className="flex-1" onClick={() => {
              setError(null);
              fetchUtxos();
            }}>
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
