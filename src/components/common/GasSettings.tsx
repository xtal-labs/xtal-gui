import { useState } from "react";
import { ChevronDown, ChevronRight, Fuel, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AmountDisplay } from "@/components/common/AmountDisplay";
import { cn } from "@/lib/utils";

/** Gas configuration returned by the `get_gas_config` Tauri command */
export interface GasConfig {
  minGasPrice: number;
  maxGasLimit: number;
  defaultGasLimit: number;
  defaultGasPrice: number;
  /** Minimum gas limit for a contract call (e.g. CAGE withdraw). */
  minCallGas: number;
}

export interface GasSettingsProps {
  gasLimit: string;
  gasPrice: string;
  onGasLimitChange: (value: string) => void;
  onGasPriceChange: (value: string) => void;
  config: GasConfig;
  /**
   * Minimum gas limit accepted in this context. Defaults to the intrinsic
   * floor (`config.defaultGasLimit`); contract-call flows pass
   * `config.minCallGas` since the builder rejects calls below that.
   */
  minGasLimit?: number;
  defaultOpen?: boolean;
  className?: string;
}

export function GasSettings({
  gasLimit,
  gasPrice,
  onGasLimitChange,
  onGasPriceChange,
  config,
  minGasLimit,
  defaultOpen = false,
  className,
}: GasSettingsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const minLimit = minGasLimit ?? config.defaultGasLimit;
  const gasLimitNum = parseInt(gasLimit) || minLimit;
  const gasPriceNum = parseInt(gasPrice) || config.defaultGasPrice;
  const maxFee = gasLimitNum * gasPriceNum;

  // Validation
  const gasLimitError =
    gasLimit && parseInt(gasLimit) < minLimit
      ? `Min: ${minLimit.toLocaleString()}`
      : gasLimit && parseInt(gasLimit) > config.maxGasLimit
        ? `Max: ${config.maxGasLimit.toLocaleString()}`
        : null;

  const gasPriceError =
    gasPrice && parseInt(gasPrice) < config.minGasPrice
      ? `Min: ${config.minGasPrice} shard/gas`
      : null;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2",
          "chamfered-sm bg-muted/30 hover:bg-muted/50 transition-colors",
          "text-sm font-heading tracking-wide text-foreground-secondary"
        )}
      >
        <span className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Fuel className="h-3.5 w-3.5" />
          GAS SETTINGS
        </span>
        <span className="text-xs font-mono text-foreground-muted">
          Max fee: <AmountDisplay amount={maxFee} size="sm" showSymbol />
        </span>
      </button>

      {isOpen && (
        <div className="space-y-3 p-3 chamfered-sm bg-muted/20 border border-border/50">
          <div className="space-y-1">
            <label className="text-xs font-heading tracking-wide text-foreground-muted">
              GAS LIMIT
            </label>
            <Input
              type="number"
              placeholder={minLimit.toLocaleString()}
              value={gasLimit}
              onChange={(e) => onGasLimitChange(e.target.value)}
              className="font-mono text-sm"
              min={minLimit}
              max={config.maxGasLimit}
              step={1000}
              error={!!gasLimitError}
            />
            {gasLimitError ? (
              <p className="text-xs text-destructive">{gasLimitError}</p>
            ) : (
              <p className="text-xs text-foreground-muted">
                Max computation units ({minLimit.toLocaleString()}&ndash;{config.maxGasLimit.toLocaleString()})
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-heading tracking-wide text-foreground-muted">
              GAS PRICE (shards/gas)
            </label>
            <Input
              type="number"
              placeholder={config.defaultGasPrice.toString()}
              value={gasPrice}
              onChange={(e) => onGasPriceChange(e.target.value)}
              className="font-mono text-sm"
              min={config.minGasPrice}
              step={1}
              error={!!gasPriceError}
            />
            {gasPriceError ? (
              <p className="text-xs text-destructive">{gasPriceError}</p>
            ) : (
              <p className="text-xs text-foreground-muted">
                Price per gas unit (min: {config.minGasPrice})
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 p-2 chamfered-sm bg-accent/5">
            <Info className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <span className="text-xs text-foreground-secondary">
              Unused gas is refunded. You only pay for gas consumed.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
