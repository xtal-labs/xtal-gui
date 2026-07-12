import { RefreshCw, AlertCircle, Book } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ContractValueDisplay,
  inferCardStyle,
  isAddressListResult,
  useTimeAgo,
} from "@/components/common/ContractValueDisplay";
import { cn } from "@/lib/utils";
import { useContractDashboard } from "@/hooks/useContractDashboard";
import type { DashboardQueryResult } from "@/hooks/useContractDashboard";
import type { ContractAbi } from "@/types/contract";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContractDashboardProps {
  contractAddress: string;
  abi: ContractAbi;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ result }: { result: DashboardQueryResult }) {
  const { icon: Icon, iconBg, iconText } = inferCardStyle(result.methodName);

  // Address lists need full width
  const isAddressList = isAddressListResult(result);

  return (
    <Card
      variant="crystalline"
      className={cn(isAddressList && "col-span-2")}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary">
          {result.displayName.toUpperCase().replace(/_/g, " ")}
        </CardTitle>
        <div className={cn(
          "icon-hex icon-hex-sm",
          result.status === "error" ? "bg-destructive/20" : iconBg,
        )}>
          {result.status === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Icon className={cn("h-3.5 w-3.5", iconText)} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {result.status === "loading" && (
          <>
            <div className="h-8 w-24 bg-muted/50 animate-pulse chamfered-sm" />
            <div className="h-3 w-32 bg-muted/30 animate-pulse chamfered-sm mt-2" />
          </>
        )}

        {result.status === "error" && (
          <>
            <div className="text-sm font-heading text-destructive">
              Query failed
            </div>
            <p
              className="text-xs text-foreground-muted mt-1 font-mono truncate"
              title={result.errorMessage}
            >
              {result.errorMessage}
            </p>
          </>
        )}

        {result.status === "success" && (
          <ContractValueDisplay result={result} isAddressList={isAddressList} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContractDashboard({ contractAddress, abi }: ContractDashboardProps) {
  const { results, lastUpdated, isRefreshing, hasDashboard, refresh } = useContractDashboard(
    contractAddress,
    abi,
  );
  const timeAgo = useTimeAgo(lastUpdated);

  // No zero-param read methods — fall back to default placeholder
  if (!hasDashboard) {
    return (
      <div className="chamfered crystalline p-8 text-center text-foreground-muted">
        <Book className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-heading tracking-wide text-sm">
          Select a method from the sidebar
        </p>
        <p className="text-xs mt-1">{abi.description}</p>
      </div>
    );
  }

  // Determine grid columns
  const cardCount = results.length;
  const gridClass = cardCount === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";

  return (
    <div className="space-y-4">
      {/* Contract overview header */}
      <div className="chamfered crystalline p-5">
        <h3 className="text-xs font-heading tracking-widest text-foreground-muted mb-1">
          CONTRACT OVERVIEW
        </h3>
        <p className="text-sm text-foreground-secondary">{abi.description}</p>
      </div>

      {/* Stat cards grid */}
      <div className={cn("grid gap-4 stagger-children", gridClass)}>
        {results.map((result) => (
          <StatCard key={result.methodName} result={result} />
        ))}
      </div>

      {/* Footer — updated time + refresh */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-foreground-muted font-mono">
          {lastUpdated ? `Updated ${timeAgo}` : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing}
          className="h-7 px-2 text-xs text-foreground-muted hover:text-foreground"
        >
          <RefreshCw
            className={cn("h-3 w-3 mr-1", isRefreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>
    </div>
  );
}
