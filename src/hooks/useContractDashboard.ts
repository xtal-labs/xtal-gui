import { useState, useEffect, useRef, useCallback } from "react";

import { encodeSelectorHex, decodeReturnValue, decodeU64 } from "@/lib/contractQuery";
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

/**
 * Analyses an ABI, finds zero-param read methods, and auto-queries them.
 * Re-queries on blockchain refreshTrigger changes (debounced 2s).
 */
export function useContractDashboard(
  contractAddress: string | null,
  abi: ContractAbi | null,
) {
  const [results, setResults] = useState<DashboardQueryResult[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const refreshTrigger = useBlockchainStore((s) => s.refreshTrigger);
  const cancelledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Find zero-param read methods with returns
  const dashboardMethods = abi?.methods.filter(
    (m) => m.mutability === "read" && m.params.length === 0 && m.returns,
  ) ?? [];

  const queryAll = useCallback(async () => {
    if (!contractAddress || dashboardMethods.length === 0) return;

    // Set all to loading
    setResults(
      dashboardMethods.map((m) => ({
        methodName: m.name,
        displayName: m.displayName || m.name,
        returnType: m.returns!.type,
        returnDescription: m.returns!.description,
        display: m.returns!.display,
        status: "loading" as const,
      })),
    );

    const settled = await Promise.allSettled(
      dashboardMethods.map((method) => queryMethod(contractAddress, method)),
    );

    if (cancelledRef.current) return;

    setResults(
      dashboardMethods.map((m, i) => {
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
      }),
    );

    setLastUpdated(Date.now());
    // We intentionally exclude dashboardMethods from deps — we re-derive from abi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, abi]);

  // Initial query on mount
  useEffect(() => {
    cancelledRef.current = false;
    queryAll();
    return () => {
      cancelledRef.current = true;
    };
  }, [queryAll]);

  // Re-query on blockchain refresh (debounced 2s)
  useEffect(() => {
    if (refreshTrigger === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      queryAll();
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [refreshTrigger, queryAll]);

  return {
    results,
    lastUpdated,
    hasDashboard: dashboardMethods.length > 0,
    refresh: queryAll,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function queryMethod(contractAddress: string, method: AbiMethod): Promise<QueryResult> {
  const data = encodeSelectorHex(method.selector);
  return tauriCommand<QueryResult>("query_contract", {
    contractAddress,
    method: method.name,
    data,
  });
}
