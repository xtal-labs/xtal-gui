import { useState, useEffect, useRef, useCallback } from "react";

import { decodeReturnValue, decodeU64 } from "@/lib/contractQuery";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { useBlockchainStore } from "@/stores";
import type { ContractAbi, AbiMethod, ParamType, QueryResult, DisplayFormat } from "@/types/contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardQueryResult {
  methodName: string;
  displayName: string;
  returnType: ParamType;
  returnDescription?: string;
  display?: DisplayFormat;
  status: "loading" | "success" | "error";
  rawHex?: string;
  decodedValue?: string;
  numericValue?: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** How a query pass should affect the UI. */
type QueryMode = "initial" | "background" | "manual";

/**
 * Analyses an ABI, finds zero-param read methods, and auto-queries them.
 * Re-queries on blockchain refreshTrigger changes (debounced 2s).
 *
 * Background re-queries are stale-while-revalidate: prior values stay on screen
 * (no skeleton flash) and results are only replaced when a value actually
 * changed, so a contract dashboard doesn't flicker on every new block.
 */
export function useContractDashboard(
  contractAddress: string | null,
  abi: ContractAbi | null,
) {
  const [results, setResults] = useState<DashboardQueryResult[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTrigger = useBlockchainStore((s) => s.refreshTrigger);
  const cancelledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Find zero-param read methods with returns
  const dashboardMethods = abi?.methods.filter(
    (m) => m.mutability === "read" && m.params.length === 0 && m.returns,
  ) ?? [];

  const queryAll = useCallback(async (mode: QueryMode = "initial") => {
    if (!contractAddress || dashboardMethods.length === 0) return;

    // Only the first load shows skeletons. Background/manual refreshes keep the
    // prior values visible (stale-while-revalidate); manual refreshes spin the
    // footer icon, background refreshes are silent.
    if (mode === "initial") {
      setResults(dashboardMethods.map(loadingResult));
    } else if (mode === "manual") {
      setIsRefreshing(true);
    }

    try {
      const settled = await Promise.allSettled(
        dashboardMethods.map((method) => queryMethod(contractAddress, method)),
      );

      if (cancelledRef.current) return;

      const next = dashboardMethods.map((m, i) => {
        const result = settled[i];
        if (result.status === "fulfilled" && result.value.success) {
          const returnType = m.returns!.type;
          const rawHex = result.value.returnData;
          const decodedValue = decodeReturnValue(rawHex, returnType);
          const numericValue =
            returnType === "u64" || returnType === "xtal_amount"
              ? decodeU64(rawHex)
              : returnType === "u32" || returnType === "u16" || returnType === "u8"
                ? Number(decodedValue)
                : undefined;

          return {
            methodName: m.name,
            displayName: m.displayName || m.name,
            returnType,
            returnDescription: m.returns!.description,
            display: m.returns!.display,
            status: "success" as const,
            rawHex,
            decodedValue,
            numericValue,
          };
        }

        const errorMessage =
          result.status === "fulfilled"
            ? result.value.errorMessage || "Query failed"
            : result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);

        return {
          methodName: m.name,
          displayName: m.displayName || m.name,
          returnType: m.returns!.type,
          returnDescription: m.returns!.description,
          display: m.returns!.display,
          status: "error" as const,
          errorMessage,
        };
      });

      // Only swap in new results when something actually changed, so unchanged
      // blocks don't re-render the dashboard.
      setResults((prev) => (resultsEqual(prev, next) ? prev : next));
      setLastUpdated(Date.now());
    } finally {
      if (mode === "manual") setIsRefreshing(false);
    }
    // We intentionally exclude dashboardMethods from deps — we re-derive from abi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, abi]);

  // Initial query on mount / contract change
  useEffect(() => {
    cancelledRef.current = false;
    queryAll("initial");
    return () => {
      cancelledRef.current = true;
    };
  }, [queryAll]);

  // Re-query on blockchain refresh (debounced 2s), stale-while-revalidate
  useEffect(() => {
    if (refreshTrigger === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      queryAll("background");
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [refreshTrigger, queryAll]);

  return {
    results,
    lastUpdated,
    isRefreshing,
    hasDashboard: dashboardMethods.length > 0,
    refresh: () => queryAll("manual"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function queryMethod(contractAddress: string, method: AbiMethod): Promise<QueryResult> {
  return tauriCommand<QueryResult>("query_contract", {
    contractAddress,
    method: method.name,
    data: "",
  });
}

/** Build a placeholder (loading) result for a dashboard method. */
function loadingResult(m: AbiMethod): DashboardQueryResult {
  return {
    methodName: m.name,
    displayName: m.displayName || m.name,
    returnType: m.returns!.type,
    returnDescription: m.returns!.description,
    display: m.returns!.display,
    status: "loading",
  };
}

/** Shallow value-equality across the fields that affect rendering. */
function resultsEqual(a: DashboardQueryResult[], b: DashboardQueryResult[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.methodName !== y.methodName ||
      x.status !== y.status ||
      x.decodedValue !== y.decodedValue ||
      x.rawHex !== y.rawHex ||
      x.numericValue !== y.numericValue ||
      x.errorMessage !== y.errorMessage
    ) {
      return false;
    }
  }
  return true;
}
