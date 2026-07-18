import { useState, useEffect } from "react";
import {
  Search,
  Send,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GasSettings, type GasConfig } from "@/components/common/GasSettings";
import { ParamInput } from "./ParamInput";
import { ResultDisplay } from "./ResultDisplay";
import { cn, getXtalInputError, isValidXtalInput, parseXtalToShards } from "@/lib/utils";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useUiStore, useGatewayStore, useWalletStore } from "@/stores";
import type { AbiMethod, QueryResult } from "@/types/contract";

interface MethodFormProps {
  method: AbiMethod;
  contractAddress: string;
}

type CallStep = "form" | "confirm" | "sending" | "success" | "error";

interface SendResult {
  txid: string;
  fee: number;
}

export function MethodForm({ method, contractAddress }: MethodFormProps) {
  const { addToast } = useUiStore();
  const { queryResult, setQueryResult } = useGatewayStore();
  const { isLoaded: walletLoaded } = useWalletStore();

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [valueAmount, setValueAmount] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [callStep, setCallStep] = useState<CallStep>("form");
  const [callError, setCallError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<SendResult | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gasLimit, setGasLimit] = useState("");
  const [gasPrice, setGasPrice] = useState("");
  const [gasConfig, setGasConfig] = useState<GasConfig | null>(null);

  useEffect(() => {
    tauriCommand<GasConfig>("get_gas_config").then(setGasConfig).catch(() => {});
  }, []);

  const valueAmountShards = parseXtalToShards(valueAmount);
  const valueAmountError = getXtalInputError(valueAmount);

  // The backend parses this with parse_xtal_to_shards, so it must be the XTAL
  // decimal the user typed — NOT valueAmountShards, which is already converted
  // and would be scaled by 1e9 a second time. valueAmountShards stays for
  // validation only. Trimmed because the Rust parser does not trim.
  const payableValueXtal =
    method.mutability === "payable" && valueAmount ? valueAmount.trim() : undefined;

  // Reset form state when method changes
  useEffect(() => {
    setParamValues({});
    setValueAmount("");
    setQueryResult(null);
    setCallStep("form");
    setCallError(null);
    setTxResult(null);
    setPassword("");
    setShowPassword(false);
  }, [method.name, setQueryResult]);

  const setParam = (name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  // Encode calldata using the Rust backend's SDK-delegated encoder
  const encodeCallData = async (): Promise<string> => {
    if (method.params.length === 0) {
      return "";
    }

    // For raw encoding with a single bytes param, pass through as-is
    if (method.encoding === "raw" && method.params.length === 1 && method.params[0].type === "bytes") {
      return (paramValues[method.params[0].name] || "").replace(/^0x/, "");
    }

    const params = method.params.map((param) => ({
      name: param.name,
      type: param.type,
      value: paramValues[param.name] || "",
    }));

    const result = await tauriCommand<{ data: string; param_results: typeof params }>(
      "encode_contract_calldata",
      {
        contractAddress,
        methodName: method.name,
        params,
      },
    );

    return result.data;
  };

  const handleQuery = async () => {
    setIsQuerying(true);
    setQueryResult(null);

    try {
      let data: string | undefined;

      if (method.params.length > 0) {
        data = await encodeCallData();
      } else {
        data = "";
      }

      const result = await tauriCommand<QueryResult>("query_contract", {
        contractAddress,
        method: method.name,
        data,
        value: payableValueXtal,
        gasLimit: gasLimit ? parseInt(gasLimit) : undefined,
      });

      setQueryResult(result);
    } catch (err) {
      setQueryResult({
        success: false,
        returnData: "",
        gasUsed: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
        logs: [],
      });
    } finally {
      setIsQuerying(false);
    }
  };

  const handleCall = async () => {
    if (!password) {
      setCallError("Please enter your password");
      return;
    }
    if (method.mutability === "payable" && valueAmount && valueAmountShards === null) {
      setCallError(valueAmountError || "Please enter a valid XTAL amount");
      return;
    }

    setCallStep("sending");
    setCallError(null);

    try {
      let data: string | undefined;

      if (method.params.length > 0) {
        data = await encodeCallData();
      } else {
        data = "";
      }

      const effectiveGasLimit = parseInt(gasLimit) || gasConfig?.defaultGasLimit || 100_000;
      const effectiveGasPrice = parseInt(gasPrice) || gasConfig?.defaultGasPrice || 1;

      const result = await tauriCommand<SendResult>("call_contract", {
        contractAddress,
        method: method.name,
        data,
        value: payableValueXtal,
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
        password,
      });

      setTxResult(result);
      setCallStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "Transaction Submitted",
        message: `${method.name} — ${result.txid.slice(0, 12)}...`,
        duration: 5000,
      });
    } catch (err) {
      setCallError(err instanceof Error ? err.message : String(err));
      setCallStep("error");
      setPassword("");
    }
  };

  const isRead = method.mutability === "read";
  const hasInputValues = method.params.length === 0 || Object.values(paramValues).some((v) => v.length > 0);
  const hasValidPayableValue = method.mutability !== "payable" || !valueAmount || !valueAmountError;
  const canQuery = hasInputValues && hasValidPayableValue;
  const canCall = walletLoaded && canQuery;

  return (
    <div className="space-y-4">
      {/* Method header */}
      <div className="space-y-1">
        <h3 className="font-heading font-semibold tracking-wide text-base">
          {method.displayName || method.name}
        </h3>
        {method.description && (
          <p className="text-sm text-foreground-secondary">{method.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className={cn(
              "text-xs font-heading tracking-wide px-2 py-0.5 chamfered-sm",
              method.mutability === "read"
                ? "bg-success/15 text-success"
                : method.mutability === "payable"
                  ? "bg-warning/15 text-warning"
                  : "bg-info/15 text-info"
            )}
          >
            {method.mutability.toUpperCase()}
          </span>
          <span className="text-xs font-mono text-foreground-muted">
            {method.encoding}
          </span>
        </div>
      </div>

      <div className="divider-angular" />

      {/* Form state */}
      {callStep === "form" && (
        <>
          {/* Parameter inputs */}
          {method.params.length > 0 && (
            <div className="space-y-3">
              {method.params.map((param) => (
                <ParamInput
                  key={param.name}
                  param={param}
                  value={paramValues[param.name] || ""}
                  onChange={(val) => setParam(param.name, val)}
                />
              ))}
            </div>
          )}

          {/* Value field for payable methods */}
          {method.mutability === "payable" && (
            <div className="space-y-1">
              <label className="text-xs font-heading tracking-wide text-foreground-muted">
                VALUE (XTAL TO SEND)
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0.00"
                  value={valueAmount}
                  onChange={(e) => {
                    if (isValidXtalInput(e.target.value)) {
                      setValueAmount(e.target.value);
                    }
                  }}
                  className="pr-16 font-mono text-sm"
                  inputMode="decimal"
                  error={!!valueAmountError}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-heading text-foreground-muted">
                  XTAL
                </div>
              </div>
              {valueAmountError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {valueAmountError}
                </p>
              )}
            </div>
          )}

          {/* Gas settings */}
          {!isRead && gasConfig && (
            <GasSettings
              gasLimit={gasLimit}
              gasPrice={gasPrice}
              onGasLimitChange={setGasLimit}
              onGasPriceChange={setGasPrice}
              config={gasConfig}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleQuery}
              disabled={isQuerying || !canQuery}
              isLoading={isQuerying}
            >
              <Search className="h-4 w-4" />
              Query
            </Button>
            {!isRead && (
              <Button
                variant="default"
                className="flex-1"
                disabled={!canCall}
                onClick={() => setCallStep("confirm")}
              >
                <Send className="h-4 w-4" />
                Call
              </Button>
            )}
          </div>

          {/* Query result */}
          {queryResult && (
            <div className="mt-4 p-4 chamfered-sm bg-muted/20 border border-border/50">
              <ResultDisplay
                result={queryResult}
                returnDef={method.returns}
                methodName={method.name}
              />
            </div>
          )}
        </>
      )}

      {/* Confirm step */}
      {callStep === "confirm" && (
        <>
          <div className="space-y-3 p-4 chamfered bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-muted font-heading">METHOD</span>
              <span className="text-sm font-mono">{method.name}</span>
            </div>
            {method.params.map((param) => (
              <div key={param.name}>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm text-foreground-muted font-heading">
                    {(param.label || param.name).toUpperCase()}
                  </span>
                  <span className="text-sm font-mono break-all text-right max-w-[60%]">
                    {paramValues[param.name] || "(empty)"}
                  </span>
                </div>
              </div>
            ))}
            {method.mutability === "payable" && valueAmount && (
              <>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">VALUE</span>
                  <span className="text-sm font-mono">{valueAmount} XTAL</span>
                </div>
              </>
            )}
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
                onKeyDown={(e) => e.key === "Enter" && password && handleCall()}
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

          {callError && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {callError}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setCallStep("form"); setPassword(""); }}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="default" className="flex-1" onClick={handleCall} disabled={!password}>
              <Send className="h-4 w-4" />
              Confirm
            </Button>
          </div>
        </>
      )}

      {/* Sending */}
      {callStep === "sending" && (
        <div className="py-8 text-center">
          <div
            className="icon-hex mx-auto mb-4 bg-accent/20 animate-pulse"
            style={{ width: "4rem", height: "4rem" }}
          >
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
          </div>
          <p className="text-foreground-secondary font-heading">Broadcasting transaction...</p>
        </div>
      )}

      {/* Success */}
      {callStep === "success" && txResult && (
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
              onClick={async () => {
                await navigator.clipboard.writeText(txResult.txid);
                addToast({ type: "success", title: "Copied", duration: 2000 });
              }}
              title="Click to copy"
            >
              {txResult.txid}
            </p>
          </div>
          <Button variant="default" className="w-full" onClick={() => setCallStep("form")}>
            Done
          </Button>
        </div>
      )}

      {/* Error */}
      {callStep === "error" && (
        <div className="py-4 text-center space-y-4">
          <div
            className="icon-hex mx-auto mb-4 bg-destructive/20"
            style={{ width: "4rem", height: "4rem" }}
          >
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <p className="text-destructive font-medium mb-2">Transaction Failed</p>
            <p className="text-sm text-foreground-muted">{callError}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setCallStep("form")}>
              Cancel
            </Button>
            <Button variant="default" className="flex-1" onClick={() => setCallStep("confirm")}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
