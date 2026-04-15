import { AlertCircle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, getXtalInputError, isValidXtalInput } from "@/lib/utils";
import { parseAddressInput } from "@/lib/address";
import type { AbiParam } from "@/types/contract";

interface ParamInputProps {
  param: AbiParam;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function validateParam(param: AbiParam, value: string): string | null {
  if (!value) return null;

  switch (param.type) {
    case "utxo_address": {
      if (value.startsWith("0x")) return "UTXO addresses use Base58Check, not hex";
      const parsed = parseAddressInput(value);
      if (!parsed) return "Invalid Base58Check address";
      if (parsed.format !== "base58") return "Expected Base58Check format";
      return null;
    }
    case "vm_address": {
      const hex = value.startsWith("0x") ? value.slice(2) : value;
      if (!/^[a-fA-F0-9]{40}$/.test(hex)) return "Must be 40 hex characters";
      return null;
    }
    case "u8": {
      const n = parseInt(value);
      if (isNaN(n) || n < 0 || n > 255) return "0 - 255";
      return null;
    }
    case "u16": {
      const n = parseInt(value);
      if (isNaN(n) || n < 0 || n > 65535) return "0 - 65,535";
      return null;
    }
    case "u32": {
      const n = parseInt(value);
      if (isNaN(n) || n < 0 || n > 4294967295) return "0 - 4,294,967,295";
      return null;
    }
    case "u64":
    case "xtal_amount": {
      if (param.type === "xtal_amount") {
        return getXtalInputError(value);
      }

      const n = Number(value);
      if (isNaN(n) || n < 0) return "Must be a positive number";
      return null;
    }
    case "bytes": {
      const hex = value.startsWith("0x") ? value.slice(2) : value;
      if (hex.length > 0 && !/^[a-fA-F0-9]*$/.test(hex)) return "Must be hex encoded";
      if (hex.length % 2 !== 0) return "Odd number of hex characters";
      return null;
    }
    case "bytes20": {
      const hex = value.startsWith("0x") ? value.slice(2) : value;
      if (!/^[a-fA-F0-9]{40}$/.test(hex)) return "Must be exactly 20 bytes (40 hex chars)";
      return null;
    }
    case "bytes32": {
      const hex = value.startsWith("0x") ? value.slice(2) : value;
      if (!/^[a-fA-F0-9]{64}$/.test(hex)) return "Must be exactly 32 bytes (64 hex chars)";
      return null;
    }
    default:
      return null;
  }
}

function getPlaceholder(param: AbiParam): string {
  switch (param.type) {
    case "utxo_address":
      return "Base58Check address";
    case "vm_address":
      return "0x...";
    case "u8":
      return "0-255";
    case "u16":
      return "0-65535";
    case "u32":
      return "0-4294967295";
    case "u64":
      return "0";
    case "xtal_amount":
      return "0.00";
    case "bool":
      return "";
    case "string":
      return "Text...";
    case "bytes":
      return "Hex bytes (optional 0x prefix)";
    case "bytes20":
      return "40 hex characters";
    case "bytes32":
      return "64 hex characters";
    default:
      return "";
  }
}

export function ParamInput({ param, value, onChange, disabled }: ParamInputProps) {
  const label = param.label || param.name;
  const error = validateParam(param, value);

  if (param.type === "bool") {
    return (
      <div className="space-y-1">
        <label className="text-xs font-heading tracking-wide text-foreground-muted uppercase">
          {label}
        </label>
        <div className="flex items-center gap-3 py-1">
          <Switch
            checked={value === "true"}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
            disabled={disabled}
          />
          <span className="text-sm text-foreground-secondary font-mono">
            {value === "true" ? "true" : "false"}
          </span>
        </div>
      </div>
    );
  }

  if (param.type === "xtal_amount") {
    return (
      <div className="space-y-1">
        <label className="text-xs font-heading tracking-wide text-foreground-muted uppercase">
          {label}
        </label>
        <div className="relative">
          <Input
            type="text"
            placeholder={getPlaceholder(param)}
            value={value}
            onChange={(e) => {
              if (isValidXtalInput(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            disabled={disabled}
            className="pr-16 font-mono text-sm"
            inputMode="decimal"
            error={!!error}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-heading text-foreground-muted">
            XTAL
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    );
  }

  if (param.type === "bytes") {
    return (
      <div className="space-y-1">
        <label className="text-xs font-heading tracking-wide text-foreground-muted uppercase">
          {label}
        </label>
        <textarea
          placeholder={getPlaceholder(param)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "flex w-full chamfered-sm border bg-input px-4 py-2",
            "text-sm font-mono placeholder:text-foreground-muted",
            "transition-all duration-200 min-h-[5rem] resize-y",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus-visible:ring-destructive"
              : "border-border hover:border-border-hover"
          )}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="flex items-center justify-between">
          {error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          ) : (
            <span className="text-xs text-foreground-muted">
              {value ? `${((value.startsWith("0x") ? value.slice(2) : value).length / 2)} bytes` : ""}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isNumeric = ["u8", "u16", "u32", "u64"].includes(param.type);

  return (
    <div className="space-y-1">
      <label className="text-xs font-heading tracking-wide text-foreground-muted uppercase">
        {label}
      </label>
      <div className="relative">
        {param.type === "vm_address" && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-foreground-muted">
            0x
          </div>
        )}
        <Input
          type={isNumeric ? "number" : "text"}
          placeholder={getPlaceholder(param)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "font-mono text-sm",
            param.type === "vm_address" && "pl-8"
          )}
          min={isNumeric ? "0" : undefined}
          error={!!error}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
