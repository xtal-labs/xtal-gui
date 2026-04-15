import { useState, useEffect, useRef } from "react";
import {
  Download,
  X,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useUiStore, useGatewayStore } from "@/stores";

interface ImportAbiModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillAddress?: string;
}

export function ImportAbiModal({ isOpen, onClose, prefillAddress }: ImportAbiModalProps) {
  const { addToast } = useUiStore();
  const { loadLibrary, selectContract } = useGatewayStore();

  const [address, setAddress] = useState(prefillAddress || "");
  const [abiJson, setAbiJson] = useState("");
  const [abiFileName, setAbiFileName] = useState<string | null>(null);
  const [fruitType, setFruitType] = useState("Apple");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setAddress(prefillAddress || "");
        setAbiJson("");
        setAbiFileName(null);
        setFruitType("Apple");
        setError(null);
        setIsSubmitting(false);
        setSuccess(false);
      }, 200);
    }
  }, [isOpen, prefillAddress]);

  const handleAbiFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAbiFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setAbiJson(reader.result as string);
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (!address.trim() || !abiJson.trim()) {
      setError("Address and ABI JSON are required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const addr = address.trim().replace(/^0x/, "");

      await tauriCommand("import_contract_abi", {
        contractAddress: addr,
        abiJson,
        fruitType,
      });

      setSuccess(true);

      addToast({
        type: "success",
        title: "ABI Imported",
        message: "Contract ABI saved to library",
        duration: 3000,
      });

      loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    if (success && address.trim()) {
      selectContract(address.trim().replace(/^0x/, ""));
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <Card variant="crystalline" className="w-full max-w-lg mx-4 relative overflow-hidden">
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
                <Download className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">
                  {success ? "ABI IMPORTED" : "IMPORT ABI"}
                </CardTitle>
                <CardDescription>
                  {success
                    ? "Contract added to your library"
                    : "Add an ABI for an existing contract"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          {success ? (
            <div className="py-4 text-center space-y-4">
              <div className="icon-hex mx-auto mb-4 bg-success/20" style={{ width: "4rem", height: "4rem" }}>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
              <p className="text-foreground-secondary text-sm">ABI is ready for interaction</p>
              <Button variant="default" className="w-full" onClick={handleDone}>
                Open Contract
              </Button>
            </div>
          ) : (
            <>
              {/* Contract address */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  CONTRACT ADDRESS
                </label>
                <Input
                  placeholder="0x..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              {/* ABI JSON */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  ABI JSON
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleAbiFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
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
                <p className="text-xs text-foreground-muted">or paste JSON below</p>
                <textarea
                  placeholder='{"name": "...", "methods": [...]}'
                  value={abiJson}
                  onChange={(e) => {
                    setAbiJson(e.target.value);
                    setAbiFileName(null);
                  }}
                  className={cn(
                    "flex w-full chamfered-sm border bg-input px-4 py-2",
                    "text-sm font-mono placeholder:text-foreground-muted",
                    "transition-all duration-200 min-h-[6rem] resize-y",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "border-border hover:border-border-hover"
                  )}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Fruit type */}
              <div className="space-y-2">
                <label className="text-sm font-heading tracking-wide text-foreground-secondary">
                  FRUIT SHARD
                </label>
                <Input
                  value={fruitType}
                  onChange={(e) => setFruitType(e.target.value)}
                  placeholder="Apple"
                  className="font-mono text-sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={!address.trim() || !abiJson.trim() || isSubmitting}
                  isLoading={isSubmitting}
                >
                  <Download className="h-4 w-4" />
                  Import
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
