import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Copy,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";
import { tauriCommand } from "@/hooks";
import { useUiStore } from "@/stores";
import type { MultisigAddressResult } from "@/types";

interface MultisigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddressCreated: () => void;
}

const MIN_KEYS = 2;
const MAX_KEYS = 21;
const DEFAULT_KEYS = ["", "", ""];
const PUBLIC_KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

export function MultisigModal({ isOpen, onClose, onAddressCreated }: MultisigModalProps) {
  const { addToast } = useUiStore();

  const [label, setLabel] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [publicKeys, setPublicKeys] = useState<string[]>(DEFAULT_KEYS);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MultisigAddressResult | null>(null);
  const [copiedField, setCopiedField] = useState<"address" | "redeemScript" | null>(null);

  const normalizedKeys = useMemo(
    () => publicKeys.map((key) => key.trim().toLowerCase()).filter(Boolean),
    [publicKeys]
  );
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const key of normalizedKeys) {
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    return duplicates;
  }, [normalizedKeys]);

  const formError = useMemo(() => {
    if (publicKeys.length < MIN_KEYS || publicKeys.length > MAX_KEYS) {
      return `Signer count must be between ${MIN_KEYS} and ${MAX_KEYS}`;
    }
    if (threshold < 1 || threshold > publicKeys.length) {
      return "Threshold must be between 1 and the number of signers";
    }
    if (normalizedKeys.length !== publicKeys.length) {
      return "Enter a public key for each signer";
    }
    if (publicKeys.some((key) => key.trim() && !PUBLIC_KEY_HEX_RE.test(key.trim()))) {
      return "Public keys must be 32-byte hex strings";
    }
    if (duplicateKeys.size > 0) return "Duplicate public keys are not allowed";
    return null;
  }, [duplicateKeys, normalizedKeys.length, publicKeys, threshold]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setLabel("");
        setThreshold(2);
        setPublicKeys(DEFAULT_KEYS);
        setIsCreating(false);
        setError(null);
        setResult(null);
        setCopiedField(null);
      }, 200);
    }
  }, [isOpen]);

  useEffect(() => {
    if (threshold > publicKeys.length) {
      setThreshold(publicKeys.length);
    }
  }, [publicKeys.length, threshold]);

  const updatePublicKey = (index: number, value: string) => {
    setPublicKeys((keys) => keys.map((key, i) => (i === index ? value : key)));
    setError(null);
  };

  const addPublicKey = () => {
    setSignerCount(publicKeys.length + 1);
  };

  const removePublicKey = (index: number) => {
    setPublicKeys((keys) => keys.filter((_, i) => i !== index));
  };

  const setSignerCount = (count: number) => {
    const nextCount = Math.min(MAX_KEYS, Math.max(MIN_KEYS, Number.isFinite(count) ? count : MIN_KEYS));
    setPublicKeys((keys) => {
      if (keys.length === nextCount) return keys;
      if (keys.length > nextCount) return keys.slice(0, nextCount);
      return [...keys, ...Array.from({ length: nextCount - keys.length }, () => "")];
    });
    setThreshold((value) => Math.min(Math.max(1, value), nextCount));
    setError(null);
  };

  const copyValue = async (field: "address" | "redeemScript", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      addToast({
        type: "success",
        title: "Copied",
        message: field === "address" ? "Address copied to clipboard" : "Redeem script copied",
        duration: 2000,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCreate = async () => {
    if (formError) {
      setError(formError);
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const created = await tauriCommand<MultisigAddressResult>("create_multisig_address", {
        threshold,
        publicKeys: normalizedKeys,
        label: label.trim() || null,
        save: true,
      });
      setResult(created);
      onAddressCreated();
      addToast({
        type: "success",
        title: "Multisig Address Created",
        message: `${created.threshold}-of-${created.publicKeys.length} address saved`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to create multisig address:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      className="bg-black/60 backdrop-blur-sm"
      cardClassName="max-w-xl relative"
      onClose={isCreating ? undefined : onClose}
      title="Create multisig address"
    >
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 left-0 w-44 h-44 bg-gradient-to-br from-primary/50 to-transparent"
            style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
        </div>

        <CardHeader className="relative">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="icon-hex bg-primary/20" style={{ width: "2.5rem", height: "2.5rem" }}>
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="font-heading tracking-wide">CREATE MULTISIG</CardTitle>
                <CardDescription>
                  {result ? `${result.threshold}-of-${result.publicKeys.length} P2SH address` : "P2SH multisig address"}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isCreating}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-success text-sm font-heading">
                <CheckCircle className="h-4 w-4" />
                Address saved
              </div>

              <div className="space-y-2">
                <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                  ADDRESS
                </label>
                <CopyRow
                  value={result.address}
                  copied={copiedField === "address"}
                  onCopy={() => copyValue("address", result.address)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                  REDEEM SCRIPT
                </label>
                <CopyRow
                  value={result.redeemScript}
                  copied={copiedField === "redeemScript"}
                  onCopy={() => copyValue("redeemScript", result.redeemScript)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" shape="chamfered">
                  {result.threshold}-of-{result.publicKeys.length}
                </Badge>
                <Badge variant="success" shape="chamfered" diamond>
                  Saved
                </Badge>
                {result.label && (
                  <Badge variant="secondary" shape="chamfered">
                    {result.label}
                  </Badge>
                )}
              </div>

              <Button variant="crystalline" className="w-full text-foreground" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_12rem] gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                    LABEL
                  </label>
                  <Input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Treasury"
                    maxLength={48}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                    SIGNERS
                  </label>
                  <NumberStepper
                    value={publicKeys.length}
                    min={MIN_KEYS}
                    max={MAX_KEYS}
                    onChange={setSignerCount}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                    THRESHOLD
                  </label>
                  <NumberStepper
                    value={threshold}
                    min={1}
                    max={publicKeys.length}
                    onChange={setThreshold}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                    PUBLIC KEYS
                  </label>
                  <Badge variant="outline" shape="chamfered" className="text-[10px]">
                    {threshold}-of-{publicKeys.length}
                  </Badge>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {publicKeys.map((key, index) => {
                    const normalized = key.trim().toLowerCase();
                    const keyError =
                      (normalized && !PUBLIC_KEY_HEX_RE.test(normalized)) ||
                      duplicateKeys.has(normalized);

                    return (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={key}
                          onChange={(event) => updatePublicKey(index, event.target.value)}
                          placeholder={`Participant ${index + 1} public key`}
                          error={Boolean(keyError)}
                          className="font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePublicKey(index)}
                          disabled={publicKeys.length <= MIN_KEYS}
                          title="Remove public key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline-crystalline"
                  className="w-full text-foreground"
                  onClick={addPublicKey}
                  disabled={publicKeys.length >= MAX_KEYS}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Signer
                </Button>
              </div>

              <Button
                variant="crystalline"
                className="w-full text-foreground"
                onClick={handleCreate}
                disabled={isCreating || Boolean(formError)}
              >
                {isCreating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Create Multisig Address
              </Button>
            </div>
          )}
        </CardContent>
    </ModalShell>
  );
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const setClamped = (next: number) => {
    if (!Number.isFinite(next)) {
      onChange(min);
      return;
    }
    onChange(Math.min(max, Math.max(min, Math.trunc(next))));
  };

  return (
    <div className="grid grid-cols-[2.5rem_1fr_2.5rem] gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10"
        onClick={() => setClamped(value - 1)}
        disabled={value <= min}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => setClamped(Number(event.target.value))}
        className="px-2 text-center font-mono"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-10 w-10"
        onClick={() => setClamped(value + 1)}
        disabled={value >= max}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CopyRow({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div
      className="group relative p-3 pr-11 chamfered-sm bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
      onClick={onCopy}
    >
      <code className={cn("block text-xs font-mono break-all text-foreground-secondary group-hover:text-foreground")}>
        {value}
      </code>
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {copied ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Copy className="h-4 w-4 text-foreground-muted" />
        )}
      </div>
    </div>
  );
}
