import { useState, useEffect, useRef } from "react";
import {
  Upload,
  X,
  ArrowRight,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle,
  FileCode,
} from "lucide-react";

import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { GasSettings, type GasConfig } from "@/components/common/GasSettings";
import { cn } from "@/lib/utils";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useUiStore, useGatewayStore } from "@/stores";
import type { DeployResult } from "@/types/contract";
import { getFruitColor } from "@/lib/fruitColors";

interface DeployContractModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DeployStep = "upload" | "confirm" | "deploying" | "success" | "error";

const FRUIT_TYPES = ["Apple", "Orange", "Pear", "Grape", "Peach", "Pineapple", "Strawberry", "Kiwi", "Watermelon"];

export function DeployContractModal({ isOpen, onClose }: DeployContractModalProps) {
  const { addToast } = useUiStore();
  const { loadLibrary } = useGatewayStore();

  const [step, setStep] = useState<DeployStep>("upload");
  const [wasmHex, setWasmHex] = useState("");
  const [wasmFileName, setWasmFileName] = useState<string | null>(null);
  const [abiJson, setAbiJson] = useState("");
  const [abiFileName, setAbiFileName] = useState<string | null>(null);
  const [fruitType, setFruitType] = useState("Apple");
  const [gasLimit, setGasLimit] = useState("");
  const [gasPrice, setGasPrice] = useState("");
  const [gasConfig, setGasConfig] = useState<GasConfig | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  const wasmInputRef = useRef<HTMLInputElement>(null);
  const abiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tauriCommand<GasConfig>("get_gas_config").then(setGasConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep("upload");
        setWasmHex("");
        setWasmFileName(null);
        setAbiJson("");
        setAbiFileName(null);
        setFruitType("Apple");
        setGasLimit("");
        setGasPrice("");
        setPassword("");
        setShowPassword(false);
        setError(null);
        setDeployResult(null);
      }, 200);
    }
  }, [isOpen]);

  const handleWasmFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWasmFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const arr = new Uint8Array(reader.result as ArrayBuffer);
      setWasmHex(Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(""));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAbiFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAbiFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setAbiJson(reader.result as string);
    };
    reader.readAsText(file);
  };

  const handleDeploy = async () => {
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setStep("deploying");
    setError(null);

    try {
      const effectiveGasLimit = parseInt(gasLimit) || gasConfig?.defaultGasLimit || 500_000;
      const effectiveGasPrice = parseInt(gasPrice) || gasConfig?.defaultGasPrice || 1;

      const result = await tauriCommand<DeployResult>("deploy_contract", {
        wasmHex,
        abiJson: abiJson || undefined,
        gasLimit: effectiveGasLimit,
        gasPrice: effectiveGasPrice,
        fruitType,
        password,
      });

      setDeployResult(result);
      setStep("success");
      setPassword("");

      addToast({
        type: "success",
        title: "Contract Deployed",
        message: `Address: ${result.contractAddress.slice(0, 14)}...`,
        duration: 6000,
      });

      loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
      setPassword("");
    }
  };

  const handleClose = () => {
    if (step === "deploying") return;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      className="bg-black/60 backdrop-blur-sm"
      cardClassName="max-w-lg relative"
      onClose={onClose}
      title="Deploy contract"
    >
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent/50 to-transparent"
            style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
          />
        </div>

        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-hex bg-accent/20" style={{ width: "2.5rem", height: "2.5rem" }}>
                <Upload className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {step === "success" ? "CONTRACT DEPLOYED" : "DEPLOY CONTRACT"}
                </CardTitle>
                <CardDescription>
                  {step === "upload" && "Upload WASM bytecode and optional ABI"}
                  {step === "confirm" && "Review deployment details"}
                  {step === "deploying" && "Broadcasting deployment..."}
                  {step === "success" && "Your contract is deployed"}
                  {step === "error" && "Deployment failed"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} disabled={step === "deploying"}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          {/* Upload step */}
          {step === "upload" && (
            <>
              {/* WASM file */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  WASM BYTECODE
                </label>
                <input
                  ref={wasmInputRef}
                  type="file"
                  accept=".wasm"
                  onChange={handleWasmFile}
                  className="hidden"
                />
                <button
                  onClick={() => wasmInputRef.current?.click()}
                  className={cn(
                    "w-full p-4 chamfered-sm border-2 border-dashed text-center transition-colors",
                    wasmHex
                      ? "border-success/50 bg-success/5"
                      : "border-border hover:border-accent/50"
                  )}
                >
                  <FileCode className={cn("h-6 w-6 mx-auto mb-2", wasmHex ? "text-success" : "text-foreground-muted")} />
                  {wasmFileName ? (
                    <div>
                      <p className="text-sm font-medium">{wasmFileName}</p>
                      <p className="text-xs text-foreground-muted">{(wasmHex.length / 2).toLocaleString()} bytes</p>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-muted">Click to select .wasm file</p>
                  )}
                </button>
              </div>

              {/* ABI file (optional) */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  ABI JSON <span className="text-foreground-muted font-normal">(optional)</span>
                </label>
                <input
                  ref={abiInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleAbiFile}
                  className="hidden"
                />
                <button
                  onClick={() => abiInputRef.current?.click()}
                  className={cn(
                    "w-full p-3 chamfered-sm border border-dashed text-center transition-colors",
                    abiJson
                      ? "border-success/50 bg-success/5"
                      : "border-border hover:border-accent/50"
                  )}
                >
                  {abiFileName ? (
                    <p className="text-sm"><span className="text-success">Loaded:</span> {abiFileName}</p>
                  ) : (
                    <p className="text-xs text-foreground-muted">Click to select .abi.json file</p>
                  )}
                </button>
              </div>

              {/* Fruit type */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  FRUIT SHARD
                </label>
                <div className="flex flex-wrap gap-2">
                  {FRUIT_TYPES.map((ft) => {
                    const colors = getFruitColor(ft);
                    const isSelected = fruitType === ft;
                    return (
                      <button
                        key={ft}
                        onClick={() => setFruitType(ft)}
                        className={cn(
                          "px-3 py-1.5 chamfered-sm text-xs font-heading tracking-wide transition-all duration-300",
                          "bg-gradient-to-br border",
                          colors.bg,
                          colors.border,
                          isSelected
                            ? cn(colors.glow, "shadow-lg", "text-foreground")
                            : "opacity-70 text-foreground-muted hover:opacity-100"
                        )}
                      >
                        {ft}
                      </button>
                    );
                  })}
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

              <Button
                variant="default"
                className="w-full"
                disabled={!wasmHex}
                onClick={() => setStep("confirm")}
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {/* Confirm step */}
          {step === "confirm" && (
            <>
              <div className="space-y-3 p-4 chamfered bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">BYTECODE</span>
                  <span className="text-sm font-mono">{(wasmHex.length / 2).toLocaleString()} bytes</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">ABI</span>
                  <span className="text-sm font-mono">{abiJson ? "Included" : "None"}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-muted font-heading">SHARD</span>
                  <span className="text-sm font-mono">{fruitType}</span>
                </div>
              </div>

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
                    onKeyDown={(e) => e.key === "Enter" && password && handleDeploy()}
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
                <Button variant="outline" className="flex-1" onClick={() => setStep("upload")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button variant="default" className="flex-1" onClick={handleDeploy} disabled={!password}>
                  <Upload className="h-4 w-4" />
                  Deploy
                </Button>
              </div>
            </>
          )}

          {/* Deploying */}
          {step === "deploying" && (
            <div className="py-8 text-center">
              <div className="icon-hex mx-auto mb-4 bg-accent/20 animate-pulse" style={{ width: "4rem", height: "4rem" }}>
                <Loader2 className="h-8 w-8 text-accent animate-spin" />
              </div>
              <p className="text-foreground-secondary font-heading">Deploying contract...</p>
            </div>
          )}

          {/* Success */}
          {step === "success" && deployResult && (
            <div className="py-4 text-center space-y-4">
              <div className="icon-hex mx-auto mb-4 bg-success/20" style={{ width: "4rem", height: "4rem" }}>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-foreground-secondary text-sm mb-1">Contract Address</p>
                  <p className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all">
                    {deployResult.contractAddress}
                  </p>
                </div>
                <div>
                  <p className="text-foreground-secondary text-sm mb-1">Transaction ID</p>
                  <p className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all">
                    {deployResult.txid}
                  </p>
                </div>
                {deployResult.abiCid && (
                  <div>
                    <p className="text-foreground-secondary text-sm mb-1">ABI CID (IPFS)</p>
                    <p className="font-mono text-xs bg-muted/50 p-2 chamfered-sm break-all">
                      {deployResult.abiCid}
                    </p>
                  </div>
                )}
              </div>
              <Button variant="default" className="w-full" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="py-4 text-center space-y-4">
              <div className="icon-hex mx-auto mb-4 bg-destructive/20" style={{ width: "4rem", height: "4rem" }}>
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <p className="text-destructive font-medium mb-2">Deployment Failed</p>
                <p className="text-sm text-foreground-muted">{error}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button variant="default" className="flex-1" onClick={() => setStep("confirm")}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
    </ModalShell>
  );
}
