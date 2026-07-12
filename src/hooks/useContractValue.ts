import { useState, useEffect, useRef, useCallback } from "react";

import { tauriCommand } from "@/hooks/useTauriCommand";
import {
  buildDashboardResult,
  isDashboardMethod,
  loadingResult,
  queryMethod,
  resultsEqual,
} from "@/hooks/useContractDashboard";
import type { DashboardQueryResult } from "@/hooks/useContractDashboard";
import { useBlockchainStore } from "@/stores";
import type { AbiMethod, ContractAbi } from "@/types/contract";

type QueryMode = "initial" | "background" | "manual";

interface ContractValueState {
  /** null while the ABI/method is still resolving or resolution failed. */
  result: DashboardQueryResult | null;
  /** Contract display name from the ABI (for widget subtitles). */
  contractName: string | null;
  /** ABI/method resolution error (contract removed from library etc.). */
  resolveError: string | null;
  lastUpdated: number | null;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Query a single zero-param read method on a contract and keep it live.
 *
 * Same lifecycle as useContractDashboard (which drives the Gateway contract
 * dashboard): initial query on mount, re-query on blockchain refreshTrigger
 * with a 2s debounce, stale-while-revalidate with change-diffing.
 */
export function useContractValue(
  contractAddress: string | null,
  methodName: string | null,
): ContractValueState {
  const [method, setMethod] = useState<AbiMethod | null>(null);
  const [contractName, setContractName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [result, setResult] = useState<DashboardQueryResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTrigger = useBlockchainStore((s) => s.refreshTrigger);
  const cancelledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Resolve the ABI method (disk-cached backend-side, cheap).
  useEffect(() => {
    cancelledRef.current = false;
    setMethod(null);
    setResult(null);
    setResolveError(null);
    setContractName(null);

    if (!contractAddress || !methodName) {
      setResolveError("Widget is missing its contract configuration");
      return;
    }

    const resolve = async () => {
      try {
        const abi = await tauriCommand<ContractAbi | null>("load_contract_abi", {
          contractAddress,
        });
        if (cancelledRef.current) return;

        if (!abi) {
          setResolveError("No ABI found for this contract");
          return;
        }
        setContractName(abi.name);

        const found = abi.methods.find(
          (m) => m.name === methodName && isDashboardMethod(m),
        );
        if (!found) {
          setResolveError(`Method "${methodName}" not found on contract`);
          return;
        }
        setMethod(found);
        setResult(loadingResult(found));
      } catch (err) {
        if (cancelledRef.current) return;
        setResolveError(err instanceof Error ? err.message : String(err));
      }
    };

    resolve();
    return () => {
      cancelledRef.current = true;
    };
  }, [contractAddress, methodName]);

  const query = useCallback(
    async (mode: QueryMode) => {
      if (!contractAddress || !method) return;

      if (mode === "manual") setIsRefreshing(true);
      try {
        const settled = await Promise.allSettled([
          queryMethod(contractAddress, method),
        ]);
        if (cancelledRef.current) return;

        const next = buildDashboardResult(method, settled[0]);
        setResult((prev) =>
          prev && prev.status !== "loading" && resultsEqual([prev], [next])
            ? prev
            : next,
        );
        setLastUpdated(Date.now());
      } finally {
        if (mode === "manual") setIsRefreshing(false);
      }
    },
    [contractAddress, method],
  );

  // Initial query once the method resolves.
  useEffect(() => {
    if (method) query("initial");
  }, [method, query]);

  // Re-query on blockchain refresh (debounced 2s), stale-while-revalidate.
  useEffect(() => {
    if (refreshTrigger === 0 || !method) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      query("background");
    }, 2000);
    return () => clearTimeout(debounceRef.current);
  }, [refreshTrigger, method, query]);

  return {
    result,
    contractName,
    resolveError,
    lastUpdated,
    isRefreshing,
    refresh: () => query("manual"),
  };
}
