import { useState, useEffect } from "react";
import { Coins, Eye, Shield, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AmountDisplay } from "@/components/common/AmountDisplay";
import { cn, truncateAddress, formatPercent } from "@/lib/utils";
import { hexToBytes } from "@/lib/contractQuery";
import type { DashboardQueryResult } from "@/hooks/useContractDashboard";
import type { DisplayFormat } from "@/types/contract";

// ---------------------------------------------------------------------------
// Icon / color inference from method name
// ---------------------------------------------------------------------------

export interface CardStyle {
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
}

export function inferCardStyle(methodName: string): CardStyle {
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

export function useTimeAgo(timestamp: number | null): string {
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
// Address-list detection
// ---------------------------------------------------------------------------

/** Successful bytes results holding more than one 20-byte address. */
export function isAddressListResult(result: DashboardQueryResult): boolean {
  return (
    result.returnType === "bytes" &&
    result.status === "success" &&
    !!result.rawHex &&
    result.rawHex.length > 0 &&
    result.rawHex.length % 40 === 0 &&
    result.rawHex.length / 40 > 1
  );
}

// ---------------------------------------------------------------------------
// Value display per return type
// ---------------------------------------------------------------------------

function renderDashboardValue(
  returnType: string,
  decodedValue: string | undefined,
  numericValue: number | undefined,
  display: DisplayFormat | undefined,
): { element: React.ReactNode; description?: string } | null {
  // basis_points display — e.g. withdrawal fee
  if (display === "basis_points" && numericValue !== undefined) {
    return {
      element: (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{numericValue}</span>
          <span className="text-xs text-foreground-muted font-mono">bps</span>
          <span className="text-xs text-foreground-muted/60 font-mono">
            ({formatPercent(numericValue / 100, 2)})
          </span>
        </div>
      ),
    };
  }

  // percentage display
  if (display === "percentage" && numericValue !== undefined) {
    return {
      element: <span className="font-mono text-sm">{formatPercent(numericValue / 100, 2)}</span>,
    };
  }

  // Amount types (u64 / xtal_amount) — use AmountDisplay
  if ((returnType === "u64" || returnType === "xtal_amount") && numericValue !== undefined) {
    return {
      element: (
        <div className="text-2xl font-heading font-bold tabular-nums">
          <AmountDisplay amount={numericValue} size="md" showSymbol />
        </div>
      ),
    };
  }

  // Numeric types (u32 / u16 / u8)
  if (returnType === "u32" || returnType === "u16" || returnType === "u8") {
    return {
      element: <div className="text-2xl font-heading font-bold tabular-nums">{decodedValue ?? "--"}</div>,
    };
  }

  return null;
}

/**
 * Renders a decoded contract query value per its ABI return type and display
 * format. Shared by the Gateway contract dashboard and the dashboard
 * contract-value widget.
 */
export function ContractValueDisplay({
  result,
  isAddressList,
}: {
  result: DashboardQueryResult;
  isAddressList: boolean;
}) {
  const { returnType, decodedValue, numericValue, returnDescription, rawHex, display } = result;

  const rendered = renderDashboardValue(returnType, decodedValue, numericValue, display);

  if (rendered) {
    return (
      <>
        {rendered.element}
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
