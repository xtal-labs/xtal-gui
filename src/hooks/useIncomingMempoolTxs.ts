import { useCallback, useEffect, useRef, useState } from "react";

import { tauriCommand } from "@/hooks/useTauriCommand";
import { useBlockchainStore, useWalletStore } from "@/stores";

/** Camel-cased wire shape of `get_incoming_mempool_transactions`. */
export interface IncomingMempoolTx {
  txid: string;
  txType: string;
  fee: number;
  sizeBytes: number;
  ageSecs: number;
  /** Total shards paying wallet-owned addresses in this transaction. */
  incomingAmount: number;
}

const REFETCH_DEBOUNCE_MS = 1000;

/**
 * Pending mempool transactions paying the loaded wallet.
 *
 * Fetches on mount, then refetches when the wallet refresh trigger bumps
 * (App.tsx bumps it on the IncomingTransaction gui-event) or the blockchain
 * refresh trigger bumps (txs leave the mempool when mined). Returns null
 * until the first fetch resolves.
 */
export function useIncomingMempoolTxs(): IncomingMempoolTx[] | null {
  const [txs, setTxs] = useState<IncomingMempoolTx[] | null>(null);
  const walletTrigger = useWalletStore((s) => s.refreshTrigger);
  const blockTrigger = useBlockchainStore((s) => s.refreshTrigger);
  const isLoaded = useWalletStore((s) => s.isLoaded);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchTxs = useCallback(async () => {
    try {
      const list = await tauriCommand<IncomingMempoolTx[]>(
        "get_incoming_mempool_transactions"
      );
      setTxs(list);
    } catch (err) {
      console.error("Failed to fetch incoming mempool transactions:", err);
    }
  }, []);

  // Initial fetch, and refetch on wallet load/unload transitions.
  useEffect(() => {
    fetchTxs();
  }, [fetchTxs, isLoaded]);

  // Debounced refetch on wallet/blockchain refresh triggers.
  useEffect(() => {
    if (walletTrigger === 0 && blockTrigger === 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchTxs, REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [walletTrigger, blockTrigger, fetchTxs]);

  return txs;
}
