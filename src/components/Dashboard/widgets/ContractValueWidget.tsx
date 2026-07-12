import { AlertCircle, RefreshCw } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import {
  ContractValueDisplay,
  inferCardStyle,
  isAddressListResult,
  useTimeAgo,
} from "@/components/common/ContractValueDisplay";
import { Button } from "@/components/ui/button";
import { useContractValue } from "@/hooks/useContractValue";
import { cn, truncateAddress } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function ContractValueWidget({ widget, shellProps }: WidgetProps) {
  const { result, contractName, resolveError, lastUpdated, isRefreshing, refresh } =
    useContractValue(widget.contractAddress ?? null, widget.method ?? null);
  const timeAgo = useTimeAgo(lastUpdated);

  const methodName = widget.method ?? "value";
  const title = (result?.displayName ?? methodName).toUpperCase().replace(/_/g, " ");
  const { icon, iconBg, iconText } = inferCardStyle(methodName);
  const failed = !!resolveError || result?.status === "error";

  return (
    <WidgetShell
      title={title}
      icon={
        failed ? (
          <WidgetIcon icon={AlertCircle} wrapClass="bg-destructive/20" iconClass="text-destructive" />
        ) : (
          <WidgetIcon icon={icon} wrapClass={iconBg} iconClass={iconText} />
        )
      }
      {...shellProps}
    >
      {resolveError && (
        <p className="text-xs text-foreground-muted font-mono break-all">{resolveError}</p>
      )}

      {!resolveError && (!result || result.status === "loading") && (
        <>
          <div className="h-8 w-24 bg-muted/50 animate-pulse chamfered-sm" />
          <div className="h-3 w-32 bg-muted/30 animate-pulse chamfered-sm mt-2" />
        </>
      )}

      {!resolveError && result?.status === "error" && (
        <>
          <div className="text-sm font-heading text-destructive">Query failed</div>
          <p
            className="text-xs text-foreground-muted mt-1 font-mono truncate"
            title={result.errorMessage}
          >
            {result.errorMessage}
          </p>
        </>
      )}

      {!resolveError && result?.status === "success" && (
        <ContractValueDisplay result={result} isAddressList={isAddressListResult(result)} />
      )}

      <div className="flex items-center justify-between mt-3">
        <span
          className="text-xs text-foreground-muted font-mono truncate"
          title={widget.contractAddress}
        >
          {contractName ?? (widget.contractAddress ? `0x${truncateAddress(widget.contractAddress.replace(/^0x/, ""), 6)}` : "")}
          {lastUpdated ? ` • ${timeAgo}` : ""}
        </span>
        {!resolveError && (
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
            className="h-6 w-6 p-0 text-foreground-muted hover:text-foreground shrink-0"
            aria-label="Refresh contract value"
          >
            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          </Button>
        )}
      </div>
    </WidgetShell>
  );
}
