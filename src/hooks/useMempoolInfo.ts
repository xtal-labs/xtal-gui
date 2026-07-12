import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Wire shape of `get_mempool_info` (snake_case, no case conversion). */
export interface MempoolInfo {
  total_transactions: number;
  size_bytes: number;
  utxo_count: number;
  vm_count: number;
  oldest_age_secs: number | null;
  transaction_count_by_type: Record<string, number>;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Poll mempool overview stats while mounted. There is no store for mempool
 * data — consumers fetch on demand.
 */
export function useMempoolInfo(): MempoolInfo | null {
  const [mempoolInfo, setMempoolInfo] = useState<MempoolInfo | null>(null);

  useEffect(() => {
    const fetchMempool = async () => {
      try {
        const info = await invoke<MempoolInfo>("get_mempool_info");
        setMempoolInfo(info);
      } catch (err) {
        console.error("Failed to fetch mempool info:", err);
      }
    };

    fetchMempool();
    const interval = setInterval(fetchMempool, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return mempoolInfo;
}
