import { create } from "zustand";
import type {
  WalletInfo,
  WalletBalance,
  VmAccountBalance,
  Address,
  VmAddress,
  Transaction,
  NetworkType,
} from "@/types";
import {
  initialTransactionPagination,
  type TransactionPagination,
} from "@/lib/pagination";
import { toShards } from "@/lib/utils";

interface WalletState {
  // Wallet status
  isLoaded: boolean;
  walletName: string | null;
  network: NetworkType | null;

  // Balance
  balance: WalletBalance;

  // Addresses
  addresses: Address[];
  selectedAddress: string | null;

  // Transaction history
  transactions: Transaction[];
  pendingTxCount: number;
  transactionPagination: TransactionPagination;

  // VM account state
  vmBalance: VmAccountBalance | null;
  vmAddresses: VmAddress[];
  vmTransactions: Transaction[];
  vmTransactionPagination: TransactionPagination;

  // Available wallets
  availableWallets: string[];

  // Refresh trigger - increment to trigger wallet data refresh
  refreshTrigger: number;

  // Actions
  setWalletInfo: (info: WalletInfo) => void;
  setBalance: (balance: WalletBalance) => void;
  setAddresses: (addresses: Address[]) => void;
  addAddress: (address: Address) => void;
  setSelectedAddress: (address: string | null) => void;
  setTransactionPage: (page: number, transactions: Transaction[], totalCount: number) => void;
  setPageLoading: (loading: boolean) => void;
  addTransaction: (transaction: Transaction) => void;
  setVmBalance: (balance: VmAccountBalance) => void;
  setVmAddresses: (addresses: VmAddress[]) => void;
  addVmAddress: (address: string) => void;
  setVmTransactionPage: (page: number, transactions: Transaction[], totalCount: number) => void;
  setVmPageLoading: (loading: boolean) => void;
  setAvailableWallets: (wallets: string[]) => void;
  setLoaded: (loaded: boolean, name: string | null) => void;
  triggerRefresh: () => void;
  reset: () => void;
}

const initialBalance: WalletBalance = {
  confirmed: "0",
  pending: "0",
  immature: "0",
  total: "0",
};

const initialPagination: TransactionPagination = { ...initialTransactionPagination };

const initialVmPagination: TransactionPagination = { ...initialTransactionPagination };

const initialState = {
  isLoaded: false,
  walletName: null,
  network: null,
  balance: initialBalance,
  addresses: [],
  selectedAddress: null,
  transactions: [],
  pendingTxCount: 0,
  transactionPagination: initialPagination,
  vmBalance: null as VmAccountBalance | null,
  vmAddresses: [] as VmAddress[],
  vmTransactions: [] as Transaction[],
  vmTransactionPagination: initialVmPagination,
  availableWallets: [],
  refreshTrigger: 0,
};

export const useWalletStore = create<WalletState>((set) => ({
  ...initialState,

  setWalletInfo: (info) =>
    set({
      isLoaded: info.isLoaded,
      walletName: info.name,
      network: info.network,
    }),

  setBalance: (balance) =>
    set({
      balance,
      pendingTxCount:
        toShards(balance.pending) > 0n
          ? 1 // We don't track individual pending txs from balance
          : 0,
    }),

  setAddresses: (addresses) => set({ addresses }),

  addAddress: (address) =>
    set((state) => ({
      addresses: [...state.addresses, address],
    })),

  setSelectedAddress: (address) => set({ selectedAddress: address }),

  setTransactionPage: (page, transactions, totalCount) =>
    set((state) => ({
      transactions,
      pendingTxCount: transactions.filter((tx) => tx.confirmations === 0)
        .length,
      transactionPagination: {
        ...state.transactionPagination,
        currentPage: page,
        totalCount,
        isLoading: false,
      },
    })),

  setPageLoading: (loading) =>
    set((state) => ({
      transactionPagination: {
        ...state.transactionPagination,
        isLoading: loading,
      },
    })),

  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
      pendingTxCount:
        transaction.confirmations === 0
          ? state.pendingTxCount + 1
          : state.pendingTxCount,
    })),

  setVmBalance: (vmBalance) => set({ vmBalance }),

  setVmAddresses: (vmAddresses) => set({ vmAddresses }),

  addVmAddress: (address) =>
    set((state) => ({
      vmAddresses: state.vmAddresses.some((addr) => addr.address === address)
        ? state.vmAddresses
        : [
            ...state.vmAddresses,
            {
              address,
              index: state.vmAddresses.filter((addr) => addr.kind !== "account_state").length,
              kind: "vm_account",
              order: state.vmAddresses.length,
              label:
                state.vmAddresses.filter((addr) => addr.kind !== "account_state").length === 0
                  ? "Primary"
                  : undefined,
            },
          ],
    })),

  setVmTransactionPage: (page, transactions, totalCount) =>
    set((state) => ({
      vmTransactions: transactions,
      vmTransactionPagination: {
        ...state.vmTransactionPagination,
        currentPage: page,
        totalCount,
        isLoading: false,
      },
    })),

  setVmPageLoading: (loading) =>
    set((state) => ({
      vmTransactionPagination: {
        ...state.vmTransactionPagination,
        isLoading: loading,
      },
    })),

  setAvailableWallets: (wallets) => set({ availableWallets: wallets }),

  setLoaded: (loaded, name) =>
    set({
      isLoaded: loaded,
      walletName: name,
      // Reset other state when unloading
      ...(loaded
        ? {}
        : {
            balance: initialBalance,
            addresses: [],
            selectedAddress: null,
            transactions: [],
            pendingTxCount: 0,
            transactionPagination: initialPagination,
            vmBalance: null,
            vmAddresses: [],
            vmTransactions: [],
            vmTransactionPagination: initialVmPagination,
            refreshTrigger: 0,
          }),
    }),

  triggerRefresh: () =>
    set((state) => ({
      refreshTrigger: state.refreshTrigger + 1,
    })),

  reset: () => set(initialState),
}));
