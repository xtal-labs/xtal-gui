import { useState, useEffect } from "react";
import {
  Coins,
  Wallet,
  Shield,
  TrendingUp,
  Eye,
  RefreshCw,
  AlertCircle,
  Book,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmountDisplay } from "@/components/common/AmountDisplay";
import { cn, truncateAddress } from "@/lib/utils";
import { hexToBytes } from "@/lib/contractQuery";
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
// Icon / color inference from method name
// ---------------------------------------------------------------------------

interface CardStyle {
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
}

function inferCardStyle(methodName: string): CardStyle {
  const name = methodName.toLowerCase();

  if (name.includes("fee") || name.includes("cost"))
    return { icon: Coins, iconBg: "bg-warning/20", iconText: "text-warning" };
  if (name.includes("balance") || name.includes("amount"))
    return { icon: Wallet, iconBg: "bg-success/20", iconText: "text-success" };
  if (name.includes("signer") || name.includes("owner") || name.includes("admin"))
    return { icon: Shield, iconBg: "bg-info/20", iconText: "text-info" };
  if (name.includes("supply") || name.includes("total") || name.includes("count"))
    return { icon: TrendingUp, iconBg: "bg-accent/20", iconText: "text-accent" };

  return { icon: Eye, iconBg: "bg-primary/20", iconText: "text-primary" };
}

// ---------------------------------------------------------------------------
// Time-ago display (re-renders every 10s)
// ---------------------------------------------------------------------------

function useTimeAgo(timestamp: number | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (timestamp === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp === null) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ result }: { result: DashboardQueryResult }) {
  const { icon: Icon, iconBg, iconText } = inferCardStyle(result.methodName);

  // Determine if this card needs full width (address lists)
  const isAddressList =
    result.returnType === "bytes" &&
    result.status === "success" &&
    result.rawHex &&
    result.rawHex.length > 0 &&
    result.rawHex.length % 40 === 0 &&
    result.rawHex.length / 40 > 1;

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
          <StatCardValue result={result} isAddressList={!!isAddressList} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Value display per return type
// ---------------------------------------------------------------------------

function StatCardValue({
  result,
  isAddressList,
}: {
  result: DashboardQueryResult;
  isAddressList: boolean;
}) {
  const { returnType, decodedValue, numericValue, returnDescription, rawHex } = result;

  // Amount types (u64 / xtal_amount) — use AmountDisplay
  if ((returnType === "u64" || returnType === "xtal_amount") && numericValue !== undefined) {
    return (
      <>
        <div className="text-2xl font-heading font-bold tabular-nums">
          <AmountDisplay amount={numericValue} size="md" showSymbol />
        </div>
        {returnDescription && (
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {returnDescription}
          </p>
        )}
      </>
    );
  }

  // Numeric types (u32 / u16 / u8)
  if (returnType === "u32" || returnType === "u16" || returnType === "u8") {
    return (
      <>
        <div className="text-2xl font-heading font-bold tabular-nums">
          {decodedValue ?? "--"}
        </div>
        {returnDescription && (
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {returnDescription}
          </p>
        )}
      </>
    );
  }

  // Boolean
  if (returnType === "bool") {
    const isTrue = decodedValue === "true";
    return (
      <>
        <span
          className={cn(
            "inline-block px-2 py-0.5 chamfered-sm text-sm font-heading tracking-wide",
            isTrue ? "bg-success/15 text-success" : "bg-muted text-foreground-muted",
          )}
        >
          {isTrue ? "Yes" : "No"}
        </span>
        {returnDescription && (
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {returnDescription}
          </p>
        )}
      </>
    );
  }

  // Bytes — address list
  if (isAddressList && rawHex) {
    const addresses = parseAddressList(rawHex);
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {addresses.map((addr, i) => (
            <span
              key={i}
              className="inline-block px-2 py-1 chamfered-sm bg-muted/40 font-mono text-xs text-foreground-secondary"
            >
              0x{truncateAddress(addr, 6)}
            </span>
          ))}
        </div>
        {returnDescription && (
          <p className="text-xs text-foreground-muted mt-2 font-mono">
            {returnDescription}
          </p>
        )}
      </>
    );
  }

  // String
  if (returnType === "string") {
    return (
      <>
        <div className="text-lg font-heading font-semibold">
          {decodedValue ?? "--"}
        </div>
        {returnDescription && (
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {returnDescription}
          </p>
        )}
      </>
    );
  }

  // Fallback — raw hex or single address
  return (
    <>
      <div className="text-sm font-mono break-all text-foreground-secondary">
        {decodedValue ?? rawHex ?? "--"}
      </div>
      {returnDescription && (
        <p className="text-xs text-foreground-muted mt-1 font-mono">
          {returnDescription}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Address list parser
// ---------------------------------------------------------------------------

function parseAddressList(hex: string): string[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  // Check if it's a SCALE-encoded length-prefixed byte vector
  // First 4 bytes (8 hex chars) = LE u32 length
  if (clean.length > 8) {
    const bytes = hexToBytes(clean.slice(0, 8));
    const len = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    // If the length matches remaining bytes, strip the prefix
    if (len * 2 === clean.length - 8 && len % 20 === 0) {
      const body = clean.slice(8);
      const addrs: string[] = [];
      for (let i = 0; i < body.length; i += 40) {
        addrs.push(body.slice(i, i + 40));
      }
      return addrs;
    }
  }
  // Raw 20-byte address chunks
  const addrs: string[] = [];
  for (let i = 0; i < clean.length; i += 40) {
    addrs.push(clean.slice(i, i + 40));
  }
  return addrs;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContractDashboard({ contractAddress, abi }: ContractDashboardProps) {
  const { results, lastUpdated, hasDashboard, refresh } = useContractDashboard(
    contractAddress,
    abi,
  );
  const timeAgo = useTimeAgo(lastUpdated);
  const isRefreshing = results.some((r) => r.status === "loading");

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
  const gridClass = cardCount === 1 ? "grid-cols-1" : "grid-cols-2";

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
