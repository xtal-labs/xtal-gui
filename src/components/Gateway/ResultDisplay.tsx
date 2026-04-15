import { CheckCircle, AlertCircle, Copy } from "lucide-react";

import { AmountDisplay } from "@/components/common/AmountDisplay";
import { cn, copyToClipboard } from "@/lib/utils";
import { decodeReturnValue } from "@/lib/contractQuery";
import { useUiStore } from "@/stores";
import type { QueryResult, AbiReturn } from "@/types/contract";

interface ResultDisplayProps {
  result: QueryResult;
  returnDef?: AbiReturn;
  methodName: string;
}

export function ResultDisplay({ result, returnDef, methodName }: ResultDisplayProps) {
  const { addToast } = useUiStore();

  const decoded = returnDef
    ? decodeReturnValue(result.returnData, returnDef.type)
    : result.returnData || "(empty)";

  const isAmountResult =
    returnDef?.type === "u64" || returnDef?.type === "xtal_amount";
  const numericValue = isAmountResult ? Number(decoded) : null;

  const handleCopy = async () => {
    const success = await copyToClipboard(decoded);
    if (success) {
      addToast({ type: "success", title: "Copied", duration: 2000 });
    }
  };

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center gap-2">
        {result.success ? (
          <CheckCircle className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <span
          className={cn(
            "text-sm font-heading tracking-wide",
            result.success ? "text-success" : "text-destructive"
          )}
        >
          {result.success ? "SUCCESS" : "FAILED"}
        </span>
        <span className="text-xs text-foreground-muted font-mono ml-auto">
          {methodName}
        </span>
      </div>

      {/* Return value */}
      {result.success && result.returnData && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading tracking-wide text-foreground-muted">
              RETURN VALUE
              {returnDef?.description && (
                <span className="font-normal ml-2 text-foreground-muted/70 normal-case tracking-normal">
                  {returnDef.description}
                </span>
              )}
            </span>
            <button
              onClick={handleCopy}
              className="text-foreground-muted hover:text-foreground transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-3 chamfered-sm bg-muted/30 border border-border/50">
            {isAmountResult && numericValue !== null ? (
              <AmountDisplay amount={numericValue} size="md" showSymbol />
            ) : decoded.includes("\n") ? (
              decoded.split("\n").map((line, i) => (
                <p key={i} className="font-mono text-sm break-all">
                  {line}
                </p>
              ))
            ) : (
              <p className="font-mono text-sm break-all">{decoded}</p>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {result.errorMessage && (
        <div className="p-3 chamfered-sm bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive break-all">{result.errorMessage}</p>
        </div>
      )}

      {/* Gas used */}
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span className="font-heading tracking-wide">GAS USED</span>
        <span className="font-mono">{result.gasUsed.toLocaleString()}</span>
      </div>

      {/* Logs */}
      {result.logs.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-heading tracking-wide text-foreground-muted">
            LOGS ({result.logs.length})
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {result.logs.map((log, i) => (
              <div
                key={i}
                className="px-2 py-1 chamfered-sm bg-muted/20 font-mono text-xs break-all text-foreground-secondary"
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
