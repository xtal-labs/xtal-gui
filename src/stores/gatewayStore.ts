import { create } from "zustand";

import { tauriCommand } from "@/hooks/useTauriCommand";
import type { CachedContract, ContractAbi, QueryResult } from "@/types/contract";

interface GatewayState {
  // Library
  cachedContracts: CachedContract[];

  // Selected contract interaction
  selectedAddress: string | null;
  selectedAbi: ContractAbi | null;
  selectedMethod: string | null;

  // Results
  queryResult: QueryResult | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadLibrary: () => Promise<void>;
  selectContract: (address: string) => Promise<void>;
  selectMethod: (name: string) => void;
  setQueryResult: (result: QueryResult | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  backToLibrary: () => void;
  reset: () => void;
}

const initialState = {
  cachedContracts: [] as CachedContract[],
  selectedAddress: null as string | null,
  selectedAbi: null as ContractAbi | null,
  selectedMethod: null as string | null,
  queryResult: null as QueryResult | null,
  isLoading: false,
  error: null as string | null,
};

export const useGatewayStore = create<GatewayState>((set) => ({
  ...initialState,

  loadLibrary: async () => {
    set({ isLoading: true, error: null });
    try {
      const entries = await tauriCommand<CachedContract[]>("list_cached_contracts");
      set({ cachedContracts: entries, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  selectContract: async (address: string) => {
    set({ isLoading: true, error: null, selectedAddress: address, selectedMethod: null, queryResult: null });
    try {
      const abi = await tauriCommand<ContractAbi | null>("load_contract_abi", {
        contractAddress: address,
      });
      if (abi) {
        set({ selectedAbi: abi, isLoading: false });
      } else {
        set({ error: "No ABI found for this contract", isLoading: false });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  selectMethod: (name) => set({ selectedMethod: name, queryResult: null }),

  setQueryResult: (result) => set({ queryResult: result }),

  setError: (error) => set({ error }),

  setLoading: (loading) => set({ isLoading: loading }),

  backToLibrary: () =>
    set({
      selectedAddress: null,
      selectedAbi: null,
      selectedMethod: null,
      queryResult: null,
      error: null,
    }),

  reset: () => set(initialState),
}));
